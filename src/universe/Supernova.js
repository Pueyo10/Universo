import * as THREE from 'three';
import { LY, KM, SUN_RADIUS_KM } from '../core/Units.js';
import { LOGDEPTH_PARS_VERT, LOGDEPTH_VERT, LOGDEPTH_PARS_FRAG, LOGDEPTH_FRAG, HASH, VALUE_NOISE3D, COLOR_UTILS } from '../shaders/chunks.js';
import { bus } from '../core/EventBus.js';

// SUPERNOVA SIMULATION (artistic, clearly labelled as simulated): pick a massive
// star and play a ~40 s sequence — core collapse (the star dims and shrinks),
// the flash, a shock shell racing outward, the ejecta cloud expanding and
// cooling into a filamentary remnant with a compact object left behind. The
// real timescales (seconds for the collapse, centuries for the remnant) are
// compressed; the sequence can be replayed or stopped at any time.
const shellVert = /* glsl */`
  varying vec3 vN; varying vec3 vPos;
  ${LOGDEPTH_PARS_VERT}
  void main() {
    vN = normal; vPos = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    ${LOGDEPTH_VERT}
  }
`;
const shellFrag = /* glsl */`
  precision highp float;
  varying vec3 vN; varying vec3 vPos;
  uniform float uTime, uPhase, uAlpha, uTemp;
  ${HASH}
  ${VALUE_NOISE3D}
  ${COLOR_UTILS}
  ${LOGDEPTH_PARS_FRAG}
  void main() {
    ${LOGDEPTH_FRAG}
    vec3 p = normalize(vPos);
    float n = vfbm(p * 4.0 + uTime * 0.05, 4);
    float fil = pow(max(1.0 - abs(vfbm(p * 9.0 + 3.0, 3) * 2.0 - 1.0), 0.0), 3.0);
    // early: smooth hot shell; late: clumpy filaments
    float dens = mix(0.6 + 0.4 * n, fil * 1.6 + n * 0.3, uPhase);
    vec3 hot = blackbody(uTemp);
    vec3 cool = mix(vec3(1.0, 0.35, 0.3), vec3(0.4, 0.8, 1.0), fil);
    vec3 col = mix(hot, cool, uPhase) * dens;
    float a = clamp(dens * uAlpha, 0.0, 1.0);
    gl_FragColor = vec4(col * a, a);
  }
`;

export class SupernovaSim {
  constructor(ctx) {
    this.ctx = ctx; this.engine = ctx.engine; this.registry = ctx.registry;
    this.active = false; this.t = 0; this.star = null;
    this.group = new THREE.Group(); this.group.visible = false;
    this.engine.scene.add(this.group);
    const geo = new THREE.IcosahedronGeometry(1, 4);
    this.shellMat = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uPhase: { value: 0 }, uAlpha: { value: 0 }, uTemp: { value: 20000 } }, vertexShader: shellVert, fragmentShader: shellFrag, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor });
    this.shell = new THREE.Mesh(geo, this.shellMat); this.shell.renderOrder = 41; this.group.add(this.shell);
    this.shockMat = this.shellMat.clone(); this.shock = new THREE.Mesh(geo, this.shockMat); this.shock.renderOrder = 41; this.group.add(this.shock);
    // flash sprite
    const c = document.createElement('canvas'); c.width = c.height = 128; const cx = c.getContext('2d');
    const g = cx.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.15, 'rgba(220,235,255,0.9)'); g.addColorStop(0.5, 'rgba(160,190,255,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    cx.fillStyle = g; cx.fillRect(0, 0, 128, 128);
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
    this.flash.renderOrder = 42; this.group.add(this.flash);
    this.duration = 42;
    bus.on('supernova:start', o => this.start(o));
    bus.on('supernova:stop', () => this.stop());
    bus.on('escape', () => this.stop());
  }

  /** A star qualifies when it is a supergiant / Wolf–Rayet / LBV or ≳ 8 solar masses. */
  static eligible(o) {
    if (!o || o.kind !== 'star' || o.pulsar) return false;
    if (o.special && /supergiant|wolfrayet|lbv/.test(o.special.kind)) return true;
    return (o.lum || 0) > 20000;
  }

  start(o) {
    if (!SupernovaSim.eligible(o)) return;
    this.stop();
    this.star = o; this.active = true; this.t = 0;
    this.pos = o.getPosition(new THREE.Vector3());
    this.R0 = o.radius;                        // stellar radius (scene units)
    this.group.position.copy(this.pos); this.group.visible = true;
    // hide the star's own point while the sequence runs (dim via registry flag read by labels; the star point stays as the core)
    this.ctx.time.setSpeed(1);
    bus.emit('supernova:begin', o);
  }

  stop() {
    if (!this.active) return;
    this.active = false; this.group.visible = false;
    this.flash.material.opacity = 0;
    bus.emit('supernova:end', this.star);
    this.star = null;
  }

  /** 0..1 progress and a phase label for the UI. */
  get progress() { return this.active ? Math.min(this.t / this.duration, 1) : 0; }
  get phaseKey() {
    const t = this.t;
    return t < 6 ? 'snCollapse' : t < 9 ? 'snFlash' : t < 20 ? 'snShock' : t < 34 ? 'snEjecta' : 'snRemnant';
  }

  update(dt, time, camPos) {
    if (!this.active) return;
    this.t += dt;
    const t = this.t, R0 = this.R0;
    const ease = x => x * x * (3 - 2 * x);
    // final remnant radius: ~1 light-year (compressed from centuries)
    const Rmax = Math.max(1.2 * LY, R0 * 200);
    let shellR = 0, shockR = 0, flashA = 0, phase = 0, alpha = 0, temp = 30000;
    if (t < 6) {               // collapse: the star flickers and contracts
      shellR = R0 * (1 - 0.6 * ease(t / 6)); alpha = 0.9; temp = 6000 - 2500 * (t / 6); phase = 0;
      this.shell.scale.setScalar(shellR); this.shock.visible = false; this.shell.visible = true;
    } else if (t < 9) {        // flash
      const u = (t - 6) / 3; flashA = Math.sin(u * Math.PI) ** 0.5; shellR = R0 * (0.4 + 2 * u); alpha = 1; temp = 40000; phase = 0;
      this.shell.scale.setScalar(shellR); this.shock.visible = false;
    } else {                   // shock + ejecta + remnant
      const u = Math.min((t - 9) / (this.duration - 9), 1);
      shockR = R0 + (Rmax - R0) * Math.pow(u, 0.55);
      shellR = R0 + (Rmax * 0.8 - R0) * Math.pow(u, 0.7);
      phase = ease(Math.min(u * 1.4, 1));
      alpha = 0.9 * (1 - 0.6 * u);
      temp = 40000 * Math.pow(1 - u, 1.5) + 4000;
      flashA = Math.max(0, 1 - (t - 9) / 6) * 0.6;
      this.shell.scale.setScalar(shellR); this.shock.visible = true; this.shock.scale.setScalar(shockR);
      this.shockMat.uniforms.uPhase.value = 0; this.shockMat.uniforms.uAlpha.value = 0.35 * (1 - u); this.shockMat.uniforms.uTemp.value = 60000; this.shockMat.uniforms.uTime.value = time;
    }
    // when the camera is inside the ejecta the shell must not wash the frame out: thin it as it engulfs us
    const d = camPos.distanceTo(this.pos);
    const inside = shellR > 0 ? THREE.MathUtils.clamp((shellR - d) / Math.max(shellR * 0.3, 1e-9), 0, 1) : 0;
    alpha *= 1 - 0.8 * inside;
    if (this.shock.visible) this.shockMat.uniforms.uAlpha.value *= 1 - 0.85 * THREE.MathUtils.clamp((shockR - d) / Math.max(shockR * 0.3, 1e-9), 0, 1);
    const su = this.shellMat.uniforms; su.uTime.value = time; su.uPhase.value = phase; su.uAlpha.value = alpha; su.uTemp.value = temp;
    // the flash scales with distance so it always reads as a blinding point
    this.flash.material.opacity = flashA;
    this.flash.scale.setScalar(Math.max(d * 0.25 * flashA, R0 * 3));
    if (t >= this.duration) { this.t = this.duration; }
  }
}
