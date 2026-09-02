// Analytic structural model of the Milky Way (light-years, galaxy model frame:
// u toward the Sun, w = galactic north). Used both to sample the galaxy-wide
// particle layers and to generate local star chunks on demand, so the two
// levels of detail agree.
import { Rng } from '../core/Random.js';
import { GC_DISTANCE_LY } from '../core/Units.js';

export const GALAXY = {
  discScale: 11500,      // exponential scale length
  discMax: 60000,
  hThin: 1000,           // old thin disc scale height
  hYoung: 320,           // young population scale height
  hThick: 3000,
  bulgeR: 5200,
  bar: { len: 13500, w: 4300, h: 3200, angle: 27 * Math.PI / 180 },
  arms: [
    { name: 'Scutum–Centaurus', rCross: 15500, pitch: 12.8, width: 2100, rMin: 8500,  rMax: 47000, strength: 1.0,  young: 1.0 },
    { name: 'Sagittarius–Carina', rCross: 21000, pitch: 13.4, width: 1500, rMin: 9500,  rMax: 42000, strength: 0.62, young: 0.85 },
    { name: 'Perseus', rCross: 33300, pitch: 12.6, width: 2300, rMin: 11000, rMax: 56000, strength: 1.0,  young: 1.0 },
    { name: 'Outer', rCross: 45500, pitch: 12.9, width: 2600, rMin: 19000, rMax: 62000, strength: 0.5,  young: 0.6 },
    { name: 'Orion Spur', rCross: GC_DISTANCE_LY, pitch: 17.5, width: 950, rMin: 23500, rMax: 30500, strength: 0.42, young: 0.9 },
  ],
};

for (const a of GALAXY.arms) a.tanP = Math.tan(a.pitch * Math.PI / 180);

const TAU = Math.PI * 2;
function wrapPi(a) { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; }

/** Azimuth of arm at radius r (log spiral, trailing, CCW outward from the NGP). */
export function armTheta(arm, r) { return Math.log(r / arm.rCross) / arm.tanP; }

/** Arm enhancement sum at (r, theta): Σ strength·gauss(perp distance / width). */
export function armFactor(r, theta, youngOnly = false) {
  let s = 0;
  for (const a of GALAXY.arms) {
    if (r < a.rMin * 0.85 || r > a.rMax * 1.15) continue;
    const edge = smooth01((r - a.rMin * 0.85) / (a.rMin * 0.3)) * (1 - smooth01((r - a.rMax * 0.9) / (a.rMax * 0.25)));
    const dth = wrapPi(theta - armTheta(a, r));
    const d = r * dth * Math.cos(a.pitch * Math.PI / 180);
    const w = a.width * (0.8 + 0.5 * r / 30000);
    const g = Math.exp(-0.5 * (d * d) / (w * w));
    s += (youngOnly ? a.young : 1) * a.strength * g * edge;
  }
  return s;
}

function smooth01(x) { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * (3 - 2 * x); }
function sech2(x) { const c = Math.cosh(x); return 1 / (c * c); }

/** Relative stellar number density (all stars) at model position (ly). */
export function density(u, v, w) {
  const r = Math.hypot(u, v);
  const theta = Math.atan2(v, u);
  const G = GALAXY;
  // bulge (flattened Sérsic-like)
  const rs = Math.sqrt(u * u + v * v + (w * w) / (0.62 * 0.62));
  const bulge = 60 * Math.exp(-Math.pow(rs / G.bulgeR, 1.05));
  // bar
  const cb = Math.cos(G.bar.angle), sb = Math.sin(G.bar.angle);
  const bu = u * cb + v * sb, bv = -u * sb + v * cb;
  const bar = 18 * Math.exp(-((bu * bu) / (G.bar.len * G.bar.len) + (bv * bv) / (G.bar.w * G.bar.w) + (w * w) / (G.bar.h * G.bar.h)) * 1.4);
  // discs
  const trunc = 1 - smooth01((r - G.discMax) / 8000);
  const radial = Math.exp(-r / G.discScale) * trunc;
  const inner = smooth01((r - 3500) / 4000); // disc weak inside the bar/bulge
  const arms = armFactor(r, theta);
  const old = 1.0 * radial * sech2(w / G.hThin) * (0.8 + 0.45 * arms) * (0.35 + 0.65 * inner);
  const thick = 0.12 * radial * sech2(w / G.hThick);
  const young = 1.45 * radial * sech2(w / G.hYoung) * armFactor(r, theta, true) * inner;
  // halo
  const rsph = Math.sqrt(u * u + v * v + w * w);
  const halo = 0.004 * Math.pow(1 + (rsph * rsph) / (18000 * 18000), -1.4);
  return bulge + bar + old + thick + young + halo;
}

/** Fraction of "young/hot" population at a point (0..1). */
export function youngFraction(u, v, w) {
  const r = Math.hypot(u, v), theta = Math.atan2(v, u);
  const G = GALAXY;
  const inner = smooth01((r - 3500) / 4000);
  const radial = Math.exp(-r / G.discScale);
  const young = 1.45 * radial * sech2(w / G.hYoung) * armFactor(r, theta, true) * inner;
  const tot = density(u, v, w);
  return tot > 0 ? Math.min(1, young / tot) : 0;
}

export const DENSITY_AT_SUN = density(GC_DISTANCE_LY, 0, 65);
export const STARS_PER_LY3_SUN = 0.0032;
/** Convert relative density to stars per cubic light-year. */
export function starsPerLy3(u, v, w) { return density(u, v, w) / DENSITY_AT_SUN * STARS_PER_LY3_SUN; }

// ---------------------------------------------------------------------------
// Stellar population sampling
// ---------------------------------------------------------------------------
// Spectral classes: temperature (K), luminosity (L☉), number fraction by population
export const SPECTRAL = {
  O: { t: 38000, L: 60000, r: 8.0,  main: 0.00003, young: 0.004 },
  B: { t: 17000, L: 1500,  r: 4.0,  main: 0.0013,  young: 0.12 },
  A: { t: 8500,  L: 22,    r: 1.8,  main: 0.006,   young: 0.22 },
  F: { t: 6800,  L: 3.5,   r: 1.25, main: 0.03,    young: 0.24 },
  G: { t: 5700,  L: 1.0,   r: 1.0,  main: 0.076,   young: 0.16 },
  K: { t: 4500,  L: 0.28,  r: 0.78, main: 0.12,    young: 0.13 },
  M: { t: 3300,  L: 0.03,  r: 0.45, main: 0.765,   young: 0.126 },
};
const CLASSES = ['O', 'B', 'A', 'F', 'G', 'K', 'M'];
const CUM_MAIN = [], CUM_YOUNG = [];
{ let a = 0, b = 0; for (const c of CLASSES) { a += SPECTRAL[c].main; b += SPECTRAL[c].young; CUM_MAIN.push(a); CUM_YOUNG.push(b); } }

/**
 * Sample a star: returns {cls, temp, lum, radius, kind} where kind ∈ main|giant|supergiant|whitedwarf|neutron|bluestraggler
 */
export function sampleStar(rng, young = 0, bulge = 0) {
  const u = rng.float();
  const cum = rng.float() < young ? CUM_YOUNG : CUM_MAIN;
  let ci = CLASSES.length - 1;
  for (let i = 0; i < cum.length; i++) if (u < cum[i] / cum[cum.length - 1]) { ci = i; break; }
  const cls = CLASSES[ci];
  const S = SPECTRAL[cls];
  let temp = S.t * (0.88 + 0.24 * rng.float());
  let lum = S.L * Math.exp(rng.gauss() * 0.35);
  let radius = S.r * (0.85 + 0.3 * rng.float());
  let kind = 'main';
  const e = rng.float();
  // evolved stars: more common in old populations (bulge)
  const giantP = 0.012 + 0.03 * bulge + 0.006 * (1 - young);
  if ((cls === 'K' || cls === 'G' || cls === 'M') && e < giantP) {
    kind = 'giant'; temp = 3600 + 900 * rng.float(); lum = 40 + 300 * Math.pow(rng.float(), 2); radius = 15 + 60 * rng.float();
  } else if (e < giantP + 0.0012 && young > 0.3) {
    kind = 'supergiant'; temp = rng.float() < 0.5 ? 3500 + 500 * rng.float() : 12000 + 15000 * rng.float(); lum = 20000 + 200000 * rng.float(); radius = temp < 6000 ? 500 + 800 * rng.float() : 30 + 40 * rng.float();
  } else if (e < giantP + 0.0012 + 0.05 && (cls === 'M' || cls === 'K')) {
    // white dwarfs are numerous but faint
    if (rng.float() < 0.09) { kind = 'whitedwarf'; temp = 9000 + 20000 * rng.float(); lum = 0.002 + 0.01 * rng.float(); radius = 0.012; }
  } else if (e > 0.99985) {
    kind = 'neutron'; temp = 600000; lum = 0.05; radius = 0.00002;
  }
  return { cls, temp, lum, radius, kind };
}

/** Blackbody-ish colour from temperature (linear RGB, roughly) */
export function starColor(t, out = [1, 1, 1]) {
  t = Math.min(Math.max(t, 1000), 40000) / 100;
  let r, g, b;
  if (t <= 66) { r = 1; g = Math.min(1, Math.max(0, (99.4708025861 * Math.log(t) - 161.1195681661) / 255)); }
  else { r = Math.min(1, Math.max(0, 329.698727446 * Math.pow(t - 60, -0.1332047592) / 255)); g = Math.min(1, Math.max(0, 288.1221695283 * Math.pow(t - 60, -0.0755148492) / 255)); }
  if (t >= 66) b = 1; else if (t <= 19) b = 0; else b = Math.min(1, Math.max(0, (138.5177312231 * Math.log(t - 10) - 305.0447927307) / 255));
  out[0] = r * r; out[1] = g * g; out[2] = b * b; // to linear-ish
  return out;
}

// ---------------------------------------------------------------------------
// Galaxy-wide sampling (positions in ly). Fills typed arrays.
// ---------------------------------------------------------------------------
export function sampleGalaxyStars(count, seed = 1337) {
  const rng = new Rng(seed);
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const lum = new Float32Array(count);
  const G = GALAXY;
  const c = [0, 0, 0];
  const armWeights = G.arms.map(a => a.strength * a.young);
  const armTotal = armWeights.reduce((a, b) => a + b, 0);
  let i = 0;
  while (i < count) {
    const comp = rng.float();
    let u, v, w, young = 0, bulge = 0;
    if (comp < 0.20) { // bulge
      const rr = Math.abs(rng.gauss()) * G.bulgeR * 0.75 + Math.abs(rng.gauss()) * 300;
      const dir = rng.unitVector();
      u = dir[0] * rr; v = dir[1] * rr; w = dir[2] * rr * 0.62; bulge = 1;
    } else if (comp < 0.28) { // bar
      const bu = rng.gauss() * G.bar.len * 0.55, bv = rng.gauss() * G.bar.w * 0.5, bw = rng.gauss() * G.bar.h * 0.5;
      const cb = Math.cos(G.bar.angle), sb = Math.sin(G.bar.angle);
      u = bu * cb - bv * sb; v = bu * sb + bv * cb; w = bw; bulge = 0.7;
    } else if (comp < 0.70) { // old disc (with mild arm attraction)
      let r = -G.discScale * Math.log(rng.float() * rng.float() + 1e-9);
      if (r > G.discMax) continue;
      let theta = rng.float() * TAU;
      if (rng.float() < 0.35 && r > 7000) {
        // attract toward the nearest arm
        let best = null, bd = 1e9;
        for (const a of G.arms) { if (r < a.rMin || r > a.rMax) continue; const d = Math.abs(wrapPi(theta - armTheta(a, r))); if (d < bd) { bd = d; best = a; } }
        if (best) theta = armTheta(best, r) + rng.gauss() * (best.width * 2.2 / r);
      }
      const h = rng.float() < 0.85 ? G.hThin : G.hThick;
      w = h * Math.atanh(Math.max(-0.999, Math.min(0.999, 2 * rng.float() - 1)));
      u = r * Math.cos(theta); v = r * Math.sin(theta);
    } else if (comp < 0.955) { // young arm population
      let r = -(G.discScale * 1.25) * Math.log(rng.float() * rng.float() + 1e-9);
      if (r < 8000 || r > G.discMax) continue;
      let pick = rng.float() * armTotal, arm = G.arms[0];
      for (let k = 0; k < G.arms.length; k++) { pick -= armWeights[k]; if (pick <= 0) { arm = G.arms[k]; break; } }
      if (r < arm.rMin || r > arm.rMax) continue;
      const theta = armTheta(arm, r) + rng.gauss() * (arm.width * 2.3 / r);
      w = G.hYoung * Math.atanh(Math.max(-0.999, Math.min(0.999, 2 * rng.float() - 1)));
      u = r * Math.cos(theta); v = r * Math.sin(theta); young = 0.85;
    } else { // halo
      const rr = rng.powerLaw(6000, 90000, -2.6);
      const dir = rng.unitVector();
      u = dir[0] * rr; v = dir[1] * rr; w = dir[2] * rr * 0.8; bulge = 0.5;
    }
    const s = sampleStar(rng, young, bulge);
    starColor(s.temp, c);
    // bias very faint stars away: the galaxy-wide layer represents the bright end
    if (s.lum < 0.3 && rng.float() < 0.85) continue;
    pos[i * 3] = u; pos[i * 3 + 1] = v; pos[i * 3 + 2] = w;
    col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
    lum[i] = s.lum;
    i++;
  }
  return { pos, col, lum };
}

/** Sample sprite positions on the arms (for gas/dust/HII layers). */
export function sampleArmSprites(count, seed, opts = {}) {
  const rng = new Rng(seed);
  const { inward = 0, spread = 0.9, hScale = 300, rMinAll = 7500, discOnly = false } = opts;
  const G = GALAXY;
  const out = new Float32Array(count * 3);
  const meta = new Float32Array(count * 2); // r, armIndex
  const armWeights = G.arms.map(a => a.strength);
  const armTotal = armWeights.reduce((a, b) => a + b, 0);
  let i = 0;
  while (i < count) {
    let r = -(G.discScale * 1.2) * Math.log(rng.float() * rng.float() + 1e-9);
    if (r < rMinAll || r > G.discMax) continue;
    let theta;
    let ai = -1;
    if (discOnly) {
      theta = rng.float() * TAU;
    } else {
      let pick = rng.float() * armTotal; ai = 0;
      for (let k = 0; k < G.arms.length; k++) { pick -= armWeights[k]; if (pick <= 0) { ai = k; break; } }
      const arm = G.arms[ai];
      if (r < arm.rMin || r > arm.rMax) continue;
      // dust lanes sit on the concave (inner) edge of the arm: shift azimuth
      theta = armTheta(arm, r) + rng.gauss() * (arm.width * spread / r) - inward * (arm.width * 0.8 / r);
    }
    const w = hScale * Math.atanh(Math.max(-0.999, Math.min(0.999, 2 * rng.float() - 1)));
    out[i * 3] = r * Math.cos(theta); out[i * 3 + 1] = r * Math.sin(theta); out[i * 3 + 2] = w;
    meta[i * 2] = r; meta[i * 2 + 1] = ai;
    i++;
  }
  return { pos: out, meta };
}
