import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

// Temporal anti-aliasing. The camera projection is jittered by a sub-pixel Halton
// offset every frame; this pass reprojects the previous accumulated frame into
// the current one (depth-based reprojection against the previous camera pose,
// done in camera-relative coordinates so it works at any scale) and blends it in
// after clamping it to the neighbourhood of the current pixel. Besides the edge
// AA this also integrates the per-pixel noise of the ray-marched volumes.
const HALTON = [];
for (let i = 1; i <= 16; i++) { const h = (b) => { let f = 1, r = 0, n = i; while (n > 0) { f /= b; r += f * (n % b); n = Math.floor(n / b); } return r; }; HALTON.push([h(2) - 0.5, h(3) - 0.5]); }

const taaFrag = /* glsl */`
  precision highp float;
  uniform sampler2D tCurrent, tHistory, tDepth;
  uniform vec2 uResolution, uJitter;
  uniform float uP00, uP11, uLogFar, uBlend, uValid;
  uniform mat3 uRotCur, uRotPrevT;
  uniform mat4 uProjPrev;
  uniform vec3 uCamDelta;
  varying vec2 vUv;
  vec3 rgb2ycocg(vec3 c) { return vec3(0.25 * c.r + 0.5 * c.g + 0.25 * c.b, 0.5 * c.r - 0.5 * c.b, -0.25 * c.r + 0.5 * c.g - 0.25 * c.b); }
  vec3 ycocg2rgb(vec3 c) { return vec3(c.x + c.y - c.z, c.x + c.z, c.x - c.y - c.z); }
  vec3 fetch(vec2 uv) { vec3 c = texture2D(tCurrent, uv).rgb; bvec3 bad = bvec3(isnan(c.r) || isinf(c.r), isnan(c.g) || isinf(c.g), isnan(c.b) || isinf(c.b)); return rgb2ycocg(max(mix(c, vec3(0.0), vec3(bad)), 0.0)); }
  void main() {
    vec2 px = 1.0 / uResolution;
    vec3 cur = fetch(vUv);
    // neighbourhood bounds (3×3, YCoCg) with a little variance slack
    vec3 mn = cur, mx = cur, m1 = cur, m2 = cur * cur;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      if (x == 0 && y == 0) continue;
      vec3 s = fetch(vUv + vec2(float(x), float(y)) * px);
      mn = min(mn, s); mx = max(mx, s); m1 += s; m2 += s * s;
    }
    m1 /= 9.0; m2 /= 9.0;
    vec3 sigma = sqrt(max(m2 - m1 * m1, 0.0));
    mn = min(mn, m1 - sigma * 1.25); mx = max(mx, m1 + sigma * 1.25);
    // reproject: view position from log depth, camera-relative world, previous camera
    float d = texture2D(tDepth, vUv).r;
    float w = exp2(d * uLogFar) - 1.0;
    vec2 ndc = vUv * 2.0 - 1.0 - uJitter;
    vec3 vpos = vec3(ndc.x * w / uP00, ndc.y * w / uP11, -w);
    vec3 rel = uRotCur * vpos + uCamDelta;
    vec3 vprev = uRotPrevT * rel;
    vec4 cp = uProjPrev * vec4(vprev, 1.0);
    vec2 uvPrev = cp.xy / max(cp.w, 1e-6) * 0.5 + 0.5;
    float ok = uValid * step(0.0, cp.w) * step(0.0, uvPrev.x) * step(uvPrev.x, 1.0) * step(0.0, uvPrev.y) * step(uvPrev.y, 1.0);
    // fast camera motion relative to the scene depth: trust the history less
    float motion = length(uCamDelta) / max(w, 1e-6);
    float blend = uBlend * ok * (1.0 - smoothstep(0.02, 0.2, motion));
    vec3 hist = rgb2ycocg(max(texture2D(tHistory, uvPrev).rgb, 0.0));
    hist = clamp(hist, mn, mx);
    vec3 outc = ycocg2rgb(mix(cur, hist, blend));
    gl_FragColor = vec4(max(outc, 0.0), 1.0);
  }
`;
const copyFrag = /* glsl */`precision highp float; uniform sampler2D tDiffuse; varying vec2 vUv; void main() { gl_FragColor = texture2D(tDiffuse, vUv); }`;
const vert = /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export class TAAPass extends Pass {
  constructor(camera, width, height) {
    super();
    this.camera = camera;
    this.needsSwap = true;
    this.enabled = true;
    this.blend = 0.88;
    this._idx = 0;
    this._jitter = new THREE.Vector2();
    this._prevRot = new THREE.Matrix3(); this._prevProj = new THREE.Matrix4(); this._prevPos = new THREE.Vector3(); this._valid = false;
    this._curRot = new THREE.Matrix3(); this._m4 = new THREE.Matrix4();
    const mk = () => new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, stencilBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
    this.hist = [mk(), mk()]; this._h = 0;
    this.material = new THREE.ShaderMaterial({
      uniforms: { tCurrent: { value: null }, tHistory: { value: null }, tDepth: { value: null }, uResolution: { value: new THREE.Vector2(width, height) }, uJitter: { value: new THREE.Vector2() }, uP00: { value: 1 }, uP11: { value: 1 }, uLogFar: { value: 1 }, uBlend: { value: this.blend }, uValid: { value: 0 }, uRotCur: { value: new THREE.Matrix3() }, uRotPrevT: { value: new THREE.Matrix3() }, uProjPrev: { value: new THREE.Matrix4() }, uCamDelta: { value: new THREE.Vector3() } },
      vertexShader: vert, fragmentShader: taaFrag, depthTest: false, depthWrite: false,
    });
    this.copyMaterial = new THREE.ShaderMaterial({ uniforms: { tDiffuse: { value: null } }, vertexShader: vert, fragmentShader: copyFrag, depthTest: false, depthWrite: false });
    this.fsq = new FullScreenQuad(this.material);
    this.camPos = new THREE.Vector3();      // set by the engine each frame (float64 camera position)
  }

  setSize(w, h) {
    for (const r of this.hist) r.setSize(w, h);
    this.material.uniforms.uResolution.value.set(w, h);
    this._valid = false;
  }

  /** Apply this frame's sub-pixel jitter to the (freshly updated) projection matrix. Call before rendering the scene. */
  jitter(width, height) {
    const cam = this.camera;
    if (!this.enabled) { this._jitter.set(0, 0); return; }
    const [hx, hy] = HALTON[this._idx % HALTON.length]; this._idx++;
    this._jitter.set(hx * 2 / width, hy * 2 / height);
    const e = cam.projectionMatrix.elements;
    e[8] = -this._jitter.x; e[9] = -this._jitter.y;
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
  }

  render(renderer, writeBuffer, readBuffer) {
    const cam = this.camera, u = this.material.uniforms;
    const e = cam.projectionMatrix.elements;
    u.tCurrent.value = readBuffer.texture;
    u.tDepth.value = readBuffer.depthTexture;
    u.tHistory.value = this.hist[this._h].texture;
    u.uJitter.value.copy(this._jitter);
    u.uP00.value = e[0]; u.uP11.value = e[5];
    u.uLogFar.value = Math.log2(cam.far + 1);
    u.uBlend.value = this.blend;
    this._curRot.setFromMatrix4(cam.matrixWorld);
    u.uRotCur.value.copy(this._curRot);
    u.uRotPrevT.value.copy(this._prevRot).transpose();
    u.uProjPrev.value.copy(this._prevProj);
    u.uCamDelta.value.copy(this.camPos).sub(this._prevPos);
    u.uValid.value = this._valid ? 1 : 0;
    // accumulate into the other history buffer, then copy to the chain
    const out = this.hist[1 - this._h];
    renderer.setRenderTarget(out);
    this.fsq.material = this.material; this.fsq.render(renderer);
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.copyMaterial.uniforms.tDiffuse.value = out.texture;
    this.fsq.material = this.copyMaterial; this.fsq.render(renderer);
    this._h = 1 - this._h;
    // remember this frame's (unjittered) camera
    this._prevRot.copy(this._curRot);
    this._prevProj.copy(cam.projectionMatrix); this._prevProj.elements[8] = 0; this._prevProj.elements[9] = 0;
    this._prevPos.copy(this.camPos);
    this._valid = true;
  }

  /** Forget the history (after a camera cut or a resize). */
  reset() { this._valid = false; }

  dispose() { for (const r of this.hist) r.dispose(); this.material.dispose(); this.copyMaterial.dispose(); this.fsq.dispose(); }
}
