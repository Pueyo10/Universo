import * as THREE from 'three';
import { CONSTELLATIONS, EXTRA_STARS } from '../data/Constellations.js';
import { STARS } from '../data/StarCatalog.js';
import { LY, radecToVector, smoothstep } from '../core/Units.js';
import { bus } from '../core/EventBus.js';
import { i18n } from '../i18n/index.js';

// Constellation stick figures drawn in true 3D between catalogue stars, faded
// out as the camera leaves the solar neighbourhood (they only make sense from
// near the Sun).
export class ConstellationLayer {
  constructor(ctx) {
    this.ctx = ctx; this.engine = ctx.engine; this.registry = ctx.registry;
    this.enabled = false;
    const byName = new Map();
    for (const s of [...STARS, ...EXTRA_STARS]) byName.set(s[0], s);
    const pts = [];
    const v = new THREE.Vector3();
    const missing = new Set();
    this.labels = [];
    for (const c of CONSTELLATIONS) {
      const centroid = new THREE.Vector3(); let n = 0;
      for (const [a, b] of c.lines) {
        const sa = byName.get(a), sb = byName.get(b);
        if (!sa || !sb) { if (!sa) missing.add(a); if (!sb) missing.add(b); continue; }
        radecToVector(sa[1], sa[2], v).multiplyScalar(sa[3]); pts.push(v.x, v.y, v.z); centroid.add(v.clone().normalize()); n++;
        radecToVector(sb[1], sb[2], v).multiplyScalar(sb[3]); pts.push(v.x, v.y, v.z); centroid.add(v.clone().normalize()); n++;
      }
      if (n) {
        centroid.normalize().multiplyScalar(60 * LY);
        const p = centroid.clone();
        const obj = { id: 'con-' + c.name.toLowerCase().replace(/[^a-z]+/g, '-'), name: c.name, kind: 'constellation', kindLabel: 'Constellation', color: '#9fb4d8', radius: 40 * LY, priority: 2, pickable: false, labelRange: [0, 1e9],
          getPosition(out) { return out.copy(p); }, labelVisible: (d) => this.enabled && d < 120 * LY, labelAlpha: (d) => 0.7,
          data: { type: 'Constellation', lines: c.lines.length }, description: i18n.tpl('constellation', { name: c.name }).en };
        const esName = i18n.ES_CONTENT[obj.id]?.name || c.name;
        obj.i18n = { es: { description: i18n.tpl('constellation', { name: esName }).es } };
        this.registry.add(obj);
        this.labels.push(obj);
      }
    }
    if (missing.size) console.warn('[constellations] missing stars:', [...missing].join(', '));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 30000);
    this.material = new THREE.LineBasicMaterial({ color: 0x8fb4ff, transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending });
    this.lines = new THREE.LineSegments(geo, this.material);
    this.lines.scale.setScalar(LY);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 13;
    this.lines.visible = false;
    this.engine.scene.add(this.lines);
    bus.on('toggle', (k, val) => { if (k === 'constellations') this.enabled = val; });
  }
  update(dt, t, camPos) {
    const dLy = camPos.length() / LY;
    const fade = this.enabled ? (1 - smoothstep(30, 200, dLy)) * 0.42 : 0;
    this.material.opacity += (fade - this.material.opacity) * Math.min(1, dt * 4);
    this.lines.visible = this.material.opacity > 0.005;
  }
}
