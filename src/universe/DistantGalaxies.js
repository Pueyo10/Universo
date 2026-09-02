import * as THREE from 'three';
import { LY, MLY, GALAXY_MATRIX, SUN_GAL_POS, radecToVector, fmtNum } from '../core/Units.js';
import { Rng } from '../core/Random.js';
import { LOGDEPTH_PARS_VERT, LOGDEPTH_VERT, LOGDEPTH_PARS_FRAG, LOGDEPTH_FRAG, HASH, SIMPLEX3D } from '../shaders/chunks.js';

// Procedural distant galaxies: named Local-Group / nearby galaxies at their
// real positions plus thousands of procedural ones arranged along cosmic-web
// filaments. Each is an oriented disc evaluated analytically in the shader
// (spiral arms, bulge, dust lane, tilt) — no textures.
const NAMED = [
  { name: 'Andromeda Galaxy', aliases: ['M31', 'NGC 224', 'Andromeda'], ra: 10.685, dec: 41.269, dist: 2.537e6, size: 220000, type: 0, incl: 77, pa: 35, arms: 2, tint: [1.0, 0.92, 0.8], bright: 0.7, desc: 'The nearest large galaxy, a barred spiral of a trillion stars 2.5 million light-years away — the most distant object visible to the naked eye. It is approaching us at 110 km/s and will merge with the Milky Way in about 4.5 billion years.' },
  { name: 'Triangulum Galaxy', aliases: ['M33', 'NGC 598', 'Triangulum'], ra: 23.462, dec: 30.660, dist: 2.73e6, size: 60000, type: 0, incl: 54, pa: 23, arms: 2, tint: [0.85, 0.9, 1.0], bright: 0.8, desc: 'The third-largest member of the Local Group, a loosely wound spiral rich in star-forming regions, including NGC 604, one of the largest known nebulae.' },
  { name: 'Large Magellanic Cloud', aliases: ['LMC'], ra: 80.894, dec: -69.756, dist: 163000, size: 14000, type: 2, incl: 35, pa: 170, arms: 1, tint: [0.9, 0.9, 1.0], bright: 0.9, desc: 'A satellite galaxy of the Milky Way, visible as a detached patch of the Milky Way from the southern hemisphere. Home of the Tarantula Nebula and Supernova 1987A.' },
  { name: 'Small Magellanic Cloud', aliases: ['SMC'], ra: 13.158, dec: -72.800, dist: 200000, size: 7000, type: 2, incl: 60, pa: 45, arms: 1, tint: [0.9, 0.92, 1.0], bright: 0.75, desc: 'A dwarf irregular galaxy orbiting the Milky Way together with the LMC, connected to it by a bridge of gas.' },
  { name: 'Sagittarius Dwarf', aliases: ['Sgr dSph'], ra: 283.76, dec: -30.48, dist: 70000, size: 10000, type: 1, incl: 0, pa: 0, arms: 0, tint: [1.0, 0.9, 0.8], bright: 0.15, desc: 'A dwarf spheroidal galaxy being torn apart by the Milky Way on the far side of the galactic centre, leaving long tidal streams of stars around our galaxy.' },
  { name: 'Centaurus A', aliases: ['NGC 5128'], ra: 201.365, dec: -43.019, dist: 12e6, size: 60000, type: 1, incl: 80, pa: 35, arms: 0, tint: [1.0, 0.9, 0.8], bright: 1.0, dust: 1, desc: 'A giant elliptical galaxy crossed by a spectacular dust lane, the nearest active radio galaxy: a supermassive black hole in its core launches jets a million light-years long.' },
  { name: 'Bode\'s Galaxy', aliases: ['M81', 'NGC 3031'], ra: 148.888, dec: 69.065, dist: 11.8e6, size: 90000, type: 0, incl: 60, pa: 157, arms: 2, tint: [1.0, 0.92, 0.82], bright: 1.0, desc: 'A grand-design spiral in Ursa Major with a bright nucleus, one of the brightest galaxies in the sky.' },
  { name: 'Cigar Galaxy', aliases: ['M82', 'NGC 3034'], ra: 148.970, dec: 69.680, dist: 11.4e6, size: 37000, type: 2, incl: 82, pa: 65, arms: 0, tint: [1.0, 0.8, 0.6], bright: 0.9, desc: 'A starburst galaxy forming stars ten times faster than the Milky Way, blowing out a superwind of hot gas, triggered by a close pass with M81.' },
  { name: 'Whirlpool Galaxy', aliases: ['M51', 'NGC 5194'], ra: 202.470, dec: 47.195, dist: 23e6, size: 76000, type: 0, incl: 20, pa: 170, arms: 2, tint: [0.9, 0.93, 1.0], bright: 1.0, desc: 'A face-on grand-design spiral interacting with a small companion, NGC 5195 — the first galaxy in which spiral structure was recognised, in 1845.' },
  { name: 'Pinwheel Galaxy', aliases: ['M101', 'NGC 5457'], ra: 210.802, dec: 54.349, dist: 21e6, size: 170000, type: 0, incl: 18, pa: 40, arms: 3, tint: [0.9, 0.95, 1.0], bright: 0.85, desc: 'A vast face-on spiral nearly twice the diameter of the Milky Way, studded with giant star-forming regions.' },
  { name: 'Sombrero Galaxy', aliases: ['M104', 'NGC 4594'], ra: 189.998, dec: -11.623, dist: 29e6, size: 50000, type: 0, incl: 84, pa: 90, arms: 2, tint: [1.0, 0.92, 0.85], bright: 1.0, dust: 1, desc: 'An almost edge-on galaxy with a brilliant bulge and a thick dark dust lane, harbouring a billion-solar-mass black hole.' },
  { name: 'Messier 87', aliases: ['M87', 'Virgo A'], ra: 187.706, dec: 12.391, dist: 53.5e6, size: 120000, type: 1, incl: 0, pa: 0, arms: 0, tint: [1.0, 0.92, 0.85], bright: 1.0, desc: 'A supergiant elliptical galaxy at the heart of the Virgo Cluster whose 6.5-billion-solar-mass black hole was the first ever imaged, by the Event Horizon Telescope in 2019.' },
  { name: 'Black Eye Galaxy', aliases: ['M64', 'NGC 4826'], ra: 194.182, dec: 21.683, dist: 17e6, size: 54000, type: 0, incl: 60, pa: 115, arms: 2, tint: [1.0, 0.9, 0.8], bright: 0.85, dust: 1, desc: 'A spiral with a dramatic dark band of dust in front of its nucleus; its outer gas rotates opposite to the inner disc.' },
  { name: 'Sculptor Galaxy', aliases: ['NGC 253'], ra: 11.888, dec: -25.288, dist: 11.4e6, size: 90000, type: 0, incl: 78, pa: 52, arms: 2, tint: [1.0, 0.9, 0.78], bright: 0.9, dust: 1, desc: 'A dusty starburst spiral, one of the brightest galaxies beyond the Local Group.' },
  { name: 'Barnard\'s Galaxy', aliases: ['NGC 6822'], ra: 296.234, dec: -14.803, dist: 1.6e6, size: 7000, type: 2, incl: 40, pa: 10, arms: 0, tint: [0.9, 0.9, 1.0], bright: 0.5, desc: 'A dwarf irregular galaxy of the Local Group, similar to the Small Magellanic Cloud.' },
];

const vert = /* glsl */`
  attribute vec3 iPos;      // ly, galaxy-centre frame
  attribute float iSize;    // ly (radius)
  attribute vec3 iAxis;     // disc normal (unit, model frame)
  attribute vec3 iParam;    // type, seed, bright
  attribute vec3 iTint;
  attribute vec3 iAux;      // arms, dust, incl unused
  uniform vec3 uCamPosModel;
  varying vec2 vUv; varying vec3 vTint; varying vec3 vParam; varying vec3 vAux;
  varying vec3 vRight, vUp, vView, vAxis; varying float vSize, vDist;
  ${LOGDEPTH_PARS_VERT}
  void main() {
    vec3 toCam = uCamPosModel - iPos;
    float dist = length(toCam);
    vec3 view = toCam / max(dist, 1e-6);
    // billboard basis
    vec3 upRef = abs(view.z) < 0.9 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
    vec3 right = normalize(cross(upRef, view));
    vec3 up = cross(view, right);
    float quad = iSize * 1.6;
    vec3 p = iPos + (right * position.x + up * position.y) * quad * 2.0;
    vUv = position.xy * 2.0; vTint = iTint; vParam = iParam; vAux = iAux;
    vRight = right; vUp = up; vView = view; vAxis = iAxis; vSize = quad; vDist = dist;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    ${LOGDEPTH_VERT}
  }
`;
const frag = /* glsl */`
  precision highp float;
  varying vec2 vUv; varying vec3 vTint; varying vec3 vParam; varying vec3 vAux;
  varying vec3 vRight, vUp, vView, vAxis; varying float vSize, vDist;
  uniform float uFade, uTime;
  ${HASH}
  ${SIMPLEX3D}
  ${LOGDEPTH_PARS_FRAG}
  void main() {
    ${LOGDEPTH_FRAG}
    float type = vParam.x, seed = vParam.y, bright = vParam.z;
    float arms = vAux.x, dust = vAux.y;
    // quad point in model space (relative to galaxy centre), unit = galaxy radius R = vSize/1.6
    float R = vSize / 1.6;
    vec3 P = (vRight * vUv.x + vUp * vUv.y) * vSize;
    vec3 n = vAxis;
    float vn = dot(vView, n);
    // intersection of the (parallel) view ray with the disc plane
    float tpl = -dot(P, n) / (abs(vn) < 0.02 ? (vn < 0.0 ? -0.02 : 0.02) : vn);
    vec3 Q = P + vView * tpl;
    // in-plane basis
    vec3 e1 = normalize(cross(n, abs(n.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
    vec3 e2 = cross(n, e1);
    float x = dot(Q, e1) / R, y = dot(Q, e2) / R;
    float r = length(vec2(x, y));
    float th = atan(y, x);
    // path length through a thin disc (edge-on brightening), clamped by extent
    float h = 0.06;
    float pathL = min(h * 1.77 / max(abs(vn), 0.02), 2.0);
    // spherical bulge/halo from the quad distance (independent of tilt)
    float rq = length(vUv) * 1.6;
    float bulge = exp(-rq * rq * 45.0) * 1.1 + exp(-rq * 7.0) * 0.25;
    vec3 col = vec3(0.0);
    float disc = 0.0;
    if (type < 0.5) {
      // spiral: log-spiral arm modulation
      float pitch = 0.28 + 0.1 * hash11(seed * 3.1);
      float phase = log(max(r, 0.02)) / pitch;
      float armPat = 0.5 + 0.5 * cos(arms * (th - phase) + seed * 20.0);
      float armW = pow(armPat, 2.2);
      float n1 = clamp(snoise(vec3(x * 5.0, y * 5.0, seed * 7.0)) * 0.5 + 0.5, 0.0, 1.0);
      float n2 = clamp(snoise(vec3(x * 14.0, y * 14.0, seed * 9.0)) * 0.5 + 0.5, 0.0, 1.0);
      float prof = exp(-r * 2.4) * (1.0 - smoothstep(0.85, 1.05, r)) * smoothstep(0.0, 0.08, r);
      disc = prof * (0.12 + 1.5 * armW * (0.55 + 0.7 * n1)) * (0.7 + 0.6 * n2);
      // HII sparkle along arms
      float hii = pow(n2, 8.0) * armW * prof * 3.0;
      vec3 armCol = mix(vTint, vec3(0.65, 0.78, 1.0), 0.55 * armW);
      col += armCol * disc * pathL * 1.3 + vec3(1.0, 0.5, 0.6) * hii * pathL;
      // dust lane (multiplicative darkening near the plane, on the near side)
      if (dust > 0.5) {
        float lane = exp(-pow((dot(P, n) / R) / 0.045, 2.0)) * smoothstep(1.0, 0.2, rq) * step(0.0, -dot(vView, n) * dot(P, n) + 1e-4);
        float dn = snoise(vec3(x * 9.0, y * 9.0, seed)) * 0.5 + 0.5;
        col *= 1.0 - 0.75 * lane * (0.6 + 0.4 * dn);
        bulge *= 1.0 - 0.7 * lane;
      }
    } else if (type < 1.5) {
      // elliptical: smooth de Vaucouleurs-like profile, slightly flattened along the axis
      float flatn = 0.55 + 0.4 * hash11(seed);
      vec3 Pn = P / R; float z = dot(Pn, n);
      float rr = length(Pn - n * z) + abs(z) / flatn;
      float prof = min(exp(-7.67 * (pow(max(rr, 0.02) * 1.4, 0.25) - 1.0)), 2.5);
      col += vTint * prof * 0.6;
      if (dust > 0.5) { float lane = exp(-pow(z / 0.05, 2.0)) * smoothstep(1.0, 0.1, rr); col *= 1.0 - 0.8 * lane; }
    } else {
      // irregular: clumpy noise
      float n1 = clamp(snoise(vec3(x * 4.0, y * 4.0, seed)) * 0.5 + 0.5, 0.0, 1.0);
      float n2 = clamp(snoise(vec3(x * 11.0, y * 11.0, seed * 3.0)) * 0.5 + 0.5, 0.0, 1.0);
      float prof = exp(-r * r * 2.2) * (1.0 - smoothstep(0.8, 1.1, r));
      disc = prof * (0.3 + 1.2 * n1 * n1) * (0.6 + 0.8 * n2);
      col += mix(vTint, vec3(0.7, 0.8, 1.0), 0.5) * disc * pathL * 1.2 + vec3(1.0, 0.55, 0.6) * pow(n2, 10.0) * prof * 2.0;
    }
    col += vTint * bulge * (type < 1.5 ? 0.8 : 0.25);
    // soften quad edge
    float edge = 1.0 - smoothstep(1.35, 1.6, rq);
    col *= edge * bright * uFade;
    float a = clamp(max(max(col.r, col.g), col.b) * 2.0, 0.0, 1.0);
    if (a < 0.002) discard;
    gl_FragColor = vec4(col, a);
  }
`;

export class DistantGalaxies {
  constructor(ctx) {
    this.ctx = ctx; this.engine = ctx.engine; this.registry = ctx.registry;
    this.group = new THREE.Group();
    this.group.matrixAutoUpdate = false;
    const center = new THREE.Vector3(-SUN_GAL_POS.x, -SUN_GAL_POS.y, -SUN_GAL_POS.z).applyMatrix4(GALAXY_MATRIX).multiplyScalar(LY);
    this.group.matrix.copy(GALAXY_MATRIX).scale(new THREE.Vector3(LY, LY, LY)).setPosition(center);
    this.group.matrixWorld.copy(this.group.matrix);
    this.centerScene = center;
    this._camModel = new THREE.Vector3();
    this._invRot = new THREE.Matrix3().setFromMatrix4(GALAXY_MATRIX).transpose();
    this._build();
    this.engine.scene.add(this.group);
  }

  _build() {
    const rng = new Rng(2024);
    const items = [];
    const v = new THREE.Vector3();
    // named
    for (const g of NAMED) {
      radecToVector(g.ra, g.dec, v).multiplyScalar(g.dist); // ly, Sun-relative scene frame
      // → galaxy model frame: model = inv(GAL) * (scene/LY) + SUN
      const model = v.clone().applyMatrix3(this._invRot).add(SUN_GAL_POS);
      const axis = this._axisFor(g.incl, g.pa, v.clone().normalize());
      items.push({ pos: model, size: g.size / 2, axis, type: g.type, seed: rng.float(), bright: g.bright, tint: g.tint, arms: g.arms, dust: g.dust || 0, named: g });
    }
    // procedural cosmic web: filaments radiating from random nodes
    const nodes = [];
    for (let i = 0; i < 40; i++) { const d = rng.unitVector(); const r = 15e6 + rng.float() * 110e6; nodes.push(new THREE.Vector3(d[0] * r, d[1] * r, d[2] * r)); }
    const countProc = Math.round(1800 * (this.engine.q.chunkStars || 1));
    for (let i = 0; i < countProc; i++) {
      const a = rng.pick(nodes), b = rng.pick(nodes);
      const t = rng.float();
      const p = a.clone().lerp(b, t);
      const jitter = 1.2e6 * (0.3 + rng.float());
      p.x += rng.gauss() * jitter; p.y += rng.gauss() * jitter; p.z += rng.gauss() * jitter;
      if (p.length() < 8e6) continue; // keep Local Group clean
      const type = rng.float() < 0.6 ? 0 : rng.float() < 0.6 ? 1 : 2;
      const size = (type === 1 ? 30000 + 80000 * rng.float() : type === 0 ? 25000 + 70000 * rng.float() : 6000 + 15000 * rng.float()) / 2;
      const ax = rng.unitVector();
      const tint = type === 1 ? [1.0, 0.9, 0.78] : type === 0 ? [0.95 + 0.05 * rng.float(), 0.9, 0.82 + 0.15 * rng.float()] : [0.85, 0.9, 1.0];
      items.push({ pos: p, size, axis: new THREE.Vector3(ax[0], ax[1], ax[2]), type, seed: rng.float(), bright: 0.25 + 0.35 * rng.float(), tint, arms: 2 + rng.int(3), dust: rng.float() < 0.25 ? 1 : 0 });
    }
    // far faint field
    for (let i = 0; i < 2500; i++) {
      const d = rng.unitVector(); const r = 60e6 + rng.float() * 350e6;
      const p = new THREE.Vector3(d[0] * r, d[1] * r, d[2] * r);
      const type = rng.float() < 0.5 ? 0 : rng.float() < 0.6 ? 1 : 2;
      const ax = rng.unitVector();
      items.push({ pos: p, size: (20000 + 60000 * rng.float()) / 2, axis: new THREE.Vector3(ax[0], ax[1], ax[2]), type, seed: rng.float(), bright: 0.12 + 0.2 * rng.float(), tint: [0.95, 0.9, 0.85], arms: 2, dust: 0 });
    }
    const n = items.length;
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    geo.instanceCount = n;
    const iPos = new Float32Array(n * 3), iSize = new Float32Array(n), iAxis = new Float32Array(n * 3), iParam = new Float32Array(n * 3), iTint = new Float32Array(n * 3), iAux = new Float32Array(n * 3);
    items.forEach((it, i) => {
      iPos[i * 3] = it.pos.x; iPos[i * 3 + 1] = it.pos.y; iPos[i * 3 + 2] = it.pos.z;
      iSize[i] = it.size;
      iAxis[i * 3] = it.axis.x; iAxis[i * 3 + 1] = it.axis.y; iAxis[i * 3 + 2] = it.axis.z;
      iParam[i * 3] = it.type; iParam[i * 3 + 1] = it.seed; iParam[i * 3 + 2] = it.bright;
      iTint[i * 3] = it.tint[0]; iTint[i * 3 + 1] = it.tint[1]; iTint[i * 3 + 2] = it.tint[2];
      iAux[i * 3] = it.arms; iAux[i * 3 + 1] = it.dust; iAux[i * 3 + 2] = 0;
      if (it.named) this._register(it);
    });
    geo.setAttribute('iPos', new THREE.InstancedBufferAttribute(iPos, 3));
    geo.setAttribute('iSize', new THREE.InstancedBufferAttribute(iSize, 1));
    geo.setAttribute('iAxis', new THREE.InstancedBufferAttribute(iAxis, 3));
    geo.setAttribute('iParam', new THREE.InstancedBufferAttribute(iParam, 3));
    geo.setAttribute('iTint', new THREE.InstancedBufferAttribute(iTint, 3));
    geo.setAttribute('iAux', new THREE.InstancedBufferAttribute(iAux, 3));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 5e8);
    this.material = new THREE.ShaderMaterial({
      uniforms: { uCamPosModel: { value: new THREE.Vector3() }, uFade: { value: 1 }, uTime: { value: 0 } },
      vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.group.add(this.mesh);
    this.count = n;
  }

  _axisFor(inclDeg, paDeg, dirFromSun) {
    // disc normal: start with the line of sight, tilt by inclination around the position-angle axis (approximate, in scene frame) then to model frame
    const los = dirFromSun.clone();
    const north = new THREE.Vector3(0, 1, 0);
    const east = new THREE.Vector3().crossVectors(north, los).normalize();
    const nn = new THREE.Vector3().crossVectors(los, east).normalize();
    const pa = paDeg * Math.PI / 180, inc = inclDeg * Math.PI / 180;
    const paAxis = nn.clone().multiplyScalar(Math.cos(pa)).addScaledVector(east, Math.sin(pa)).normalize(); // major axis direction on sky
    const normal = los.clone().applyAxisAngle(paAxis, inc).normalize();
    return normal.applyMatrix3(this._invRot).normalize();
  }

  _register(it) {
    const g = it.named;
    const scenePos = it.pos.clone().sub(SUN_GAL_POS).applyMatrix4(GALAXY_MATRIX).multiplyScalar(LY);
    const axisWorld = it.axis.clone().applyMatrix4(new THREE.Matrix4().extractRotation(GALAXY_MATRIX)).normalize();
    this.registry.add({
      id: 'gal-' + g.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name: g.name, kind: 'galaxy', aliases: g.aliases, color: '#c8c0ff', radius: g.size / 2 * LY, priority: 4, labelRange: [2, 70], axis: axisWorld, approachElevation: 0.55,
      getPosition(out) { return out.copy(scenePos); },
      data: { type: g.type === 0 ? 'Spiral galaxy' : g.type === 1 ? 'Elliptical galaxy' : 'Irregular galaxy', distance: `${fmtNum(g.dist / 1e6, 3)} million ly`, diameter: `≈ ${fmtNum(g.size, 3)} ly` },
      description: g.desc,
    });
  }

  update(dt, t, camPos) {
    // camera in model coords
    this._camModel.copy(camPos).multiplyScalar(1 / LY).applyMatrix3(this._invRot).add(SUN_GAL_POS);
    this.material.uniforms.uCamPosModel.value.copy(this._camModel);
    this.material.uniforms.uTime.value = t;
  }
}
