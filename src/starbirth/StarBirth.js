import * as THREE from 'three';
import { PC, AU, LY, KM, SUN_RADIUS_KM, radecToVector, clamp, lerp, smoothstep } from '../core/Units.js';
import { bus } from '../core/EventBus.js';
import { StarBody } from '../solar/Sun.js';
import { CAM_MODE } from '../camera/CameraController.js';
import { i18n, t } from '../i18n/index.js';
import { MASSES, PHASES, PHASE_SECONDS, EVENTS, STRUCTS, TOUR, TOUR_END_U, fmtYears } from './StarBirthData.js';
import * as SH from './StarBirthShaders.js';

// STAR FORMATION — an interactive, time-compressed simulation of a molecular
// cloud core collapsing into a star: cloud → collapse → protostar → disc →
// bipolar jets → hydrogen ignition → main sequence. Lives at a real site in the
// Orion complex; the camera can explore it freely or follow a guided sequence.
// Every visual parameter is a function of the simulation clock u ∈ [0, 7), so the
// sequence can be paused, accelerated, scrubbed and rewound.
const RSUN = SUN_RADIUS_KM * KM;                 // scene units per solar radius
const SIBLINGS = [new THREE.Vector3(0.42, 0.18, -0.35), new THREE.Vector3(-0.5, -0.1, 0.22), new THREE.Vector3(0.15, -0.45, 0.48)];
const ss = (a, b, x) => smoothstep(a, b, x);
const QMUL = { low: 0.35, medium: 0.6, high: 1, ultra: 1.4 };

function blackbody(T) {
  // same approximation as the GLSL helper (linear RGB)
  const tt = clamp(T, 1000, 40000) / 100;
  let r, g, b;
  if (tt <= 66) { r = 1; g = clamp((99.4708025861 * Math.log(tt) - 161.1195681661) / 255, 0, 1); }
  else { r = clamp(329.698727446 * Math.pow(tt - 60, -0.1332047592) / 255, 0, 1); g = clamp(288.1221695283 * Math.pow(tt - 60, -0.0755148492) / 255, 0, 1); }
  if (tt >= 66) b = 1; else if (tt <= 19) b = 0; else b = clamp((138.5177312231 * Math.log(tt - 10) - 305.0447927307) / 255, 0, 1);
  return new THREE.Color(r * r, g * g, b * b);
}
function radialTexture(inner = 'rgba(255,255,255,1)', mid = 'rgba(255,225,190,0.55)', midStop = 0.2) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const cx = c.getContext('2d');
  const g = cx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, inner); g.addColorStop(midStop, mid); g.addColorStop(0.55, 'rgba(255,200,160,0.12)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  cx.fillStyle = g; cx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
/** Monotone cubic interpolation (Fritsch–Carlson): C1-continuous, no overshoot. pts: [[x, y]...] with increasing x. */
function monoCubic(pts) {
  const n = pts.length, xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) { m[i] = 0; continue; }
    const h0 = xs[i] - xs[i - 1], h1 = xs[i + 1] - xs[i];
    m[i] = 3 * (h0 + h1) / ((2 * h1 + h0) / d[i - 1] + (h1 + 2 * h0) / d[i]);
  }
  return x => {
    if (x <= xs[0]) return ys[0]; if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0; while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}
/** Same, interpolating in log space (for quantities spanning orders of magnitude). */
const logCurve = pts => { const f = monoCubic(pts.map(([x, y]) => [x, Math.log(y)])); return x => Math.exp(f(x)); };

export class StarBirth {
  constructor(ctx) {
    this.ctx = ctx; this.engine = ctx.engine; this.registry = ctx.registry; this.cameraCtl = ctx.cameraCtl; this.time = ctx.time;
    this.active = false; this.u = 0; this.speed = 1; this.paused = false; this.mode = 'normal'; this.layer = 0; this.tour = false;
    this.rot = 0; this.jetClock = 0; this.simT = 0;
    this._flash = 0; this._shake = 0; this._ignited = false; this._eventIdx = -1; this._phase = -1; this._ringT = 99;
    this.m = MASSES.solar; this.massKey = 'solar';
    // site: in the Orion star-forming complex, ~30 ly from M42 (which then fills the sky as a backdrop)
    const orion = radecToVector(83.82, -5.39).multiplyScalar(1344 * LY);
    const side = new THREE.Vector3().crossVectors(orion.clone().normalize(), new THREE.Vector3(0, 1, 0)).normalize();
    this.site = orion.clone().addScaledVector(side, 30 * LY).addScaledVector(new THREE.Vector3(0, 1, 0), -14 * LY);
    this.axis = new THREE.Vector3(0.25, 1, -0.18).normalize();
    this.tilt = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), this.axis);
    this.tiltInv = this.tilt.clone().invert();
    this._orionDir = orion.clone().sub(this.site).normalize().applyQuaternion(this.tiltInv);
    this._v = new THREE.Vector3(); this._v2 = new THREE.Vector3(); this._v3 = new THREE.Vector3(); this._m3 = new THREE.Matrix3(); this._m3b = new THREE.Matrix3(); this._m4 = new THREE.Matrix4();
    this._build();
    this._registry();
    this.setMass('solar');
    this._params();
    bus.on('starbirth:start', o => this.start(o || {}));
    bus.on('starbirth:stop', () => this.stop());
    bus.on('starbirth:focus', () => this.focus());
    bus.on('escape', () => { if (!this.active) return; if (this.tour) this.stopTour(false); else this.stop(); });
    bus.on('observatory:changed', b => { this._band = b; });
    this._band = 'visible';
    if (new URLSearchParams(location.search).has('starbirth')) setTimeout(() => this.start({ tour: new URLSearchParams(location.search).get('starbirth') === 'tour' }), 1500);
  }

  // ------------------------------------------------------------- scene objects
  _build() {
    const mul = QMUL[this.engine.qualityName] || 0.6;
    const prem = { transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor };
    const add = { transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor };
    this.root = new THREE.Group(); this.root.position.copy(this.site); this.root.quaternion.copy(this.tilt); this.root.visible = false;
    this.engine.scene.add(this.root);
    this.cloudRoot = new THREE.Group(); this.cloudRoot.position.copy(this.site); this.cloudRoot.quaternion.copy(this.tilt); this.cloudRoot.visible = false;
    this.engine.volScene.add(this.cloudRoot);
    // --- volumetric cloud (reduced-resolution layer)
    this.cloudMat = new THREE.ShaderMaterial({
      uniforms: {
        uCamToLocal: { value: new THREE.Matrix3() }, uCamLocal: { value: new THREE.Vector3() }, uTime: { value: 0 }, uSeed: { value: 3.7 }, uSteps: { value: 32 },
        uCollapse: { value: 0 }, uCavity: { value: 0 }, uDisperse: { value: 0 }, uStarLum: { value: 0 }, uIon: { value: 0 }, uSci: { value: 0 }, uFade: { value: 1 }, uBand: { value: 0 }, uInner: { value: 0.01 }, uExt: { value: 0.9 },
        uStarColor: { value: new THREE.Color(1, 0.8, 0.6) }, uExtDir: { value: new THREE.Vector3(0, 0, 1) }, uSib: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
      },
      vertexShader: SH.cloudVert, fragmentShader: SH.cloudFrag, ...prem, depthTest: false, side: THREE.BackSide,
    });
    // drawn after the star layers (renderOrder 10–12): alpha = extinction, colour = emission (premultiplied), so the dark cloud
    // silhouettes the stars behind it while its own glow stays intact
    this.cloud = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 3), this.cloudMat); this.cloud.renderOrder = 39; this.cloud.frustumCulled = false;
    this.cloudRoot.add(this.cloud);
    // --- groups at each scale
    this.gDust = new THREE.Group(); this.gDisk = new THREE.Group(); this.gJet = new THREE.Group(); this.gStar = new THREE.Group(); this.gFx = new THREE.Group();
    for (const g of [this.gDust, this.gDisk, this.gJet, this.gStar, this.gFx]) this.root.add(g);
    // --- cloud dust particles
    const nDust = Math.round(30000 * mul);
    {
      const pos = new Float32Array(nDust * 3), seed = new Float32Array(nDust * 3);
      for (let i = 0; i < nDust; i++) {
        const r = 0.06 + 0.94 * Math.pow(Math.random(), 0.5);
        const z = Math.random() * 2 - 1, ph = Math.random() * Math.PI * 2, s = Math.sqrt(1 - z * z);
        // mild clumping: pull a fraction of points toward a few filaments
        let x = s * Math.cos(ph), y = z, zz = s * Math.sin(ph);
        pos[i * 3] = x * r; pos[i * 3 + 1] = y * r * 0.85; pos[i * 3 + 2] = zz * r;
        seed[i * 3] = Math.random(); seed[i * 3 + 1] = Math.random(); seed[i * 3 + 2] = Math.random();
      }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
      geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 2);
      this.dustMat = new THREE.ShaderMaterial({ uniforms: { uCollapse: { value: 0 }, uRot: { value: 0 }, uTime: { value: 0 }, uPxPerUnit: { value: 800 }, uWorldScale: { value: 1 }, uPointSize: { value: 0.007 }, uStarLum: { value: 0 }, uSci: { value: 0 }, uDisperse: { value: 0 }, uFade: { value: 1 }, uDiskR: { value: 0.009 }, uStarColor: { value: new THREE.Color(1, 0.8, 0.6) } }, vertexShader: SH.dustVert, fragmentShader: SH.ptsFrag, ...add });
      this.dust = new THREE.Points(geo, this.dustMat); this.dust.renderOrder = 61; this.dust.frustumCulled = false; this.gDust.add(this.dust);
    }
    // --- sibling protostars (sprites in the dust group)
    this.sibTex = radialTexture('rgba(255,245,225,1)', 'rgba(255,200,150,0.5)', 0.18);
    this.sibs = SIBLINGS.map(p => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.sibTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 })); s.position.copy(p); s.scale.setScalar(0.035); s.renderOrder = 70; this.gDust.add(s); return s; });
    // --- disc: surface + particles
    this.diskMat = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uRot: { value: 0 }, uDisk: { value: 0 }, uGap: { value: 0 }, uClump: { value: 0 }, uStarLum: { value: 0 }, uSci: { value: 0 }, uInnerR: { value: 0.01 }, uFade: { value: 1 }, uStarColor: { value: new THREE.Color(1, 0.8, 0.6) } }, vertexShader: SH.diskVert, fragmentShader: SH.diskFrag, ...prem, side: THREE.DoubleSide });
    this.disk = new THREE.Mesh(new THREE.RingGeometry(0.004, 1, 160, 24), this.diskMat); this.disk.rotation.x = Math.PI / 2; this.disk.renderOrder = 60; this.disk.frustumCulled = false; this.gDisk.add(this.disk);
    const nDisk = Math.round(24000 * mul);
    {
      const pos = new Float32Array(nDisk * 3), seed = new Float32Array(nDisk * 3);
      for (let i = 0; i < nDisk; i++) {
        const r = Math.max(0.012, Math.pow(Math.random(), 0.75));
        const g = Math.sqrt(-2 * Math.log(Math.max(Math.random(), 1e-6))) * Math.cos(2 * Math.PI * Math.random());
        pos[i * 3] = r; pos[i * 3 + 1] = Math.random() * Math.PI * 2; pos[i * 3 + 2] = clamp(g, -2.5, 2.5);
        seed[i * 3] = Math.random(); seed[i * 3 + 1] = Math.random(); seed[i * 3 + 2] = Math.random();
      }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
      geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 2);
      this.diskPtsMat = new THREE.ShaderMaterial({ uniforms: { uRot: { value: 0 }, uDisk: { value: 0 }, uGap: { value: 0 }, uClump: { value: 0 }, uPxPerUnit: { value: 800 }, uWorldScale: { value: 1 }, uPointSize: { value: 0.006 }, uStarLum: { value: 0 }, uSci: { value: 0 }, uFade: { value: 1 }, uStarColor: { value: new THREE.Color(1, 0.8, 0.6) } }, vertexShader: SH.diskPtsVert, fragmentShader: SH.ptsFrag, ...add });
      this.diskPts = new THREE.Points(geo, this.diskPtsMat); this.diskPts.renderOrder = 62; this.diskPts.frustumCulled = false; this.gDisk.add(this.diskPts);
    }
    // ignition shock ring (in the disc plane)
    this.ringMat = new THREE.ShaderMaterial({ uniforms: { uA: { value: 0 }, uW: { value: 0.1 }, uColor: { value: new THREE.Color(1, 0.9, 0.7) } }, vertexShader: SH.ringVert, fragmentShader: SH.ringFrag, ...add, side: THREE.DoubleSide });
    this.ring = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.ringMat); this.ring.rotation.x = Math.PI / 2; this.ring.renderOrder = 63; this.ring.visible = false; this.ring.frustumCulled = false; this.gDisk.add(this.ring);
    // --- jets: two beams, bow-shock sprites and particles
    const jetGeo = new THREE.CylinderGeometry(0.075, 0.008, 1, 48, 24, true); jetGeo.translate(0, 0.5, 0);
    this.jetMat = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uJet: { value: 0 }, uStrength: { value: 0 }, uSci: { value: 0 }, uSpeed: { value: 0.5 } }, vertexShader: SH.jetVert, fragmentShader: SH.jetFrag, ...add, side: THREE.DoubleSide });
    this.jetN = new THREE.Mesh(jetGeo, this.jetMat); this.jetS = new THREE.Mesh(jetGeo, this.jetMat); this.jetS.scale.y = -1;
    for (const j of [this.jetN, this.jetS]) { j.renderOrder = 64; j.frustumCulled = false; this.gJet.add(j); }
    this.hhTex = radialTexture('rgba(255,235,210,1)', 'rgba(255,150,90,0.6)', 0.25);
    this.hh = [1, -1].map(sg => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.hhTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0, color: new THREE.Color(1, 0.75, 0.55) })); s.userData.sign = sg; s.scale.set(0.16, 0.11, 1); s.renderOrder = 71; this.gJet.add(s); return s; });
    const nJet = Math.round(9000 * mul);
    {
      const seed = new Float32Array(nJet * 4), pos = new Float32Array(nJet * 3);
      for (let i = 0; i < nJet; i++) { seed[i * 4] = Math.random(); seed[i * 4 + 1] = Math.random(); seed[i * 4 + 2] = Math.random(); seed[i * 4 + 3] = i % 2 ? 1 : -1; }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
      geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 2);
      this.jetPtsMat = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uJet: { value: 0 }, uSpeed: { value: 0.5 }, uStrength: { value: 0 }, uPxPerUnit: { value: 800 }, uWorldScale: { value: 1 }, uPointSize: { value: 0.012 }, uFade: { value: 1 } }, vertexShader: SH.jetPtsVert, fragmentShader: SH.ptsFrag, ...add });
      this.jetPts = new THREE.Points(geo, this.jetPtsMat); this.jetPts.renderOrder = 65; this.jetPts.frustumCulled = false; this.gJet.add(this.jetPts);
    }
    // --- the star (photosphere, chromosphere, corona) + glow sprites
    this.star = new StarBody({ radius: 1, temp: 3600, intensity: 2.6 });
    this.gStar.add(this.star.group);
    this.glowTex = radialTexture();
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 })); this.glow.renderOrder = 72; this.gFx.add(this.glow);
    this.glowCore = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 })); this.glowCore.renderOrder = 73; this.gFx.add(this.glowCore);
    // --- science overlays: infall arrows (cloud) and gravity/pressure arrows (star)
    this.arrows = this._makeArrows(Math.round(260 * Math.max(mul, 0.5)), 'infall'); this.gDust.add(this.arrows);
    this.balance = new THREE.Group(); this.gStar.add(this.balance);
    this.gravArrows = this._makeArrows(14, 'in'); this.pressArrows = this._makeArrows(14, 'out');
    this.balance.add(this.gravArrows); this.balance.add(this.pressArrows);
    this.balance.visible = false; this.arrows.visible = false;
    this._abBase = this.engine.finalPass.uniforms.uAberration ? this.engine.finalPass.uniforms.uAberration.value : 0;
  }

  _makeArrows(n, kind) {
    const base = [], dir = [], perp = [], k = [], len = [];
    const push = (b, d, p, L, kx, ky) => { base.push(b.x, b.y, b.z); dir.push(d.x, d.y, d.z); perp.push(p.x, p.y, p.z); len.push(L); k.push(kx, ky); };
    for (let i = 0; i < n; i++) {
      let b, d, L;
      if (kind === 'infall') {
        const r = 0.14 + 0.8 * Math.pow(Math.random(), 0.7);
        const z = Math.random() * 2 - 1, ph = Math.random() * Math.PI * 2, s = Math.sqrt(1 - z * z);
        const u = new THREE.Vector3(s * Math.cos(ph), z * 0.85, s * Math.sin(ph)).normalize();
        b = u.clone().multiplyScalar(r); d = u.clone().negate(); L = clamp(0.012 / (r * r), 0.05, 0.2);
      } else {
        const a = (i / n) * Math.PI * 2;
        const u = new THREE.Vector3(Math.cos(a), Math.sin(a), 0);
        if (kind === 'in') { b = u.clone().multiplyScalar(2.2); d = u.clone().negate(); } else { b = u.clone().multiplyScalar(1.12); d = u.clone(); }
        L = 0.6;
      }
      const p = new THREE.Vector3().crossVectors(d, Math.abs(d.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize();
      if (kind !== 'infall') p.set(0, 0, 1).cross(d).normalize();
      push(b, d, p, L, 0, 0); push(b, d, p, L, 1, 0);
      push(b, d, p, L, 1, 0); push(b, d, p, L, 0.72, 1);
      push(b, d, p, L, 1, 0); push(b, d, p, L, 0.72, -1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(base, 3)); geo.setAttribute('aDir', new THREE.Float32BufferAttribute(dir, 3)); geo.setAttribute('aPerp', new THREE.Float32BufferAttribute(perp, 3)); geo.setAttribute('aK', new THREE.Float32BufferAttribute(k, 2)); geo.setAttribute('aLen', new THREE.Float32BufferAttribute(len, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 4);
    const color = kind === 'in' ? new THREE.Color(1.0, 0.45, 0.3) : kind === 'out' ? new THREE.Color(0.45, 0.75, 1.0) : new THREE.Color(0.55, 0.85, 1.0);
    const mat = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uAlpha: { value: 0 }, uLen: { value: 1 }, uColor: { value: color } }, vertexShader: SH.arrowVert, fragmentShader: SH.arrowFrag, transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor });
    const ls = new THREE.LineSegments(geo, mat); ls.renderOrder = 80; ls.frustumCulled = false;
    return ls;
  }

  // ------------------------------------------------------------- registry
  _registry() {
    const self = this;
    const es = (key, field) => STRUCTS[key][field].es;
    this.obj = this.registry.add({
      id: 'starbirth', name: 'Birth of a Star (simulation)', kind: 'starbirth', aliases: ['star formation', 'star birth', 'protostar', 'stellar nursery', 'formación estelar', 'nacimiento de una estrella', 'protoestrella', 'vivero estelar'],
      color: '#ffc48a', priority: 6, provenance: 'simulated', axis: this.axis, approachElevation: 0.3, labelRange: [0, 1e30],
      get radius() { return self.P ? Math.max(self.P.R, 1) : 1; },
      getPosition(out) { return out.copy(self.site); },
      labelAlpha: d => clamp((d - self.Sd * 3) / (self.Sd * 6), 0, 1),
      subtitle: 'Interactive simulation · Orion complex, 1,350 light-years away',
      description: 'Watch a star being born: a cold molecular cloud collapses under its own gravity into a protostar, grows a planet-forming disc, launches bipolar jets and finally ignites hydrogen fusion. Pause, accelerate, rewind, switch to a scientific view or follow the guided sequence.',
      i18n: { es: { name: 'Nacimiento de una estrella (simulación)', subtitle: 'Simulación interactiva · complejo de Orión, a 1.350 años luz', description: 'Asiste al nacimiento de una estrella: una nube molecular fría colapsa por su propia gravedad hasta formar una protoestrella, desarrolla un disco donde nacen planetas, lanza chorros bipolares y finalmente enciende la fusión del hidrógeno. Pausa, acelera, retrocede, activa la vista científica o sigue la secuencia guiada.' } },
      data: {}, action: () => bus.emit('starbirth:start', {}), actionLabel: () => t('sbStart'),
    });
    const vis = { core: () => self.P && self.u < 2.05, star: () => self.P && self.P.starOn > 0.05, disk: () => self.P && self.P.diskF > 0.04, jet: () => self.P && self.P.jetF > 0.04, sib: () => self.P && self.P.sib > 0.05 };
    // getters must survive: copy property descriptors instead of values
    const defs = (o, src) => { Object.defineProperties(o, Object.getOwnPropertyDescriptors(src)); return o; };
    const mk = (id, key, extra) => {
      const o = { id, kind: 'structure', color: '#ffd9a8', priority: 3, provenance: 'simulated', parent: this.obj, labelRange: [0, 1e30], searchable: false, i18n: { es: {} } };
      defs(o, { get name() { return STRUCTS[key].name.en; }, get description() { return STRUCTS[key].desc.en; } });
      defs(o.i18n.es, { get name() { return es(key, 'name'); }, get description() { return es(key, 'desc'); } });
      const ex = Object.getOwnPropertyDescriptors(extra);
      if (ex.i18n) { defs(o.i18n.es, extra.i18n.es); delete ex.i18n; }
      Object.defineProperties(o, ex);
      return o;
    };
    this.subs = [];
    this.subs.push(mk('sb-core', 'core', { getPosition(out) { return out.copy(self.site); }, get radius() { return self.Sc * 0.3; }, labelVisible: () => vis.core(), get pickable() { return vis.core(); }, labelAlpha: d => clamp((d - self.Sc * 0.3) / (self.Sc * 0.4), 0, 1) }));
    this.subs.push(this.starObj = mk('sb-star', 'star', {
      kind: 'star', procedural: true, color: '#fff1dc',
      get name() { return self.u >= 5.85 ? STRUCTS.starMS.name.en : STRUCTS.star.name.en; }, get description() { return self.u >= 5.85 ? STRUCTS.starMS.desc.en : STRUCTS.star.desc.en; },
      i18n: { es: { get name() { return self.u >= 5.85 ? STRUCTS.starMS.name.es : STRUCTS.star.name.es; }, get description() { return self.u >= 5.85 ? STRUCTS.starMS.desc.es : STRUCTS.star.desc.es; }, data: {} } },
      getPosition(out) { return out.copy(self.site); }, get radius() { return self.P ? Math.max(self.P.R, 1) : 1; },
      get lum() { return self.P && self.u >= 6 && self.m.lumSun > 20000 ? self.m.lumSun : undefined; }, get temp() { return self.P ? self.P.T : 3000; },
      labelVisible: d => vis.star() && d < self.Sd * 12, get pickable() { return vis.star(); }, data: {},
    }));
    this.subs.push(mk('sb-disk', 'disk', { getPosition(out) { return out.copy(self.site); }, get radius() { return self.Sd; }, get orbitMin() { return self.Sd * 0.04; }, labelVisible: d => vis.disk() && d > self.Sd * 0.6 && d < self.Sd * 60, get pickable() { return vis.disk(); }, labelOffset: 1 }));
    for (const sg of [1, -1]) this.subs.push(mk(sg > 0 ? 'sb-jet-n' : 'sb-jet-s', sg > 0 ? 'jetN' : 'jetS', { getPosition(out) { return out.copy(self.site).addScaledVector(self.axis, sg * 0.55 * self.Sj * (self.P ? self.P.jetF : 0)); }, get radius() { return self.Sj * 0.08; }, get orbitMin() { return self.Sj * 0.03; }, labelVisible: d => vis.jet() && d < self.Sc * 40, get pickable() { return vis.jet(); } }));
    SIBLINGS.forEach((p, i) => this.subs.push(mk('sb-sib-' + (i + 1), 'sib', { getPosition(out) { return out.copy(p).applyQuaternion(self.tilt).multiplyScalar(self.Sc).add(self.site); }, get radius() { return self.Sc * 0.02; }, labelVisible: d => vis.sib() && d < self.Sc * 12, get pickable() { return vis.sib(); } })));
  }

  // ------------------------------------------------------------- configuration
  setMass(key) {
    const m = MASSES[key]; if (!m) return;
    this.m = m; this.massKey = key;
    this.Sc = m.cloudPc * PC; this.Sd = m.diskAU * AU; this.Sj = 0.55 * this.Sc;
    this.cloud.scale.setScalar(this.Sc); this.gDust.scale.setScalar(this.Sc);
    this.cloudMat.uniforms.uExtDir.value.copy(this._orionDir); this.gDisk.scale.setScalar(this.Sd); this.gJet.scale.setScalar(this.Sj);
    this.dustMat.uniforms.uWorldScale.value = this.Sc; this.diskPtsMat.uniforms.uWorldScale.value = this.Sd; this.jetPtsMat.uniforms.uWorldScale.value = this.Sj;
    this.diskMat.uniforms.uInnerR.value = Math.max(0.0015, (m.radiusSun * RSUN * 3) / this.Sd);
    this.cloudMat.uniforms.uSeed.value = key === 'low' ? 5.3 : key === 'massive' ? 9.1 : 3.7;
    this.dustMat.uniforms.uDiskR.value = this.Sd / this.Sc;
    // smooth physical tracks (radius, temperature, luminosity, core state) — C1-continuous across every stage boundary
    const Rp = m.protoRadiusSun, Rms = m.radiusSun;
    this.curves = {
      R: logCurve([[1.45, 0.04 * Rp], [1.9, 0.55 * Rp], [2.4, Rp], [3.2, 0.92 * Rp], [4.6, lerp(Rp, Rms * 1.5, 0.6)], [5.85, Rms * 1.45], [6.4, Rms], [7.1, Rms]]),
      T: logCurve([[1.45, m.protoTemp * 0.7], [2.4, m.protoTemp * 0.95], [5.4, m.protoTemp * 1.1], [5.85, lerp(m.protoTemp * 1.1, m.tempMS, 0.35)], [6.35, m.tempMS], [7.1, m.tempMS]]),
      L: logCurve([[1.45, m.protoLum * 0.08], [2.4, m.protoLum], [3.2, m.protoLum * 0.9], [5.5, m.protoLum * 0.45], [5.85, lerp(m.protoLum * 0.45, m.lumSun, 0.5)], [6.3, m.lumSun], [7.1, m.lumSun]]),
      coreT: logCurve([[0, 10], [1, 12], [1.8, 2000], [2.2, 1e5], [2.6, 1e6], [5.85, 1e7], [6.4, m.coreTempMS], [7.1, m.coreTempMS]]),
      coreDens: logCurve([[0, 3e-20], [1, 3e-19], [1.8, 1e-13], [2.2, 1e-3], [3, 1e-2], [5.85, 20], [6.4, m.coreDens], [7.1, m.coreDens]]),
    };
    // guided-tour camera path: monotone splines through the keyframes (log distance, elevation) → no stop-and-go
    const scaleOf = (k, u) => k === 'cloud' ? this.Sc : k === 'disk' ? this.Sd : k === 'jet' ? this.Sj : Math.max(this.curves.R(u) * RSUN, 1);
    this.tourD = monoCubic(TOUR.map(k => [k.u, Math.log(scaleOf(k.dist[0], k.u) * k.dist[1])]));
    this.tourPhi = monoCubic(TOUR.map(k => [k.u, k.phi]));
    this._params();
    bus.emit('starbirth:mass', key);
  }
  setSpeed(s) { if (s <= 0) { this.paused = true; } else { this.speed = s; this.paused = false; } bus.emit('starbirth:speed', this.paused ? 0 : this.speed); }
  togglePause() { this.paused = !this.paused; bus.emit('starbirth:speed', this.paused ? 0 : this.speed); }
  stepSpeed(dir) { const S = [1, 10, 100, 1000]; let i = S.indexOf(this.speed); i = clamp(i + dir, 0, S.length - 1); this.setSpeed(S[i]); }
  setMode(mode) { this.mode = mode; bus.emit('starbirth:mode', mode); }
  setLayer(n) { this.layer = n | 0; }
  get phase() { return Math.min(Math.floor(this.u), 6); }
  seek(u) {
    this.u = clamp(u, 0, 6.999);
    this._ignited = this.u >= 5.85; this._flash = 0; this._shake = 0; this._ringT = 99; this.ring.visible = false;
    this._eventIdx = -1; for (let i = 0; i < EVENTS.length; i++) if (EVENTS[i].u <= this.u) this._eventIdx = i;
    this._phase = this.phase; this._capPhase = -1;
    this._params();
    bus.emit('starbirth:seek', this.u);
  }
  seekPhase(p) { this.seek(clamp(p, 0, 6) + 0.001); }

  // ------------------------------------------------------------- lifecycle
  start(opts = {}) {
    const wantTour = !!opts.tour;
    if (opts.mass) this.setMass(opts.mass);
    if (!this.active) {
      this.active = true;
      for (const s of this.subs) this.registry.add(s);
      bus.emit('starbirth:begin');
    }
    if (this.tour) this.stopTour(false);
    this.seek(0); this.paused = true; this.speed = 1; this.simT = 0;
    bus.emit('select:request', null);
    const d = this.cameraCtl.position.distanceTo(this.site);
    const go = () => {
      if (!this.active) return;
      if (wantTour) this.startTour(); else this.cameraCtl.setMode(CAM_MODE.ORBIT, this.obj);
      this.paused = false; bus.emit('starbirth:speed', this.speed); bus.emit('starbirth:ready');
    };
    if (!wantTour && d > 1.2 * this.Sc && d < 6 * this.Sc) { go(); return; }
    this.cameraCtl.travelTo(this.obj, { absDistance: 3.4 * this.Sc, duration: d > 40 * this.Sc ? 8 : 4, mode: CAM_MODE.ORBIT, onArrive: go });
  }
  stop() {
    if (!this.active) return;
    if (this.tour) this.stopTour(false);
    this.active = false; this.paused = true;
    for (const s of this.subs) this.registry.remove(s.id);
    if (this.cameraCtl.target && this.cameraCtl.target.id && this.cameraCtl.target.id.startsWith('sb-')) this.cameraCtl.setMode(CAM_MODE.ORBIT, this.obj);
    this.engine.bloomBoost = 0; if (this.engine.finalPass.uniforms.uAberration) this.engine.finalPass.uniforms.uAberration.value = this._abBase;
    bus.emit('select:request', null);
    bus.emit('starbirth:end');
  }
  /** Bring the camera back to the simulation (top-bar button while active). */
  focus() {
    if (!this.active) { this.start({}); return; }
    const d = this.cameraCtl.position.distanceTo(this.site);
    if (d > 8 * this.Sc || d < 1) this.cameraCtl.travelTo(this.obj, { absDistance: 2.5 * this.Sc, duration: 5, mode: CAM_MODE.ORBIT });
  }
  startTour() {
    if (!this.active) { this.start({ tour: true }); return; }
    this.tour = true;
    this.cameraCtl.cancelTravel();
    const off = this._v.copy(this.cameraCtl.position).sub(this.site);
    this._theta = Math.atan2(off.x, off.z) || 0;
    this.cameraCtl.mode = CAM_MODE.CINEMATIC; this.cameraCtl.inputEnabled = false; this.cameraCtl.cinematicFov = 1;
    bus.emit('camera:mode', CAM_MODE.CINEMATIC);
    this.speed = 1; this.paused = false;
    bus.emit('starbirth:tour', true);
  }
  stopTour(done) {
    if (!this.tour) return;
    this.tour = false;
    this.cameraCtl.inputEnabled = true;
    if (this.cameraCtl.mode === CAM_MODE.CINEMATIC) this.cameraCtl.setMode(CAM_MODE.ORBIT, this.obj);
    bus.emit('starbirth:tour', false);
    if (done) bus.emit('starbirth:tourdone');
  }

  // ------------------------------------------------------------- physics of the visuals
  _params() {
    const u = this.u, m = this.m, C = this.curves;
    // processes overlap as they do in nature: the disc starts forming while the envelope still falls, jets switch on as soon as
    // disc + protostar exist, the envelope is eaten by accretion long before the wind blows the rest away, ignition is gradual.
    const collapse = ss(0.9, 2.6, u), starOn = ss(1.45, 2.4, u), diskF = ss(1.9, 3.5, u), clump = ss(3.0, 4.8, u);
    const jetF = ss(2.5, 4.3, u) * (1 - ss(5.8, 6.7, u)), cavity = ss(3.0, 5.6, u), ignite = ss(5.55, 6.15, u);
    const disperse = 0.35 * ss(4.4, 6.9, u) + 0.65 * ss(5.7, 6.9, u), gap = ss(6.0, 6.9, u);
    const sib = ss(2.2, 3.8, u) * (1 - 0.5 * disperse);
    const R = Math.max(C.R(u), 1e-4) * RSUN;
    const T = C.T(u);
    const L = C.L(u) * (1 + 4 * this._flash);
    const illum = clamp(0.32 * Math.log10(1 + L * 4), 0, 3) * starOn + 0.8 * ss(1.05, 1.9, u) * (1 - starOn);
    const coreT = C.coreT(u), coreDens = C.coreDens(u);
    const massAcc = m.mass * ss(1.4, 4.8, u);
    const y = m.years; let age = 0; const p = this.phase, f = u - p;
    for (let i = 0; i < p && i < 6; i++) age += y[i];
    age += p < 6 ? f * y[p] : f * m.lifeYr;
    this.P = { collapse, starOn, diskF, clump, jetF, cavity, ignite, disperse, gap, sib, R, T, L, illum, color: blackbody(T), coreT, coreDens, massAcc, age, flash: this._flash };
  }
  /** Years of simulated time per real second at the current speed. */
  get yearsPerSecond() { const p = this.phase; return (p < 6 ? this.m.years[p] : this.m.lifeYr) / this.phaseSecondsAt(this.u) * (this.paused ? 0 : this.speed); }

  _ignite() {
    this._ignited = true; this._flash = 0.75; this._shake = 0.55; this._ringT = 0; this.ring.visible = true;
    bus.emit('starbirth:ignite');
  }

  // ------------------------------------------------------------- per frame
  update(dt, t, camPos) {
    const cam = this.engine.camera;
    const d = camPos.distanceTo(this.site);
    const show = this.active || d < 60 * this.Sc;
    this.root.visible = show; this.cloudRoot.visible = show;
    if (!show) { this.engine.volActive = false; return; }
    if (this.active && !this.paused) this._advance(dt);
    this._flash = Math.max(0, this._flash - dt * 0.9); this._shake = Math.max(0, this._shake - dt * 0.7);
    if (this._ringT < 99) this._ringT += dt;
    this._params();
    this._apply(dt, t, camPos, cam, d);
    if (this.tour) this._tourCamera(dt);
    if (this.active) { this._captions(); this._data(); }
  }

  /** Visual seconds per unit of u, interpolated between stage mid-points so the pace never jumps at a boundary. */
  phaseSecondsAt(u) {
    const p = Math.min(Math.floor(u), 6), f = u - p;
    if (f < 0.5) { if (p === 0) return PHASE_SECONDS[0]; return lerp(PHASE_SECONDS[p - 1], PHASE_SECONDS[p], 0.5 + f); }
    if (p === 6) return PHASE_SECONDS[6];
    return lerp(PHASE_SECONDS[p], PHASE_SECONDS[p + 1], f - 0.5);
  }
  _advance(dt) {
    this.u = Math.min(this.u + dt * this.speed / this.phaseSecondsAt(this.u), 6.999);
    const k = 0.22 + 0.3 * Math.log10(1 + this.speed);
    this.rot += dt * k; this.jetClock += dt * (0.5 + 0.35 * Math.log10(1 + this.speed)); this.simT += dt;
    if (this.phase !== this._phase) { this._phase = this.phase; bus.emit('starbirth:phase', this._phase); }
    if (this.u >= 5.85 && !this._ignited) this._ignite();
    if (this.tour && this.u >= TOUR_END_U) this.stopTour(true);
  }

  _apply(dt, t, camPos, cam, d) {
    const P = this.P, m = this.m, sci = this.mode === 'sci' ? this.layer : 0;
    const h = window.innerHeight, pr = this.engine.renderer.getPixelRatio();
    const pxPerUnit = h / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2)) * pr;
    const band = { visible: 0, infrared: 1, uv: 2, xray: 3, radio: 4 }[this._band] || 0;
    // --- cloud volume
    const rpx = this.Sc / Math.max(d - this.Sc, 1e-6) * pxPerUnit / pr;
    const inside = d < this.Sc;
    const cloudVis = inside || rpx > 1.2;
    this.cloud.visible = cloudVis;
    if (cloudVis) {
      const cu = this.cloudMat.uniforms;
      this._m3.setFromMatrix4(cam.matrixWorld);
      this._m3b.setFromMatrix4(this._m4.makeRotationFromQuaternion(this.tiltInv));
      cu.uCamToLocal.value.copy(this._m3b).multiply(this._m3);
      cu.uCamLocal.value.copy(camPos).sub(this.site).applyQuaternion(this.tiltInv).multiplyScalar(1 / this.Sc);
      cu.uTime.value = t; cu.uCollapse.value = P.collapse; cu.uCavity.value = P.cavity * m.jet / 1.8 + P.cavity * 0.3; cu.uDisperse.value = P.disperse;
      cu.uStarLum.value = P.illum * (1 + 3 * P.flash); cu.uIon.value = m.ion * ss(5.85, 6.5, this.u); cu.uSci.value = sci; cu.uBand.value = band;
      cu.uStarColor.value.copy(P.color); cu.uInner.value = 0.02 + 0.12 * P.diskF;
      for (let i = 0; i < 3; i++) cu.uSib.value[i].set(SIBLINGS[i].x, SIBLINGS[i].y, SIBLINGS[i].z, P.sib * 0.8);
      // full-resolution march: step budget by quality preset, fewer steps deep inside (the view is a uniform haze there)
      const frac = Math.min(rpx / (h * 0.5), 1);
      const budget = { low: 18, medium: 28, high: 40, ultra: 60 }[this.engine.qualityName] || 28;
      const stepsMax = inside ? Math.round(budget * (0.55 + 0.45 * clamp(d / this.Sc, 0, 1))) : budget;
      cu.uSteps.value = Math.round(lerp(8, stepsMax, Math.sqrt(frac)));
      cu.uFade.value = clamp((rpx - 1.2) / 3, 0, 1);
      cu.uExt.value = 1 - 0.6 * P.disperse;
    }
    this.engine.volActive = cloudVis;
    // --- dust
    const du = this.dustMat.uniforms;
    du.uCollapse.value = P.collapse; du.uRot.value = this.rot; du.uTime.value = t; du.uPxPerUnit.value = pxPerUnit; du.uStarLum.value = P.illum; du.uSci.value = sci; du.uDisperse.value = P.disperse; du.uStarColor.value.copy(P.color);
    du.uFade.value = clamp((rpx - 0.5) / 4, 0, 1) * (inside ? clamp(d / (this.Sc * 0.02), 0.15, 1) : 1);
    this.dust.visible = rpx > 0.5 || inside;
    for (let i = 0; i < 3; i++) { this.sibs[i].material.opacity = P.sib * 0.9; this.sibs[i].visible = P.sib > 0.01; }
    // --- disc
    const dd = this.diskMat.uniforms, dp = this.diskPtsMat.uniforms;
    const rpxD = this.Sd / Math.max(d - this.Sd, 1e-6) * pxPerUnit / pr;
    const diskVis = P.diskF > 0.01 && (rpxD > 1.5 || d < this.Sd * 2);
    this.disk.visible = diskVis; this.diskPts.visible = diskVis;
    if (diskVis) {
      dd.uTime.value = t; dd.uRot.value = this.rot; dd.uDisk.value = P.diskF; dd.uGap.value = P.gap; dd.uClump.value = P.clump; dd.uStarLum.value = P.illum * (1 + 2 * P.flash); dd.uSci.value = sci; dd.uStarColor.value.copy(P.color);
      dd.uFade.value = clamp((rpxD - 1.5) / 6, 0, 1);
      dp.uRot.value = this.rot; dp.uDisk.value = P.diskF; dp.uGap.value = P.gap; dp.uClump.value = P.clump; dp.uPxPerUnit.value = pxPerUnit; dp.uStarLum.value = P.illum; dp.uSci.value = sci; dp.uStarColor.value.copy(P.color); dp.uFade.value = dd.uFade.value;
    }
    // ignition ring
    if (this._ringT < 6) { const s = 0.02 + 1.6 * Math.pow(this._ringT / 4, 0.7); this.ring.scale.setScalar(s); this.ringMat.uniforms.uA.value = 1.4 * Math.max(0, 1 - this._ringT / 4); this.ringMat.uniforms.uW.value = 0.08 + 0.06 * this._ringT; this.ring.visible = true; } else this.ring.visible = false;
    // --- jets
    const jetOn = P.jetF > 0.01;
    this.jetN.visible = this.jetS.visible = this.jetPts.visible = jetOn;
    if (jetOn) {
      const ju = this.jetMat.uniforms, jp = this.jetPtsMat.uniforms;
      const strength = Math.pow(P.jetF, 1.5) * (0.7 + 0.5 * m.jet) * (1 + 0.15 * Math.sin(this.jetClock * 2.3)) * (1 + 1.5 * P.flash);
      ju.uTime.value = this.jetClock; ju.uJet.value = P.jetF; ju.uStrength.value = strength; ju.uSci.value = sci; ju.uSpeed.value = 0.55;
      jp.uTime.value = this.jetClock; jp.uJet.value = P.jetF; jp.uStrength.value = strength; jp.uPxPerUnit.value = pxPerUnit; jp.uSpeed.value = 0.55; jp.uFade.value = 1;
      for (const s of this.hh) { s.position.set(0, s.userData.sign * P.jetF * 0.98, 0); s.material.opacity = 0.9 * P.jetF * ss(0.55, 0.9, P.jetF) * (0.8 + 0.2 * Math.sin(this.jetClock * 3 + s.userData.sign)); s.visible = s.material.opacity > 0.01; }
    } else for (const s of this.hh) s.visible = false;
    // --- star
    const starOn = P.starOn > 0.01;
    this.gStar.visible = starOn; this.gStar.scale.setScalar(Math.max(P.R, 1e-3));
    if (starOn) {
      const pulse = 1 + 0.035 * Math.sin(this.rot * 4.1) * (1 - P.ignite);
      this.star.surface.scale.setScalar(pulse); this.star.chromo.scale.setScalar(pulse);
      this.star.surfMat.uniforms.uTemp.value = P.T; this.star.surfMat.uniforms.uIntensity.value = 2.2 + 1.6 * P.ignite + 6 * P.flash;
      this.star.chromoMat.uniforms.uIntensity.value = 0.9 + 0.6 * (1 - P.ignite);
      const rpxS = P.R / Math.max(d - P.R, 1e-6) * pxPerUnit / pr;
      this.star.update(t, cam, rpxS);
      this.star.coronaMat.uniforms.uIntensity.value *= 0.6 + 0.8 * P.ignite;
    }
    // glow: extinction through the envelope, distance-scaled so it always reads as a bright point
    const ext = this._extinction(camPos, band === 1);
    const glowK = clamp(0.85 + 0.3 * Math.log10(P.L + 0.01), 0.15, 2.0) * P.starOn * ext;
    const gsz = Math.max(d * 0.06 * glowK * (1 + 3 * P.flash), P.R * 5);
    this.glow.scale.setScalar(gsz); this.glow.material.opacity = clamp(glowK * 0.85 + P.flash, 0, 1); this.glow.material.color.copy(P.color).lerp(new THREE.Color(1, 1, 1), 0.3 + 0.5 * P.flash);
    this.glowCore.scale.setScalar(Math.max(d * 0.012 * (0.6 + glowK), P.R * 2.5)); this.glowCore.material.opacity = clamp(glowK * 1.2, 0, 1); this.glowCore.material.color.copy(P.color).lerp(new THREE.Color(1, 1, 1), 0.6);
    this.glow.visible = this.glowCore.visible = starOn;
    // --- science overlays
    const sciMode = this.mode === 'sci';
    const arrowsA = sciMode ? ss(0.75, 1.3, this.u) * (1 - ss(2.5, 3.2, this.u)) : 0;
    this.arrows.visible = arrowsA > 0.01; this.arrows.material.uniforms.uAlpha.value = arrowsA * 0.9; this.arrows.material.uniforms.uTime.value = t; this.arrows.material.uniforms.uLen.value = 0.6 + 0.8 * P.collapse;
    const balA = sciMode && starOn ? ss(5.5, 5.9, this.u) : 0;
    this.balance.visible = balA > 0.01;
    if (this.balance.visible) {
      this.balance.quaternion.copy(this.root.quaternion).invert().multiply(cam.quaternion);
      this.gravArrows.material.uniforms.uAlpha.value = balA; this.gravArrows.material.uniforms.uTime.value = t; this.gravArrows.material.uniforms.uLen.value = 1;
      this.pressArrows.material.uniforms.uAlpha.value = balA; this.pressArrows.material.uniforms.uTime.value = t; this.pressArrows.material.uniforms.uLen.value = lerp(0.45, 1, ss(5.75, 6.25, this.u));
    }
    // --- post effects: ignition flash + shake
    this.engine.bloomBoost = this._flash * 1.4;
    if (this.engine.finalPass.uniforms.uAberration) this.engine.finalPass.uniforms.uAberration.value = this._abBase + this._flash * 0.6;
    if (this._shake > 0.01) { const a = this._shake * this._shake * d * 0.006; cam.position.copy(this.cameraCtl.position).add(this._v.set((Math.random() - 0.5) * a, (Math.random() - 0.5) * a, (Math.random() - 0.5) * a)); cam.updateMatrixWorld(true); }
  }

  /** Optical depth of the envelope between the camera and the star (analytic, ~24 samples). */
  _extinction(camPos, infrared) {
    const P = this.P;
    const lc = this._v2.copy(camPos).sub(this.site).applyQuaternion(this.tiltInv).multiplyScalar(1 / this.Sc);
    let r0 = lc.length(); if (r0 < 1e-5) return 1;
    const dir = this._v3.copy(lc).multiplyScalar(-1 / r0);
    const start = Math.min(r0, 1);
    const cosA = Math.abs(lc.y / r0);
    const inCavity = cosA > (0.75 - 0.1 * P.cavity) ? P.cavity : 0;
    const c = P.collapse, sig = lerp(0.3, 0.1, c), inner = 0.02 + 0.12 * P.diskF;
    let tau = 0; const N = 24, ds = (start - 0.002) / N;
    for (let i = 0; i < N; i++) {
      const r = start - ds * (i + 0.5);
      const env = 1 - ss(0.5, 1.0, r);
      let dens = 0.35 * env * (1 - 0.55 * c * ss(0.25, 0.9, r)) + Math.exp(-r * r / (sig * sig)) * lerp(0.35, 2.2, c) + c * 1.6 * Math.pow(Math.max(1 - r / 0.55, 0), 2);
      dens *= (1 - 0.92 * inCavity) * (1 - 0.55 * P.disperse) * lerp(1, ss(0, 0.02 + 0.45 * P.disperse, r), P.disperse) * ss(inner * 0.6, inner * 1.6, r);
      tau += dens * ds;
    }
    const K = (infrared ? 0.25 : 2.2) * (1 - 0.9 * P.disperse);
    return Math.exp(-tau * K);
  }

  _tourCamera(dt) {
    const u = this.u;
    const dist = Math.max(Math.exp(this.tourD(u)), this.P.R * 3);
    const phi = this.tourPhi(u);
    this._theta += dt * 0.055 * (1 + 0.4 * Math.sin(u * 1.7));
    const dir = this._v.set(Math.cos(phi) * Math.sin(this._theta), Math.sin(phi), Math.cos(phi) * Math.cos(this._theta));
    const cc = this.cameraCtl;
    cc.position.copy(this.site).addScaledVector(dir, dist);
    cc.quaternion.setFromRotationMatrix(this._m4.lookAt(cc.position, this.site, cc.up));
  }

  _captions() {
    if (!(this.tour || this.mode === 'explain')) return;
    const lang = i18n.lang;
    if (this._capPhase !== this.phase) {
      this._capPhase = this.phase;
      const ph = PHASES[this.phase];
      bus.emit('starbirth:caption', { title: ph.title[lang], sub: ph.name[lang], ms: 6500 });
      this._capT = 0;
    }
    let next = this._eventIdx + 1;
    if (next < EVENTS.length && EVENTS[next].u <= this.u) {
      this._eventIdx = next;
      const ev = EVENTS[next]; const c = ev[lang] || ev.en;
      bus.emit('starbirth:caption', { title: c[1], sub: c[0], ms: 7500 });
    }
  }

  _data() {
    const P = this.P, lang = i18n.lang, es = lang === 'es';
    const kK = v => `${Math.round(v).toLocaleString('en-US')} K`;
    const dens = P.coreDens >= 1 ? `${P.coreDens.toPrecision(2)} g/cm³` : P.coreDens.toExponential(1) + ' g/cm³';
    const en = { phase: PHASES[this.phase].name.en, age: fmtYears(P.age, 'en'), surfaceTemp: kK(P.T), coreTemp: P.coreT < 1e4 ? kK(P.coreT) : `${(P.coreT / 1e6).toPrecision(2)} million K`, coreDensity: dens, radius: `${(P.R / RSUN).toPrecision(2)} R☉ (${Math.round(P.R * 1000).toLocaleString('en-US')} km)`, luminosity: `${P.L < 0.01 ? P.L.toExponential(1) : P.L.toPrecision(2)} L☉`, massAccreted: `${P.massAcc.toPrecision(2)} M☉` };
    const esD = { phase: PHASES[this.phase].name.es, age: fmtYears(P.age, 'es'), surfaceTemp: en.surfaceTemp, coreTemp: P.coreT < 1e4 ? kK(P.coreT) : `${(P.coreT / 1e6).toPrecision(2)} millones K`, coreDensity: dens, radius: en.radius, luminosity: en.luminosity, massAccreted: en.massAccreted };
    this.starObj.data = en; this.starObj.i18n.es.data = esD;
    this.obj.data = { phase: en.phase, age: en.age, starMass: `${this.m.mass} M☉ (${this.m.name.en})`, coreSize: `${this.m.cloudPc} pc ≈ ${(this.m.cloudPc * 3.26).toPrecision(2)} light-years`, discRadius: `${this.m.diskAU} AU` };
    this.obj.i18n.es.data = { phase: esD.phase, age: esD.age, starMass: `${this.m.mass} M☉ (${this.m.name.es})`, coreSize: `${this.m.cloudPc} pc ≈ ${(this.m.cloudPc * 3.26).toPrecision(2)} años luz`, discRadius: `${this.m.diskAU} UA` };
  }
}
