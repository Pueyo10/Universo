import * as THREE from 'three';
import { KM, DEG } from '../core/Units.js';
import { SITES } from '../data/Sites.js';
import { i18n } from '../i18n/index.js';

// Historic sites, rovers and landmarks pinned to planetary surfaces. Each is a
// registry object whose position follows the body's rotation (planetographic
// lat/lon in the body's IAU frame: +Y pole, prime meridian at +X).
export class SurfaceSites {
  constructor(ctx, solar) {
    this.ctx = ctx; this.registry = ctx.registry; this.solar = solar;
    this.items = [];
    const self = this;
    for (const s of SITES) {
      const body = solar.byId[s.body]; if (!body) continue;
      const lat = s.lat * DEG, lon = s.lon * DEG;
      const local = new THREE.Vector3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), -Math.cos(lat) * Math.sin(lon)); // unit sphere, east-positive longitude
      const kindLabel = s.kind === 'rover' ? 'Rover' : s.kind === 'site' ? 'Historic site' : 'Surface feature';
      const obj = {
        id: 'site-' + s.id, name: s.name, kind: 'site', kindLabel, parent: body, color: s.color || (s.kind === 'feature' ? '#d8c8a8' : '#ffffff'),
        radius: Math.max(body.realRadius * 0.004, 0.5 * KM), priority: 1, searchable: true, pickable: true, labelRange: [0, 1e9],
        site: s, body, local,
        getPosition(out) { return self._pos(this, out); },
        labelVisible: (d) => d < body.radius * 6,
        maxLabelDistance: body.realRadius * 2000,
        data: { ...(s.data || {}), ...(s.date ? { date: s.date } : {}), coordinates: `${Math.abs(s.lat).toFixed(2)}° ${s.lat >= 0 ? 'N' : 'S'}, ${Math.abs(s.lon).toFixed(2)}° ${s.lon >= 0 ? 'E' : 'W'}` },
        description: s.desc ? s.desc.en : '', i18n: s.desc ? { es: { description: s.desc.es } } : undefined,
        provenance: 'observed',
      };
      this.registry.add(obj);
      this.items.push(obj);
    }
    this._v = new THREE.Vector3();
  }

  _pos(o, out) {
    const b = o.body;
    // the Great Red Spot drifts with the gas-giant band flow; keep it at the texture's spot longitude (System II drift is tiny)
    out.copy(o.local);
    // planetographic frame -> body local (group scale handles oblateness)
    out.x *= b.group.scale.x; out.y *= b.group.scale.y; out.z *= b.group.scale.z;
    out.applyQuaternion(b.quaternion).add(b.position);
    return out;
  }

  update() { /* positions are derived on demand */ }
}
