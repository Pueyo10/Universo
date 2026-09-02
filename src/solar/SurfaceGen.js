import { SimplexNoise, worley3 } from '../core/Noise.js';
import { Rng, hashString } from '../core/Random.js';

// Procedural planetary surface generation (pure math, no THREE): runs on the
// main thread or inside a Web Worker. Each recipe paints an equirectangular
// albedo map plus a height field; a tangent-space normal map is derived from
// the heights. Everything is seeded and deterministic.


function dirFromUV(u, v) {
  const lon = (u - 0.5) * Math.PI * 2, lat = (0.5 - v) * Math.PI;
  const cl = Math.cos(lat);
  return [cl * Math.cos(lon), Math.sin(lat), cl * Math.sin(lon)];
}

/** Crater field: returns [heightDelta, albedoDelta] at direction d for given density/scale. */
function craters(d, scale, seed, depth, rimH, count = 1, out = [0, 0]) {
  let h = 0, a = 0;
  const w = [0, 0, 0];
  for (let k = 0; k < count; k++) {
    const s = scale * Math.pow(2.3, k);
    worley3(d[0] * s + 7.1 * k, d[1] * s + 3.3 * k, d[2] * s + 9.7 * k, seed + k * 131, w);
    const f1 = w[0], hash = w[2];
    // each cell may or may not hold a crater; radius varies
    if (hash < 0.55) {
      const r = 0.18 + 0.3 * hash;
      const x = f1 / r;
      if (x < 1.0) {
        const bowl = -(1 - x * x) * depth * (0.7 + 0.6 * (1 - hash));
        const rim = Math.exp(-Math.pow((x - 0.85) / 0.12, 2)) * rimH;
        h += (bowl + rim) / Math.pow(1.6, k);
        // ejecta brighten, floor darken
        a += (rim * 1.2 - (1 - x) * 0.25 * depth) / Math.pow(1.5, k);
      } else if (x < 1.5) {
        a += Math.exp(-(x - 1) * 5) * 0.06 * rimH;
      }
    }
  }
  out[0] = h; out[1] = a;
  return out;
}

function mix(a, b, t) { return a + (b - a) * t; }
function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
function smooth(a, b, x) { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); }

// Recipes -----------------------------------------------------------------
// Each returns { color:[r,g,b], height } for direction d (unit vector), given noise n and rng-derived params.
const RECIPES = {
  generic(d, n, p) {
    const base = n.fbm3(d[0] * 3, d[1] * 3, d[2] * 3, 5);
    const cr = craters(d, 6, p.seed, 0.5, 0.25, 3);
    const v = 0.5 + 0.25 * base + cr[1];
    return { color: [p.tint[0] * v, p.tint[1] * v, p.tint[2] * v], height: base * 0.3 + cr[0] };
  },
  io(d, n) {
    const f = n.fbm3(d[0] * 2.5, d[1] * 2.5, d[2] * 2.5, 5);
    const g = n.warped3(d[0] * 4, d[1] * 4, d[2] * 4, 5, 0.6);
    const w = [0, 0, 0]; worley3(d[0] * 5, d[1] * 5, d[2] * 5, 11, w);
    const volcano = smooth(0.18, 0.0, w[0]) * (w[2] > 0.5 ? 1 : 0);
    const flow = smooth(0.3, 0.05, w[0]) * (w[2] > 0.5 ? 1 : 0);
    // sulfur palettes: yellow, orange, white, dark
    let r = 0.9 + 0.1 * f, gg = 0.78 + 0.15 * f, b = 0.28 + 0.2 * g;
    const white = smooth(0.25, 0.5, g);
    r = mix(r, 0.95, white); gg = mix(gg, 0.93, white); b = mix(b, 0.8, white);
    const orange = smooth(0.1, -0.2, f);
    r = mix(r, 0.85, orange); gg = mix(gg, 0.45, orange); b = mix(b, 0.12, orange);
    r = mix(r, 0.75, flow * 0.6); gg = mix(gg, 0.28, flow * 0.6); b = mix(b, 0.08, flow * 0.6);
    r = mix(r, 0.12, volcano); gg = mix(gg, 0.08, volcano); b = mix(b, 0.05, volcano);
    // polar greenish tint
    const pol = smooth(0.6, 0.95, Math.abs(d[1]));
    gg = mix(gg, gg * 1.05, pol); b = mix(b, b * 0.8, pol);
    return { color: [r, gg, b], height: 0.15 * f - volcano * 0.3 + flow * 0.05 };
  },
  europa(d, n) {
    const base = n.fbm3(d[0] * 3, d[1] * 3, d[2] * 3, 4);
    // lineae: ridged noise thresholds along warped domain
    const l1 = n.ridged3(d[0] * 5 + 3, d[1] * 5, d[2] * 5, 3);
    const l2 = n.ridged3(d[0] * 11 + 8, d[1] * 11, d[2] * 11, 3);
    const line = smooth(0.70, 0.92, l1) * 0.95 + smooth(0.78, 0.95, l2) * 0.7;
    const chaos = smooth(0.2, 0.5, n.fbm3(d[0] * 6 + 20, d[1] * 6, d[2] * 6, 3));
    let r = 0.88 + 0.08 * base, g = 0.86 + 0.08 * base, b = 0.82 + 0.08 * base;
    // brownish-red lineae
    r = mix(r, 0.55, line); g = mix(g, 0.32, line); b = mix(b, 0.18, line);
    r = mix(r, 0.7, chaos * 0.5); g = mix(g, 0.58, chaos * 0.5); b = mix(b, 0.45, chaos * 0.5);
    return { color: [r, g, b], height: -line * 0.06 + base * 0.03 };
  },
  ganymede(d, n) {
    const terr = n.fbm3(d[0] * 2.2, d[1] * 2.2, d[2] * 2.2, 5);
    const dark = smooth(0.1, -0.15, terr);
    const grooves = n.ridged3(d[0] * 9, d[1] * 9, d[2] * 9, 3);
    const cr = craters(d, 7, 21, 0.4, 0.3, 3);
    let v = mix(0.62, 0.32, dark) + 0.06 * (grooves - 0.5) * (1 - dark) + cr[1] * 1.2;
    const bright = smooth(0.2, 0.0, cr[0] > 0.1 ? 0 : 1) * 0;
    return { color: [v * 1.0, v * 0.95, v * 0.88 + bright], height: cr[0] + 0.1 * terr };
  },
  callisto(d, n) {
    const base = n.fbm3(d[0] * 3, d[1] * 3, d[2] * 3, 5);
    const cr = craters(d, 8, 33, 0.5, 0.35, 4);
    // Valhalla-style multi-ring basin
    const vx = d[0] * 0.6 + d[1] * 0.2 + d[2] * 0.77;
    const ring = Math.exp(-Math.pow((1 - vx) * 12 - 0.6, 2)) * 0.5 + Math.exp(-Math.pow((1 - vx) * 12 - 1.8, 2)) * 0.25;
    let v = 0.32 + 0.08 * base + cr[1] * 1.6 + ring * 0.3;
    return { color: [v * 1.0, v * 0.93, v * 0.85], height: cr[0] + ring * 0.1 };
  },
  mimas(d, n) {
    const cr = craters(d, 7, 41, 0.6, 0.35, 3);
    // Herschel crater
    const hx = d[0] * 1.0;
    const herschel = smooth(0.94, 0.985, hx);
    const rim = Math.exp(-Math.pow((hx - 0.94) * 40, 2)) * 0.8;
    const peak = Math.exp(-Math.pow((hx - 0.999) * 300, 2)) * 0.5;
    let v = 0.72 + cr[1] + rim * 0.2 - herschel * 0.15 + peak * 0.2;
    return { color: [v, v * 0.99, v * 0.97], height: cr[0] - herschel * 0.9 + rim * 0.5 + peak * 0.6 };
  },
  enceladus(d, n) {
    const base = n.fbm3(d[0] * 4, d[1] * 4, d[2] * 4, 4);
    const south = smooth(-0.55, -0.95, d[1]);
    const stripes = n.ridged3(d[0] * 8, d[1] * 8 + 5, d[2] * 8, 3);
    const tiger = smooth(0.8, 0.97, stripes) * south;
    const cr = craters(d, 8, 51, 0.3, 0.2, 2);
    const crN = cr[1] * smooth(-0.3, 0.6, d[1]);
    let v = 0.96 + 0.03 * base + crN;
    let r = v, g = v, b = v * 1.02;
    r = mix(r, 0.6, tiger); g = mix(g, 0.7, tiger); b = mix(b, 0.85, tiger);
    return { color: [r, g, b], height: cr[0] * smooth(-0.3, 0.6, d[1]) - tiger * 0.15 + base * 0.03 };
  },
  tethys(d, n) { const cr = craters(d, 7, 61, 0.5, 0.3, 3); const chasma = Math.exp(-Math.pow((d[2] * 0.8 - d[0] * 0.3) * 25, 2)) * 0.4; let v = 0.85 + cr[1] - chasma * 0.2; return { color: [v, v * 0.98, v * 0.96], height: cr[0] - chasma * 0.5 }; },
  dione(d, n) { const cr = craters(d, 7, 71, 0.5, 0.3, 3); const wisps = smooth(0.85, 0.98, n.ridged3(d[0] * 10 - 3, d[1] * 10, d[2] * 10, 3)) * smooth(0.1, 0.6, -d[2]); let v = 0.7 + cr[1] + wisps * 0.3; return { color: [v, v * 0.97, v * 0.95], height: cr[0] + wisps * 0.05 }; },
  rhea(d, n) { const cr = craters(d, 8, 81, 0.5, 0.3, 4); let v = 0.75 + cr[1]; return { color: [v, v * 0.98, v * 0.96], height: cr[0] }; },
  iapetus(d, n) {
    const cr = craters(d, 6, 91, 0.5, 0.3, 3);
    // leading hemisphere dark (Cassini Regio), trailing bright
    const lead = smooth(-0.35, 0.35, d[0] + 0.3 * n.fbm3(d[0] * 5, d[1] * 5, d[2] * 5, 3));
    const ridge = Math.exp(-Math.pow(d[1] * 30, 2)) * 0.9;
    let v = mix(0.9, 0.12, lead) + cr[1] * (1 - lead * 0.7);
    let r = v, g = v * mix(0.98, 0.8, lead), b = v * mix(0.95, 0.6, lead);
    return { color: [r, g, b], height: cr[0] + ridge * 0.7 };
  },
  titan(d, n) {
    // surface (rarely seen): dunes and methane seas near the north pole
    const base = n.fbm3(d[0] * 3, d[1] * 3, d[2] * 3, 5);
    const seas = smooth(0.7, 0.9, d[1]) * smooth(0.1, 0.4, base);
    let r = 0.55 + 0.15 * base, g = 0.4 + 0.12 * base, b = 0.18 + 0.05 * base;
    r = mix(r, 0.15, seas); g = mix(g, 0.15, seas); b = mix(b, 0.2, seas);
    return { color: [r, g, b], height: base * 0.1 };
  },
  miranda(d, n) { const cr = craters(d, 8, 101, 0.5, 0.3, 3); const coronae = smooth(0.3, 0.7, n.fbm3(d[0] * 2, d[1] * 2, d[2] * 2, 3)); const grooves = n.ridged3(d[0] * 12, d[1] * 12, d[2] * 12, 2) * coronae; let v = 0.6 + cr[1] * (1 - coronae) + (grooves - 0.5) * 0.25; return { color: [v, v, v * 1.02], height: cr[0] * (1 - coronae) + (grooves - 0.5) * 0.4 * coronae }; },
  ariel(d, n) { const cr = craters(d, 7, 111, 0.4, 0.25, 3); const valleys = smooth(0.85, 0.97, n.ridged3(d[0] * 7, d[1] * 7, d[2] * 7, 3)); let v = 0.68 + cr[1] - valleys * 0.15; return { color: [v, v, v * 1.02], height: cr[0] - valleys * 0.4 }; },
  umbriel(d, n) { const cr = craters(d, 8, 121, 0.5, 0.3, 3); const wunda = Math.exp(-Math.pow(((d[1] - 0.75) * 12), 2) - Math.pow((d[0] - 0.5) * 12, 2)) * 0.6; let v = 0.28 + cr[1] * 0.8 + wunda; return { color: [v, v, v * 1.02], height: cr[0] }; },
  titania(d, n) { const cr = craters(d, 7, 131, 0.5, 0.3, 3); const canyon = Math.exp(-Math.pow((d[2] * 0.7 + d[1] * 0.4) * 20, 2)) * 0.5; let v = 0.52 + cr[1] - canyon * 0.15; return { color: [v, v * 0.98, v * 0.97], height: cr[0] - canyon * 0.5 }; },
  oberon(d, n) { const cr = craters(d, 7, 141, 0.55, 0.3, 3); let v = 0.45 + cr[1]; const darkFloor = cr[0] < -0.2 ? 0.7 : 1; v *= darkFloor; return { color: [v, v * 0.96, v * 0.93], height: cr[0] }; },
  triton(d, n) {
    // cantaloupe terrain + bright south polar cap with dark geyser streaks
    const cant = n.ridged3(d[0] * 9, d[1] * 9, d[2] * 9, 3);
    const cap = smooth(-0.15, -0.5, d[1]);
    const streak = smooth(0.9, 0.99, n.ridged3(d[0] * 3, d[1] * 30, d[2] * 3, 2)) * cap * 0.6;
    let r = 0.62 + 0.1 * (cant - 0.5), g = 0.58 + 0.1 * (cant - 0.5), b = 0.55 + 0.1 * (cant - 0.5);
    r = mix(r, 0.88, cap); g = mix(g, 0.82, cap); b = mix(b, 0.72, cap);
    r = mix(r, 0.3, streak); g = mix(g, 0.28, streak); b = mix(b, 0.27, streak);
    return { color: [r, g, b], height: (cant - 0.5) * 0.25 * (1 - cap) };
  },
  charon(d, n) { const cr = craters(d, 6, 151, 0.5, 0.3, 3); const mordor = smooth(0.55, 0.85, d[1]); let v = 0.55 + cr[1]; let r = v, g = v * 0.97, b = v * 0.95; r = mix(r, 0.45, mordor); g = mix(g, 0.3, mordor); b = mix(b, 0.22, mordor); return { color: [r, g, b], height: cr[0] }; },
  pluto(d, n) {
    // Sputnik Planitia (bright heart) centred near lat 20N, lon 180 (d[0] ≈ -1)
    const cx = -0.94, cy = 0.34, cz = 0.05;
    const dx = d[0] - cx, dy = d[1] - cy, dz = d[2] - cz;
    const lobe = Math.exp(-(dx * dx * 6 + Math.pow(dy - 0.02, 2) * 9 + dz * dz * 4) * 2.2);
    const heartWarp = 0.12 * n.fbm3(d[0] * 5, d[1] * 5, d[2] * 5, 3);
    const heart = smooth(0.32, 0.55, lobe + heartWarp);
    const cells = worley3(d[0] * 14, d[1] * 14, d[2] * 14, 5, [0, 0, 0])[0];
    // Cthulhu Macula: dark reddish band along the equator west of the heart
    const band = smooth(0.35, 0.05, Math.abs(d[1] - 0.05)) * smooth(-0.2, 0.4, d[2]) * smooth(0.1, -0.3, d[0]);
    const base = n.fbm3(d[0] * 3, d[1] * 3, d[2] * 3, 5);
    const cr = craters(d, 6, 161, 0.35, 0.2, 2);
    let r = 0.72 + 0.1 * base, g = 0.6 + 0.1 * base, b = 0.5 + 0.08 * base;
    r = mix(r, 0.35, band * 0.8); g = mix(g, 0.2, band * 0.8); b = mix(b, 0.13, band * 0.8);
    r = mix(r, 0.94 - cells * 0.06, heart); g = mix(g, 0.9 - cells * 0.06, heart); b = mix(b, 0.85 - cells * 0.05, heart);
    r += cr[1] * (1 - heart); g += cr[1] * (1 - heart); b += cr[1] * (1 - heart);
    return { color: [r, g, b], height: cr[0] * (1 - heart) - heart * 0.3 + base * 0.05 };
  },
  sedna(d, n) { const base = n.fbm3(d[0] * 3, d[1] * 3, d[2] * 3, 5); const cr = craters(d, 6, 171, 0.4, 0.2, 2); let v = 0.5 + 0.15 * base + cr[1]; return { color: [v * 1.0, v * 0.55, v * 0.4], height: cr[0] + base * 0.1 }; },
  phobos(d, n) { const cr = craters(d, 5, 181, 0.6, 0.35, 3); const stickney = smooth(0.82, 0.95, d[0]); const grooves = smooth(0.9, 0.99, n.ridged3(d[0] * 2, d[1] * 14, d[2] * 2, 2)) * 0.5; let v = 0.4 + cr[1] - grooves * 0.1; return { color: [v, v * 0.93, v * 0.85], height: cr[0] - stickney * 0.8 - grooves * 0.2 }; },
  deimos(d, n) { const cr = craters(d, 5, 191, 0.4, 0.25, 2); let v = 0.45 + cr[1] * 0.6; return { color: [v, v * 0.94, v * 0.86], height: cr[0] * 0.5 }; },
  contact(d, n) { const cr = craters(d, 5, 201, 0.4, 0.25, 2); const base = n.fbm3(d[0] * 4, d[1] * 4, d[2] * 4, 4); let v = 0.45 + 0.1 * base + cr[1]; return { color: [v, v * 0.7, v * 0.55], height: cr[0] + base * 0.1 }; },
  // Exoplanet archetypes
  lava(d, n) { const r1 = n.ridged3(d[0] * 6, d[1] * 6, d[2] * 6, 4); const cracks = smooth(0.85, 0.97, r1); let r = 0.12 + 0.05 * r1, g = 0.08, b = 0.06; r = mix(r, 1.0, cracks); g = mix(g, 0.45, cracks); b = mix(b, 0.1, cracks); return { color: [r, g, b], height: -cracks * 0.2, emissive: cracks }; },
  ocean(d, n) { const c = n.fbm3(d[0] * 3, d[1] * 3, d[2] * 3, 6); const land = smooth(0.12, 0.2, c); const ice = smooth(0.7, 0.85, Math.abs(d[1])); let r = 0.05, g = 0.2, b = 0.5; r = mix(r, 0.35 + 0.2 * c, land); g = mix(g, 0.4 + 0.15 * c, land); b = mix(b, 0.2, land); r = mix(r, 0.95, ice); g = mix(g, 0.97, ice); b = mix(b, 1.0, ice); return { color: [r, g, b], height: land * 0.2 * c, water: 1 - land }; },
  desert(d, n) { const c = n.warped3(d[0] * 4, d[1] * 4, d[2] * 4, 5, 0.8); const cr = craters(d, 6, 211, 0.3, 0.2, 2); let v = 0.6 + 0.2 * c + cr[1]; return { color: [v * 1.0, v * 0.75, v * 0.5], height: c * 0.2 + cr[0] }; },
  ice(d, n) { const c = n.fbm3(d[0] * 5, d[1] * 5, d[2] * 5, 4); const cracks = smooth(0.85, 0.97, n.ridged3(d[0] * 8, d[1] * 8, d[2] * 8, 3)); let v = 0.85 + 0.08 * c; return { color: [v * 0.95 - cracks * 0.3, v * 0.97 - cracks * 0.3, v - cracks * 0.2], height: c * 0.05 - cracks * 0.1 }; },
  gas(d, n, p) {
    const lat = d[1];
    const bands = Math.sin(lat * 14 + 2 * n.fbm3(d[0] * 2, d[1] * 6, d[2] * 2, 3)) * 0.5 + 0.5;
    const turb = n.warped3(d[0] * 5, d[1] * 12, d[2] * 5, 4, 0.8);
    const t = clamp01(bands * 0.7 + turb * 0.4);
    const c1 = p.tint, c2 = p.tint2;
    return { color: [mix(c1[0], c2[0], t), mix(c1[1], c2[1], t), mix(c1[2], c2[2], t)], height: 0 };
  },
};

/**
 * Generate the pixel data for a recipe: { w, h, color, normal, emis?, spec? } (RGBA Uint8ClampedArray).
 */
export function generateSurfaceData(recipe, opts = {}) {
  const w = opts.width || 1024, h = w / 2;
  const seed = opts.seed ?? hashString(recipe);
  const n = new SimplexNoise(seed);
  const rng = new Rng(seed + 7);
  const p = { seed, tint: opts.tint || [1, 1, 1], tint2: opts.tint2 || [0.8, 0.7, 0.6] };
  const fn = RECIPES[recipe] || RECIPES.generic;
  const color = new Uint8ClampedArray(w * h * 4);
  const height = new Float32Array(w * h);
  const emis = opts.emissive ? new Uint8ClampedArray(w * h * 4) : null;
  const spec = opts.water ? new Uint8ClampedArray(w * h * 4) : null;
  const gamma = 1 / 2.2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = dirFromUV((x + 0.5) / w, (y + 0.5) / h);
      const r = fn(d, n, p);
      const i = (y * w + x);
      color[i * 4] = Math.pow(clamp01(r.color[0]), gamma) * 255;
      color[i * 4 + 1] = Math.pow(clamp01(r.color[1]), gamma) * 255;
      color[i * 4 + 2] = Math.pow(clamp01(r.color[2]), gamma) * 255;
      color[i * 4 + 3] = 255;
      height[i] = r.height;
      if (emis) { const e = clamp01(r.emissive || 0); emis[i * 4] = e * 255; emis[i * 4 + 1] = e * 120; emis[i * 4 + 2] = e * 30; emis[i * 4 + 3] = 255; }
      if (spec) { const s = clamp01(r.water || 0); spec[i * 4] = spec[i * 4 + 1] = spec[i * 4 + 2] = s * 255; spec[i * 4 + 3] = 255; }
    }
  }
  const normal = new Uint8ClampedArray(w * h * 4);
  const strength = opts.normalStrength || 6;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const xl = (x - 1 + w) % w, xr = (x + 1) % w, yu = Math.max(0, y - 1), yd = Math.min(h - 1, y + 1);
      const dx = (height[y * w + xr] - height[y * w + xl]) * strength;
      const dy = (height[yd * w + x] - height[yu * w + x]) * strength;
      const len = Math.sqrt(dx * dx + dy * dy + 1);
      const i = y * w + x;
      normal[i * 4] = (-dx / len * 0.5 + 0.5) * 255;
      normal[i * 4 + 1] = (dy / len * 0.5 + 0.5) * 255;
      normal[i * 4 + 2] = (1 / len * 0.5 + 0.5) * 255;
      normal[i * 4 + 3] = 255;
    }
  }
  return { w, h, color, normal, emis, spec };
}

export function generateRingData(kind = 'saturn', width = 2048) {
  const data = new Uint8ClampedArray(width * 4);
  const n = new SimplexNoise(kind === 'saturn' ? 99 : kind === 'uranus' ? 77 : 55);
  for (let i = 0; i < width; i++) {
    const t = i / (width - 1); // 0 = inner edge, 1 = outer edge
    let a = 0, r = 0.85, g = 0.8, b = 0.72;
    if (kind === 'saturn') {
      // radii mapping: inner 1.239 → outer 2.347 Rs (C ring start to A ring end); F ring beyond handled separately
      const R = 1.239 + t * (2.347 - 1.239);
      const fine = n.noise2D(t * 260, 0.5) * 0.5 + 0.5;
      const fine2 = n.noise2D(t * 900, 3.5) * 0.5 + 0.5;
      const med = n.noise2D(t * 40, 7.5) * 0.5 + 0.5;
      if (R < 1.527) { a = 0.18 + 0.15 * fine * med; r = 0.6; g = 0.6; b = 0.62; } // C ring (dim, bluish-grey)
      else if (R < 1.95) { a = 0.72 + 0.25 * fine * (0.5 + 0.5 * med); r = 0.92; g = 0.85; b = 0.72; } // B ring inner/mid
      else if (R < 2.025) { a = 0.9 + 0.1 * fine2; r = 0.95; g = 0.9; b = 0.8; } // B ring outer (dense)
      else if (R < 2.097) { a = 0.06 + 0.1 * fine; r = 0.5; g = 0.5; b = 0.55; } // Cassini division
      else if (R < 2.27) { a = 0.55 + 0.2 * fine * med; r = 0.88; g = 0.82; b = 0.7; } // A ring
      else if (R < 2.29) { a = 0.05; } // Encke gap
      else if (R < 2.33) { a = 0.5 + 0.15 * fine; r = 0.86; g = 0.8; b = 0.68; }
      else if (R < 2.335) { a = 0.05; } // Keeler gap
      else { a = 0.45 * (1 - smooth(2.335, 2.347, R)); r = 0.85; g = 0.8; b = 0.68; }
      // Huygens gap & ringlets in Cassini division
      if (Math.abs(R - 2.03) < 0.004) a *= 0.2;
      a *= 0.85 + 0.15 * fine2;
      // edge softening
      a *= smooth(0, 0.01, t) * (1 - smooth(0.995, 1, t));
    } else if (kind === 'uranus') {
      // thin dark ringlets; epsilon ring at the outer edge
      const rings = [0.0, 0.08, 0.15, 0.22, 0.31, 0.37, 0.45, 0.6, 0.72, 0.99];
      for (let k = 0; k < rings.length; k++) { const wdt = k === rings.length - 1 ? 0.012 : 0.004; a += Math.exp(-Math.pow((t - rings[k]) / wdt, 2)) * (k === rings.length - 1 ? 0.6 : 0.25); }
      r = 0.4; g = 0.42; b = 0.45;
    } else { // neptune: faint with arcs handled in shader via noise
      const rings = [0.05, 0.35, 0.6, 0.98];
      for (let k = 0; k < rings.length; k++) a += Math.exp(-Math.pow((t - rings[k]) / 0.01, 2)) * 0.25;
      a += 0.03 * (t > 0.3 && t < 0.62 ? 1 : 0);
      r = 0.5; g = 0.45; b = 0.42;
    }
    data[i * 4] = clamp01(r) * 255; data[i * 4 + 1] = clamp01(g) * 255; data[i * 4 + 2] = clamp01(b) * 255; data[i * 4 + 3] = clamp01(a) * 255;
  }
  return data;
}
