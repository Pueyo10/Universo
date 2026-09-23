"""Regenerate the Moon and Mars globe textures from public-domain NASA / USGS data.

    python tools/planet_maps.py [--src DIR] [--only moon|mars]

Sources are downloaded (once) into --src, by default %TEMP%/planetmaps -- never into the repo:

  Moon colour  NASA SVS CGI Moon Kit (ID 4720), 2025 colour map lroc_color_16bit_srgb_8k.tif
               (LRO WAC Hapke-normalised mosaic, 643/566/415 nm as R/G/B)
  Moon relief  CGI Moon Kit ldem_16_uint.tif (LOLA gridded DEM, 16 px/deg, uint16 half-metres + 10 km)
  Mars colour  USGS Astrogeology Mars_Viking_ClrMosaic_global_925m.tif (Viking MDIM colour mosaic)
  Mars relief  PDS MGS MOLA MEGDR megt90n000eb.img (16 px/deg, int16 metres above the areoid)

All maps are equirectangular, 0 deg longitude in the middle (u = 0 at 180 W), north up.
Outputs (public/textures):
  2k_moon.jpg, 8k/8k_moon.jpg, 2k_moon_normal.jpg, 8k/4k_moon_normal.jpg
  2k_mars.jpg, 8k/8k_mars.jpg, 2k_mars_normal.jpg, 8k/4k_mars_normal.jpg
Normal maps are tangent space, OpenGL convention (R = east, G = north), as the planet shader expects.

Requires numpy, pillow, tifffile, imagecodecs (the Moon colour TIFF is LZW-compressed).
"""
import argparse
import os
import sys
import tempfile
import urllib.request

import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'textures')

SVS = 'https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/'
SOURCES = {
    'lroc_color_16bit_srgb_8k.tif': SVS + 'lroc_color_16bit_srgb_8k.tif',
    'ldem_16_uint.tif': SVS + 'ldem_16_uint.tif',
    'Mars_Viking_ClrMosaic_global_925m.tif': 'https://planetarymaps.usgs.gov/mosaic/Mars_Viking_ClrMosaic_global_925m.tif',
    'megt90n000eb.img': 'https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg016/megt90n000eb.img',
}

# ---- tuning --------------------------------------------------------------------------------------------------------
# Albedo level of the maps in linear units (the renderer multiplies albedo by N.L; the image-based auto exposure then
# frames it, so these set the balance between bodies and against the streamed tiles rather than absolute brightness).
# The Moon keeps roughly the level the app was calibrated with; Mars' median is lower because its maps are strongly red
# (luminance is dominated by green) and its dust-filled atmosphere adds in-scatter on top.
MOON_MEAN_Y = 0.27
MARS_MEDIAN_Y = 0.19
# The SVS colour map is white-balanced on the highlands. The lunar spectrum is red-sloped everywhere, so in sunlight the
# Moon is a faintly warm grey: rebalance the global mean to these linear ratios, keeping the (real, few-percent) colour
# differences between maria and highlands at MOON_CHROMA of their mapped strength.
MOON_BALANCE = (1.06, 0.93)   # mean linear (R/G, B/G)
MOON_CHROMA = 0.6
# Mars is recoloured from its Viking albedo pattern with measured reflectance spectra: the Viking colour mosaic's
# synthetic green makes the dark basaltic regions slate blue and the whole planet too saturated. Linear-RGB ratios
# (R/G, B/G) of the end members, integrated from telescopic / orbital spectra of Mars:
MARS_DUST = (2.55, 0.40)      # bright ferric dust (Arabia, Tharsis): butterscotch
MARS_DARK = (1.60, 0.66)      # dark basaltic sands (Syrtis Major, Acidalia): brown-grey
MARS_ICE = (1.04, 0.96)       # residual polar caps / frost: off-white
MARS_CONTRAST = 0.92          # Viking albedo contrast is stretched; real bright/dark ratio in the visible is ~2.5
# Relief: baked slope exaggeration of the normal maps (1 = true slopes). Without cast shadows the eye reads normal-only
# shading as flatter than a photograph, so the globe-scale maps are modestly exaggerated.
MOON_RELIEF = 1.6
MARS_RELIEF = 2.2
MOON_R, MARS_R = 1737400.0, 3396000.0


def fetch(src, name):
    path = os.path.join(src, name)
    if not os.path.exists(path):
        print('downloading', SOURCES[name])
        urllib.request.urlretrieve(SOURCES[name], path + '.part')
        os.replace(path + '.part', path)
    return path


def srgb_to_lin(x):
    return np.where(x <= 0.04045, x / 12.92, ((x + 0.055) / 1.055) ** 2.4).astype(np.float32)


def lin_to_srgb(x):
    x = np.clip(x, 0.0, 1.0)
    return np.where(x <= 0.0031308, x * 12.92, 1.055 * np.power(x, 1 / 2.4) - 0.055)


def resize_lin(lin, w, h):
    """Area-average a linear float image (H, W, C) to (h, w, C)."""
    return np.stack([np.asarray(Image.fromarray(lin[..., c]).resize((w, h), Image.BOX)) for c in range(lin.shape[2])], -1)


def save_srgb_jpeg(lin, path, quality):
    rgb = (lin_to_srgb(lin) * 255.0 + 0.5).astype(np.uint8)
    Image.fromarray(rgb).save(path, quality=quality, optimize=True, progressive=True, subsampling=2)
    print(f'  {os.path.relpath(path, ROOT)}  {rgb.shape[1]}x{rgb.shape[0]}  {os.path.getsize(path) / 1e6:.2f} MB')


def lat_weights(h):
    lat = np.radians(90.0 - (np.arange(h) + 0.5) * 180.0 / h)
    return lat, np.cos(lat)


def mean_y(lin):
    h = lin.shape[0]
    _, w = lat_weights(h)
    y = lin @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    return float((y.mean(1) * w).sum() / w.sum())


# ---- relief -------------------------------------------------------------------------------------------------------
def normal_map(dem, radius, w, exaggeration, path, quality=95):
    """Tangent-space normal map from an equirectangular height field (metres). Heights are area-averaged to the output
    size first so the slopes match what that mip level can show."""
    h = w // 2
    z = np.asarray(Image.fromarray(dem.astype(np.float32)).resize((w, h), Image.BOX)).astype(np.float64)
    lat, coslat = lat_weights(h)
    dx = 2 * np.pi * radius * np.maximum(coslat, 1e-3) / w      # metres per texel, east
    dy = np.pi * radius / h                                        # metres per texel, north
    gx = (np.roll(z, -1, 1) - np.roll(z, 1, 1)) / (2 * dx[:, None])
    zn = np.vstack([z[:1], z[:-1]])      # row above = further north
    zs = np.vstack([z[1:], z[-1:]])
    gy = (zn - zs) / (2 * dy)
    # the tangent frame degenerates at the poles: fade to flat over the last few degrees
    fade = np.clip((90.0 - np.abs(np.degrees(lat))) / 3.0, 0.0, 1.0)[:, None]
    nx, ny = -gx * exaggeration * fade, -gy * exaggeration * fade
    inv = 1.0 / np.sqrt(nx * nx + ny * ny + 1.0)
    n = np.stack([nx * inv, ny * inv, inv], -1)
    rgb = np.clip(np.round((n * 0.5 + 0.5) * 255.0), 0, 255).astype(np.uint8)
    Image.fromarray(rgb).save(path, quality=quality, optimize=True, subsampling=0)
    slope = np.degrees(np.arctan(np.hypot(gx, gy)))
    print(f'  {os.path.relpath(path, ROOT)}  {w}x{h}  {os.path.getsize(path) / 1e6:.2f} MB  (true slope p50 {np.percentile(slope, 50):.2f} deg, p99 {np.percentile(slope, 99):.1f} deg)')


# ---- Moon ---------------------------------------------------------------------------------------------------------
def moon(src):
    import tifffile
    print('Moon colour (LROC WAC, SVS CGI Moon Kit 2025)')
    rgb16 = tifffile.imread(fetch(src, 'lroc_color_16bit_srgb_8k.tif'))
    lin = srgb_to_lin(rgb16.astype(np.float32) / 65535.0)
    del rgb16
    small = lin[::4, ::4].reshape(-1, 3)
    m = small.mean(0)
    for c in range(3):      # neutral mean, then the warm balance, with the local colour contrast scaled around luminance
        lin[..., c] *= m[1] / m[c]
    y = lin @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    for c in range(3):
        lin[..., c] = y + (lin[..., c] - y) * MOON_CHROMA
    del y
    bal = np.array([MOON_BALANCE[0], 1.0, MOON_BALANCE[1]], np.float32)
    lin *= bal / float(bal @ np.array([0.2126, 0.7152, 0.0722], np.float32))
    gain = MOON_MEAN_Y / mean_y(lin[::4, ::4])
    lin *= gain
    m = lin[::4, ::4].reshape(-1, 3).mean(0)
    print(f'  gain {gain:.3f}  linear mean {m.round(3)}  R/G {m[0] / m[1]:.3f}  B/G {m[2] / m[1]:.3f}')
    save_srgb_jpeg(lin, os.path.join(OUT, '8k', '8k_moon.jpg'), 86)
    save_srgb_jpeg(resize_lin(lin, 2048, 1024), os.path.join(OUT, '2k_moon.jpg'), 90)
    del lin
    print('Moon relief (LOLA ldem_16)')
    dem = (tifffile.imread(fetch(src, 'ldem_16_uint.tif')).astype(np.float32) - 20000.0) * 0.5
    normal_map(dem, MOON_R, 2048, MOON_RELIEF, os.path.join(OUT, '2k_moon_normal.jpg'))
    normal_map(dem, MOON_R, 4096, MOON_RELIEF, os.path.join(OUT, '8k', '4k_moon_normal.jpg'))


# ---- Mars ---------------------------------------------------------------------------------------------------------
def viking_linear(path, w, h):
    """Viking colour mosaic (3, 11530, 23059 uint8, planar, 0 = no data) -> linear RGB (h, w, 3), holes filled."""
    import tifffile
    a = tifffile.memmap(path)
    valid = np.asarray(a[0]) > 0
    for c in (1, 2):
        valid &= np.asarray(a[c]) > 0
    wsum = np.asarray(Image.fromarray(valid.astype(np.float32)).resize((w, h), Image.BOX))
    chans = []
    for c in range(3):
        lin = srgb_to_lin(np.asarray(a[c]).astype(np.float32) / 255.0) * valid
        chans.append(np.asarray(Image.fromarray(lin).resize((w, h), Image.BOX)) / np.maximum(wsum, 1e-6))
        del lin
    out = np.stack(chans, -1)
    # rows with no data at all (polar edges): copy the nearest valid row
    good = wsum.mean(1) > 0.5
    idx = np.where(good)[0]
    for j in np.where(~good)[0]:
        out[j] = out[idx[np.argmin(np.abs(idx - j))]]
    return out


def mars(src):
    print('Mars colour (Viking MDIM colour mosaic, recoloured from spectra)')
    w, h = 8192, 4096
    v = viking_linear(fetch(src, 'Mars_Viking_ClrMosaic_global_925m.tif'), w, h)
    y = v @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    lat, _ = lat_weights(h)
    band = np.abs(np.degrees(lat)) < 60
    yref = float(np.median(y[band]))
    # redness of the Viking pixel: ~0 for dark sands and frost, ~1 for dust (log R/G between 1.1 and 3.4)
    red = np.clip((np.log(np.maximum(v[..., 0], 1e-4) / np.maximum(v[..., 1], 1e-4)) - np.log(1.1)) / (np.log(3.4) - np.log(1.1)), 0, 1)
    red = red * red * (3 - 2 * red)
    rel = y / yref
    ice = (1 - red) * np.clip((rel - 1.4) / 0.9, 0, 1)
    ice = ice * ice * (3 - 2 * ice)
    rg = MARS_DARK[0] + (MARS_DUST[0] - MARS_DARK[0]) * red
    bg = MARS_DARK[1] + (MARS_DUST[1] - MARS_DARK[1]) * red
    rg += (MARS_ICE[0] - rg) * ice
    bg += (MARS_ICE[1] - bg) * ice
    yo = MARS_MEDIAN_Y * np.power(np.maximum(rel, 1e-4), MARS_CONTRAST)
    g = yo / (0.2126 * rg + 0.7152 + 0.0722 * bg)
    lin = np.stack([g * rg, g, g * bg], -1).astype(np.float32)
    del v, y, red, rel, ice, rg, bg, yo, g
    m = lin[band].reshape(-1, 3).mean(0)
    print(f'  linear mean {m.round(3)}  R/G {m[0] / m[1]:.2f}  B/G {m[2] / m[1]:.2f}')
    save_srgb_jpeg(lin, os.path.join(OUT, '8k', '8k_mars.jpg'), 86)
    save_srgb_jpeg(resize_lin(lin, 2048, 1024), os.path.join(OUT, '2k_mars.jpg'), 90)
    del lin
    print('Mars relief (MOLA MEGDR 16 px/deg)')
    dem = np.fromfile(fetch(src, 'megt90n000eb.img'), dtype='>i2').reshape(2880, 5760).astype(np.float32)
    dem = np.roll(dem, 2880, axis=1)     # MEGDR starts at 0 E; the globe maps start at 180 W
    normal_map(dem, MARS_R, 2048, MARS_RELIEF, os.path.join(OUT, '2k_mars_normal.jpg'))
    normal_map(dem, MARS_R, 4096, MARS_RELIEF, os.path.join(OUT, '8k', '4k_mars_normal.jpg'))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--src', default=os.path.join(tempfile.gettempdir(), 'planetmaps'))
    ap.add_argument('--only', choices=['moon', 'mars'])
    args = ap.parse_args()
    os.makedirs(args.src, exist_ok=True)
    if args.only in (None, 'moon'):
        moon(args.src)
    if args.only in (None, 'mars'):
        mars(args.src)


if __name__ == '__main__':
    sys.exit(main())
