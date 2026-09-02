import * as THREE from 'three';
import { AU, KM, LY, smoothstep, clamp } from '../core/Units.js';
import { Rng } from '../core/Random.js';
import { SimplexNoise } from '../core/Noise.js';
import { LOGDEPTH_PARS_VERT, LOGDEPTH_VERT, LOGDEPTH_PARS_FRAG, LOGDEPTH_FRAG, HASH } from '../shaders/chunks.js';
import { VISUAL } from './Body.js';

// Asteroid belt, Kuiper belt and Oort cloud as GPU-propagated Keplerian
// particle systems (orbits solved in the vertex shader), plus an instanced
// field of irregular rocks that materialises around the camera inside the
// asteroid belt.
const beltVert = /* glsl */`
  attribute vec4 el1;   // a (AU), e, i (rad), Omega (rad)
  attribute vec3 el2;   // omega (rad), M0 (rad), size
  attribute vec3 color;
  varying vec3 vColor; varying float vAlpha;
  uniform float uDays, uScaleT, uPixelRatio, uSizeMul, uFade, uMinPx, uMaxPx;
  uniform vec3 uCamPos;
  ${LOGDEPTH_PARS_VERT}
  void main() {
    float a = el1.x, e = el1.y, inc = el1.z, O = el1.w, w = el2.x, M0 = el2.y;
    float n = 0.01720209895 / pow(a, 1.5);     // rad/day
    float M = mod(M0 + n * uDays, 6.28318530718);
    float E = M + e * sin(M);
    for (int k = 0; k < 4; k++) E = E - (E - e * sin(E) - M) / (1.0 - e * cos(E));
    float xp = a * (cos(E) - e), yp = a * sqrt(1.0 - e * e) * sin(E);
    float cw = cos(w), sw = sin(w), cO = cos(O), sO = sin(O), ci = cos(inc), si = sin(inc);
    float x = (cw * cO - sw * sO * ci) * xp + (-sw * cO - cw * sO * ci) * yp;
    float y = (cw * sO + sw * cO * ci) * xp + (-sw * sO + cw * cO * ci) * yp;
    float z = (sw * si) * xp + (cw * si) * yp;
    vec3 pAU = vec3(x, z, -y);
    float r = length(pAU);
    float rv = ${VISUAL.orbitMul} * pow(r, ${VISUAL.orbitPow});
    vec3 p = pAU * mix(1.0, rv / max(r, 1e-6), uScaleT) * ${AU.toFixed(3)};
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float dist = length(mv.xyz);
    float sizeUnits = el2.z * uSizeMul;              // scene units
    float px = sizeUnits / dist * 1000.0;
    float size = clamp(px, uMinPx, uMaxPx);
    vColor = color;
    // fade with distance so the belt reads as a band from afar and as sparse rocks from within
    vAlpha = uFade * clamp(0.25 + px * 0.5, 0.0, 1.0);
    gl_PointSize = size * uPixelRatio;
    gl_Position = projectionMatrix * mv;
    ${LOGDEPTH_VERT}
  }
`;
const beltFrag = /* glsl */`
  precision highp float;
  varying vec3 vColor; varying float vAlpha;
  ${LOGDEPTH_PARS_FRAG}
  void main() {
    ${LOGDEPTH_FRAG}
    vec2 c = gl_PointCoord - 0.5; float r2 = dot(c, c) * 4.0;
    if (r2 > 1.0) discard;
    float a = (1.0 - smoothstep(0.3, 1.0, r2)) * vAlpha;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor * a, a);
  }
`;
const oortVert = /* glsl */`
  varying float vAlpha;
  uniform float uPixelRatio, uFade;
  ${LOGDEPTH_PARS_VERT}
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vAlpha = uFade;
    gl_PointSize = 1.5 * uPixelRatio;
    gl_Position = projectionMatrix * mv;
    ${LOGDEPTH_VERT}
  }
`;
const oortFrag = /* glsl */`
  precision highp float; varying float vAlpha;
  ${LOGDEPTH_PARS_FRAG}
  void main() {
    ${LOGDEPTH_FRAG}
    if (vAlpha < 0.01) discard;
    gl_FragColor = vec4(vec3(0.6, 0.7, 0.9) * vAlpha, vAlpha);
  }
`;

const rockVert = /* glsl */`
  attribute vec3 iOffset; attribute vec4 iRot; attribute vec3 iScale; attribute float iShade;
  varying vec3 vN; varying float vShade;
  uniform float uTime;
  ${LOGDEPTH_PARS_VERT}
  vec3 qrot(vec4 q, vec3 v) { return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v); }
  void main() {
    float a = uTime * (0.05 + iRot.w * 0.3);
    vec3 axis = normalize(iRot.xyz);
    vec4 q = vec4(axis * sin(a), cos(a));
    vec3 p = qrot(q, position * iScale) + iOffset;
    vN = normalize(qrot(q, normal / iScale));
    vShade = iShade;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    ${LOGDEPTH_VERT}
  }
`;
const rockFrag = /* glsl */`
  precision highp float;
  varying vec3 vN; varying float vShade;
  uniform vec3 uSunDir; uniform float uExposure;
  ${LOGDEPTH_PARS_FRAG}
  void main() {
    ${LOGDEPTH_FRAG}
    vec3 n = normalize(vN);
    float ndl = max(dot(n, normalize(uSunDir)), 0.0);
    vec3 base = mix(vec3(0.35, 0.32, 0.29), vec3(0.55, 0.5, 0.45), vShade);
    gl_FragColor = vec4(base * (0.03 + 0.97 * ndl) * uExposure, 1.0);
  }
`;

export class Belts {
  constructor(ctx, manager) {
    this.ctx = ctx; this.engine = ctx.engine; this.manager = manager;
    this.group = new THREE.Group();
    this.engine.scene.add(this.group);
    const q = this.engine.q;
    this.asteroids = this._makeBelt(q.asteroids, 2024, { aMin: 2.06, aMax: 3.27, eMax: 0.25, iSig: 6.5, sizeKm: [1, 60], color: [0.62, 0.58, 0.52], kirkwood: true });
    this.kuiper = this._makeBelt(Math.round(q.asteroids * 0.6), 2025, { aMin: 30, aMax: 55, eMax: 0.2, iSig: 8, sizeKm: [20, 400], color: [0.55, 0.6, 0.72] });
    this.scattered = this._makeBelt(Math.round(q.asteroids * 0.15), 2026, { aMin: 40, aMax: 110, eMax: 0.55, iSig: 15, sizeKm: [30, 300], color: [0.5, 0.55, 0.68] });
    this._makeOort();
    this._makeRocks();
    this._v = new THREE.Vector3();
    this._cell = null;
  }

  _makeBelt(n, seed, o) {
    const rng = new Rng(seed);
    const el1 = new Float32Array(n * 4), el2 = new Float32Array(n * 3), col = new Float32Array(n * 3), pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      let a = o.aMin + (o.aMax - o.aMin) * Math.pow(rng.float(), 0.9);
      if (o.kirkwood) { // gaps at 3:1 (2.50), 5:2 (2.82), 7:3 (2.96), 2:1 (3.28)
        for (const g of [2.5, 2.82, 2.96]) { if (Math.abs(a - g) < 0.02 && rng.float() < 0.85) a += (rng.float() < 0.5 ? -0.05 : 0.05); }
      }
      el1[i * 4] = a; el1[i * 4 + 1] = Math.abs(rng.gauss()) * o.eMax * 0.5; el1[i * 4 + 2] = Math.abs(rng.gauss()) * o.iSig * Math.PI / 180; el1[i * 4 + 3] = rng.float() * Math.PI * 2;
      el2[i * 3] = rng.float() * Math.PI * 2; el2[i * 3 + 1] = rng.float() * Math.PI * 2;
      const sizeKm = o.sizeKm[0] + (o.sizeKm[1] - o.sizeKm[0]) * Math.pow(rng.float(), 4);
      el2[i * 3 + 2] = sizeKm * KM;
      const t = 0.75 + 0.5 * rng.float();
      col[i * 3] = o.color[0] * t; col[i * 3 + 1] = o.color[1] * t; col[i * 3 + 2] = o.color[2] * t;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('el1', new THREE.BufferAttribute(el1, 4));
    geo.setAttribute('el2', new THREE.BufferAttribute(el2, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), o.aMax * 2 * AU);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uDays: { value: 0 }, uScaleT: { value: 0 }, uPixelRatio: { value: 1 }, uSizeMul: { value: 1 }, uFade: { value: 1 }, uMinPx: { value: 1.2 }, uMaxPx: { value: 4 }, uCamPos: { value: new THREE.Vector3() } },
      vertexShader: beltVert, fragmentShader: beltFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false; pts.renderOrder = 45;
    this.group.add(pts);
    return pts;
  }

  _makeOort() {
    const rng = new Rng(2027);
    const n = 5000;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const d = rng.unitVector(); const r = (2000 + 60000 * Math.pow(rng.float(), 1.5)) * AU;
      pos[i * 3] = d[0] * r; pos[i * 3 + 1] = d[1] * r; pos[i * 3 + 2] = d[2] * r;
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 70000 * AU);
    this.oortMat = new THREE.ShaderMaterial({ uniforms: { uPixelRatio: { value: 1 }, uFade: { value: 0 } }, vertexShader: oortVert, fragmentShader: oortFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.oort = new THREE.Points(geo, this.oortMat);
    this.oort.frustumCulled = false; this.oort.renderOrder = 44;
    this.group.add(this.oort);
  }

  _makeRocks() {
    const base = new THREE.IcosahedronGeometry(1, 3);
    const p = base.attributes.position; const noise = new SimplexNoise(77);
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const n = 1 + 0.3 * noise.fbm3(x * 1.4, y * 1.4, z * 1.4, 4) + 0.1 * noise.fbm3(x * 5, y * 5, z * 5, 3); p.setXYZ(i, x * n, y * n * 0.85, z * n * 1.1); }
    base.computeVertexNormals();
    const n = 160;
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index; geo.attributes.position = base.attributes.position; geo.attributes.normal = base.attributes.normal;
    this.rOffset = new Float32Array(n * 3); this.rRot = new Float32Array(n * 4); this.rScale = new Float32Array(n * 3); this.rShade = new Float32Array(n);
    geo.setAttribute('iOffset', new THREE.InstancedBufferAttribute(this.rOffset, 3));
    geo.setAttribute('iRot', new THREE.InstancedBufferAttribute(this.rRot, 4));
    geo.setAttribute('iScale', new THREE.InstancedBufferAttribute(this.rScale, 3));
    geo.setAttribute('iShade', new THREE.InstancedBufferAttribute(this.rShade, 1));
    geo.instanceCount = 0;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.rockMat = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uSunDir: { value: new THREE.Vector3() }, uExposure: { value: 1 } }, vertexShader: rockVert, fragmentShader: rockFrag });
    this.rocks = new THREE.Mesh(geo, this.rockMat);
    this.rocks.frustumCulled = false; this.rocks.visible = false; this.rocks.renderOrder = 46;
    this.group.add(this.rocks);
    this.rockCount = n;
  }

  _updateRocks(camPos, scaleT) {
    // inside the asteroid belt torus?
    const r = Math.hypot(camPos.x, camPos.z) / AU;
    const rReal = scaleT > 0.5 ? Math.pow(r / VISUAL.orbitMul, 1 / VISUAL.orbitPow) : r;
    const inBelt = rReal > 2.0 && rReal < 3.4 && Math.abs(camPos.y / AU) < 0.35;
    if (!inBelt) { this.rocks.visible = false; this._cell = null; return; }
    this.rocks.visible = true;
    const cellSize = (0.0004 + 0.003 * scaleT) * AU;
    const cx = Math.floor(camPos.x / cellSize), cy = Math.floor(camPos.y / cellSize), cz = Math.floor(camPos.z / cellSize);
    const key = `${cx}:${cy}:${cz}`;
    if (key === this._cell) return;
    this._cell = key;
    const rng = new Rng(((cx * 73856093) ^ (cy * 19349663) ^ (cz * 83492791)) >>> 0);
    const n = this.rockCount;
    const mul = 1 + scaleT * (VISUAL.smallRadius - 1);
    for (let i = 0; i < n; i++) {
      this.rOffset[i * 3] = (cx + rng.float() * 3 - 1) * cellSize; this.rOffset[i * 3 + 1] = (cy + rng.float() * 3 - 1) * cellSize; this.rOffset[i * 3 + 2] = (cz + rng.float() * 3 - 1) * cellSize;
      const ax = rng.unitVector(); this.rRot[i * 4] = ax[0]; this.rRot[i * 4 + 1] = ax[1]; this.rRot[i * 4 + 2] = ax[2]; this.rRot[i * 4 + 3] = rng.float();
      const s = (0.3 + 12 * Math.pow(rng.float(), 3)) * KM * mul * (1 + 2 * (1 - scaleT));
      this.rScale[i * 3] = s * (0.7 + 0.6 * rng.float()); this.rScale[i * 3 + 1] = s * (0.6 + 0.6 * rng.float()); this.rScale[i * 3 + 2] = s * (0.7 + 0.6 * rng.float());
      this.rShade[i] = rng.float();
    }
    const g = this.rocks.geometry;
    g.attributes.iOffset.needsUpdate = true; g.attributes.iRot.needsUpdate = true; g.attributes.iScale.needsUpdate = true; g.attributes.iShade.needsUpdate = true;
    g.instanceCount = n;
    this.rocks.position.set(0, 0, 0);
  }

  update(dt, t, camPos, days, scaleT, exposure) {
    const pr = this.engine.renderer.getPixelRatio();
    const sizeMul = 1 + scaleT * (VISUAL.smallRadius - 1) * 0.5;
    for (const b of [this.asteroids, this.kuiper, this.scattered]) {
      const u = b.material.uniforms;
      u.uDays.value = days; u.uScaleT.value = scaleT; u.uPixelRatio.value = pr; u.uSizeMul.value = sizeMul; u.uCamPos.value.copy(camPos);
      u.uFade.value = exposure * 0.9;
    }
    // Kuiper fades when viewed from far outside (it becomes a faint ring)
    const d = camPos.length();
    this.oortMat.uniforms.uFade.value = smoothstep(1500 * AU, 6000 * AU, d) * (1 - smoothstep(2 * LY, 20 * LY, d)) * 0.35;
    this.oortMat.uniforms.uPixelRatio.value = pr;
    this._updateRocks(camPos, scaleT);
    if (this.rocks.visible) { const ru = this.rockMat.uniforms; ru.uTime.value = t; ru.uExposure.value = exposure; ru.uSunDir.value.copy(camPos).negate().normalize(); }
  }
}
