// Real WebGL checks, served by Vite at /tests/graphics.html. Readbacks are test-only.
import * as THREE from 'three';
import { TAAPass } from '../src/postfx/TAAPass.js';
import { ExposurePass } from '../src/postfx/ExposurePass.js';
import { Engine } from '../src/core/Engine.js';
import { checkRingGraphics } from './ring-graphics.js';

const results = [];
function check(name, condition, detail = '') {
  results.push({ name, passed: !!condition, detail });
  if (!condition) throw new Error(name + ': ' + detail);
}
function dataTexture(data, w, h, format = THREE.RGBAFormat) {
  const tex = new THREE.DataTexture(data, w, h, format, THREE.FloatType);
  tex.needsUpdate = true; return tex;
}
function halfRead(renderer, rt) {
  const values = new Uint16Array(rt.width * rt.height * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, rt.width, rt.height, values);
  return Float32Array.from(values, v => THREE.DataUtils.fromHalfFloat(v));
}
function luminosity(renderer, pass) {
  const values = new Float32Array(4);
  renderer.readRenderTargetPixels(pass.rt[pass._i], 0, 0, 1, 1, values);
  return values[0];
}

try {
  const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gl') });
  renderer.setSize(64, 32); renderer.autoClear = false;
  const camera = new THREE.PerspectiveCamera(55, 2, 0.001, 1e9);
  camera.updateMatrixWorld();
  const w = 64, h = 32;
  const colors = new Float32Array(w * h * 4), depths = new Float32Array(w * h);
  const color = dataTexture(colors, w, h), depth = dataTexture(depths, w, h, THREE.RedFormat);
  const read = { texture: color, depthTexture: depth, viewport: new THREE.Vector4(), scissor: new THREE.Vector4() };
  const out = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: false });
  const taa = new TAAPass(camera, w, h);
  const fill = (z, center = 0.25, scale = 1) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const k = y * w + x, valid = x < w * scale && y < h * scale;
      const grey = ((x + y) % 3 === 0 ? 0.9 : (x + y) % 3 === 1 ? 0.1 : center);
      colors.set(valid ? [grey, grey, grey, 1] : [8, 0, 8, 1], k * 4);
      depths[k] = valid ? Math.log2(z + 1) / Math.log2(camera.far + 1) : 1;
    }
    color.needsUpdate = depth.needsUpdate = true;
  };
  fill(100, 0.7); taa.render(renderer, out, read);
  fill(5, 0.25); taa.render(renderer, out, read); const rejected = halfRead(renderer, out);
  taa.reset(); taa.render(renderer, out, read); const fresh = halfRead(renderer, out);
  const error = Math.max(...fresh.map((v, i) => Math.abs(v - rejected[i])));
  check('Disocclusion rejects old colour using depth', error < 0.002, String(error));
  // Same surface should still accumulate; otherwise the rejection test is vacuous.
  fill(5, 0.7); taa.reset(); taa.render(renderer, out, read);
  fill(5, 0.25); taa.render(renderer, out, read); const accumulated = halfRead(renderer, out);
  check('Stable surfaces retain temporal accumulation', accumulated.some((v, i) => Math.abs(v - fresh[i]) > 0.01));
  // Previous scale/far decoding must not mistake valid geometry for a disocclusion.
  taa.reset(); fill(5, 0.7, 0.5); taa.setScale(0.5, 0.5); taa.render(renderer, out, read);
  camera.far = 1e12; camera.updateProjectionMatrix(); fill(5, 0.25, 1); taa.setScale(1, 1); taa.render(renderer, out, read);
  const rescaled = halfRead(renderer, out);
  check('History survives a scale and far-plane change', rescaled.some((v, i) => Math.abs(v - fresh[i]) > 0.01));
  taa.reset(); taa.setScale(0.5, 0.5);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) colors.set(x < w / 2 && y < h / 2 ? [0.25, 0.25, 0.25, 1] : [8, 0, 8, 1], (y * w + x) * 4);
  color.magFilter = THREE.LinearFilter; color.needsUpdate = true;
  camera.updateProjectionMatrix(); taa.jitter(w / 2, h / 2); taa.render(renderer, out, read);
  const edges = halfRead(renderer, out);
  check('TAAU never samples stale pixels outside its viewport', edges.every((v, i) => Math.abs(v - (i % 4 === 3 ? 1 : 0.25)) < 0.003));
  const exposure = new ExposurePass();
  const flat = dataTexture(new Float32Array([0.5, 0.5, 0.5, 1]), 1, 1);
  exposure.render(renderer, out, { texture: flat }); const measured = luminosity(renderer, exposure);
  check('Weighted exposure normalises a uniform image exactly', Math.abs(measured - Math.log(0.502)) < 1e-4, String(measured));
  exposure.locked = true; flat.image.data.fill(0.01); flat.needsUpdate = true;
  for (let i = 0; i < 4; i++) exposure.render(renderer, out, { texture: flat });
  check('Exposure lock retains the adapted value', luminosity(renderer, exposure) === measured);
  exposure.locked = false; exposure.render(renderer, out, { texture: flat });
  check('Unlock resumes adaptation', luminosity(renderer, exposure) < measured);
  checkRingGraphics(renderer, check);
  taa.dispose(); exposure.dispose(); color.dispose(); depth.dispose(); flat.dispose(); out.dispose(); renderer.dispose();

  const engine = new Engine(document.createElement('canvas'), 'medium');
  engine.autoScale = false; engine.camera.far = 1e6;
  engine.scene.background = new THREE.Color(0.5, 0.5, 0.5);
  engine.settings.motionBlur = false; engine.exposurePass.dt = 1 / 60;
  engine.render(); const beforeBloom = luminosity(engine.renderer, engine.exposurePass);
  engine.settings.bloom = 3; engine.render();
  check('Bloom does not change metered exposure', Math.abs(beforeBloom - luminosity(engine.renderer, engine.exposurePass)) < 1e-6);
  check('Final pass reads the current exposure buffer', engine.finalPass.uniforms.tLum.value === engine.exposurePass.texture);
  engine.renderScale = 0.5; engine.adaptive.volume = 0.75; engine._applyScale(); engine.render();
  const size = engine.renderer.getDrawingBufferSize(new THREE.Vector2());
  check('Volume resolution follows dynamic scene resolution', engine.nebulaRT.width === Math.round(size.x * engine.q.nebulaScale * 0.5 * 0.75));
  check('Composer uses physical dimensions exactly once', engine.composer.readBuffer.width === size.x && engine.taa.width === size.x);
  engine.setQuality('low'); engine.render(); check('Explicit low preserves the non-TAA path', !engine.taa.enabled);
  engine.setQuality('high'); engine.render();
  const highSize = engine.renderer.getDrawingBufferSize(new THREE.Vector2());
  check('Preset switch keeps composer and TAA dimensions aligned', engine.composer.readBuffer.width === highSize.x && engine.taa.width === highSize.x);
  const timingWindow = ms => {
    engine.time += 0.7; engine.jsMs = 1;
    Object.assign(engine._perf, { acc: 0.6, n: 36, js: 36, gpu: ms, gpuN: 1 });
    engine._updatePerf(1 / 60);
  };
  const startTrial = () => {
    engine.setQuality('low'); engine.qualityMode = 'auto';
    engine.gpuName = 'Synthetic integrated GPU timing fixture'; engine.autoScale = true;
    engine.time = 10; engine._startTemporalTrial();
    for (let i = 0; i < 6; i++) timingWindow(4);
    check('Auto-low starts a measured temporal trial', engine.temporalTrial.phase === 'temporal' && engine.taa.enabled);
  };
  startTrial(); for (let i = 0; i < 6; i++) timingWindow(5);
  check('Affordable auto-low TAA stays enabled', engine.temporalTrial.phase === 'accepted' && engine.taa.enabled);
  startTrial(); for (let i = 0; i < 6; i++) timingWindow(25);
  check('Expensive auto-low TAA falls back', engine.temporalTrial.phase === 'fallback' && !engine.taa.enabled);
  engine._noTaa = true; engine.setQuality('medium');
  check('notaa is honoured when switching presets', !engine.taa.enabled);
  check('WebGL reports no error', engine.gl.getError() === engine.gl.NO_ERROR);
} catch (error) {
  results.push({ name: 'Exception', passed: false, detail: error.stack });
} finally {
  window.graphicsResults = results;
  document.getElementById('result').textContent = JSON.stringify(results, null, 2);
  document.title = results.every(r => r.passed) ? 'PASS: graphics checks' : 'FAIL: graphics checks';
}
