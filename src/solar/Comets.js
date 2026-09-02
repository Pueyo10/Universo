import * as THREE from 'three';
import { AU, KM, clamp } from '../core/Units.js';
import { Rng } from '../core/Random.js';
import { SimplexNoise } from '../core/Noise.js';
import { cometPosition, cometPath } from './Orbits.js';
import { COMETS } from '../data/SolarSystemData.js';
import { LOGDEPTH_PARS_VERT, LOGDEPTH_VERT, LOGDEPTH_PARS_FRAG, LOGDEPTH_FRAG, HASH } from '../shaders/chunks.js';
import { Body, VISUAL } from './Body.js';

// Comets on real orbits with a nucleus, coma and two tails (straight blue ion
// tail, curved yellow dust tail) whose activity grows near perihelion.
const tailVert = /* glsl */`
  attribute vec3 off; attribute float t; attribute float seed;
  varying float vAlpha; varying vec3 vColor;
  uniform vec3 uAntiSun, uVelPerp, uCol;
  uniform float uLength, uCurve, uSpread, uActivity, uPixelRatio, uTime, uExposure;
  ${LOGDEPTH_PARS_VERT}
  void main() {
    float tt = t;
    // streaming animation
    tt = fract(tt + uTime * 0.02 * (0.5 + seed));
    vec3 p = uAntiSun * tt * uLength + uVelPerp * tt * tt * uCurve * uLength;
    p += off * uSpread * uLength * (0.05 + tt) * (0.5 + 0.5 * seed);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float dist = length(mv.xyz);
    float size = clamp(uLength * 0.02 * (0.3 + tt) / dist * 1000.0, 1.5, 40.0);
    gl_PointSize = size * uPixelRatio;
    vAlpha = uActivity * (1.0 - tt) * (1.0 - tt) * 0.35;
    vColor = uCol * uExposure;
    gl_Position = projectionMatrix * mv;
    ${LOGDEPTH_VERT}
  }
`;
const tailFrag = /* glsl */`
  precision highp float; varying float vAlpha; varying vec3 vColor;
  ${LOGDEPTH_PARS_FRAG}
  void main() {
    ${LOGDEPTH_FRAG}
    vec2 c = gl_PointCoord - 0.5; float r2 = dot(c, c) * 4.0;
    float a = exp(-r2 * 3.0) * vAlpha;
    if (a < 0.004) discard;
    gl_FragColor = vec4(vColor * a, a);
  }
`;

export class Comet extends Body {
  constructor(def, manager) {
    super({ ...def, kind: 'comet' }, manager, null);
    this.c = def;
    this.nucleusGeo = new THREE.IcosahedronGeometry(1, 4);
    const p = this.nucleusGeo.attributes.position; const noise = new SimplexNoise(def.name.length * 31);
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const n = 1 + 0.35 * noise.fbm3(x * 1.6, y * 1.6, z * 1.6, 4) + 0.12 * noise.fbm3(x * 5, y * 5, z * 5, 3); p.setXYZ(i, x * n * 1.35, y * n, z * n * 0.85); }
    this.nucleusGeo.computeVertexNormals();
    this.nucleus = new THREE.Mesh(this.nucleusGeo, new THREE.MeshStandardMaterial({ color: 0x6a625a, roughness: 0.95, metalness: 0.0 }));
    this.group.add(this.nucleus);
    // coma sprite
    const c = document.createElement('canvas'); c.width = c.height = 128; const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.15, 'rgba(210,230,255,0.7)'); g.addColorStop(0.5, 'rgba(150,190,255,0.18)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
    this.comaMat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.8 });
    this.coma = new THREE.Sprite(this.comaMat);
    this.group.add(this.coma);
    // tails are children of a world-scaled group (not the body scale)
    this.tailGroup = new THREE.Group();
    manager.engine.scene.add(this.tailGroup);
    this.ion = this._tail(500, [0.45, 0.7, 1.0], 0.0, 0.02, 1);
    this.dust = this._tail(700, [1.0, 0.92, 0.75], 0.35, 0.09, 2);
    this.tailGroup.add(this.ion, this.dust);
    this.orbitPoints = cometPath(def, 512);
  }

  _tail(n, col, curve, spread, seed) {
    const rng = new Rng(seed * 1001);
    const off = new Float32Array(n * 3), t = new Float32Array(n), sd = new Float32Array(n), pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const d = rng.unitVector(); off[i * 3] = d[0]; off[i * 3 + 1] = d[1]; off[i * 3 + 2] = d[2]; t[i] = rng.float(); sd[i] = rng.float(); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('off', new THREE.BufferAttribute(off, 3));
    geo.setAttribute('t', new THREE.BufferAttribute(t, 1));
    geo.setAttribute('seed', new THREE.BufferAttribute(sd, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uAntiSun: { value: new THREE.Vector3(1, 0, 0) }, uVelPerp: { value: new THREE.Vector3(0, 0, 1) }, uCol: { value: new THREE.Vector3(...col) }, uLength: { value: 1 }, uCurve: { value: curve }, uSpread: { value: spread }, uActivity: { value: 0 }, uPixelRatio: { value: 1 }, uTime: { value: 0 }, uExposure: { value: 1 } },
      vertexShader: tailVert, fragmentShader: tailFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 47;
    return pts;
  }

  update(simMs, scaleT) {
    const c = this.c;
    cometPosition(c, simMs, this.realPosition);
    const r = this.realPosition.length();
    const rv = Body.orbitVisual(r);
    this.visualPosition.copy(this.realPosition).multiplyScalar(rv / r);
    this.position.copy(this.realPosition).lerp(this.visualPosition, scaleT);
    // velocity direction via finite difference
    const p2 = cometPosition(c, simMs + 3600e3 * 24, new THREE.Vector3());
    this.vel = p2.sub(this.realPosition).normalize();
    this.radius = this.realRadius * (1 + scaleT * (VISUAL.smallRadius - 1));
    this.pole.set(0, 1, 0);
    this.quaternion.setFromAxisAngle(new THREE.Vector3(0.3, 1, 0.2).normalize(), (simMs / 3.6e6) % (Math.PI * 2));
    this.trackVelocity(simMs);
    this.group.position.copy(this.position); this.group.quaternion.copy(this.quaternion); this.group.scale.setScalar(this.radius);
    this.group.updateMatrix(); this.group.matrixWorld.copy(this.group.matrix);
    this.rAU = r / AU;
  }

  updateVisuals(t, camPos, exposure, pr) {
    const rAU = this.rAU;
    const activity = clamp(Math.pow(2.8 / Math.max(rAU, 0.3), 2.2), 0, 1.6);
    this.activity = activity;
    const antiSun = this.position.clone().normalize();
    const velPerp = this.vel.clone().sub(antiSun.clone().multiplyScalar(this.vel.dot(antiSun))).normalize();
    // visual tail length (AU-ish): grows with activity; scaled with orbit mapping in visual mode
    const len = (0.06 + 0.9 * activity) * AU * (this.manager.scaleT > 0.5 ? 0.5 : 1);
    this.tailGroup.position.copy(this.position);
    for (const [pts, mul] of [[this.ion, 1.0], [this.dust, 0.7]]) {
      const u = pts.material.uniforms;
      u.uAntiSun.value.copy(antiSun); u.uVelPerp.value.copy(velPerp); u.uLength.value = len * mul; u.uActivity.value = activity * exposure; u.uPixelRatio.value = pr; u.uTime.value = t; u.uExposure.value = exposure;
      pts.visible = activity > 0.02;
    }
    const dcam = camPos.distanceTo(this.position);
    this.coma.scale.setScalar(clamp(6 + activity * 40, 6, 60));
    this.comaMat.opacity = clamp(0.15 + activity * 0.7, 0, 0.9) * (dcam > this.radius * 3 ? 1 : 0.2);
    this.coma.visible = activity > 0.02;
  }
}

export function buildComets(manager) {
  return COMETS.map(def => new Comet(def, manager));
}
