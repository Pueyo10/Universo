#!/usr/bin/env python3
"""Bake the Orion Nebula (M42 + M43) into 3D textures for the browser ray marcher.

Pure numpy (no scipy): python tools/nebula/bake_orion.py [--preview DIR] [--out public/volumes]

Model (after O'Dell 2001, ARA&A 39, 99; Wen & O'Dell 1995; O'Dell et al. 2009 "the Veil";
Pabst et al. 2019, Nature 565, 618 "the Veil bubble"):

  frame: x = sky East, y = sky North, z = line of sight away from Earth; light-years;
         theta-1 Ori C (Trapezium) at the origin.

  * OMC-1 is a thick molecular cloud BEHIND the Trapezium. Its surface facing the star is a
    concave bowl ("blister") ~0.25 pc behind theta-1 C at the closest point, curving toward
    the observer farther out (limb-brightened walls = the outer "wings").
  * The Bright Bar is an escarpment of that surface ~0.25 pc SE of the Trapezium, seen edge-on.
  * The Veil: a thin, patchy neutral dome 1-2 pc IN FRONT of the Trapezium (A_V ~ 1-2),
    the near cap of the expanding bubble that becomes the Extended Orion Nebula.
  * Dense foreground dust: the Dark Bay ("fish's mouth", ENE of the Trapezium) and the
    north-east dark lane that separates M43, whose own small blister is ionised by NU Ori.
  * Turbulence: log-normal density from Gaussian random fields with a power-law (Kolmogorov-
    like) spectrum, domain-warped; radially stretched noise raises pillars/trunks that point
    at the Trapezium (photo-evaporation sculpting).

  Radiative transfer: for each ionising star (theta-1 Ori C, theta-2 Ori A, NU Ori for M43,
  and 42 Ori / iota Ori just outside the box for the faint outskirts) rays are marched outward
  on a cube-sphere of directions (no pole artefacts). Ionising photons are absorbed by the
  gas (optical depth tau_ion), and the photons absorbed in each shell are re-emitted as
  recombination lines where they are absorbed (photon counting, so every ionisation front is
  exactly as bright as the flux that reaches it — shadows, 1/r^2 fall-off and limb
  brightening come out for free). The emission is then smeared toward the star along the
  ray to mimic the photo-evaporation flow off the front:
     H-alpha (scale 0.11 ly), [OIII] (0.3 ly, only in the hard radiation field of
     theta-1 C, fraction 1/(1+(r/4.5 ly)^2)), [NII]+[SII] low-ionisation lines (0.05 ly).
  Dust scatters the stars' optical light (attenuated by tau_V) -> reflection channel.
  Fronts are thinner than a voxel, so the channels get a 1-voxel binomial blur before
  encoding (avoids terraced iso-lines when a sheet is seen at a grazing angle).

Output (uint8), stored gzip'd in one file (see orion_m42.json for layout/scales):
  emission RGBA  (NX,NY,NZ): R = H-alpha, G = [OIII], B = [NII]+[SII], A = dust x starlight
                  log-encoded: v = scale * 10^((enc-1) * DEC)
  dust R         (NX,NY,NZ): sqrt-encoded extinction density
  detail RG      64^3 tiling: fBm + ridged turbulence for sub-voxel detail in the shader
  The grid is warped per axis (x = c + h sinh(a s)/sinh(a), s in [-1,1]) so the bright core
  gets ~2x the resolution of the faint outskirts.
"""
import argparse, gzip, json, math, os, time
import numpy as np

T0 = time.time()
def log(*a): print(f'[{time.time() - T0:7.1f}s]', *a, flush=True)

# ------------------------------------------------------------------ domain
HX, HY = 12.0, 12.0
ZMIN, ZMAX = -7.2, 6.0
FINE = 0.06                                   # physics grid spacing (ly)
NXF, NYF, NZF = int(round(2 * HX / FINE)), int(round(2 * HY / FINE)), int(round((ZMAX - ZMIN) / FINE))
OUT_N = (176, 176, 96)                        # output voxels (x, y, z)
WARP = {'x': (0.0, HX, 1.8), 'y': (0.0, HY, 1.8), 'z': ((ZMAX + ZMIN) / 2, (ZMAX - ZMIN) / 2, 1.2)}   # (centre, half, a)
DEC = 4.5                                     # decades of the log encoding
DETAIL_N = 64

# stars: position (ly), ionising photon rate Q (relative), optical luminosity (relative)
STARS = [
  dict(name='theta1 Ori C (Trapezium)', p=(0.0, 0.0, 0.0), Q=1.0, L=1.4, rmax=18.6, dr=0.045, M=224, hard=1.3),
  dict(name='theta2 Ori A', p=(0.63, -0.62, -1.3), Q=0.10, L=0.35, rmax=8.0, dr=0.05, M=96, hard=0.2),
  dict(name='NU Ori (M43)', p=(1.45, 2.87, -0.1), Q=0.05, L=0.25, rmax=6.0, dr=0.05, M=96, hard=0.0),
  # outskirts: 42 Ori ionises NGC 1977 to the north, iota Ori (O9 III) lights the southern cloud face
  dict(name='42 Ori (NGC 1977)', p=(-0.4, 12.6, -1.6), Q=0.05, L=0.2, rmax=22.0, dr=0.06, M=96, hard=0.0),
  dict(name='iota Ori', p=(0.6, -14.0, -2.6), Q=0.1, L=0.5, rmax=24.0, dr=0.06, M=96, hard=0.1),
]
KAPPA_V = 8.0 / 60.0                          # dust optical depth per unit density per ly (visual)
ALBEDO = 0.6


def fcoords(n, lo, h):
    return (lo + (np.arange(n) + 0.5) * h).astype(np.float32)


# ------------------------------------------------------------------ sampling helpers
def trilinear(field, iz, iy, ix, wrap=False):
    """field (nz,ny,nx) float32, index-space coordinates (cell centres at integers)."""
    nz, ny, nx = field.shape
    flat = field.ravel()
    out_shape = np.broadcast(iz, iy, ix).shape
    iz = np.broadcast_to(iz, out_shape).ravel(); iy = np.broadcast_to(iy, out_shape).ravel(); ix = np.broadcast_to(ix, out_shape).ravel()
    res = np.empty(iz.size, np.float32)
    CH = 1 << 22
    for s in range(0, iz.size, CH):
        z, y, x = iz[s:s + CH], iy[s:s + CH], ix[s:s + CH]
        z0 = np.floor(z); y0 = np.floor(y); x0 = np.floor(x)
        tz = (z - z0).astype(np.float32); ty = (y - y0).astype(np.float32); tx = (x - x0).astype(np.float32)
        z0 = z0.astype(np.int64); y0 = y0.astype(np.int64); x0 = x0.astype(np.int64)
        if wrap:
            z0 %= nz; y0 %= ny; x0 %= nx
            z1 = (z0 + 1) % nz; y1 = (y0 + 1) % ny; x1 = (x0 + 1) % nx
        else:
            z1 = np.clip(z0 + 1, 0, nz - 1); y1 = np.clip(y0 + 1, 0, ny - 1); x1 = np.clip(x0 + 1, 0, nx - 1)
            z0 = np.clip(z0, 0, nz - 1); y0 = np.clip(y0, 0, ny - 1); x0 = np.clip(x0, 0, nx - 1)
        a0 = z0 * ny; a1 = z1 * ny
        b00 = (a0 + y0) * nx; b01 = (a0 + y1) * nx; b10 = (a1 + y0) * nx; b11 = (a1 + y1) * nx
        c00 = flat[b00 + x0] * (1 - tx) + flat[b00 + x1] * tx
        c01 = flat[b01 + x0] * (1 - tx) + flat[b01 + x1] * tx
        c10 = flat[b10 + x0] * (1 - tx) + flat[b10 + x1] * tx
        c11 = flat[b11 + x0] * (1 - tx) + flat[b11 + x1] * tx
        res[s:s + CH] = (c00 * (1 - ty) + c01 * ty) * (1 - tz) + (c10 * (1 - ty) + c11 * ty) * tz
    return res.reshape(out_shape)


def grf(shape, h, slope, lmin=0.0, lmax=None, seed=0):
    """Periodic Gaussian random field, power spectrum P(k) ~ k^slope, unit variance."""
    rng = np.random.default_rng(seed)
    nz, ny, nx = shape
    kz = np.fft.fftfreq(nz, h).astype(np.float32)[:, None, None]
    ky = np.fft.fftfreq(ny, h).astype(np.float32)[None, :, None]
    kx = np.fft.rfftfreq(nx, h).astype(np.float32)[None, None, :]
    k2 = kz * kz + ky * ky + kx * kx
    k2[0, 0, 0] = 1.0
    amp = k2 ** (slope / 4.0)
    amp[0, 0, 0] = 0.0
    if lmin: amp *= np.exp(-k2 * (lmin * lmin))
    if lmax: amp *= 1.0 - np.exp(-k2 * (lmax * lmax))
    F = np.fft.rfftn(rng.standard_normal(shape, dtype=np.float32)) * amp
    del amp, k2
    f = np.fft.irfftn(F, s=shape, axes=(0, 1, 2)).astype(np.float32)
    f -= f.mean(); f /= f.std()
    return f


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def lognorm(sig, g):
    return np.exp(sig * g - 0.5 * sig * sig).astype(np.float32)


# ------------------------------------------------------------------ density model
def build_density(seed):
    log(f'fine grid {NXF}x{NYF}x{NZF} = {NXF * NYF * NZF / 1e6:.1f} M voxels')
    xs, ys, zs = fcoords(NXF, -HX, FINE), fcoords(NYF, -HY, FINE), fcoords(NZF, ZMIN, FINE)
    Z = zs[:, None, None]; Y = ys[None, :, None]; X = xs[None, None, :]
    shape = (NZF, NYF, NXF)
    # large-scale warp (3 components) on a coarse grid, upsampled
    CW = 0.2
    cshape = (int(round((ZMAX - ZMIN) / CW)), int(round(2 * HY / CW)), int(round(2 * HX / CW)))
    ci = lambda v, lo: (v - lo) / CW - 0.5
    W = []
    for c in range(3):
        g = grf(cshape, CW, -4.0, lmin=0.9, seed=seed + 11 + c)
        W.append(trilinear(g, ci(Z, ZMIN), ci(Y, -HY), ci(X, -HX), wrap=True))
    log('warp field')
    WA = 0.75
    Xw = X + WA * W[0]; Yw = Y + WA * W[1]; Zw = Z + WA * 0.6 * W[2]
    fi = lambda v, lo, n: (v - lo) / FINE - 0.5
    # small-scale turbulence (Kolmogorov-like), sampled on warped coordinates -> sheared filaments
    T = grf(shape, FINE, -3.4, lmin=0.10, seed=seed + 21)
    log('turbulence field')
    def turb(dx=0.0, dy=0.0, dz=0.0):
        return trilinear(T, fi(Zw + dz, ZMIN, NZF), fi(Yw + dy, -HY, NYF), fi(Xw + dx, -HX, NXF), wrap=True)
    T1 = turb()
    T2 = turb(7.3, -3.1, 2.9)
    T3 = turb(-5.7, 9.4, -4.3)
    log('turbulence samples')
    # 2D relief of the cloud face
    H2 = grf((1, NYF // 2, NXF // 2), FINE * 2, -3.6, lmin=1.2, seed=seed + 31)[0]
    H2 = trilinear(H2[None], np.zeros((1, 1, 1), np.float32), (Y + HY) / (FINE * 2) - 0.5, (X + HX) / (FINE * 2) - 0.5, wrap=True)
    # radially stretched noise around theta-1 C -> pillars / trunks pointing at the Trapezium
    PH = 0.07; PN = 200
    P = grf((PN, PN, PN), PH, -3.0, lmin=0.12, seed=seed + 41)
    r = np.sqrt(X * X + Y * Y + Z * Z) + 1e-4
    r0, stretch = 2.5, 2.6
    f = (r0 + (r - r0) / stretch) / r
    pc = lambda v: v / PH + PN / 2
    Pn = trilinear(P, pc(Z * f), pc(Y * f), pc(X * f), wrap=True)
    del P
    log('pillar noise')

    # ---- OMC-1: concave blister behind the Trapezium
    rho2 = X * X + Y * Y
    zf = 0.85 - 0.052 * rho2 + 0.05 * (X + Y) + 0.55 * H2
    # the front is closest to theta-1 C just SW of it (the brightest part of the Huygens region)
    zf = zf - 0.4 * np.exp(-((X + 0.5) ** 2 + (Y + 0.45) ** 2) / 1.4)
    # north of the M42/M43 lane the cloud face comes forward (dark, grazing illumination)
    zf = zf - 0.35 * np.maximum(Y - 1.2, 0) - 0.02 * np.maximum(Y - 1.2, 0) ** 2
    # the Bright Bar escarpment, 0.8 ly SE of the Trapezium running NE-SW
    bx, by = 0.62, -0.55
    d = ((X - bx) - (Y - by)) * 0.7071 + 0.12 * W[0]
    t = ((X - bx) + (Y - by)) * 0.7071
    bar = 1.55 * (1 / (1 + np.exp(np.clip(-d / 0.07, -60, 60)))) * np.exp(-(t / 2.3) ** 4) * np.exp(-np.maximum(d, 0) / 3.5)
    zf = zf - bar
    # the "wings": ridges where the cloud face folds toward us and is lit edge-on (limb-brightened
    # arcs). East wing: from the Dark Bay round the east side to the south; a weaker western arc.
    for (cx, cy, rad, wid, amp, a0, a1) in ((-1.2, -0.6, 4.6, 0.8, 2.2, -2.3, 0.55), (0.8, -0.2, 5.8, 0.9, 1.6, 2.45, 3.9)):
        dx_, dy_ = Xw - cx, Yw - cy
        ang = np.arctan2(dy_, dx_)
        if a1 > math.pi: ang = np.where(ang < 0, ang + 2 * math.pi, ang)
        win = smoothstep(a0, a0 + 0.5, ang) * smoothstep(a1, a1 - 0.5, ang)
        zf = zf - amp * np.exp(-((np.sqrt(dx_ * dx_ + dy_ * dy_) - rad) / wid) ** 2) * win
    s = Z - zf + 0.32 * T1 + 0.9 * np.maximum(Pn - 1.2, 0) + 0.25 * W[2]
    # OMC-1 is thick near the Trapezium and thins out laterally (elongated N-S, the integral-shaped
    # filament) and with depth, with a ragged fractal edge rather than a hard boundary
    lat = np.sqrt((Xw / 7.5) ** 2 + (Yw / np.where(Yw > 0, 11.0, 6.5)) ** 2) + 0.22 * W[0] + 0.2 * T3 + 0.1 * T1
    cloud = 60.0 * smoothstep(-0.06, 0.35, s) * np.exp(-np.maximum(s - 1.5, 0) / 2.2) * lognorm(0.9, T2)
    cloud *= 0.02 + 0.98 * np.exp(-lat ** 2 * 1.8) * smoothstep(1.25, 0.8, lat)
    del s, bar, d, t, lat
    # keep the Trapezium itself in the cavity
    cloud *= smoothstep(0.35, 0.9, r)
    # M43 blister around NU Ori
    m43 = np.sqrt((Xw - 1.45) ** 2 + (Yw - 2.87) ** 2 + (Zw - 0.35) ** 2)
    cloud *= smoothstep(0.85, 1.3, m43)
    log('cloud')

    # ---- the Veil: patchy neutral dome in front
    cvx, cvy, cvz, Rv = -0.5, -3.4, 3.4, 9.6
    rv = np.sqrt((Xw - cvx) ** 2 + (Yw - cvy) ** 2 + (Zw - cvz) ** 2) + 1.1 * W[1]
    veil = 10.0 * np.exp(-((rv - Rv) / 0.38) ** 2) * lognorm(1.35, T3)
    del rv
    log('veil')

    # ---- dense foreground lanes (distance to warped polylines)
    lanes = np.zeros(shape, np.float32)
    paths = [
        # Dark Bay ("fish's mouth"), from its tip ENE of the Trapezium outward
        [(0.3, 0.3, -3.2, 0.25), (0.9, 0.6, -3.6, 0.5), (1.8, 0.9, -4.0, 0.85), (3.0, 1.0, -4.3, 1.25), (4.6, 0.8, -4.6, 1.7), (6.5, 0.3, -4.8, 2.1), (9.0, -0.5, -5.0, 2.4)],
        # north-east dark lane between M42 and M43
        [(-2.8, 1.5, -2.6, 0.3), (-1.2, 1.7, -2.8, 0.36), (0.2, 1.75, -3.0, 0.42), (1.4, 1.65, -3.3, 0.5), (2.5, 1.45, -3.6, 0.62), (3.4, 1.15, -3.9, 0.8)],
        # M43's comma: the lane curling round its east side
        [(2.5, 1.45, -1.5, 0.5), (2.95, 2.35, -1.3, 0.45), (2.85, 3.4, -1.1, 0.4), (2.2, 4.2, -1.0, 0.34), (1.2, 4.6, -0.9, 0.3)],
    ]
    for path in paths:
        dmin = np.full(shape, 1e9, np.float32)
        for (ax, ay, az, ar), (bx_, by_, bz_, br) in zip(path[:-1], path[1:]):
            vx, vy, vz = bx_ - ax, by_ - ay, bz_ - az
            L2 = vx * vx + vy * vy + vz * vz
            tt = np.clip(((Xw - ax) * vx + (Yw - ay) * vy + (Zw - az) * vz) / L2, 0, 1)
            dd = np.sqrt((Xw - ax - tt * vx) ** 2 + (Yw - ay - tt * vy) ** 2 + (Zw - az - tt * vz) ** 2) / (ar + tt * (br - ar))
            np.minimum(dmin, dd, out=dmin)
        lanes = np.maximum(lanes, 16.0 * smoothstep(1.1, 0.25, dmin + 0.35 * T1))
    del dmin, tt, dd
    lanes *= lognorm(0.6, T2)
    log('lanes')

    # ---- diffuse ionised gas in the cavity (recombination absorbers + some dust)
    cav = 0.01 * lognorm(1.0, T3)
    # ionised gas between the Trapezium and the Veil uses up most of the ionising photons
    # headed toward us (the Veil itself is essentially neutral): a low-density foreground lid
    rr = np.sqrt(X * X + Y * Y + Z * Z)
    cav = cav + 0.035 * smoothstep(-0.2, -1.6, Z) * smoothstep(-4.2, -2.8, Z) * (1 - smoothstep(3.5, 7.5, rr)) * lognorm(0.8, T1)
    del rr

    # soft, ragged ellipsoidal envelope so nothing reaches the texture border
    e = np.sqrt((X / HX) ** 2 + (Y / HY) ** 2 + ((Z - WARP['z'][0]) / WARP['z'][1]) ** 2) + 0.12 * W[1] + 0.05 * T3
    env = 1 - smoothstep(0.62, 0.95, e)
    n = (np.maximum(np.maximum(cloud, veil), lanes) + cav) * env
    n = n.astype(np.float32)
    log(f'density: max {n.max():.1f} mean {n.mean():.3f}')
    return n


# ------------------------------------------------------------------ radiative transfer
# cube-sphere ray layout (no poles): face normal, u axis, v axis
FACES = np.array([[(1, 0, 0), (0, 1, 0), (0, 0, 1)], [(-1, 0, 0), (0, 0, 1), (0, 1, 0)],
                  [(0, 1, 0), (0, 0, 1), (1, 0, 0)], [(0, -1, 0), (1, 0, 0), (0, 0, 1)],
                  [(0, 0, 1), (1, 0, 0), (0, 1, 0)], [(0, 0, -1), (0, 1, 0), (1, 0, 0)]], np.float32)


def cube_dirs(M):
    al = np.tan((-1 + (np.arange(M) + 0.5) * 2 / M) * math.pi / 4).astype(np.float32)
    A, B = np.meshgrid(al, al, indexing='ij')            # (M, M): [a, b]
    d = FACES[:, 0][:, None, None, :] + A[None, :, :, None] * FACES[:, 1][:, None, None, :] + B[None, :, :, None] * FACES[:, 2][:, None, None, :]
    d /= np.linalg.norm(d, axis=-1, keepdims=True)
    return d.reshape(-1, 3)                              # (6*M*M, 3)


def march_star(n, st):
    """Ray march outward from a star on a cube-sphere of directions (photon-conserving deposition)."""
    px, py, pz = st['p']
    M, dr = st['M'], st['dr']
    nr = int(math.ceil(st['rmax'] / dr))
    D = cube_dirs(M)
    dx, dy, dz = D[:, 0].copy(), D[:, 1].copy(), D[:, 2].copy()
    nth, nph = 6 * M, M
    tau_i = np.zeros(6 * M * M, np.float32); tau_v = np.zeros(6 * M * M, np.float32)
    dep = np.zeros((nr, 6 * M * M), np.float32); fopt = np.zeros((nr, 6 * M * M), np.float32)
    fi = lambda v, lo: (v - lo) / FINE - 0.5
    for i in range(nr):
        r = (i + 0.5) * dr
        dens = trilinear(n, fi(pz + r * dz, ZMIN), fi(py + r * dy, -HY), fi(px + r * dx, -HX))
        F0 = np.exp(-tau_i)
        tau_i += dens * dr
        tau_v += dens * KAPPA_V * dr
        re2 = max(r, 0.25) ** 2
        # photons absorbed in this shell, per unit volume (photon conserving)
        dep[i] = st['Q'] * (F0 - np.exp(-tau_i)) / (4 * math.pi * re2 * dr)
        fopt[i] = st['L'] * np.exp(-tau_v) / (4 * math.pi * (r * r + 0.04))
    return dict(dep=dep.reshape(nr, 6 * M, M), fopt=fopt.reshape(nr, 6 * M, M), nr=nr, dr=dr, M=M)


def smear_inward(dep, dr, h):
    """one-sided exponential smoothing toward the star (photo-evaporation flow)."""
    a = math.exp(-dr / h)
    out = np.empty_like(dep)
    acc = np.zeros(dep.shape[1:], np.float32)
    for i in range(dep.shape[0] - 1, -1, -1):
        acc = acc * a + dep[i] * (1 - a)
        out[i] = acc
    return out


def sph_sample(fields, st, grid, X, Y, Z):
    px, py, pz = st['p']
    M = grid['M']
    x, y, z = (X - px).ravel(), (Y - py).ravel(), (Z - pz).ravel()
    r = np.sqrt(x * x + y * y + z * z) + 1e-6
    P = np.stack([x, y, z], -1) / r[:, None]
    dots = P @ FACES[:, 0].T                             # (N, 6)
    face = np.argmax(dots, axis=1)
    ir = r / grid['dr'] - 0.5
    out = [np.zeros(r.size, np.float32) for _ in fields]
    for f in range(6):
        sel = np.nonzero(face == f)[0]
        if sel.size == 0: continue
        Pf = P[sel]; dn = Pf @ FACES[f, 0]
        a = np.arctan((Pf @ FACES[f, 1]) / dn) / (math.pi / 4); b = np.arctan((Pf @ FACES[f, 2]) / dn) / (math.pi / 4)
        ia = np.clip((a + 1) / 2 * M - 0.5, 0, M - 1) + f * M
        ib = np.clip((b + 1) / 2 * M - 0.5, 0, M - 1)
        # keep the bilinear footprint inside the face
        ia = np.minimum(ia, f * M + M - 1.0001)
        for k, fp in enumerate(fields):
            out[k][sel] = trilinear(fp, ir[sel], ia, ib)
    for k in range(len(out)):
        out[k][r > grid['nr'] * grid['dr']] = 0
        out[k] = out[k].reshape(X.shape)
    return out, r.reshape(X.shape)


def blur(v, taps):
    """separable binomial blur (clamped edges) along all three axes."""
    w = np.array(taps, np.float32); w /= w.sum(); h = len(w) // 2
    for ax in range(3):
        p = np.pad(v, [(h, h) if a == ax else (0, 0) for a in range(3)], mode='edge')
        n = v.shape[ax]
        v = sum(w[i] * np.take(p, np.arange(i, i + n), axis=ax) for i in range(len(w))).astype(np.float32)
    return v


def warp_pos(axis, s):
    c, h, a = WARP[axis]
    return c + h * np.sinh(a * s) / math.sinh(a)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'volumes'))
    ap.add_argument('--preview', default=None)
    ap.add_argument('--seed', type=int, default=1976)
    args = ap.parse_args()

    n = build_density(args.seed)

    # output voxel positions (warped), 2x2x2 supersampled
    NX, NY, NZ = OUT_N
    def axis_pts(N, axis):
        s = -1 + (np.arange(N) + 0.5) * 2 / N
        offs = np.array([-0.25, 0.25]) * 2 / N
        return np.stack([warp_pos(axis, s + o) for o in offs]).astype(np.float32)   # (2, N)
    PXs, PYs, PZs = axis_pts(NX, 'x'), axis_pts(NY, 'y'), axis_pts(NZ, 'z')
    acc = {k: np.zeros((NZ, NY, NX), np.float32) for k in ('ha', 'o3', 'low', 'fopt', 'dust')}
    grids = []
    for st in STARS:
        log('march', st['name'])
        g = march_star(n, st)
        r_axis = (np.arange(g['nr']) + 0.5) * g['dr']
        # O++ needs photons > 35 eV: only the hard field close to theta-1 C (O7V) keeps oxygen doubly ionised
        fO = (st['hard'] / (1 + (r_axis / 4.5) ** 2)).astype(np.float32)[:, None, None]
        ha = smear_inward(g['dep'], g['dr'], 0.11)
        o3 = smear_inward(g['dep'], g['dr'], 0.3) * fO
        low = smear_inward(g['dep'], g['dr'], 0.05) * (0.3 + 0.7 * (1 - np.minimum(fO, 1)))
        grids.append((st, g, [ha, o3, low, g['fopt']]))
        del ha, o3, low
        del g['dep']
    log('resample to output grid')
    fi = lambda v, lo: (v - lo) / FINE - 0.5
    for a in range(2):
        for b in range(2):
            for c in range(2):
                Z = PZs[a][:, None, None]; Y = PYs[b][None, :, None]; X = PXs[c][None, None, :]
                Zb, Yb, Xb = np.broadcast_arrays(Z, Y, X)
                acc['dust'] += trilinear(n, fi(Zb, ZMIN), fi(Yb, -HY), fi(Xb, -HX)) / 8
                for st, g, fields in grids:
                    (ha, o3, low, fo), _ = sph_sample(fields, st, g, Xb, Yb, Zb)
                    acc['ha'] += ha / 8; acc['o3'] += o3 / 8; acc['low'] += low / 8; acc['fopt'] += fo / 8
        log(f'supersample {a + 1}/2')
    del grids
    # ionisation fronts are thinner than a voxel: spread them over ~2 voxels so a trilinear
    # fetch does not produce terraced iso-lines when a thin sheet is seen at grazing angles
    for k in ('ha', 'o3', 'low', 'fopt'):
        acc[k] = blur(acc[k], (1, 4, 6, 4, 1))
    acc['dust'] = blur(acc['dust'], (1, 2, 1))
    scat =acc['dust'] * KAPPA_V * ALBEDO * acc['fopt']
    chans = {'ha': acc['ha'], 'o3': acc['o3'], 'low': acc['low'], 'scat': scat}
    scales = {}
    enc = {}
    for k, v in chans.items():
        vmax = float(np.percentile(v, 99.995))
        scales[k] = vmax
        e = 1 + np.log10(np.maximum(v, 1e-30) / vmax) / DEC
        enc[k] = np.clip(np.round(e * 255), 0, 255).astype(np.uint8)
    dmax = float(np.percentile(acc['dust'], 99.9))
    scales['dust'] = dmax * KAPPA_V       # decoded: extinction per ly (visual) = scale * enc^2
    enc_d = np.clip(np.round(np.sqrt(np.clip(acc['dust'] / dmax, 0, 1)) * 255), 0, 255).astype(np.uint8)
    emis = np.stack([enc['ha'], enc['o3'], enc['low'], enc['scat']], axis=-1)   # (NZ,NY,NX,4)
    log('scales', {k: f'{v:.4g}' for k, v in scales.items()})

    # detail noise (tiling)
    g1 = grf((DETAIL_N,) * 3, 1.0, -3.0, lmin=1.2, seed=args.seed + 51)
    g2 = grf((DETAIL_N,) * 3, 1.0, -2.6, lmin=1.0, seed=args.seed + 52)
    d1 = np.clip(0.5 + 0.2 * g1, 0, 1)
    d2 = np.clip(1 - np.abs(g2) / 2.2, 0, 1) ** 3
    detail = np.stack([np.round(d1 * 255), np.round(d2 * 255)], axis=-1).astype(np.uint8)

    os.makedirs(args.out, exist_ok=True)
    blob = emis.tobytes() + enc_d.tobytes() + detail.tobytes()
    with open(os.path.join(args.out, 'orion_m42.vol'), 'wb') as fh:
        fh.write(gzip.compress(blob, 9, mtime=0))
    meta = {
        'name': 'Orion Nebula (M42/M43)', 'frame': 'x=East y=North z=away from Earth, light-years, theta1 Ori C at origin',
        'dims': [NX, NY, NZ], 'warp': WARP, 'encoding': {'emission': f'log10, {DEC} decades', 'dust': 'sqrt'}, 'dec': DEC,
        'scales': scales, 'albedo': ALBEDO, 'envelope': 0.97,
        # display grading used by the browser (see NebulaVolume.js)
        'render': {'gain': 0.1, 'gamma': 0.62, 'chanGain': [0.85, 2.0, 1.5, 1.9], 'detail': 0.9, 'detailTile': 1.4},
        'layout': [{'name': 'emission', 'format': 'RGBA', 'bytes': emis.nbytes}, {'name': 'dust', 'format': 'R', 'bytes': enc_d.nbytes},
                   {'name': 'detail', 'format': 'RG', 'dims': [DETAIL_N] * 3, 'bytes': detail.nbytes}],
        'stars': [{'name': s['name'], 'p': s['p'], 'Q': s['Q'], 'L': s['L']} for s in STARS],
    }
    with open(os.path.join(args.out, 'orion_m42.json'), 'w') as fh:
        json.dump(meta, fh, indent=1)
    log('wrote', os.path.getsize(os.path.join(args.out, 'orion_m42.vol')) / 1e6, 'MB (gz) raw', len(blob) / 1e6)
    if args.preview:
        from preview import render_previews
        render_previews(emis, enc_d, meta, args.preview)


if __name__ == '__main__':
    main()
