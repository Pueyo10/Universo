import * as THREE from 'three';
import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js';
import { LOGDEPTH_PARS_VERT, LOGDEPTH_VERT, HASH } from '../shaders/chunks.js';

// GPU particle dynamics for the collapsing core (local unit = cloud radius, time unit = one unit of the
// simulation clock u). Each particle feels the gravity of the growing protostar plus the enclosed mass of
// the cloud (isothermal-like M(<r) ∝ r), turbulent kicks, and — near the midplane — gas drag toward the
// local Keplerian flow, which is what turns spinning infall into a disc: material with too much angular
// momentum cannot reach the star, hits its centrifugal barrier and settles into rotation. Anything that
// reaches the accretion radius is swallowed and re-enters from the outer envelope, so the population is
// stable. Positions / velocities live in float textures (ping-pong) computed by GPUComputationRenderer.

const RESPAWN = /* glsl */`
vec3 respawnPos(float seed, float t) {
  vec3 h = hash33(vec3(seed * 91.7 + 1.3, floor(t * 60.0) * 0.137 + seed, seed * 3.3 + 7.1));
  float z = h.x * 2.0 - 1.0, ph = h.y * 6.2831853; float s = sqrt(max(1.0 - z * z, 0.0));
  return vec3(s * cos(ph), z * 0.85, s * sin(ph)) * (0.72 + 0.28 * h.z);
}`;

export const velFrag = /* glsl */`
  uniform float uDt, uG, uMstar, uMcloud, uTrigger, uDisk, uRdisk, uDrag, uWind, uAccR, uTime, uTurb, uSpin, uVmax, uOmegaMax;
  ${HASH}
  ${RESPAWN}
  void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 p4 = texture2D(tPos, uv); vec3 p = p4.xyz; float seed = p4.w;
    vec4 v4 = texture2D(tVel, uv); vec3 v = v4.xyz;
    float r = length(p);
    if (r < uAccR || r > 1.8) {
      vec3 np = respawnPos(seed, uTime);
      vec3 tg = cross(vec3(0.0, 1.0, 0.0), np);
      gl_FragColor = vec4(tg * uSpin * 0.9, v4.w); return;
    }
    vec3 rhat = p / max(r, 1e-5);
    float soft = 0.35 * uRdisk;
    float r2 = r * r + soft * soft;
    float Menc = uMstar + uMcloud * clamp(r, 0.0, 1.0);
    vec3 g = -rhat * uG * Menc / r2;
    // before the collapse is triggered, thermal / turbulent / magnetic support balances gravity
    vec3 a = g * uTrigger;
    vec3 tn = vec3(hash13(p * 7.0 + uTime * 0.05), hash13(p * 7.0 + 31.0 + uTime * 0.05), hash13(p * 7.0 + 71.0 + uTime * 0.05)) - 0.5;
    a += tn * uTurb;
    // disc: gas drag toward the Keplerian flow near the midplane (viscous settling)
    vec3 tg = cross(vec3(0.0, 1.0, 0.0), rhat);
    float tl = length(tg); tg = tl > 1e-4 ? tg / tl : vec3(1.0, 0.0, 0.0);
    float vk = sqrt(uG * max(uMstar, 0.02) / sqrt(r2));
    float vt = min(vk, min(uVmax, uOmegaMax * r));
    vec3 vTarget = tg * vt;
    float rc = length(p.xz);
    float h = 0.08 * max(rc, 0.002) * pow(max(rc / max(uRdisk, 1e-4), 0.02), 0.25);
    float inPlane = exp(-p.y * p.y / (h * h));
    float discW = uDisk * inPlane * smoothstep(uRdisk * 1.6, uRdisk * 0.6, r);
    v += (vTarget - v) * (1.0 - exp(-uDrag * discW * uDt));
    float settle = uDisk * smoothstep(uRdisk * 2.5, uRdisk * 0.5, r);
    v.y *= exp(-settle * 2.5 * uDt);
    a.y -= p.y * settle * 60.0;
    // winds (young star, then giant / planetary-nebula phase) push the envelope outward
    a += rhat * uWind * (1.0 - discW) * smoothstep(0.0, 0.1, r);
    v += a * uDt;
    float sp = length(v); if (sp > 6.0) v *= 6.0 / sp;
    gl_FragColor = vec4(v, v4.w);
  }
`;

export const posFrag = /* glsl */`
  uniform float uDt, uAccR, uTime;
  ${HASH}
  ${RESPAWN}
  void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 p4 = texture2D(tPos, uv); vec4 v4 = texture2D(tVel, uv);
    vec3 p = p4.xyz; float r = length(p);
    if (r < uAccR || r > 1.8) { gl_FragColor = vec4(respawnPos(p4.w, uTime), p4.w); return; }
    p += v4.xyz * uDt;
    gl_FragColor = vec4(p, p4.w);
  }
`;

/** Point sprites fed by the simulation textures. */
export const simPtsVert = /* glsl */`
  uniform sampler2D tPos, tVel;
  uniform float uPxPerUnit, uWorldScale, uPointSize, uStarLum, uSci, uFade, uRdisk;
  uniform vec3 uStarColor;
  varying vec3 vColor; varying float vAlpha;
  ${LOGDEPTH_PARS_VERT}
  void main() {
    vec4 p4 = texture2D(tPos, position.xy); vec3 p = p4.xyz;
    vec4 v4 = texture2D(tVel, position.xy);
    float r = length(p); float seed = fract(p4.w * 7.31);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float near = smoothstep(uRdisk * 4.0, uRdisk * 0.5, r);
    float sizeLocal = uPointSize * (0.5 + 1.0 * seed) * (1.0 - 0.85 * near);
    gl_PointSize = clamp(sizeLocal * uWorldScale / max(-mv.z, 1e-6) * uPxPerUnit, 1.0, 12.0);
    float illum = uStarLum / (1.0 + r * r * 300.0);
    vec3 cold = vec3(0.5, 0.47, 0.55) * (0.5 + 0.5 * v4.w);
    vec3 col = cold * 0.35 + uStarColor * min(illum, 1.5) * 1.3;
    float alpha = (0.10 + 0.22 * seed) * (1.0 - 0.7 * near) * uFade;
    if (uSci > 2.5) {
      vec3 v = v4.xyz; float sp = length(v);
      float radial = -dot(v / max(sp, 1e-5), p / max(r, 1e-5));
      col = mix(vec3(1.0, 0.45, 0.15), vec3(0.25, 0.55, 1.0), clamp(radial * 0.5 + 0.5, 0.0, 1.0)) * (0.6 + 2.0 * min(sp, 1.5));
      alpha = 0.16 * uFade;
    }
    vColor = col; vAlpha = alpha;
    ${LOGDEPTH_VERT}
  }
`;

export class DustSim {
  /** n ≈ number of particles (rounded to a square texture). */
  constructor(renderer, n) {
    this.ok = false;
    const W = Math.max(32, Math.round(Math.sqrt(n) / 16) * 16);
    this.W = this.H = W; this.count = W * W;
    try {
      const gpu = this.gpu = new GPUComputationRenderer(W, W, renderer);
      const pos0 = gpu.createTexture(), vel0 = gpu.createTexture();
      this._fill(pos0.image.data, vel0.image.data);
      this.pos0 = pos0; this.vel0 = vel0;
      this.posVar = gpu.addVariable('tPos', posFrag, pos0);
      this.velVar = gpu.addVariable('tVel', velFrag, vel0);
      gpu.setVariableDependencies(this.posVar, [this.posVar, this.velVar]);
      gpu.setVariableDependencies(this.velVar, [this.posVar, this.velVar]);
      const U = (o) => { for (const k of Object.keys(o)) { this.posVar.material.uniforms[k] = { value: o[k] }; this.velVar.material.uniforms[k] = { value: o[k] }; } };
      U({ uDt: 0.005, uG: 1, uMstar: 0, uMcloud: 1, uTrigger: 0, uDisk: 0, uRdisk: 0.009, uDrag: 6, uWind: 0, uAccR: 0.001, uTime: 0, uTurb: 0.15, uSpin: 0.25, uVmax: 1.6, uOmegaMax: 300 });
      for (const v of [this.posVar, this.velVar]) { v.wrapS = v.wrapT = THREE.ClampToEdgeWrapping; v.minFilter = v.magFilter = THREE.NearestFilter; }
      const err = gpu.init();
      if (err) { console.warn('[starbirth] GPU particle sim unavailable:', err); return; }
      this.ok = true;
      this.uPos = this.posVar.material.uniforms; this.uVel = this.velVar.material.uniforms;
    } catch (e) { console.warn('[starbirth] GPU particle sim unavailable:', e); }
  }

  _fill(pos, vel) {
    const n = this.count;
    for (let i = 0; i < n; i++) {
      const r = 0.12 + 0.88 * Math.pow(Math.random(), 0.55);
      const z = Math.random() * 2 - 1, ph = Math.random() * Math.PI * 2, s = Math.sqrt(1 - z * z);
      const x = s * Math.cos(ph) * r, y = z * 0.85 * r, zz = s * Math.sin(ph) * r;
      pos[i * 4] = x; pos[i * 4 + 1] = y; pos[i * 4 + 2] = zz; pos[i * 4 + 3] = Math.random();
      // slow solid-body rotation about the axis + a little turbulence
      const spin = 0.25;
      vel[i * 4] = -zz * spin + (Math.random() - 0.5) * 0.03; vel[i * 4 + 1] = (Math.random() - 0.5) * 0.03; vel[i * 4 + 2] = x * spin + (Math.random() - 0.5) * 0.03; vel[i * 4 + 3] = Math.random();
    }
  }

  /** Back to the quiescent cloud. */
  reset() {
    if (!this.ok) return;
    const g = this.gpu;
    g.renderTexture(this.pos0, g.getCurrentRenderTarget(this.posVar)); g.renderTexture(this.pos0, g.getAlternateRenderTarget(this.posVar));
    g.renderTexture(this.vel0, g.getCurrentRenderTarget(this.velVar)); g.renderTexture(this.vel0, g.getAlternateRenderTarget(this.velVar));
  }

  /** Set the physical state for the current simulation time (all in cloud units / u-time). */
  setParams(p) {
    if (!this.ok) return;
    for (const k of Object.keys(p)) { if (this.uPos[k]) this.uPos[k].value = p[k]; if (this.uVel[k]) this.uVel[k].value = p[k]; }
  }

  /** Advance the particles by du (units of the simulation clock), sub-stepped for stability. */
  step(du, time, maxSub = 30) {
    if (!this.ok || du <= 0) return;
    const n = Math.min(maxSub, Math.max(1, Math.ceil(du / 0.008)));
    const h = du / n;
    for (let i = 0; i < n; i++) {
      this.uPos.uDt.value = h; this.uVel.uDt.value = h;
      this.uPos.uTime.value = time + i * h; this.uVel.uTime.value = time + i * h;
      this.gpu.compute();
    }
  }

  get posTexture() { return this.gpu.getCurrentRenderTarget(this.posVar).texture; }
  get velTexture() { return this.gpu.getCurrentRenderTarget(this.velVar).texture; }

  /** Geometry whose `position` holds the texture coordinate of each particle. */
  makeGeometry() {
    const uv = new Float32Array(this.count * 3);
    for (let y = 0; y < this.H; y++) for (let x = 0; x < this.W; x++) { const i = (y * this.W + x) * 3; uv[i] = (x + 0.5) / this.W; uv[i + 1] = (y + 0.5) / this.H; uv[i + 2] = 0; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(uv, 3));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 2);
    return geo;
  }
}
