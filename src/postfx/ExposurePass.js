import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

// Automatic exposure from the image itself: the mean log-luminance of the frame
// (sampled on a grid, bright pixels clamped so a small Sun does not dominate) is
// adapted over time in a 1×1 float target that the final pass reads — no CPU
// read-back, no stalls. Photographic key / average → exposure, within bounds.
const lumFrag = /* glsl */`
  precision highp float;
  uniform sampler2D tDiffuse, tPrev;
  uniform float uRate, uValid, uClampMax;
  varying vec2 vUv;
  void main() {
    float acc = 0.0;
    for (int y = 0; y < 20; y++) for (int x = 0; x < 20; x++) {
      vec2 uv = (vec2(float(x), float(y)) + 0.5) / 20.0;
      // centre-weighted metering
      float w = 0.55 + 0.45 * (1.0 - smoothstep(0.15, 0.6, length(uv - 0.5)));
      vec3 c = texture2D(tDiffuse, uv).rgb;
      bvec3 bad = bvec3(isnan(c.r) || isinf(c.r), isnan(c.g) || isinf(c.g), isnan(c.b) || isinf(c.b));
      c = max(mix(c, vec3(0.0), vec3(bad)), 0.0);
      float l = min(dot(c, vec3(0.2126, 0.7152, 0.0722)), uClampMax);
      acc += log(l + 0.002) * w;
    }
    float target = acc / (400.0 * 0.775);
    float prev = texture2D(tPrev, vec2(0.5)).r;
    float v = uValid > 0.5 ? mix(prev, target, uRate) : target;
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
    this.material = new THREE.ShaderMaterial({ uniforms: { tDiffuse: { value: null }, tPrev: { value: null }, uRate: { value: 0.04 }, uValid: { value: 0 }, uClampMax: { value: 6.0 } }, vertexShader: vert, fragmentShader: lumFrag, depthTest: false, depthWrite: false });
    this.fsq = new FullScreenQuad(this.material);
    this.dt = 1 / 60;
  }
  /** The adapted mean log-luminance texture (1×1) for the final pass. */
  get texture() { return this.rt[this._i].texture; }
  render(renderer, writeBuffer, readBuffer) {
    const u = this.material.uniforms;
    u.tDiffuse.value = readBuffer.texture;
    u.tPrev.value = this.rt[this._i].texture;
    u.uRate.value = 1 - Math.exp(-this.dt * 2.2);       // eye adaptation ~0.5 s
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
