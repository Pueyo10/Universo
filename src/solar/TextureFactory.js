import * as THREE from 'three';
import { generateSurfaceData, generateRingData } from './SurfaceGen.js';

// Texture wrappers around the pure generators in SurfaceGen.js. The synchronous
// path is kept for callers that need a texture immediately; the asynchronous
// path runs the (expensive) generation in a Web Worker so the frame loop never
// stalls — used at boot, for the post-intro resolution upgrades and for
// exoplanets generated while flying.

const cache = new Map();          // key -> textures (sync + async share it)
const pending = new Map();        // key -> Promise<textures>

function wrap(data, w, h) {
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.colorSpace = THREE.NoColorSpace; // shaders decode sRGB manually
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true; t.anisotropy = 8;
  t.needsUpdate = true; t.flipY = true;
  return t;
}
function toTextures(r) {
  return { map: wrap(r.color, r.w, r.h), normalMap: wrap(r.normal, r.w, r.h), emissiveMap: r.emis ? wrap(r.emis, r.w, r.h) : null, specMap: r.spec ? wrap(r.spec, r.w, r.h) : null };
}
const keyOf = (recipe, opts) => recipe + ':' + JSON.stringify(opts);

/** Synchronous generation (blocks the main thread for 50–400 ms). Prefer generateSurfaceAsync. */
export function generateSurface(recipe, opts = {}) {
  const key = keyOf(recipe, opts);
  if (cache.has(key)) return cache.get(key);
  const res = toTextures(generateSurfaceData(recipe, opts));
  cache.set(key, res);
  return res;
}

// ---- worker pool ----------------------------------------------------------
let workers = null, rr = 0, nextId = 1;
const jobs = new Map();
function pool() {
  if (workers) return workers;
  const n = Math.max(1, Math.min(2, (navigator.hardwareConcurrency || 4) - 2));
  workers = [];
  for (let i = 0; i < n; i++) {
    const w = new Worker(new URL('../workers/textureWorker.js', import.meta.url), { type: 'module' });
    w.onmessage = (e) => { const j = jobs.get(e.data.id); if (!j) return; jobs.delete(e.data.id); e.data.ok ? j.resolve(e.data) : j.reject(new Error(e.data.error)); };
    w.onerror = (e) => { console.error('[textureWorker]', e.message || e); for (const [id, j] of jobs) { if (j.worker === w) { jobs.delete(id); j.reject(new Error('worker error')); } } };
    workers.push(w);
  }
  return workers;
}

/** Asynchronous generation in a worker. Resolves to { map, normalMap, emissiveMap?, specMap? }. */
export function generateSurfaceAsync(recipe, opts = {}) {
  const key = keyOf(recipe, opts);
  if (cache.has(key)) return Promise.resolve(cache.get(key));
  if (pending.has(key)) return pending.get(key);
  let p;
  if (typeof Worker === 'undefined') {
    p = Promise.resolve().then(() => generateSurface(recipe, opts));
  } else {
    const ws = pool();
    const w = ws[rr++ % ws.length];
    const id = nextId++;
    p = new Promise((resolve, reject) => { jobs.set(id, { resolve, reject, worker: w }); w.postMessage({ id, recipe, opts }); })
      .then(r => { const res = toTextures(r); cache.set(key, res); return res; })
      .catch(err => { console.warn('[textures] worker failed, generating on main thread', err); return generateSurface(recipe, opts); });
  }
  pending.set(key, p);
  p.finally(() => pending.delete(key));
  return p;
}

/** Derive a normal map from the luminance of a loaded albedo image (fake relief for photographic maps). */
export function normalFromImage(image, strength = 2.0, size = 1024) {
  const c = document.createElement('canvas'); c.width = size; c.height = size / 2;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, c.width, c.height);
  const src = ctx.getImageData(0, 0, c.width, c.height).data;
  const w = c.width, h = c.height;
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) lum[i] = (src[i * 4] * 0.3 + src[i * 4 + 1] * 0.59 + src[i * 4 + 2] * 0.11) / 255;
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const xl = (x - 1 + w) % w, xr = (x + 1) % w, yu = Math.max(0, y - 1), yd = Math.min(h - 1, y + 1);
    const dx = (lum[y * w + xr] - lum[y * w + xl]) * strength;
    const dy = (lum[yd * w + x] - lum[yu * w + x]) * strength;
    const len = Math.sqrt(dx * dx + dy * dy + 1);
    const i = y * w + x;
    out[i * 4] = (-dx / len * 0.5 + 0.5) * 255; out[i * 4 + 1] = (dy / len * 0.5 + 0.5) * 255; out[i * 4 + 2] = (1 / len * 0.5 + 0.5) * 255; out[i * 4 + 3] = 255;
  }
  const t = new THREE.DataTexture(out, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.colorSpace = THREE.NoColorSpace; t.wrapS = THREE.RepeatWrapping; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true; t.anisotropy = 8; t.flipY = true; t.needsUpdate = true;
  return t;
}

/** Saturn-like ring radial profile as a 1D texture (RGBA: colour + alpha) with named gaps. */
export function generateRingTexture(kind = 'saturn', width = 2048) {
  const data = generateRingData(kind, width);
  const tex = new THREE.DataTexture(data, width, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.colorSpace = THREE.NoColorSpace; tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter; tex.wrapS = THREE.ClampToEdgeWrapping; tex.needsUpdate = true;
  return tex;
}
