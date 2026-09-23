"""Orthographic numpy previews of the baked Orion volume (same decode + colour model as the shader).

python tools/nebula/preview.py public/volumes OUTDIR
"""
import gzip, json, math, os, sys
import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from bake_orion import trilinear

# keep in sync with NebulaManager.js (ORION_* constants)
C_HA = np.array([1.0, 0.13, 0.24], np.float32)
C_O3 = np.array([0.05, 1.0, 0.78], np.float32)
C_LOW = np.array([1.0, 0.06, 0.03], np.float32)
C_SC = np.array([0.50, 0.66, 1.0], np.float32)
EXT_RGB = np.array([0.74, 1.0, 1.30], np.float32)


def inv_warp(meta, axis, v):
    c, h, a = meta['warp'][axis]
    s = np.arcsinh((v - c) / h * math.sinh(a)) / a
    n = meta['dims'][{'x': 0, 'y': 1, 'z': 2}[axis]]
    return (s + 1) / 2 * n - 0.5


def load(path):
    meta = json.load(open(os.path.join(path, 'orion_m42.json')))
    raw = gzip.decompress(open(os.path.join(path, 'orion_m42.vol'), 'rb').read())
    NX, NY, NZ = meta['dims']
    n = NX * NY * NZ
    emis = np.frombuffer(raw[:4 * n], np.uint8).reshape(NZ, NY, NX, 4)
    dust = np.frombuffer(raw[4 * n:5 * n], np.uint8).reshape(NZ, NY, NX)
    return emis, dust, meta


def render(emis, dust, meta, view, res=360, steps=300, extent=12.0, exposure=None):
    sc = meta['scales']; D = meta['dec']; R = meta.get('render', {})
    g = R.get('gamma', 1.0); cg = R.get('chanGain', [1, 1, 1, 1])
    # same grading as the shader: (value / scale_ha)^gamma * per-line gain
    dec = lambda e, k, i: np.where(e > 0, (sc[k] / sc['ha']) ** g * cg[i] * 10.0 ** ((e.astype(np.float32) / 255 - 1) * D * g), 0).astype(np.float32)
    fields = [dec(emis[..., 0], 'ha', 0), dec(emis[..., 1], 'o3', 1), dec(emis[..., 2], 'low', 2), dec(emis[..., 3], 'scat', 3), (dust.astype(np.float32) / 255) ** 2 * sc['dust']]
    u = np.linspace(-extent, extent, res, dtype=np.float32)
    # image axes: right, up, forward (ray direction)
    if view == 'front':   R, U, F, o = (-1, 0, 0), (0, 1, 0), (0, 0, 1), -8.0
    elif view == 'side':  R, U, F, o = (0, 0, -1), (0, 1, 0), (-1, 0, 0), -12.5
    elif view == 'back':  R, U, F, o = (1, 0, 0), (0, 1, 0), (0, 0, -1), -8.0
    elif view == 'top':   R, U, F, o = (-1, 0, 0), (0, 0, -1), (0, -1, 0), -12.5
    R, U, F = map(lambda v: np.array(v, np.float32), (R, U, F))
    ts = np.linspace(0, 25, steps, dtype=np.float32); dt = ts[1] - ts[0]
    acc = np.zeros((res, res, 3), np.float32); T = np.ones((res, res, 3), np.float32)
    uu, vv = np.meshgrid(u, -u)
    for t in ts:
        P = R[None, None] * uu[..., None] + U[None, None] * vv[..., None] + F[None, None] * (o + t)
        x, y, z = P[..., 0], P[..., 1], P[..., 2]
        ix, iy, iz = inv_warp(meta, 'x', x), inv_warp(meta, 'y', y), inv_warp(meta, 'z', z)
        inside = (np.abs(x) < 12) & (np.abs(y) < 12) & (z > -7.2) & (z < 6.0)
        vals = [trilinear(f, iz, iy, ix) * inside for f in fields]
        ha, o3, low, scat, ext = vals
        cosT = ((x * F[0] + y * F[1] + z * F[2]) / (np.sqrt(x * x + y * y + z * z) + 1e-3))
        hg = 0.7975 / (1.2025 - 0.9 * cosT) ** 1.5
        e = ha[..., None] * C_HA + o3[..., None] * C_O3 + low[..., None] * C_LOW + (scat * hg)[..., None] * C_SC
        tau = ext[..., None] * EXT_RGB * dt
        a = np.exp(-tau)
        # emission integrated exactly over the step with absorption
        acc += T * e * np.where(tau > 1e-4, (1 - a) / np.maximum(tau, 1e-6), 1.0) * dt
        T *= a
    # astrophoto-style asinh stretch (same as the shader's display stretch)
    L = acc.max(-1, keepdims=True)
    if exposure is None: exposure = 1.0 / max(np.percentile(L, 99.5), 1e-9)
    k = 60.0
    acc = acc * np.arcsinh(k * L * exposure) / np.maximum(k * L * exposure, 1e-9) * exposure * 4
    img = 1 - np.exp(-acc * 1.3)
    img = np.clip(img, 0, 1) ** (1 / 2.2)
    return (img * 255).astype(np.uint8), exposure


def render_previews(emis, dust, meta, outdir, views=('front', 'side', 'back', 'top')):
    os.makedirs(outdir, exist_ok=True)
    exp = None
    for v in views:
        img, e = render(emis, dust, meta, v, exposure=exp)
        if exp is None: exp = e
        Image.fromarray(img).save(os.path.join(outdir, f'prev_{v}.png'))
        print('preview', v, flush=True)


if __name__ == '__main__':
    e, d, m = load(sys.argv[1])
    render_previews(e, d, m, sys.argv[2], views=tuple(sys.argv[3].split(',')) if len(sys.argv) > 3 else ('front', 'side', 'back', 'top'))
