import * as THREE from 'three';
import { AU } from '../core/Units.js';
import { bus } from '../core/EventBus.js';
import { habitableZone } from '../data/Exoplanets.js';
import { Body } from './Body.js';
import { LOGDEPTH_PARS_VERT, LOGDEPTH_VERT, LOGDEPTH_PARS_FRAG, LOGDEPTH_FRAG } from '../shaders/chunks.js';

// HABITABLE ZONE overlay: a translucent annulus around the selected star where
// a rocky planet with an Earth-like atmosphere could keep liquid surface water
// (conservative limits, Kopparapu et al. 2013; the fainter outer band is the
// optimistic estimate). Toggled from the Science panel; scale-aware.
const vert = /* glsl */`
  varying vec2 vUv;
  ${LOGDEPTH_PARS_VERT}
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    ${LOGDEPTH_VERT}
  }
`;
const frag = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  uniform float uInner, uOuter, uOptIn, uOptOut, uAlpha;
  ${LOGDEPTH_PARS_FRAG}
  void main() {
    ${LOGDEPTH_FRAG}
    // uv.x (radial) from geometry: RingGeometry maps u across the annulus [uOptIn, uOptOut]
    float r = mix(uOptIn, uOptOut, vUv.x);
    float cons = smoothstep(uInner - (uInner) * 0.02, uInner, r) * (1.0 - smoothstep(uOuter, uOuter * 1.02, r));
    float opt = 1.0 - smoothstep(uOptOut * 0.985, uOptOut, r);
    opt *= smoothstep(uOptIn, uOptIn * 1.015, r);
    vec3 col = mix(vec3(0.25, 0.9, 0.55), vec3(0.6, 1.0, 0.7), cons);
    float a = (0.08 * opt + 0.22 * cons) * uAlpha;
    // subtle radial lines to read as an overlay, not a solid
    a *= 0.85 + 0.15 * sin(vUv.y * 400.0);
    gl_FragColor = vec4(col * a, a);
  }
`;

export class HabitableZoneLayer {
  constructor(ctx, solar) {
    this.ctx = ctx; this.engine = ctx.engine; this.solar = solar;
    this.enabled = false;
    this.star = null;
    this.mat = new THREE.ShaderMaterial({ uniforms: { uInner: { value: 1 }, uOuter: { value: 2 }, uOptIn: { value: 0.8 }, uOptOut: { value: 2.2 }, uAlpha: { value: 1 } }, vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor });
    this.mesh = new THREE.Mesh(new THREE.RingGeometry(1, 2, 256, 4), this.mat);   // rebuilt per star (inner/outer ratio changes)
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.renderOrder = 43; this.mesh.frustumCulled = false; this.mesh.visible = false;
    this.group = new THREE.Group(); this.group.add(this.mesh);
    this.engine.scene.add(this.group);
    bus.on('toggle', (k, v) => { if (k === 'habitable') { this.enabled = v; } });
    bus.on('select', o => { this.setStar(o); });
  }

  /** Star for the overlay: the selected star, the Sun for solar bodies, or the host of a selected exoplanet. */
  setStar(o) {
    if (!o) { this.star = null; return; }
    if (o.kind === 'sun') this.star = { obj: o, L: 1, pos: () => o.getPosition(new THREE.Vector3()), sun: true };
    else if (o.kind === 'star') this.star = { obj: o, L: o.lum || 1, pos: () => o.scenePos ? o.scenePos.clone() : o.getPosition(new THREE.Vector3()) };
    else if (o.parent && o.parent.kind === 'star') this.setStar(o.parent);
    else if (o.kind === 'planet' || o.kind === 'dwarf' || o.kind === 'moon' || o.kind === 'asteroid' || o.kind === 'comet') { const sun = this.solar.sun; this.star = { obj: sun, L: 1, pos: () => sun.position.clone(), sun: true }; }
    else this.star = null;
    if (this.star) {
      const hz = habitableZone(this.star.L);
      this.hz = hz;
      const u = this.mat.uniforms; u.uInner.value = hz.inner; u.uOuter.value = hz.outer; u.uOptIn.value = hz.optimisticInner; u.uOptOut.value = hz.optimisticOuter;
      this.mesh.geometry.dispose();
      this.mesh.geometry = new THREE.RingGeometry(hz.optimisticInner, hz.optimisticOuter, 256, 4);
    }
  }

  /** Which of the given planets (with .a in AU) are in the zone. */
  inZone(aAU) { return this.hz ? aAU >= this.hz.inner && aAU <= this.hz.outer : false; }

  update(dt, t, camPos) {
    const vis = this.enabled && !!this.star;
    this.mesh.visible = vis;
    if (!vis) return;
    const p = this.star.pos();
    this.group.position.copy(p);
    // scale: AU in the star's frame, following the visual/real orbit mapping of the Solar System when the Sun is the star
    let k = AU;
    if (this.star.sun) {
      // follow the Solar System's real ↔ visual orbit mapping (evaluated at the zone's middle radius)
      const st = this.solar.scaleT;
      if (st > 0) { const hzMid = (this.hz.inner + this.hz.outer) / 2; const rv = Body.orbitVisual(hzMid * AU) / (hzMid * AU); k = AU * (1 + st * (rv - 1)); }
    }
    this.group.scale.setScalar(k);
    // fade when the whole zone is tiny or when the camera is far outside it
    const d = camPos.distanceTo(p) / k;
    this.mat.uniforms.uAlpha.value = THREE.MathUtils.clamp(this.hz.outer * 40 / Math.max(d, 1e-6), 0.15, 1) * (d < this.hz.outer * 400 ? 1 : 0);
  }
}
