"""
Saturn's rings radial profile from Cassini UVIS stellar occultations.

  python tools/rings_profile.py [--cache DIR] [--out public/textures/saturn_rings_cassini.bin] [--preview PNG]

Source: NASA PDS Ring-Moon Systems Node, volume COUVIS_8001 (Cassini UVIS High Speed
Photometer ring occultation profiles, Colwell et al. 2010), 10 km radial resolution:
  https://pds-rings.seti.org/holdings/volumes/COUVIS_8xxx/COUVIS_8001/data/
Seven ingress occultations of beta Centauri / alpha Crucis (ring opening 66-68 deg, the
most opaque-B-ring-capable geometry of the mission) are downloaded (~6 MB) into the cache
directory (default: %TEMP%/rings_data), interpolated onto a common grid and median-combined.
The median keeps sharp edges (at their median position) and removes noise.

What is measured and what is modelled
- normal optical depth tau(r), 74,000-136,800 km (C ring, B ring, Cassini Division,
  A ring with the Encke and Keeler gaps, density waves): measured (median of 7 profiles).
  The B ring core is clipped at tau = 6 (beyond UVIS' detection limit; opaque anyway).
- F ring (140,220 km): the measured profiles aligned on their peaks (it is eccentric) and
  averaged, then placed at its semi-major axis.
- Beyond the A ring the UVIS baseline drifts (unocculted-star model); it is forced to 0
  outside the F ring window.
- D ring (66,900-74,490 km, tau ~ 1e-4-1e-3, below UVIS noise): modelled after Hedman et
  al. 2007 (D68, D72, D73 ringlets), dust only.
- Particle single-scattering albedo / colour: a model after Voyager / Cassini ISS & VIMS
  photometry (Cuzzi et al. 2009, Nicholson et al. 2008, Filacchione et al. 2014): B ring
  reddest and brightest, A ring slightly less red, C ring and Cassini Division darker and
  greyer, with ballistic-transport ramps at the C/B and CD/A boundaries.
- Dust fraction (share of tau in micron-sized, forward-scattering grains): model; 1 in the
  D ring and the F ring envelope, ~0.85 in the gaps' dusty ringlets (Encke, Keeler...),
  0.2 Cassini Division, 0.08 C ring, 0.03 A ring, ~0 B ring.
Data: NASA PDS (public domain). Colwell, J. E. et al. (2010), Cassini UVIS Stellar
Occultation Ring Profiles, CO-SR-UVIS-HSP-2/4-OCC-V3.0.

Output (little-endian binary, ~48 KB):
  0  char[4]  'SRNG'
  4  uint32   version (1)
  8  uint32   N texels
  12 float32  inner radius, km (texel 0 left edge)
  16 float32  outer radius, km (texel N-1 right edge)
  20 12 bytes reserved
  32 uint16[N]   normal-incidence opacity 1 - exp(-tau), x 65535 (box average of
                 transmission over the texel)
  .. uint8[N*4]  R, G, B = particle single-scattering albedo (linear), A = dust fraction
"""
import argparse, os, struct, tempfile, urllib.request, warnings
import numpy as np

BASE = 'https://pds-rings.seti.org/holdings/volumes/COUVIS_8xxx/COUVIS_8001/data/'
PROFILES = [
    'UVIS_HSP_2008_188_BETCEN_I', 'UVIS_HSP_2008_202_BETCEN_I', 'UVIS_HSP_2008_231_BETCEN_I',
    'UVIS_HSP_2008_260_BETCEN_I', 'UVIS_HSP_2008_290_BETCEN_I', 'UVIS_HSP_2008_343_BETCEN_I',
    'UVIS_HSP_2008_312_ALPCRU_I',
]
R_IN, R_OUT, N = 66900.0, 141100.0, 8192       # km; ~9.06 km per texel (data: 10 km bins)
A_OUT = 136774.0                                # A ring outer edge
F_RING = 140221.0                               # F ring semi-major axis (Bosh et al. 2002)
TAU_MAX = 6.0


def fetch(cache):
    os.makedirs(cache, exist_ok=True)
    paths = []
    for p in PROFILES:
        for ext in ('.TAB', '.LBL'):
            f = os.path.join(cache, p + '_TAU10KM' + ext)
            if not os.path.exists(f):
                print('downloading', p + '_TAU10KM' + ext)
                urllib.request.urlretrieve(BASE + p + '_TAU10KM' + ext, f)
        paths.append(os.path.join(cache, p + '_TAU10KM.TAB'))
    return paths


def load(path):
    d = np.loadtxt(path, delimiter=',')
    r, tau, flag = d[:, 0], d[:, 4], d[:, 11].astype(int)
    tau = np.where((tau < 0) | (flag & (8 | 32 | 64) != 0), np.nan, tau)   # missing / planet / corrupted
    o = np.argsort(r)
    return r[o], tau[o]


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def gauss(x, c, w):
    return np.exp(-0.5 * ((x - c) / w) ** 2)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--cache', default=os.path.join(tempfile.gettempdir(), 'rings_data'))
    ap.add_argument('--out', default=os.path.join(os.path.dirname(__file__), '..', 'public', 'textures', 'saturn_rings_cassini.bin'))
    ap.add_argument('--preview', default=None, help='optional PNG plot of the result (needs matplotlib)')
    a = ap.parse_args()

    # ---- measured optical depth on a 1 km grid
    fine = np.arange(R_IN, R_OUT, 1.0) + 0.5
    stack, fring = [], []
    for path in fetch(a.cache):
        r, tau = load(path)
        ok = np.isfinite(tau)
        t = np.interp(fine, r[ok], tau[ok], left=np.nan, right=np.nan)
        t[(fine < r[ok].min()) | (fine > r[ok].max())] = np.nan
        stack.append(t)
        # F ring: align this profile's peak (eccentric ring) and keep a +-600 km window
        w = (r > 139300) & (r < 141100) & ok
        if w.sum() > 50:
            rr, tt = r[w], tau[w]
            pk = rr[np.argmax(tt)]
            x = np.arange(-600, 601, 1.0)
            seg = np.interp(pk + x, rr, tt)
            edge = np.r_[seg[:80], seg[-80:]]
            base = np.polyfit(np.r_[x[:80], x[-80:]], edge, 1)
            fring.append(np.clip(seg - np.polyval(base, x), 0, None))
    with warnings.catch_warnings():   # all-NaN columns outside the profiles' coverage
        warnings.simplefilter('ignore', RuntimeWarning)
        tau = np.nanmedian(np.array(stack), axis=0)
    tau = np.nan_to_num(tau, nan=0.0)
    tau = np.clip(tau, 0, TAU_MAX)
    # the median of 7 still carries ~0.002 noise; clean the empty gaps
    tau = np.where(tau < 0.002, 0.0, tau)
    # nothing measured interior to the C ring and beyond the A ring (baseline drift): rebuild
    tau[fine < 74400] = 0.0
    tau[fine > A_OUT + 15] = 0.0
    if fring:
        f = np.mean(fring, axis=0)
        x = np.arange(-600, 601, 1.0)
        tau += np.interp(fine - F_RING, x, f, left=0, right=0)
        print('F ring: %d profiles, peak tau (10 km) %.3f' % (len(fring), f.max()))
    # F ring dusty envelope (Showalter et al. 1992): ~500 km FWHM, tau ~ 2e-3
    tau += 2.0e-3 * gauss(fine, F_RING, 210)
    # D ring (Hedman et al. 2007): dusty ringlets, tau ~ 1e-4-1e-3
    d = (1.2e-3 * gauss(fine, 67630, 60) + 1.0e-3 * gauss(fine, 71710, 25)
         + 6e-4 * smooth(72600, 73300, fine) * (1 + 0.5 * np.sin(fine / 80.0)) * (1 - smooth(74300, 74500, fine))
         + 2e-4 * smooth(66900, 69000, fine) * (1 - smooth(72000, 73000, fine)))
    tau += d

    # ---- particle albedo (linear, per channel R ~ 650 nm, G ~ 550, B ~ 450) and dust fraction
    B_col = np.array([0.60, 0.50, 0.37])   # B ring: brightest and reddest
    A_col = np.array([0.56, 0.48, 0.38])   # A ring
    C_col = np.array([0.26, 0.235, 0.21])  # C ring: dark, neutral-grey
    CD_col = np.array([0.30, 0.27, 0.235]) # Cassini Division ~ C ring
    rr = fine[:, None]
    wB = smooth(91000, 94500, rr) * (1 - smooth(117300, 117700, rr))       # C/B ramp, sharp B outer edge
    wA = smooth(120800, 122400, rr)                                          # CD ramp into the A ring
    wCD = smooth(117300, 117700, rr) * (1 - wA)
    wC = 1 - smooth(91000, 94500, rr)
    col = wC * C_col + wB * B_col + wCD * CD_col + wA * A_col
    # B ring: denser bands slightly redder and brighter (Estrada & Cuzzi 1996)
    # (lit-side B ring I/F spans ~0.35-0.55 between its thin and opaque bands)
    bdense = np.clip((tau - 2.0) / 3.0, -0.6, 1.0)[:, None] * wB
    col = col * (1 + 0.18 * bdense * np.array([1.0, 0.9, 0.7]))
    # outer A ring slightly brighter / less red (beyond the Encke gap)
    col = col * (1 + 0.04 * smooth(133000, 136000, rr) * np.array([0.6, 0.9, 1.3]))
    # C ring and Cassini Division are notably bright at high phase (dusty, regolith-coated);
    # the dense B ring hardly scatters forwards
    dust = (1.0 * (fine < 74450) + 0.08 * ((fine >= 74450) & (fine < 91975)) + 0.005 * ((fine >= 91975) & (fine < 117570))
            + 0.20 * ((fine >= 117570) & (fine < 122050)) + 0.03 * ((fine >= 122050) & (fine < A_OUT))
            + 1.0 * (fine >= A_OUT))
    # dusty ringlets in the gaps (Encke, Keeler, Huygens...): low-tau material is mostly dust
    gapdust = smooth(0.03, 0.004, tau) * (fine > 117570)
    dust = np.maximum(dust, 0.85 * gapdust)
    # F ring core holds cm-m bodies too
    dust = np.where(np.abs(fine - F_RING) < 60, 0.7, dust)

    # ---- box-average onto N texels (transmission, not tau)
    per = len(fine) / N
    idx = np.minimum((np.arange(len(fine)) / per).astype(int), N - 1)
    cnt = np.bincount(idx, minlength=N)
    T = np.bincount(idx, weights=np.exp(-tau), minlength=N) / cnt
    opac = 1 - T
    w = 1e-6 + (1 - np.exp(-tau))       # weight colour/dust by opacity
    ws = np.bincount(idx, weights=w, minlength=N)
    colT = np.stack([np.bincount(idx, weights=w * col[:, k], minlength=N) / ws for k in range(3)], 1)
    dustT = np.bincount(idx, weights=w * dust, minlength=N) / ws

    op16 = np.round(np.clip(opac, 0, 1) * 65535).astype('<u2')
    rgba = np.zeros((N, 4), np.uint8)
    rgba[:, :3] = np.round(np.clip(colT, 0, 1) * 255)
    rgba[:, 3] = np.round(np.clip(dustT, 0, 1) * 255)
    out = os.path.abspath(a.out)
    with open(out, 'wb') as fh:
        fh.write(b'SRNG' + struct.pack('<IIff', 1, N, R_IN, R_OUT) + b'\0' * 12)
        fh.write(op16.tobytes()); fh.write(rgba.tobytes())
    print('wrote %s (%d bytes), %.2f km/texel' % (out, os.path.getsize(out), (R_OUT - R_IN) / N))
    rc = R_IN + (np.arange(N) + 0.5) * (R_OUT - R_IN) / N
    for name, lo, hi in [('C ring', 77000, 90000), ('B ring', 99000, 116000), ('Cassini Div', 118000, 120500), ('A ring', 123000, 133000)]:
        m = (rc > lo) & (rc < hi)
        print('  %-12s mean tau %.3f' % (name, np.mean(-np.log(np.maximum(T[m], 1e-9)))))

    if a.preview:
        import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
        fig, ax = plt.subplots(3, 1, figsize=(18, 10), sharex=True)
        ax[0].plot(rc, -np.log(np.maximum(T, 1e-9)), lw=0.5); ax[0].set_yscale('symlog', linthresh=0.01); ax[0].set_ylabel('tau')
        ax[1].imshow(np.repeat(np.clip(colT / 0.6, 0, 1)[None], 40, 0) ** (1 / 2.2), aspect='auto', extent=(R_IN, R_OUT, 0, 1))
        ax[2].plot(rc, dustT); ax[2].set_ylabel('dust')
        plt.tight_layout(); plt.savefig(a.preview, dpi=60)


if __name__ == '__main__':
    main()
