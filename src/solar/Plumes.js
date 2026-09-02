import * as THREE from 'three';
import { KM, DEG } from '../core/Units.js';
import { Rng } from '../core/Random.js';
import { LOGDEPTH_PARS_VERT, LOGDEPTH_VERT, LOGDEPTH_PARS_FRAG, LOGDEPTH_FRAG } from '../shaders/chunks.js';

// Cryovolcanic geysers (Enceladus south pole, Triton) and volcanic plumes (Io):
// GPU particle fountains in the body's local frame. Each particle follows a
// ballistic arc under the body's gravity; Enceladus' escape-velocity fraction
// feeds the E ring, Io's plumes reach 300–500 km. All sources are real sites.
const vert = /* glsl */`
  attribute vec3 dir; attribute float t0; attribute float speed; attribute float seed;
  varying float vAlpha; varying float vHeight;
  uniform float uTime, uG, uPixelRatio, uLife, uSize, uSpread;
  uniform vec3 uSource;
  ${LOGDEPTH_PARS_VERT}
  void main() {
    float life = mod(uTime * 0.25 + t0 * uLife, uLife);         // seconds (visual)
    vec3 up = normalize(uSource);
    vec3 v = normalize(mix(up, dir, uSpread)) * speed;
    vec3 p = uSource + v * life - up * 0.5 * uG * life * life;
    // particles that fall back below the surface vanish
    float h = length(p) - 1.0;
    vHeight = h;
    float a = smoothstep(0.0, 0.02, h) * (1.0 - smoothstep(uLife * 0.7, uLife, life));
    vAlpha = a * 0.55;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float dist = length(mv.xyz);
    gl_PointSize = clamp(uSize / dist * 1000.0, 1.0, 14.0) * uPixelRatio;
    gl_Position = projectionMatrix * mv;
    ${LOGDEPTH_VERT}
  }
`;
const frag = /* glsl */`
  precision highp float;
  varying float vAlpha; varying float vHeight;
  uniform vec3 uColor;
  ${LOGDEPTH_PARS_FRAG}
  void main() {
    ${LOGDEPTH_FRAG}
    vec2 c = gl_PointCoord - 0.5; float r2 = dot(c, c) * 4.0;
    if (r2 > 1.0) discard;
    float a = exp(-r2 * 3.0) * vAlpha;
    if (a < 0.004) discard;
    gl_FragColor = vec4(uColor * a, a);
  }
`;

// sources: lat/lon (deg), color, speed (planet radii per visual second), life (s), count
const SOURCES = {
  enceladus: { color: [0.85, 0.92, 1.0], g: 0.113, sites: [[-83, 40], [-81, 120], [-86, 210], [-79, 300], [-84, 330], [-88, 20]], speed: 0.9, life: 5.5, count: 900, size: 2.6, spread: 0.35,
    note: 'Cassini imaged ~100 jets along the four "tiger stripe" fractures near the south pole.' },
  io: { color: [1.0, 0.85, 0.55], g: 1.80 / 1821.6 * 1000, sites: [[18, 253], [-19, 185], [-2, 298], [13, 117], [-45, 110]], speed: 0.55, life: 6, count: 700, size: 3.2, spread: 0.5,
    note: 'Pele, Loki, Prometheus, Tvashtar: umbrella-shaped plumes 100–500 km tall, seen by Voyager, Galileo, New Horizons and Juno.' },
  triton: { color: [0.55, 0.6, 0.7], g: 0.779 / 1353.4 * 1000, sites: [[-50, 20], [-55, 330], [-60, 60]], speed: 0.25, life: 7, count: 300, size: 2.2, spread: 0.2,
    note: 'Voyager 2 saw dark nitrogen geysers rising 8 km and streaking downwind.' },
};

export class Plumes {
  constructor(ctx, solar) {
    this.ctx = ctx; this.engine = ctx.engine;
    this.items = [];
    for (const [id, src] of Object.entries(SOURCES)) {
      const body = solar.byId[id]; if (!body) continue;
      const n = src.count;
      const dir = new Float32Array(n * 3), t0 = new Float32Array(n), speed = new Float32Array(n), seed = new Float32Array(n), pos = new Float32Array(n * 3);
      const rng = new Rng(id.length * 131);
      const src3 = new THREE.Vector3();
      for (let i = 0; i < n; i++) {
        const d = rng.unitVector(); dir[i * 3] = d[0]; dir[i * 3 + 1] = d[1]; dir[i * 3 + 2] = d[2];
        t0[i] = rng.float(); speed[i] = src.speed * (0.6 + 0.6 * rng.float()); seed[i] = rng.float();
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('dir', new THREE.BufferAttribute(dir, 3));
      geo.setAttribute('t0', new THREE.BufferAttribute(t0, 1));
      geo.setAttribute('speed', new THREE.BufferAttribute(speed, 1));
      geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
      geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 4);
      const g = new THREE.Group();
      for (const [lat, lon] of src.sites) {
        const la = lat * DEG, lo = lon * DEG;
        src3.set(Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo));
        const mat = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uG: { value: src.g * 1.0 }, uPixelRatio: { value: 1 }, uLife: { value: src.life }, uSize: { value: src.size }, uSpread: { value: src.spread }, uSource: { value: src3.clone().multiplyScalar(1.002) }, uColor: { value: new THREE.Vector3(...src.color) } }, vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
        const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 64;
        g.add(pts);
      }
      body.group.add(g);
      body.plumes = { note: src.note };
      this.items.push({ body, g });
    }
  }

  update(dt, t, camPos) {
    const pr = this.engine.renderer.getPixelRatio();
    for (const it of this.items) {
      const d = camPos.distanceTo(it.body.position);
      const vis = it.body.group.visible && d < it.body.radius * 60;
      it.g.visible = vis;
      if (!vis) continue;
      for (const pts of it.g.children) { pts.material.uniforms.uTime.value = t; pts.material.uniforms.uPixelRatio.value = pr; }
    }
  }
}
