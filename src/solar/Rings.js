import * as THREE from 'three';
import { LOGDEPTH_PARS_VERT, LOGDEPTH_VERT, LOGDEPTH_PARS_FRAG, LOGDEPTH_FRAG, SIMPLEX3D, HASH } from '../shaders/chunks.js';
import { Rng } from '../core/Random.js';

// Planetary rings: a radial density profile with real gaps (Cassini, Encke,
// Keeler…), lit and unlit sides, forward scattering when backlit, the planet's
// shadow cast analytically across the ring plane, azimuthal clumping when
// close, and an instanced field of ice boulders around the camera when it
// flies through the ring plane.
const ringVert = /* glsl */`
  varying vec3 vPos; varying vec2 vUv;
  ${LOGDEPTH_PARS_VERT}
  void main() {
    vPos = position; vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    ${LOGDEPTH_VERT}
  }
`;
const ringFrag = /* glsl */`
  precision highp float;
  varying vec3 vPos; varying vec2 vUv;
  uniform sampler2D uTex; uniform vec3 uSunDir, uCamLocal;
  uniform float uInner, uOuter, uTime, uExposure, uDetail, uFaint, uPlanetFlat;
  ${HASH}
  ${SIMPLEX3D}
  ${LOGDEPTH_PARS_FRAG}
  void main() {
    ${LOGDEPTH_FRAG}
    float r = length(vPos.xz);
    float t = (r - uInner) / (uOuter - uInner);
    if (t < 0.0 || t > 1.0) discard;
    vec4 s = texture2D(uTex, vec2(t, 0.5));
    float a = s.a;
    // fine azimuthal / radial structure when close
    float ang = atan(vPos.z, vPos.x);
    if (uDetail > 0.001) {
      float n1 = snoise(vec3(t * 900.0, ang * 60.0, 0.0)) * 0.5 + 0.5;
      float n2 = snoise(vec3(t * 3000.0, ang * 20.0, 3.0)) * 0.5 + 0.5;
      a *= mix(1.0, 0.6 + 0.8 * n1 * (0.5 + n2), uDetail);
    }
    if (a < 0.003) discard;
    vec3 L = normalize(uSunDir);
    vec3 V = normalize(uCamLocal - vPos);
    float nl = L.y;   // ring normal = +Y
    float nv = V.y;
    bool sameSide = (nl * nv) > 0.0;
    // lit side: direct reflection; unlit side: transmitted light through thin parts
    float lit = sameSide ? abs(nl) : abs(nl) * (1.0 - a) * 0.75;
    // planet shadow: does the sun ray from this point hit the (slightly flattened) planet?
    vec3 P = vPos; P.y /= uPlanetFlat;
    vec3 Ls = L; Ls.y /= uPlanetFlat; Ls = normalize(Ls);
    float b = dot(P, Ls); float c = dot(P, P) - 1.0; float h = b * b - c;
    float shadow = 1.0;
    if (h > 0.0 && (-b - sqrt(h)) > 0.0) shadow = 0.04;
    // soften the shadow edge using distance of closest approach
    float dca = length(P - Ls * max(-b, 0.0));
    if (b < 0.0) shadow = mix(shadow, 1.0, smoothstep(1.0, 1.03, dca));
    // forward scattering (backlit) glow for thin/dusty parts
    float fwd = pow(max(dot(-V, L), 0.0), 12.0) * (1.0 - a) * 0.8;
    vec3 col = s.rgb * (0.12 + 1.15 * lit) * shadow + vec3(0.9, 0.85, 0.75) * fwd * shadow;
    col *= uExposure;
    float alpha = clamp(a * uFaint, 0.0, 1.0);
    gl_FragColor = vec4(col * alpha, alpha);
  }
`;

const rockVert = /* glsl */`
  attribute vec3 iOffset; attribute vec4 iRot; attribute float iScale;
  varying vec3 vN; varying vec3 vWp;
  uniform float uTime;
  ${LOGDEPTH_PARS_VERT}
  vec3 qrot(vec4 q, vec3 v) { return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v); }
  void main() {
    // slow tumble
    float a = uTime * (0.2 + iRot.w * 0.5);
    float c = cos(a), s = sin(a);
    vec3 axis = normalize(iRot.xyz);
    vec4 q = vec4(axis * s, c);
    vec3 p = qrot(q, position * iScale) + iOffset;
    vN = normalize(qrot(q, normal));
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vWp = mv.xyz;
    gl_Position = projectionMatrix * mv;
    ${LOGDEPTH_VERT}
  }
`;
const rockFrag = /* glsl */`
  precision highp float;
  varying vec3 vN; varying vec3 vWp;
  uniform vec3 uSunDirView; uniform float uExposure;
  ${LOGDEPTH_PARS_FRAG}
  void main() {
    ${LOGDEPTH_FRAG}
    vec3 n = normalize(vN);
    float ndl = max(dot(n, normalize(uSunDirView)), 0.0);
    // icy boulders: bright albedo with a little ambient bounce from the ring plane
    vec3 col = vec3(0.92, 0.9, 0.85) * (0.12 + 0.95 * ndl);
    gl_FragColor = vec4(col * uExposure, 1.0);
  }
`;

export class Rings {
  constructor(body, tex, opts = {}) {
    this.body = body;
    const def = body.def.rings;
    this.inner = def.inner; this.outer = def.outer;
    const geo = new THREE.RingGeometry(this.inner, this.outer, 512, 8);
    // rotate to XZ plane (RingGeometry is in XY)
    geo.rotateX(-Math.PI / 2);
    this.material = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: tex }, uSunDir: { value: new THREE.Vector3(1, 0, 0) }, uCamLocal: { value: new THREE.Vector3() }, uInner: { value: this.inner }, uOuter: { value: this.outer }, uTime: { value: 0 }, uExposure: { value: 1 }, uDetail: { value: 0 }, uFaint: { value: def.faint ? (def.veryFaint ? 0.35 : 0.6) : 1 }, uPlanetFlat: { value: 1 - (body.def.oblateness || 0) } },
      vertexShader: ringVert, fragmentShader: ringFrag, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.renderOrder = 63;
    // rings lie in the planet's equatorial plane = local XZ (pole = local Y)
    body.group.add(this.mesh);
    this.tex = tex;
    // particles
    this.maxRocks = opts.maxRocks || 12000;
    this._buildRocks();
    this._cellKey = null;
    this._v = new THREE.Vector3();
  }

  _buildRocks() {
    const base = new THREE.IcosahedronGeometry(1, 1);
    // displace vertices for irregular rocks
    const p = base.attributes.position; const rng = new Rng(31);
    for (let i = 0; i < p.count; i++) { const k = 0.7 + 0.5 * rng.float(); p.setXYZ(i, p.getX(i) * k, p.getY(i) * (0.6 + 0.6 * rng.float()), p.getZ(i) * k); }
    base.computeVertexNormals();
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index; geo.attributes.position = base.attributes.position; geo.attributes.normal = base.attributes.normal;
    const n = this.maxRocks;
    this.iOffset = new Float32Array(n * 3); this.iRot = new Float32Array(n * 4); this.iScale = new Float32Array(n);
    geo.setAttribute('iOffset', new THREE.InstancedBufferAttribute(this.iOffset, 3));
    geo.setAttribute('iRot', new THREE.InstancedBufferAttribute(this.iRot, 4));
    geo.setAttribute('iScale', new THREE.InstancedBufferAttribute(this.iScale, 1));
    geo.instanceCount = 0;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 10);
    this.rockMat = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uSunDirView: { value: new THREE.Vector3() }, uExposure: { value: 1 } }, vertexShader: rockVert, fragmentShader: rockFrag });
    this.rocks = new THREE.Mesh(geo, this.rockMat);
    this.rocks.frustumCulled = false;
    this.rocks.renderOrder = 59;
    this.rocks.visible = false;
    this.body.group.add(this.rocks);
  }

  /** Regenerate the boulder field around the camera (local ring coords). */
  _updateRocks(camLocal, planetRadiusUnits) {
    const r = Math.hypot(camLocal.x, camLocal.z);
    const inRing = r > this.inner - 0.05 && r < this.outer + 0.05 && Math.abs(camLocal.y) < 0.02;
    if (!inRing) { this.rocks.visible = false; this._cellKey = null; return; }
    this.rocks.visible = true;
    // cell in (r, angle) space around the camera; regenerate when moving to a new cell
    const cellR = 0.004, cellA = 0.004;
    const ang = Math.atan2(camLocal.z, camLocal.x);
    const key = `${Math.floor(r / cellR)}:${Math.floor(ang / cellA)}`;
    if (key === this._cellKey) return;
    this._cellKey = key;
    const rng = new Rng((Math.floor(r / cellR) * 7919 + Math.floor(ang / cellA) * 104729) >>> 0);
    const n = this.maxRocks;
    // spread: 3×3 cells around camera
    const geo = this.rocks.geometry;
    const tex = this.tex.image?.data; const tw = this.tex.image?.width || 1;
    let i = 0;
    for (let k = 0; k < n; k++) {
      const rr = r + (rng.float() - 0.5) * cellR * 3;
      const aa = ang + (rng.float() - 0.5) * cellA * 3;
      // density from the ring profile alpha
      const t = (rr - this.inner) / (this.outer - this.inner);
      if (t < 0 || t > 1) continue;
      let dens = 0.7;
      if (tex) dens = tex[Math.floor(t * (tw - 1)) * 4 + 3] / 255;
      if (rng.float() > dens) continue;
      const y = rng.gauss() * 0.00006;   // ring thickness ~ tens of metres in planet radii
      this.iOffset[i * 3] = Math.cos(aa) * rr; this.iOffset[i * 3 + 1] = y; this.iOffset[i * 3 + 2] = Math.sin(aa) * rr;
      const ax = rng.unitVector();
      this.iRot[i * 4] = ax[0]; this.iRot[i * 4 + 1] = ax[1]; this.iRot[i * 4 + 2] = ax[2]; this.iRot[i * 4 + 3] = rng.float();
      // sizes: metres to tens of metres in planet-radius units (Saturn R = 58,232 km): 1 m = 1.7e-8
      this.iScale[i] = (0.3 + 20 * Math.pow(rng.float(), 3)) * 1.7e-8 * 60;
      i++;
    }
    geo.attributes.iOffset.needsUpdate = true; geo.attributes.iRot.needsUpdate = true; geo.attributes.iScale.needsUpdate = true;
    geo.instanceCount = i;
  }

  update(t, camPos, sunPos, rpx, exposure, camera) {
    const b = this.body;
    const u = this.material.uniforms;
    const sunDirWorld = this._v.copy(sunPos).sub(b.position).normalize();
    b.worldDirToLocal(sunDirWorld, u.uSunDir.value);
    b.worldToLocal(camPos, u.uCamLocal.value);
    u.uTime.value = t; u.uExposure.value = exposure;
    u.uDetail.value = THREE.MathUtils.clamp((rpx - 300) / 900, 0, 1);
    this.mesh.visible = rpx > 1.5;
    this._updateRocks(u.uCamLocal.value, b.radius);
    if (this.rocks.visible) {
      const ru = this.rockMat.uniforms;
      ru.uTime.value = t; ru.uExposure.value = exposure;
      ru.uSunDirView.value.copy(u.uSunDir.value); // rock normals are in ring-local space
    }
  }
}
