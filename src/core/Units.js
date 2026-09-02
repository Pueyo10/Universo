// ---------------------------------------------------------------------------
// Units & frames
// Scene unit = 1000 km ("megametre"). All positions are kept in float64 (JS
// numbers) and only converted to float32 by the GPU in camera-relative form,
// which keeps precision from a planet's surface up to intergalactic distances.
// ---------------------------------------------------------------------------
import { Vector3, Matrix4, Quaternion } from 'three';
import { UI } from '../i18n/ui.js';
const U = (k) => { const l = document.documentElement.lang === 'es' ? 'es' : 'en'; return UI[l][k]; };

export const UNIT_KM = 1000;                       // km per scene unit
export const KM = 1 / UNIT_KM;                     // scene units per km
export const AU_KM = 149597870.7;
export const AU = AU_KM / UNIT_KM;                 // 149 597.87 units
export const LY_KM = 9.4607304725808e12;
export const LY = LY_KM / UNIT_KM;                 // 9.46e9 units
export const PC = LY * 3.26156;
export const KPC = PC * 1000;
export const MLY = LY * 1e6;

export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;
export const TAU = Math.PI * 2;

export const DAY_MS = 86400000;
export const DAY_S = 86400;
export const YEAR_D = 365.25;
export const J2000_MS = Date.UTC(2000, 0, 1, 12, 0, 0);

export const SUN_RADIUS_KM = 695700;
export const EARTH_RADIUS_KM = 6371;
export const OBLIQUITY = 23.4392911 * DEG;

// Sun's distance to the galactic centre (Gravity Collaboration 2019: 8.178 kpc)
export const GC_DISTANCE_LY = 26673;
export const SUN_HEIGHT_LY = 65;   // above the galactic mid-plane (approx. 20 pc)

export function julianDate(ms) { return 2440587.5 + ms / DAY_MS; }
export function centuriesSinceJ2000(ms) { return (ms - J2000_MS) / (DAY_MS * 36525); }
export function daysSinceJ2000(ms) { return (ms - J2000_MS) / DAY_MS; }

// ---------------------------------------------------------------------------
// Coordinate frames
// Scene frame = ecliptic J2000 with Y = ecliptic north, planets orbit in XZ.
// ---------------------------------------------------------------------------

/** Equatorial (RA/Dec in degrees) → scene-frame unit vector. */
export function radecToVector(raDeg, decDeg, out = new Vector3()) {
  const ra = raDeg * DEG, dec = decDeg * DEG;
  const x = Math.cos(dec) * Math.cos(ra);
  const y = Math.cos(dec) * Math.sin(ra);
  const z = Math.sin(dec);
  const ce = Math.cos(OBLIQUITY), se = Math.sin(OBLIQUITY);
  const ye = y * ce + z * se;        // ecliptic y
  const ze = -y * se + z * ce;       // ecliptic z (north)
  return out.set(x, ze, -ye);
}

/** Ecliptic (lon/lat in degrees) → scene-frame unit vector. */
export function eclipticToVector(lonDeg, latDeg, out = new Vector3()) {
  const l = lonDeg * DEG, b = latDeg * DEG;
  const x = Math.cos(b) * Math.cos(l), y = Math.cos(b) * Math.sin(l), z = Math.sin(b);
  return out.set(x, z, -y);
}

/** Scene-frame direction → RA/Dec (degrees). */
export function vectorToRadec(v) {
  const x = v.x, ze = v.y, ye = -v.z;
  const ce = Math.cos(OBLIQUITY), se = Math.sin(OBLIQUITY);
  const y = ye * ce - ze * se;
  const z = ye * se + ze * ce;
  let ra = Math.atan2(y, x) * RAD; if (ra < 0) ra += 360;
  const dec = Math.asin(Math.max(-1, Math.min(1, z))) * RAD;
  return { ra, dec };
}

// Galactic frame (IAU 1958 / J2000): north galactic pole and centre direction.
const NGP = radecToVector(192.85948, 27.12825);
const GC_DIR = radecToVector(266.40500, -28.93617); // Sun → galactic centre
// Model axes: e_u points from GC toward the Sun, e_w = NGP, e_v = e_w × e_u
export const GAL_EU = GC_DIR.clone().negate().normalize();
export const GAL_EW = NGP.clone().normalize();
// re-orthogonalise
GAL_EU.sub(GAL_EW.clone().multiplyScalar(GAL_EU.dot(GAL_EW))).normalize();
export const GAL_EV = new Vector3().crossVectors(GAL_EW, GAL_EU).normalize();
export const GAL_CENTER_DIR = GC_DIR.clone().normalize();

/** Matrix: galaxy model coords (u,v,w in ly) → scene orientation (no scale). */
export const GALAXY_MATRIX = new Matrix4().makeBasis(GAL_EU, GAL_EV, GAL_EW);
export const GALAXY_QUAT = new Quaternion().setFromRotationMatrix(GALAXY_MATRIX);
export const GALAXY_MATRIX_INV = GALAXY_MATRIX.clone().invert();

/** Sun position in galaxy model coords (ly). */
export const SUN_GAL_POS = new Vector3(GC_DISTANCE_LY, 0, SUN_HEIGHT_LY);

/** Galaxy model coords (ly) → scene position relative to the Sun (scene units). */
export function galToScene(u, v, w, out = new Vector3()) {
  out.set(u - SUN_GAL_POS.x, v - SUN_GAL_POS.y, w - SUN_GAL_POS.z).applyMatrix4(GALAXY_MATRIX);
  return out.multiplyScalar(LY);
}

/** Scene position (relative to Sun, scene units) → galaxy model coords (ly). */
export function sceneToGal(p, out = new Vector3()) {
  out.copy(p).multiplyScalar(1 / LY).applyMatrix4(GALAXY_MATRIX_INV).add(SUN_GAL_POS);
  return out;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------
export function fmtNum(n, digits = 3) {
  if (!isFinite(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1e15 || (a > 0 && a < 1e-3)) return n.toExponential(2);
  if (a >= 1000) return Math.round(n).toLocaleString('en-US');
  return n.toLocaleString('en-US', { maximumSignificantDigits: digits });
}

export function formatDistance(units) {
  const km = units * UNIT_KM;
  const a = Math.abs(km);
  if (a < 1e4) return `${fmtNum(km, 4)} ${U('uKm')}`;
  if (a < 0.02 * AU_KM) return `${fmtNum(km / 1e3, 4)} ${U('uThousandKm')}`;
  if (a < 0.1 * LY_KM) return `${fmtNum(km / AU_KM, 4)} ${U('uAU')}`;
  if (a < 1000 * LY_KM) return `${fmtNum(km / LY_KM, 4)} ${U('uLy')}`;
  if (a < 1e6 * LY_KM) return `${fmtNum(km / LY_KM / 1000, 4)} ${U('uKly')}`;
  if (a < 1e9 * LY_KM) return `${fmtNum(km / LY_KM / 1e6, 4)} ${U('uMly')}`;
  return `${fmtNum(km / LY_KM / 1e9, 4)} ${U('uGly')}`;
}

export function formatSpeed(unitsPerSec) {
  const kms = unitsPerSec * UNIT_KM;
  const c = 299792.458;
  if (kms < 1) return `${fmtNum(kms * 1000, 3)} ${U('uMs')}`;
  if (kms < 0.01 * c) return `${fmtNum(kms, 4)} ${U('uKms')}`;
  if (kms < 1000 * c) return `${fmtNum(kms / c, 3)} ${U('uC')}`;
  if (kms < LY_KM / 1) return `${fmtNum(kms / (AU_KM), 3)} ${U('uAUs')}`;
  if (kms < LY_KM * 1e5) return `${fmtNum(kms / LY_KM, 3)} ${U('uLys')}`;
  return `${fmtNum(kms / LY_KM / 1e6, 3)} ${U('uMlys')}`;
}

export function formatDate(ms) {
  const d = new Date(ms);
  if (isNaN(d.getTime())) return '—';
  const p = (n) => String(n).padStart(2, '0');
  const y = d.getUTCFullYear();
  const ys = y < 0 ? `-${String(-y).padStart(4, '0')}` : String(y).padStart(4, '0');
  return `${ys}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} UTC`;
}

export function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function smoothstep(a, b, x) { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
export function expLerp(a, b, t) { return Math.exp(lerp(Math.log(a), Math.log(b), t)); }
export function damp(a, b, lambda, dt) { return lerp(a, b, 1 - Math.exp(-lambda * dt)); }
