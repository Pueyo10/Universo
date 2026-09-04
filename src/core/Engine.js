import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { FinalPass } from '../postfx/FinalPass.js';
import { BlackHolePass } from '../postfx/BlackHolePass.js';
import { TAAPass } from '../postfx/TAAPass.js';
import { ExposurePass } from '../postfx/ExposurePass.js';
import { bus } from './EventBus.js';

// Quality presets. `pixelRatio` is the ceiling: dynamic resolution scaling may
// lower the effective render scale down to `minScale` to hold 60 fps.
//  nebulaScale: resolution of the volumetric (nebula) pass relative to the frame
//  skyTiers   : procedural background star tiers (3 = skip the ultra-faint tier)
const DPR = Math.min(window.devicePixelRatio || 1, 2);
export const QUALITY = {
  low:    { pixelRatio: Math.min(DPR, 1.0), minScale: 0.45, bloomScale: 0.25, galaxyStars: 150000, chunkStars: 0.35, nebulaSteps: 24, nebulaScale: 0.35, atmoSteps: 6, atmoLight: 3, samples: 0, ringParticles: 4000, asteroids: 5000, skyTiers: 3, skyGalaxies: 1, taa: false, tiles: 5, hiRes: false, motion: false, dof: false },
  medium: { pixelRatio: Math.min(DPR, 1.0), minScale: 0.5,  bloomScale: 0.35, galaxyStars: 300000, chunkStars: 0.6,  nebulaSteps: 36, nebulaScale: 0.5,  atmoSteps: 10, atmoLight: 4, samples: 0, ringParticles: 12000, asteroids: 12000, skyTiers: 4, skyGalaxies: 2, taa: true, tiles: 7, hiRes: false, motion: true, dof: false },
  high:   { pixelRatio: Math.min(DPR, 1.5), minScale: 0.55, bloomScale: 0.5,  galaxyStars: 550000, chunkStars: 1.0,  nebulaSteps: 48, nebulaScale: 0.5,  atmoSteps: 14, atmoLight: 5, samples: 0, ringParticles: 26000, asteroids: 24000, skyTiers: 4, skyGalaxies: 2, taa: true, tiles: 8, hiRes: true, motion: true, dof: true },
  ultra:  { pixelRatio: Math.min(DPR, 2.0), minScale: 0.6,  bloomScale: 0.5,  galaxyStars: 900000, chunkStars: 1.4,  nebulaSteps: 72, nebulaScale: 0.75, atmoSteps: 16, atmoLight: 6, samples: 0, ringParticles: 40000, asteroids: 40000, skyTiers: 4, skyGalaxies: 2, taa: true, tiles: 8, hiRes: true, motion: true, dof: true },
};

/** Pick a preset from the GPU renderer string (dynamic resolution fine-tunes from there). */
export function detectQuality(gl) {
  let r = '';
  try { const dbg = gl.getExtension('WEBGL_debug_renderer_info'); r = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER)); } catch (_) { }
  const s = r.toLowerCase();
  if (/swiftshader|llvmpipe|software|basic render/.test(s)) return { name: 'low', gpu: r };
  // high end: RTX, GTX 1070+/16xx+, RX 5700+/6600+/7xxx, Arc A7xx, Apple M-Pro/Max
  if (/rtx|gtx 10[78]0|gtx 16[6-9]0|gtx (titan|1080)|rx (5[7-9]00|6[6-9]00|7[0-9]00|9[0-9]00)|radeon pro w|arc\(tm\) a7|arc a7|apple m[1-4] (pro|max|ultra)/.test(s)) return { name: 'high', gpu: r };
  // integrated / mobile / very old: low
  if (/intel|iris|uhd|hd graphics|vega [0-9]\b|radeon\(tm\) graphics|radeon graphics|mali|adreno|powervr|apple gpu|apple m1\b|geforce mx|gt [0-9]{3}\b|gtx [5-9][0-9]0\b|gtx 10[56]0|radeon r[5-7] |radeon (5|6)[0-9]0\b/.test(s)) return { name: 'low', gpu: r };
  return { name: 'medium', gpu: r };
}

export class Engine {
  constructor(canvas, qualityName = 'auto') {
    this.canvas = canvas;
    this.settings = { bloom: 0.9, exposure: 1.0, autoExposure: true, lens: true, motionBlur: true, dof: true, fov: 55, starDensity: 1.0 };
    this.motionIntensity = 0.3;   // set by the UI: 0.3 baseline (camera turns), 1 during travel / tours / flight
    this.dofAperture = 0; this.dofFocus = 1;   // set by the UI (photo mode aperture, mild during tours); focus in world units

    const renderer = new THREE.WebGLRenderer({
      canvas, antialias: false, alpha: false, stencil: false, depth: true,
      logarithmicDepthBuffer: true, powerPreference: 'high-performance', preserveDrawingBuffer: false,
    });
    this.renderer = renderer;
    this.gl = renderer.getContext();
    this.capabilities = renderer.capabilities;

    // ------ quality ------
    this.qualityMode = qualityName;                       // 'auto' or an explicit preset
    const det = detectQuality(this.gl);
    this.gpuName = det.gpu;
    this.qualityName = QUALITY[qualityName] ? qualityName : det.name;
    this.q = QUALITY[this.qualityName];
    this.renderScale = 1;                                 // dynamic resolution multiplier on q.pixelRatio
    this.autoScale = !new URLSearchParams(location.search).has('nodrs');

    renderer.setPixelRatio(this.q.pixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // we handle it in FinalPass
    renderer.autoClear = true;
    renderer.setClearColor(0x000000, 1);
    renderer.sortObjects = true;

    this.scene = new THREE.Scene();
    this.scene.background = null;
    this.camera = new THREE.PerspectiveCamera(this.settings.fov, window.innerWidth / window.innerHeight, 1e-4, 1e19);
    this.camera.matrixAutoUpdate = true;

    // ------ volumetric (nebula) layer: rendered at reduced resolution into its own
    // target and composited over the sky before everything else ------
    this.nebulaScene = new THREE.Scene();
    this.nebulaActive = false;
    this.nebulaRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, stencilBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
    this.nebulaComposite = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      uniforms: { tNebula: { value: this.nebulaRT.texture } },
      vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */`precision highp float; uniform sampler2D tNebula; varying vec2 vUv; void main() { gl_FragColor = texture2D(tNebula, vUv); }`,
      transparent: false, depthTest: false, depthWrite: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    }));
    this.nebulaComposite.frustumCulled = false;
    this.nebulaComposite.renderOrder = -999;     // right after the sky, before any opaque body
    this.nebulaComposite.visible = false;
    this.scene.add(this.nebulaComposite);
    // ------ foreground volumetric layer: same reduced resolution, but composited after the star layers, so a
    // dark cloud can hide the stars behind it (used by the star-formation simulation) ------
    this.volScene = new THREE.Scene();
    this.volActive = false;
    this.volRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, stencilBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
    this.volComposite = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      uniforms: { tNebula: { value: this.volRT.texture } },
      vertexShader: this.nebulaComposite.material.vertexShader, fragmentShader: this.nebulaComposite.material.fragmentShader,
      transparent: true, depthTest: false, depthWrite: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    }));
    this.volComposite.frustumCulled = false;
    this.volComposite.renderOrder = 39;          // after stars (10–12), before discs / bodies drawn inside the volume
    this.volComposite.visible = false;
    this.scene.add(this.volComposite);

    // ------ post-processing chain ------
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType, format: THREE.RGBAFormat, colorSpace: THREE.LinearSRGBColorSpace,
      samples: this.q.samples, depthBuffer: true, stencilBuffer: false,
    });
    this.composer = new EffectComposer(renderer, rt);
    // the scene colour buffers carry a float depth texture: the TAA pass reprojects against it
    for (const t of [this.composer.renderTarget1, this.composer.renderTarget2]) { const d = new THREE.DepthTexture(size.x, size.y); d.type = THREE.FloatType; t.depthTexture = d; }
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);
    this.taa = new TAAPass(this.camera, size.x, size.y);
    this.taa.enabled = !!this.q.taa && !new URLSearchParams(location.search).has('notaa');
    this.composer.addPass(this.taa);
    this.blackHolePass = new BlackHolePass(this.camera);
    this.blackHolePass.enabled = false;          // enabled by BlackHole only when lensing is on screen
    this.composer.addPass(this.blackHolePass);
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(size.x * this.q.bloomScale, size.y * this.q.bloomScale), 0.9, 0.55, 1.0);
    this.bloomPass.threshold = 1.1; this.bloomPass.strength = 0.9; this.bloomPass.radius = 0.45;
    this.bloomPass.materialHighPassFilter.uniforms.smoothWidth.value = 0.7;   // soft knee: no hard cut between glowing and not
    // NaN/Inf scrub in the bloom high-pass (a single bad pixel would otherwise blacken the whole blur)
    this.bloomPass.materialHighPassFilter.fragmentShader = this.bloomPass.materialHighPassFilter.fragmentShader.replace(
      'vec4 texel = texture2D( tDiffuse, vUv );',
      'vec4 texel = texture2D( tDiffuse, vUv );\n\t\t\tbvec3 bad = bvec3(isnan(texel.r) || isinf(texel.r), isnan(texel.g) || isinf(texel.g), isnan(texel.b) || isinf(texel.b));\n\t\t\ttexel.rgb = clamp(mix(texel.rgb, vec3(0.0), vec3(bad)), 0.0, 64.0);');
    this.bloomPass.materialHighPassFilter.needsUpdate = true;
    this.composer.addPass(this.bloomPass);
    // image-based auto exposure (adapted mean log-luminance), read by the final pass
    this.exposurePass = new ExposurePass();
    this.composer.addPass(this.exposurePass);
    this.finalPass = new FinalPass();
    this.finalPass.uniforms.tLum.value = this.exposurePass.texture;
    this.composer.addPass(this.finalPass);

    // ------ GPU timing (for dynamic resolution) ------
    this._timerExt = this.gl.getExtension('EXT_disjoint_timer_query_webgl2');
    this._queries = [];
    this.gpuMs = 0;

    // ------ loop state ------
    this.clock = new THREE.Clock();
    this.time = 0;
    this.dt = 0;
    this.frame = 0;
    this.systems = [];
    this.fps = 60; this._fpsAcc = 0; this._fpsN = 0;
    this.jsMs = 0;
    this.stats = { drawCalls: 0, triangles: 0, points: 0, programs: 0, geometries: 0, textures: 0 };
    this._perf = { acc: 0, n: 0, js: 0, gpu: 0, gpuN: 0, lastChange: 0, probeAt: -1, backoffUntil: 0 };
    this.running = false;
    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    this.resize();
  }

  setQuality(name) {
    if (name === 'auto') { this.qualityMode = 'auto'; name = detectQuality(this.gl).name; }
    else if (QUALITY[name]) this.qualityMode = name;
    else return;
    this.qualityName = name; this.q = QUALITY[name];
    this.taa.enabled = !!this.q.taa;
    this.renderScale = 1;
    this._perf.lastChange = this.time; this._perf.backoffUntil = this.time + 3;
    this._applyScale();
    bus.emit('quality', name);
  }

  _applyScale() {
    // with TAA the scene is rendered into a fraction of the full-size targets and the temporal pass reconstructs the full
    // image (TAAU): the drawing buffer keeps its size. Without TAA fall back to a smaller drawing buffer.
    const pr = this.taa && this.taa.enabled ? this.q.pixelRatio : this.q.pixelRatio * this.renderScale;
    if (Math.abs(this.renderer.getPixelRatio() - pr) > 1e-6) { this.renderer.setPixelRatio(pr); this.resize(); }
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.composer.setSize(size.x, size.y);
    if (this.taa) this.taa.setSize(size.x, size.y);
    this.bloomPass.setSize(Math.max(8, Math.round(size.x * this.q.bloomScale)), Math.max(8, Math.round(size.y * this.q.bloomScale)));
    this.finalPass.setSize(size.x, size.y);
    this.blackHolePass.setSize(size.x, size.y);
    this.nebulaRT.setSize(Math.max(8, Math.round(size.x * this.q.nebulaScale)), Math.max(8, Math.round(size.y * this.q.nebulaScale)));
    this.volRT.setSize(Math.max(8, Math.round(size.x * this.q.nebulaScale)), Math.max(8, Math.round(size.y * this.q.nebulaScale)));
    bus.emit('resize', w, h);
  }

  addSystem(s) { this.systems.push(s); return s; }

  /**
   * Warm-up: draw every material reachable from the given roots (visible or not)
   * once into a small offscreen target of the same format as the HDR frame, so the
   * driver compiles all shader variants during the loading screen instead of
   * stalling the first visit to a planet, the rings, the Sun or Sagittarius A*.
   * (Background compileAsync polling stalls the main thread on ANGLE/D3D11, so the
   * work is done up front, sequentially, before the frame loop starts.)
   */
  async warmup(roots, extraMaterials = [], onProgress = null) {
    const seen = new Set();
    const proxies = [];
    const box = new THREE.BoxGeometry(1, 1, 1);
    const pts = new THREE.BufferGeometry(); pts.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 0.2, 0.1, 0]), 3));
    const add = (m, o) => {
      if (!m || seen.has(m.uuid)) return;
      seen.add(m.uuid);
      let proxy;
      if (o && o.isSprite) proxy = new THREE.Sprite(m);
      else if (o && o.isPoints) proxy = new THREE.Points(pts, m);
      else if (o && o.isLineSegments) proxy = new THREE.LineSegments(pts, m);
      else if (o && o.isLine) proxy = new THREE.Line(pts, m);
      else proxy = new THREE.Mesh(box, m);
      proxy.frustumCulled = false;
      proxies.push(proxy);
    };
    for (const m of extraMaterials) add(m, null);
    for (const root of roots) root.traverse(o => { const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []); for (const m of mats) add(m, o); });
    const rt = new THREE.WebGLRenderTarget(16, 16, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: true, stencilBuffer: false });
    const scene = new THREE.Scene();
    // copy the lights so lit materials get the same program variant as in the real scene
    this.scene.traverse(o => { if (o.isLight) scene.add(o.clone()); });
    const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 100); cam.position.z = 3; cam.updateMatrixWorld();
    const r = this.renderer;
    const prevTarget = r.getRenderTarget();
    for (let i = 0; i < proxies.length; i++) {
      const p = proxies[i];
      scene.add(p);
      try { r.setRenderTarget(rt); r.render(scene, cam); } catch (e) { console.warn('[warmup]', e); }
      scene.remove(p);
      if (onProgress && (i % 3 === 0)) { onProgress((i + 1) / proxies.length); await new Promise(res => setTimeout(res, 0)); }
    }
    r.setRenderTarget(prevTarget);
    rt.dispose();
    return seen.size;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.clock.start();
    const loop = () => {
      if (!this.running) return;
      this._raf = requestAnimationFrame(loop);
      this.step();
    };
    this._raf = requestAnimationFrame(loop);
  }
  stop() { this.running = false; cancelAnimationFrame(this._raf); }

  step() {
    const t0 = performance.now();
    const rawDt = this.clock.getDelta();
    const dt = Math.min(rawDt, 0.1);
    this.dt = dt; this.time += dt; this.frame++;
    this._fpsAcc += dt; this._fpsN++;
    if (this._fpsAcc >= 0.5) { this.fps = this._fpsN / this._fpsAcc; this._fpsAcc = 0; this._fpsN = 0; }
    for (const s of this.systems) { if (s.enabled !== false) s.update(dt, this.time); }
    this.jsMs = performance.now() - t0;        // simulation / UI only: render() blocks on GPU back-pressure and would hide the split
    const t1 = performance.now();
    this.render();
    this.renderMs = performance.now() - t1;
    this._updatePerf(rawDt);
  }

  render() {
    this.camera.fov = this.settings.fov * (this.fovMultiplier || 1);
    this.camera.updateProjectionMatrix();
    // sub-pixel jitter for the temporal AA (the pass reprojects the previous frame against this camera)
    const dbs = this.renderer.getDrawingBufferSize(this._dbs || (this._dbs = new THREE.Vector2()));
    const up = this.taa.enabled, rs = up ? this.renderScale : 1;
    const vw = Math.max(8, Math.round(dbs.x * rs)), vh = Math.max(8, Math.round(dbs.y * rs));
    for (const t of [this.composer.renderTarget1, this.composer.renderTarget2]) { t.viewport.set(0, 0, vw, vh); t.scissor.set(0, 0, vw, vh); t.scissorTest = rs < 1; }
    this.taa.setScale(vw / dbs.x, vh / dbs.y);
    this.taa.jitter(vw, vh); this.taa.camPos.copy(this.camera.position);
    this.taa.pixelRatio = this.renderer.getPixelRatio();
    this.taa.motionBlur = this.settings.motionBlur && this.q.motion ? this.motionIntensity : 0;
    this.taa.dof.aperture = this.settings.dof && this.q.dof ? this.dofAperture : 0;
    this.taa.dof.focus = this.dofFocus;
    this.exposurePass.dt = this.dt;
    this.finalPass.uniforms.tLum.value = this.exposurePass.texture;
    this.finalPass.uniforms.uAutoExp.value = this.settings.autoExposure ? 1 : 0;
    this.bloomPass.strength = this.settings.bloom + (this.bloomBoost || 0);
    this.finalPass.uniforms.uLens.value = this.settings.lens ? 1 : 0;
    this.finalPass.uniforms.uTime.value = this.time;
    const info = this.renderer.info;
    info.autoReset = false;
    info.reset();
    const q = this._beginGpuQuery();
    // volumetric layer at reduced resolution
    if (this.nebulaActive) {
      const r = this.renderer;
      r.setRenderTarget(this.nebulaRT);
      r.setClearColor(0x000000, 0);
      r.clear(true, false, false);
      r.render(this.nebulaScene, this.camera);
      r.setClearColor(0x000000, 1);
      r.setRenderTarget(null);
    }
    this.nebulaComposite.visible = this.nebulaActive;
    if (this.volActive) {
      const r = this.renderer;
      r.setRenderTarget(this.volRT);
      r.setClearColor(0x000000, 0);
      r.clear(true, false, false);
      r.render(this.volScene, this.camera);
      r.setClearColor(0x000000, 1);
      r.setRenderTarget(null);
    }
    this.volComposite.visible = this.volActive;
    this.composer.render(this.dt);
    this._endGpuQuery(q);
    this.stats.drawCalls = info.render.calls; this.stats.triangles = info.render.triangles; this.stats.points = info.render.points;
    this.stats.programs = info.programs?.length || 0; this.stats.geometries = info.memory.geometries; this.stats.textures = info.memory.textures;
  }

  // ---------------------------------------------------------------- GPU timer queries
  _beginGpuQuery() {
    const ext = this._timerExt; if (!ext) return null;
    const gl = this.gl;
    if (this._queries.length >= 4) return null;           // don't let them pile up
    const q = gl.createQuery();
    gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
    return q;
  }
  _endGpuQuery(q) {
    const ext = this._timerExt; if (!ext) return;
    const gl = this.gl;
    if (q) { gl.endQuery(ext.TIME_ELAPSED_EXT); this._queries.push(q); }
    // harvest finished queries (oldest first)
    while (this._queries.length) {
      const h = this._queries[0];
      const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
      if (disjoint) { for (const x of this._queries) gl.deleteQuery(x); this._queries.length = 0; break; }
      if (!gl.getQueryParameter(h, gl.QUERY_RESULT_AVAILABLE)) break;
      const ns = gl.getQueryParameter(h, gl.QUERY_RESULT);
      gl.deleteQuery(h); this._queries.shift();
      const ms = ns / 1e6;
      if (ms > 0 && ms < 1000) { this.gpuMs = this.gpuMs ? this.gpuMs * 0.8 + ms * 0.2 : ms; this._perf.gpu += ms; this._perf.gpuN++; }
    }
  }

  // ---------------------------------------------------------------- dynamic resolution
  _updatePerf(rawDt) {
    const p = this._perf;
    if (rawDt > 0.25 || document.hidden) { p.acc = 0; p.n = 0; p.js = 0; p.gpu = 0; p.gpuN = 0; return; } // tab switch / one-off hitch
    p.acc += rawDt; p.n++; p.js += this.jsMs;
    if (p.acc < 0.6) return;
    const wall = 1000 * p.acc / p.n, js = p.js / p.n;
    const gpu = p.gpuN ? p.gpu / p.gpuN : null;
    p.acc = 0; p.n = 0; p.js = 0; p.gpu = 0; p.gpuN = 0;
    this.frameMs = wall;
    if (!this.autoScale || this.time < 2) return;
    const t = this.time, minS = this.q.minScale;
    let s = this.renderScale;
    const cpuBound = js > 11;                  // simulation alone eats the budget: lowering resolution cannot help
    if (gpu != null) {
      // measured GPU time: steer toward a ~13 ms GPU budget (leaves headroom for compositor + CPU)
      if (gpu > 15.5) s *= Math.max(0.7, Math.min(0.95, Math.sqrt(13 / gpu)));
      else if (gpu < 9.5 && s < 1 && t - p.lastChange > 2 && t > p.backoffUntil) s = Math.min(1, s * Math.min(1.15, Math.sqrt(13 / Math.max(gpu, 1))));
    } else {
      // wall-clock heuristic (vsync makes headroom invisible, so probe upward carefully)
      if (wall > 17.8 && !cpuBound) {
        s *= 0.85;
        if (p.probeAt >= 0 && t - p.probeAt < 3) { p.backoffUntil = t + 25; }   // the probe failed: hold for a while
        p.probeAt = -1;
      } else if (wall < 17.2 && s < 1 && t - p.lastChange > 4 && t > p.backoffUntil) {
        s = Math.min(1, s * 1.1); p.probeAt = t;
      }
    }
    s = Math.max(minS, Math.min(1, s));
    if (Math.abs(s - this.renderScale) > 0.01) {
      this.renderScale = s; p.lastChange = t;
      this._applyScale();
    }
  }
}
