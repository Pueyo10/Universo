import * as THREE from 'three';
import { AU, KM } from '../core/Units.js';
import { bus } from '../core/EventBus.js';
import { Rng } from '../core/Random.js';
import { LOGDEPTH_PARS_VERT, LOGDEPTH_VERT, LOGDEPTH_PARS_FRAG, LOGDEPTH_FRAG } from '../shaders/chunks.js';

// Science layers (hidden by default):
//  • SOLAR WIND — particles streaming radially from the Sun at ~400 km/s (sped up)
//  • HELIOSPHERE — termination shock (~90 AU), heliopause (~120 AU, where Voyager 1
//    crossed in 2012) as translucent shells with labels
//  • MAGNETOSPHERES — dipole field lines for Earth, Jupiter, Saturn, compressed on
//    the day side and stretched into a tail by the solar wind (conceptual)
const windVert = /* glsl */`
  attribute vec3 dir; attribute float t0;
  varying float vAlpha;
  uniform float uTime, uPixelRatio, uInner, uOuter;
  ${LOGDEPTH_PARS_VERT}
  void main() {
    float u = fract(t0 + uTime * 0.03);
    float r = mix(uInner, uOuter, pow(u, 0.6));
    vec3 p = dir * r;
    vAlpha = (1.0 - u) * 0.6 * smoothstep(0.0, 0.05, u);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = 1.8 * uPixelRatio;
    gl_Position = projectionMatrix * mv;
    ${LOGDEPTH_VERT}
  }
`;
const windFrag = /* glsl */`
  precision highp float; varying float vAlpha;
  ${LOGDEPTH_PARS_FRAG}
  void main() {
    ${LOGDEPTH_FRAG}
    if (vAlpha < 0.01) discard;
    gl_FragColor = vec4(vec3(1.0, 0.8, 0.5) * vAlpha, vAlpha);
  }
`;

export class Heliosphere {
  constructor(ctx, solar) {
    this.ctx = ctx; this.engine = ctx.engine; this.solar = solar; this.registry = ctx.registry;
    this.enabledHelio = false; this.enabledMag = false; this.enabledWind = false;
    this.group = new THREE.Group(); this.engine.scene.add(this.group);
    // --- heliosphere shells (slightly flattened toward the direction of motion: the nose points toward RA 17h 18m, Dec +15°)
    const shellMat = (color, op) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending, wireframe: false });
    this.termination = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), shellMat(0xff9a5a, 0.06));
    this.heliopause = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), shellMat(0x6fa8ff, 0.05));
    const wire = new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.SphereGeometry(1, 24, 12)), new THREE.LineBasicMaterial({ color: 0x6fa8ff, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.heliopause.add(wire);
    this.termination.scale.setScalar(90 * AU); this.heliopause.scale.setScalar(121 * AU);
    this.termination.scale.z *= 0.85; this.heliopause.scale.z *= 0.8;   // compressed nose along -Z (conceptual)
    this.termination.renderOrder = this.heliopause.renderOrder = 9;
    this.termination.visible = this.heliopause.visible = false;
    this.group.add(this.termination, this.heliopause);
    // registry markers for labels / travel
    const self = this;
    this.registry.add({ id: 'heliopause', name: 'Heliopause', kind: 'region', kindLabel: 'Heliosphere boundary', color: '#6fa8ff', radius: 121 * AU, priority: 3, labelRange: [0.9, 12], labelVisible: () => self.enabledHelio, searchable: true,
      getPosition(out) { return out.set(0, 0, 0); }, data: { type: 'Boundary of the solar wind', distance: '≈ 120 AU (Voyager 1 crossed it in August 2012 at 121 AU)', note: 'Beyond it lies the interstellar medium' },
      description: 'The heliopause is where the solar wind is stopped by the pressure of interstellar gas. Inside it, at ~90 AU, the termination shock slows the wind from 400 km/s to subsonic speeds. Voyager 1 (2012) and Voyager 2 (2018) are the only spacecraft to have crossed it — and measured the interstellar medium directly.', provenance: 'estimated' });
    // --- solar wind particles
    const n = 6000, rng = new Rng(4242);
    const dir = new Float32Array(n * 3), t0 = new Float32Array(n), pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const d = rng.unitVector(); dir[i * 3] = d[0]; dir[i * 3 + 1] = d[1]; dir[i * 3 + 2] = d[2]; t0[i] = rng.float(); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('dir', new THREE.BufferAttribute(dir, 3)); geo.setAttribute('t0', new THREE.BufferAttribute(t0, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 200 * AU);
    this.windMat = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uPixelRatio: { value: 1 }, uInner: { value: 0.1 * AU }, uOuter: { value: 90 * AU } }, vertexShader: windVert, fragmentShader: windFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.wind = new THREE.Points(geo, this.windMat); this.wind.frustumCulled = false; this.wind.renderOrder = 9; this.wind.visible = false;
    this.group.add(this.wind);
    // --- magnetospheres: dipole field lines in each body's local frame (unit = body radius)
    this.mags = [];
    for (const [id, cfg] of Object.entries({ earth: { standoff: 10, tilt: 11, color: 0x7fb4ff }, jupiter: { standoff: 60, tilt: 10, color: 0xc8a0ff }, saturn: { standoff: 20, tilt: 0, color: 0xa0c8ff } })) {
      const body = solar.byId[id]; if (!body) continue;
      const lines = this._dipoleLines(cfg.standoff, cfg.tilt * Math.PI / 180);
      const mesh = new THREE.LineSegments(lines, new THREE.LineBasicMaterial({ color: cfg.color, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }));
      mesh.frustumCulled = false; mesh.renderOrder = 65; mesh.visible = false;
      body.group.add(mesh);
      this.mags.push({ body, mesh, cfg });
    }
    bus.on('toggle', (k, v) => { if (k === 'heliosphere') this.enabledHelio = v; if (k === 'magnetosphere') this.enabledMag = v; if (k === 'solarwind') this.enabledWind = v; });
    this._v = new THREE.Vector3();
  }

  /** Dipole field lines r = L sin²θ, compressed toward the Sun (+X in the local frame is handled per frame by rotating the mesh). */
  _dipoleLines(standoff, tilt) {
    const pts = [];
    const Ls = [1.5, 2.0, 2.7, 3.6, 5.0];
    for (const L0 of Ls) {
      for (let k = 0; k < 8; k++) {
        const phi = (k / 8) * Math.PI * 2 + (L0 * 0.7);
        // day side compressed, night side stretched
        const dayFactor = 0.5 + 0.5 * Math.cos(phi);        // 1 toward the Sun (-Z later), 0 anti-sun
        const L = L0 * (1 - 0.3 * dayFactor * Math.min(L0 / 5, 1)) * (1 + 0.9 * (1 - dayFactor) * Math.min(L0 / 5, 1));
        let prev = null;
        for (let i = 0; i <= 40; i++) {
          const th = 0.15 + (i / 40) * (Math.PI - 0.3);
          const r = L * Math.sin(th) ** 2; if (r < 1.02) { prev = null; continue; }
          const x = r * Math.sin(th) * Math.cos(phi), z = r * Math.sin(th) * Math.sin(phi), y = r * Math.cos(th);
          // tilt the dipole axis
          const yt = y * Math.cos(tilt) - x * Math.sin(tilt), xt = y * Math.sin(tilt) + x * Math.cos(tilt);
          const p = [xt, yt, z];
          if (prev) pts.push(...prev, ...p);
          prev = p;
        }
      }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 60);
    return geo;
  }

  update(dt, t, camPos) {
    const d = camPos.length();
    this.termination.visible = this.heliopause.visible = this.enabledHelio && d > 3 * AU;
    this.wind.visible = this.enabledWind && d > 0.05 * AU && d < 400 * AU;
    if (this.wind.visible) { this.windMat.uniforms.uTime.value = t; this.windMat.uniforms.uPixelRatio.value = this.engine.renderer.getPixelRatio(); }
    for (const m of this.mags) {
      const vis = this.enabledMag && m.body.group.visible && (m.body.rpx || 0) > 4;
      m.mesh.visible = vis;
      if (!vis) continue;
      // orient the compressed (day) side toward the Sun: field lines were built with phi=0 -> +X; rotate +X to the local sun direction
      const sunLocal = m.body.worldDirToLocal(this._v.copy(m.body.position).negate().normalize(), new THREE.Vector3());
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), new THREE.Vector3(sunLocal.x, 0, sunLocal.z).normalize());
      m.mesh.quaternion.copy(q);
      m.mesh.material.opacity = 0.22 * Math.min(1, (m.body.rpx || 0) / 40);
    }
  }
}
