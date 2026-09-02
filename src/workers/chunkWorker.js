// Web Worker: generates procedural star chunks off the main thread.
// Pure math (galaxy density model + seeded RNG); results are transferred back
// as typed arrays so the main thread only has to wrap them in a geometry.
import { Rng, hash3 } from '../core/Random.js';
import { starsPerLy3, youngFraction, sampleStar, starColor } from '../universe/GalaxyModel.js';

let LEVELS = null;
let galInv = null;      // 3x3 rotation (column-major, 9 floats): scene(ly) -> galaxy model
let sunGal = null;      // Sun position in model coords (ly)
let banks = null;
let densityScale = 1, userDensity = 1;

function toGal(x, y, z, out) {
  // out = galInv * (x,y,z) + sunGal   (x,y,z in ly, scene frame)
  out[0] = galInv[0] * x + galInv[3] * y + galInv[6] * z + sunGal[0];
  out[1] = galInv[1] * x + galInv[4] * y + galInv[7] * z + sunGal[1];
  out[2] = galInv[2] * x + galInv[5] * y + galInv[8] * z + sunGal[2];
  return out;
}

function makeBank(young, bulge, n, seed) {
  const rng = new Rng(seed);
  const arr = [];
  for (let i = 0; i < n; i++) arr.push(sampleStar(rng, young, bulge));
  for (let i = 0; i < 400; i++) {
    const s = sampleStar(rng, 0.9, 0);
    if (s.kind === 'main') { s.kind = 'supergiant'; s.lum = 3000 + 80000 * rng.float(); s.temp = rng.float() < 0.5 ? 3600 : 15000 + 12000 * rng.float(); s.radius = s.temp < 5000 ? 600 : 40; }
    arr.push(s);
  }
  arr.sort((a, b) => a.lum - b.lum);
  return { arr, lums: arr.map(s => s.lum) };
}
function firstAbove(bank, minLum) {
  let lo = 0, hi = bank.lums.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (bank.lums[m] < minLum) lo = m + 1; else hi = m; }
  return lo;
}

const g = [0, 0, 0];
const c = [0, 0, 0];

function generateCell(level, ix, iy, iz) {
  const L = LEVELS[level];
  const size = L.size;
  const rng = new Rng(hash3(ix, iy, iz, 977 + level * 31));
  const cx = (ix + 0.5) * size, cy = (iy + 0.5) * size, cz = (iz + 0.5) * size;
  toGal(cx, cy, cz, g);
  const rho = starsPerLy3(g[0], g[1], g[2]);
  const young = youngFraction(g[0], g[1], g[2]);
  const bank = young > 0.35 ? banks.young : banks.old;
  const lo = firstAbove(bank, L.minLum);
  const frac = (bank.arr.length - lo) / bank.arr.length;
  const range = bank.arr.length - lo;
  if (range <= 0) return null;
  let count = Math.round(rho * size * size * size * frac * densityScale * userDensity);

  // Large cells: trilinear density lattice (N^3 corners) instead of one density
  // evaluation per candidate star. Gives smooth gradients across the cell.
  let lattice = null, N = 0, rhoMax = rho;
  if (level >= 2) {
    N = 5;
    lattice = new Float32Array(N * N * N);
    let sum = 0; rhoMax = 0;
    for (let k = 0, i = 0; k < N; k++) for (let j = 0; j < N; j++) for (let h = 0; h < N; h++, i++) {
      toGal(cx + (h / (N - 1) - 0.5) * size, cy + (j / (N - 1) - 0.5) * size, cz + (k / (N - 1) - 0.5) * size, g);
      const r = starsPerLy3(g[0], g[1], g[2]);
      lattice[i] = r; sum += r; if (r > rhoMax) rhoMax = r;
    }
    const mean = sum / (N * N * N);
    count = Math.round(mean * size * size * size * frac * densityScale * userDensity);
  }
  if (count > L.cap) count = L.cap;
  if (count <= 0) return null;

  const pos = new Float32Array(count * 3), col = new Float32Array(count * 3), lum = new Float32Array(count), seed = new Float32Array(count);
  let i = 0, guard = 0;
  const guardMax = count * 10;
  const n1 = N - 1;
  while (i < count && guard < guardMax) {
    guard++;
    const ux = rng.float(), uy = rng.float(), uz = rng.float();
    const x = (ux - 0.5) * size, y = (uy - 0.5) * size, z = (uz - 0.5) * size;
    if (lattice && rhoMax > 0) {
      // trilinear interpolation of the density lattice
      const fx = ux * n1, fy = uy * n1, fz = uz * n1;
      const x0 = Math.min(fx | 0, n1 - 1), y0 = Math.min(fy | 0, n1 - 1), z0 = Math.min(fz | 0, n1 - 1);
      const tx = fx - x0, ty = fy - y0, tz = fz - z0;
      const idx = (xx, yy, zz) => lattice[(zz * N + yy) * N + xx];
      const c00 = idx(x0, y0, z0) * (1 - tx) + idx(x0 + 1, y0, z0) * tx;
      const c10 = idx(x0, y0 + 1, z0) * (1 - tx) + idx(x0 + 1, y0 + 1, z0) * tx;
      const c01 = idx(x0, y0, z0 + 1) * (1 - tx) + idx(x0 + 1, y0, z0 + 1) * tx;
      const c11 = idx(x0, y0 + 1, z0 + 1) * (1 - tx) + idx(x0 + 1, y0 + 1, z0 + 1) * tx;
      const d = (c00 * (1 - ty) + c10 * ty) * (1 - tz) + (c01 * (1 - ty) + c11 * ty) * tz;
      if (rng.float() > d / rhoMax) continue;
    }
    const dx = cx + x, dy = cy + y, dz = cz + z;
    if (dx * dx + dy * dy + dz * dz < 4) continue;   // keep clear of the Sun
    const s = bank.arr[lo + rng.int(range)];
    const lumJ = s.lum * (0.75 + 0.5 * rng.float());
    const tempJ = s.temp * (0.95 + 0.1 * rng.float());
    starColor(tempJ, c);
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
    lum[i] = lumJ; seed[i] = rng.float();
    i++;
  }
  if (i === 0) return null;
  return { count: i, pos: pos.slice(0, i * 3), col: col.slice(0, i * 3), lum: lum.slice(0, i), seed: seed.slice(0, i) };
}

self.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'init') {
    LEVELS = m.levels; galInv = m.galInv; sunGal = m.sunGal; densityScale = m.densityScale; userDensity = m.userDensity;
    if (!banks) banks = { old: makeBank(0.05, 0.2, 30000, 11), young: makeBank(0.85, 0.0, 12000, 13) };
    self.postMessage({ type: 'ready' });
  } else if (m.type === 'density') {
    densityScale = m.densityScale; userDensity = m.userDensity;
  } else if (m.type === 'cell') {
    const r = generateCell(m.level, m.ix, m.iy, m.iz);
    if (!r) { self.postMessage({ type: 'cell', id: m.id, gen: m.gen, count: 0 }); return; }
    self.postMessage({ type: 'cell', id: m.id, gen: m.gen, count: r.count, pos: r.pos, col: r.col, lum: r.lum, seed: r.seed }, [r.pos.buffer, r.col.buffer, r.lum.buffer, r.seed.buffer]);
  }
};
