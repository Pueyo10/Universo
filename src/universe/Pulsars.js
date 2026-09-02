import * as THREE from 'three';
import { LY, KM } from '../core/Units.js';
import { LOGDEPTH_PARS_VERT, LOGDEPTH_VERT, LOGDEPTH_PARS_FRAG, LOGDEPTH_FRAG, HASH } from '../shaders/chunks.js';
import { bus } from '../core/EventBus.js';

// Pulsars and magnetars: a tiny hot neutron star, two opposed radiation beams
// sweeping around a tilted magnetic axis, and a pulse flash when a beam crosses
// the camera (radio "pulse" — also sonified by the audio system). Spin rates are
// the real ones (30 Hz for the Crab) but the beams are drawn at a visible pace
// unless time is slowed; the true frequency is shown in the data.
const beamVert = /* glsl */`
  varying vec3 vPos; varying vec2 vUv;
  ${LOGDEPTH_PARS_VERT}
  void main() {
    vPos = position; vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    ${LOGDEPTH_VERT}
  }
`;
const beamFrag = /* glsl */`
  precision highp float;
  varying vec3 vPos; varying vec2 vUv;
  uniform float uTime, uIntensity; uniform vec3 uColor;
  ${HASH}
  ${LOGDEPTH_PARS_FRAG}
  void main() {
    ${LOGDEPTH_FRAG}
    // cone: y along the axis in [0,1]; fade with distance and toward the edge
    float along = vUv.y;
    float edge = 1.0 - smoothstep(0.55, 1.0, abs(vUv.x * 2.0 - 1.0));
    float flicker = 0.85 + 0.15 * hash12(vec2(floor(uTime * 60.0), along * 10.0));
    float a = (1.0 - along) * (1.0 - along) * edge * uIntensity * flicker;
    gl_FragColor = vec4(uColor * a, a);
  }
`;

const MAGNETARS = [
  ['SGR 1806−20', 272.164, -20.411, 42000, 'The most magnetic object known: 10¹⁵ gauss. Its 2004 flare briefly outshone the full Moon in gamma rays from 42,000 light-years away.'],
  ['1E 1048.1−5937', 162.53, -59.89, 9000, 'An anomalous X-ray pulsar: a magnetar spinning once every 6.4 s, powered by the decay of its magnetic field.'],
];

export class Pulsars {
  constructor(ctx) {
    this.ctx = ctx; this.engine = ctx.engine; this.registry = ctx.registry;
    this.group = new THREE.Group(); this.engine.scene.add(this.group);
    this.items = [];
    this._v = new THREE.Vector3(); this._q = new THREE.Quaternion();
    // magnetars as registry objects
    const { radecToVector } = ctx.units || {};
    for (const [name, ra, dec, dist, desc] of MAGNETARS) {
      const p = this._radec(ra, dec).multiplyScalar(dist * LY);
      this.registry.add({ id: 'magnetar-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name, kind: 'star', kindLabel: 'Magnetar', color: '#ffb0d0', radius: 12 * KM, priority: 2, labelRange: [2, 1e9], maxLabelDistance: 2000 * LY, pulsar: true, magnetar: true, spinHz: name.startsWith('SGR') ? 0.13 : 0.155,
        getPosition(out) { return out.copy(p); }, data: { type: 'Magnetar (neutron star)', distance: `${dist.toLocaleString('en-US')} ly`, magneticField: '≈ 10¹⁴–10¹⁵ G (a trillion times Earth\'s)', radius: '≈ 12 km', mass: '≈ 1.4 M☉', rotationPeriod: name.startsWith('SGR') ? '7.5 s' : '6.4 s' },
        description: desc + ' A magnetar\'s field is so intense that it would erase a credit card from the Moon\'s distance and distort atoms into cylinders.', provenance: 'observed', massKg: 2.8e30 });
    }
    // visuals for every pulsar-like registry object
    for (const o of this.registry.objects) {
      if (!o.pulsar) continue;
      if (o.spinHz == null) o.spinHz = /Crab/.test(o.name) ? 30 : /Vela/.test(o.name) ? 11 : /J0437/.test(o.name) ? 174 : /Geminga/.test(o.name) ? 4.2 : 1.34;
      if (o.massKg == null) o.massKg = 2.8e30;
      o.data = o.data || {}; o.data.spin = o.data.spin || `${o.spinHz} Hz (${(1000 / o.spinHz).toFixed(1)} ms)`;
      this.items.push(this._make(o));
    }
  }

  _radec(raDeg, decDeg) {
    const DEG = Math.PI / 180, ra = raDeg * DEG, dec = decDeg * DEG, OBL = 23.4392911 * DEG;
    const x = Math.cos(dec) * Math.cos(ra), y = Math.cos(dec) * Math.sin(ra), z = Math.sin(dec);
    const ye = y * Math.cos(OBL) + z * Math.sin(OBL), ze = -y * Math.sin(OBL) + z * Math.cos(OBL);
    return new THREE.Vector3(x, ze, -ye);
  }

  _make(o) {
    const g = new THREE.Group();
    const pos = o.getPosition(new THREE.Vector3());
    g.position.copy(pos);
    // star: a tiny bright sprite (the neutron star itself is 12 km: sub-pixel until you are very close)
    const c = document.createElement('canvas'); c.width = c.height = 64; const cx = c.getContext('2d');
    const grd = cx.createRadialGradient(32, 32, 0, 32, 32, 32); grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.2, 'rgba(200,220,255,0.8)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    cx.fillStyle = grd; cx.fillRect(0, 0, 64, 64);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.renderOrder = 36; g.add(glow);
    // beams: two cones along ±Y of a tilted magnetic axis, which precesses around the spin axis (Z)
    const mat = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uIntensity: { value: 1 }, uColor: { value: new THREE.Color(o.magnetar ? 0xffb0d0 : 0x9fd0ff) } }, vertexShader: beamVert, fragmentShader: beamFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const cone = new THREE.CylinderGeometry(0.02, 0.35, 1, 24, 1, true); cone.translate(0, 0.5, 0);
    const b1 = new THREE.Mesh(cone, mat), b2 = new THREE.Mesh(cone, mat); b2.rotation.z = Math.PI;
    const axis = new THREE.Group(); axis.add(b1, b2); axis.rotation.x = 0.55;   // magnetic axis tilt
    const spin = new THREE.Group(); spin.add(axis); g.add(spin);
    b1.renderOrder = b2.renderOrder = 37;
    g.visible = false;
    this.group.add(g);
    return { o, g, glow, spin, mat, pos, phase: Math.random() * Math.PI * 2, flash: 0 };
  }

  update(dt, t, camPos) {
    const cam = this.engine.camera;
    const fovScale = window.innerHeight / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
    const speed = this.ctx.time.effectiveSpeed;
    for (const it of this.items) {
      const d = it.pos.distanceTo(camPos);
      // beams become visible within ~0.5 ly; their length scales with distance so they read at any zoom
      const near = d < 0.6 * LY;
      it.g.visible = near;
      const size = Math.max(d * 0.004, 40 * KM);
      it.glow.scale.setScalar(size * 1.4);
      if (!near) continue;
      // real spin is far too fast to see: show the true rate only when time runs slow (≤ 0.01×), else a visible 0.6 Hz sweep
      const hz = speed > 0 && speed <= 0.01 ? it.o.spinHz * speed : Math.min(0.6, it.o.spinHz);
      it.phase += 2 * Math.PI * hz * dt;
      it.spin.rotation.z = it.phase;
      const L = Math.max(d * 0.9, 100 * KM);
      it.spin.scale.set(L * 0.35, L, L * 0.35);
      it.mat.uniforms.uTime.value = t;
      // does a beam point at us? the beam direction in world space vs direction to the camera
      const beamDir = this._v.set(0, 1, 0).applyQuaternion(it.spin.getWorldQuaternion(this._q).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.55, 0, 0))));
      const toCam = new THREE.Vector3().copy(camPos).sub(it.pos).normalize();
      const align = Math.max(Math.abs(beamDir.dot(toCam)), 0);
      const hit = align > 0.985;
      if (hit && it.flash <= 0) { it.flash = 1; bus.emit('pulsar:pulse', it.o); }
      it.flash = Math.max(0, it.flash - dt * 4);
      it.mat.uniforms.uIntensity.value = 0.35 + 0.65 * it.flash;
      it.glow.material.opacity = 0.6 + 0.4 * it.flash;
    }
  }
}
