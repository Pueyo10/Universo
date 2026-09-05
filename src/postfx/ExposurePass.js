import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

// Automatic exposure from the image itself: the mean log-luminance of the frame
// (sampled on a grid, bright pixels clamped so a small Sun does not dominate) is
// adapted over time in a 1×1 float target that the final pass reads — no CPU
// read-back, no stalls. Photographic key / average → exposure, within bounds.
const lumFrag = /* glsl */`
  precision highp float;
  uniform sampler2D tDiffuse, tPrev;
  uniform float uDt, uValid, uClampMax;
  uniform vec2 uMeterCenter;
  uniform float uMeterRadius, uMeterTarget, uAspect;
  varying vec2 vUv;
  void main() {
    float acc = 0.0, weights = 0.0;
    for (int y = 0; y < 20; y++) for (int x = 0; x < 20; x++) {
      vec2 grid = (vec2(float(x), float(y)) + 0.5) / 20.0;
      vec2 extent = vec2(uMeterRadius / uAspect, uMeterRadius);
      vec2 uv = mix(grid, clamp(uMeterCenter + (grid * 2.0 - 1.0) * extent, 0.0, 1.0), uMeterTarget);
      // centre-weighted metering
      float w = 0.55 + 0.45 * (1.0 - smoothstep(0.15, 0.6, length(grid - 0.5)));
      vec3 c = texture2D(tDiffuse, uv).rgb;
      bvec3 bad = bvec3(isnan(c.r) || isinf(c.r), isnan(c.g) || isinf(c.g), isnan(c.b) || isinf(c.b));
      c = max(mix(c, vec3(0.0), vec3(bad)), 0.0);
      float l = min(dot(c, vec3(0.2126, 0.7152, 0.0722)), uClampMax);
      acc += log(l + 0.002) * w;
      weights += w;
    }
    float target = acc / weights;
    float prev = texture2D(tPrev, vec2(0.5)).r;
    // Adapt faster to bright scenes; reveal dark scenes gradually. Real seconds.
    float rate = 1.0 - exp(-uDt * (target > prev ? 3.5 : 0.8));
    float v = uValid > 0.5 ? mix(prev, target, rate) : target;
    gl_FragColor = vec4(v, 0.0, 0.0, 1.0);
  }
`;
const vert = /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export class ExposurePass extends Pass {
  constructor() {
    super();
    this.needsSwap = false;
    const mk = () => new THREE.WebGLRenderTarget(1, 1, { type: THREE.FloatType, format: THREE.RGBAFormat, depthBuffer: false, stencilBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    this.rt = [mk(), mk()]; this._i = 0; this._valid = false;
    this.material = new THREE.ShaderMaterial({ uniforms: { tDiffuse: { value: null }, tPrev: { value: null }, uDt: { value: 1 / 60 }, uValid: { value: 0 }, uClampMax: { value: 6.0 }, uMeterCenter: { value: new THREE.Vector2(0.5, 0.5) }, uMeterRadius: { value: 0.2 }, uMeterTarget: { value: 0 }, uAspect: { value: 1 } }, vertexShader: vert, fragmentShader: lumFrag, depthTest: false, depthWrite: false });
    this.fsq = new FullScreenQuad(this.material);
    this.dt = 1 / 60;
    this.locked = false;
  }
  /** The adapted mean log-luminance texture (1×1) for the final pass. */
  get texture() { return this.rt[this._i].texture; }
  render(renderer, writeBuffer, readBuffer) {
    if (this.locked && this._valid) return;
    const u = this.material.uniforms;
    u.tDiffuse.value = readBuffer.texture;
    u.tPrev.value = this.rt[this._i].texture;
    u.uDt.value = Math.max(0, Math.min(this.dt, 0.1));
    u.uValid.value = this._valid ? 1 : 0;
    const out = this.rt[1 - this._i];
    renderer.setRenderTarget(out);
    this.fsq.render(renderer);
    renderer.setRenderTarget(null);
    this._i = 1 - this._i; this._valid = true;
  }
  reset() { this._valid = false; }
  dispose() { for (const r of this.rt) r.dispose(); this.material.dispose(); this.fsq.dispose(); }
}
