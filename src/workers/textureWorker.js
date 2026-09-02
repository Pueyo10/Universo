// Web Worker: procedural planet surfaces (albedo / normal / emissive / specular)
// generated off the main thread. Pixel arrays are transferred back.
import { generateSurfaceData } from '../solar/SurfaceGen.js';

self.onmessage = (e) => {
  const { id, recipe, opts } = e.data;
  try {
    const r = generateSurfaceData(recipe, opts);
    const buffers = [r.color.buffer, r.normal.buffer];
    if (r.emis) buffers.push(r.emis.buffer);
    if (r.spec) buffers.push(r.spec.buffer);
    self.postMessage({ id, ok: true, w: r.w, h: r.h, color: r.color, normal: r.normal, emis: r.emis, spec: r.spec }, buffers);
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err && err.message || err) });
  }
};
