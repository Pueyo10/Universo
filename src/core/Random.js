// Deterministic random utilities. Everything procedural in the universe is
// derived from seeds so the universe never changes between sessions.

export function hashInt(x) {
  x = (x ^ 61) ^ (x >>> 16);
  x = Math.imul(x, 9);
  x = x ^ (x >>> 4);
  x = Math.imul(x, 0x27d4eb2d);
  x = x ^ (x >>> 15);
  return x >>> 0;
}

export function hash3(ix, iy, iz, seed = 0) {
  let h = Math.imul(ix | 0, 0x8da6b343) ^ Math.imul(iy | 0, 0xd8163841) ^ Math.imul(iz | 0, 0xcb1ab31f) ^ Math.imul(seed | 0, 0x9e3779b1);
  h = hashInt(h);
  return h;
}

export function hashString(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** Small, fast PRNG (mulberry32). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  constructor(seed = 1) {
    this.seed = seed >>> 0;
    this.next = mulberry32(this.seed);
    this._spare = null;
  }
  float() { return this.next(); }
  range(a, b) { return a + (b - a) * this.next(); }
  int(n) { return Math.floor(this.next() * n); }
  intRange(a, b) { return a + Math.floor(this.next() * (b - a + 1)); }
  bool(p = 0.5) { return this.next() < p; }
  sign() { return this.next() < 0.5 ? -1 : 1; }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  /** Standard normal (Box–Muller). */
  gauss() {
    if (this._spare !== null) { const s = this._spare; this._spare = null; return s; }
    let u = 0, v = 0;
    while (u === 0) u = this.next();
    v = this.next();
    const r = Math.sqrt(-2 * Math.log(u));
    const th = 2 * Math.PI * v;
    this._spare = r * Math.sin(th);
    return r * Math.cos(th);
  }
  /** Exponential distribution with given mean. */
  exp(mean) { return -Math.log(1 - this.next()) * mean; }
  /** Power-law in [a,b] with exponent p (p != -1). */
  powerLaw(a, b, p) {
    const u = this.next();
    const ap = Math.pow(a, p + 1), bp = Math.pow(b, p + 1);
    return Math.pow(ap + (bp - ap) * u, 1 / (p + 1));
  }
  /** Random unit vector, written into [x,y,z]. */
  unitVector(out = [0, 0, 0]) {
    const z = this.range(-1, 1);
    const t = this.range(0, Math.PI * 2);
    const r = Math.sqrt(1 - z * z);
    out[0] = r * Math.cos(t); out[1] = r * Math.sin(t); out[2] = z;
    return out;
  }
}

export function seeded(seed) { return new Rng(typeof seed === 'string' ? hashString(seed) : seed); }
