import { Vector3 } from 'three';

// Central registry of every selectable / searchable / labelled object.
// A "celestial object" is a plain record:
// {
//   id, name, kind, parent, aliases[], color, radius (scene units, current),
//   getPosition(out) -> world position (scene units, float64), priority,
//   data (facts), description, facts[], labelRange:[min,max] (distance limits, units of radius or absolute), children[]
// }
export class Registry {
  constructor() {
    this.objects = [];
    this.byId = new Map();
    this._tmp = new Vector3();
  }
  add(o) {
    if (!o.id) throw new Error('object needs id');
    if (this.byId.has(o.id)) { console.warn('duplicate id', o.id); return this.byId.get(o.id); }
    o.aliases = o.aliases || [];
    o.children = o.children || [];
    o.priority = o.priority ?? 1;
    o.color = o.color ?? '#ffffff';
    if (o.parent) { o.parent.children.push(o); }
    this.objects.push(o);
    this.byId.set(o.id, o);
    return o;
  }
  get(id) { return this.byId.get(id); }
  remove(id) {
    const o = this.byId.get(id); if (!o) return;
    this.byId.delete(id);
    const i = this.objects.indexOf(o); if (i >= 0) this.objects.splice(i, 1);
    if (o.parent && o.parent.children) { const j = o.parent.children.indexOf(o); if (j >= 0) o.parent.children.splice(j, 1); }
  }
  find(name) {
    const n = name.trim().toLowerCase();
    return this.objects.find(o => o.name.toLowerCase() === n || o.aliases.some(a => a.toLowerCase() === n));
  }
  search(query, limit = 12) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const scored = [];
    for (const o of this.objects) {
      if (o.searchable === false) continue;
      const names = [o.name, ...o.aliases];
      let best = 0;
      for (const nm of names) {
        const l = nm.toLowerCase();
        if (l === q) best = Math.max(best, 100);
        else if (l.startsWith(q)) best = Math.max(best, 80 - (l.length - q.length) * 0.5);
        else if (l.includes(q)) best = Math.max(best, 55 - l.indexOf(q));
        else if (q.length >= 3 && fuzzy(q, l)) best = Math.max(best, 25);
      }
      if (best > 0) scored.push({ o, s: best + (o.priority || 0) * 0.01 });
    }
    scored.sort((a, b) => b.s - a.s);
    return scored.slice(0, limit).map(x => x.o);
  }
  /** Nearest object surface to a point, optionally filtered. Returns {obj, dist (to surface), center} */
  nearest(p, filter = null, out = { obj: null, dist: Infinity, centerDist: Infinity }) {
    out.obj = null; out.dist = Infinity; out.centerDist = Infinity;
    for (const o of this.objects) {
      if (!o.getPosition || o.radius == null) continue;
      if (filter && !filter(o)) continue;
      o.getPosition(this._tmp);
      const d = this._tmp.distanceTo(p);
      const s = d - o.radius;
      if (s < out.dist) { out.dist = s; out.obj = o; out.centerDist = d; }
    }
    return out;
  }
}

function fuzzy(q, s) {
  let i = 0;
  for (let j = 0; j < s.length && i < q.length; j++) if (s[j] === q[i]) i++;
  return i === q.length;
}
