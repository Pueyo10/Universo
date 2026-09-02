import * as THREE from 'three';
import { AU, LY, clamp } from '../core/Units.js';
import { bus } from '../core/EventBus.js';
import { i18n } from '../i18n/index.js';

// Screen-space labels for registry objects, with distance ranges per kind,
// priority-based overlap avoidance and smooth fades.
const DEFAULT_RANGE = {
  sun: [1.5, 3e6], star: [2, 5e5], planet: [1.2, 2.5e6], dwarf: [1.2, 4e5], moon: [1.2, 900],
  asteroid: [1.5, 3e4], comet: [1.5, 2e6], spacecraft: [2, 2e6], nebula: [1.05, 4000], blackhole: [1.2, 1e12],
  galaxy: [2.2, 400], region: [2, 60], cluster: [1.5, 3000],
};

export class LabelSystem {
  constructor(engine, registry, container, cameraCtl) {
    this.engine = engine; this.registry = registry; this.container = container; this.cameraCtl = cameraCtl;
    this.pool = [];
    this.enabled = true;
    this.selected = null;
    this._v = new THREE.Vector3();
    this._rects = [];
    this.hoverObj = null;
    this.maxLabels = 70;
    this.showStars = false;
    bus.on('select', o => { this.selected = o; });
    bus.on('toggle', (k, v) => { if (k === 'constellations') this.showStars = v; });
  }
  refresh() { for (const el of this.pool) { el._obj = null; el._w = 0; } }
  /** Approximate label width without touching layout (offsetWidth would force a synchronous reflow per label). */
  _measure(text, kind) {
    const key = kind + '|' + text;
    let w = this._widths?.get(key);
    if (w != null) return w;
    if (!this._mctx) { this._mctx = document.createElement('canvas').getContext('2d'); this._widths = new Map(); }
    const small = kind === 'moon' || kind === 'spacecraft' || kind === 'asteroid' || kind === 'dwarf' || kind === 'comet';
    const px = small ? 10 : 11;
    this._mctx.font = `500 ${px}px Inter, system-ui, sans-serif`;
    const t = String(text).toUpperCase();
    w = this._mctx.measureText(t).width + t.length * px * 0.08 + 12;   // letter-spacing 0.08em + dot & gap
    if (this._widths.size > 2000) this._widths.clear();
    this._widths.set(key, w);
    return w;
  }
  _get(i) {
    let el = this.pool[i];
    if (!el) {
      el = document.createElement('div');
      el.className = 'label';
      el.innerHTML = '<span class="lb-dot"></span><span class="lb-text"></span>';
      el.addEventListener('click', e => { e.stopPropagation(); if (el._obj) bus.emit('select:request', el._obj); });
      el.addEventListener('dblclick', e => { e.stopPropagation(); if (el._obj) bus.emit('travel:request', el._obj); });
      this.container.appendChild(el);
      this.pool[i] = el;
    }
    return el;
  }
  update() {
    const cam = this.engine.camera;
    const w = window.innerWidth, h = window.innerHeight;
    const camPos = this.cameraCtl.position;
    const fovScale = h / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
    const cands = [];
    const dSun = camPos.length();
    const inSolar = dSun < 300 * AU;
    // occluders: large bodies that can hide labels behind them
    const occ = this._occ || (this._occ = []);
    occ.length = 0;
    if (this.enabled) {
      for (const o of this.registry.objects) {
        if (!o.getPosition || o.radius == null) continue;
        if (o.kind !== 'planet' && o.kind !== 'moon' && o.kind !== 'sun' && o.kind !== 'dwarf') continue;
        const p = o.getPosition(this._v);
        const d = p.distanceTo(camPos);
        if (o.radius / d * fovScale > 6) occ.push({ x: p.x, y: p.y, z: p.z, r: o.radius, d, o });
      }
      for (const o of this.registry.objects) {
        if (!o.getPosition || o.label === false) continue;
        // context: inside the solar system, deep-sky labels only clutter
        if (inSolar && (o.kind === 'galaxy' || o.kind === 'nebula' || o.kind === 'region' || o.kind === 'cluster' || o.kind === 'blackhole')) continue;
        if (inSolar && o.kind === 'star' && !(this.showStars || (o.mag != null && o.mag < 0.6))) continue;
        const p = o.getPosition(this._v);
        const dist = p.distanceTo(camPos);
        if (o.kind === 'star' && o.lum != null && o !== this.selected && o !== this.hoverObj) {
          // apparent magnitude from the camera: only the brightest handful get labels
          const dpc = Math.max(dist / LY / 3.26156, 1e-6);
          const appMag = 4.83 - 2.5 * Math.log10(Math.max(o.lum, 1e-6)) + 5 * Math.log10(dpc / 10);
          if (appMag > (this.showStars ? 2.6 : 1.2)) continue;
        }
        // occlusion by big bodies
        let hidden = false;
        for (const oc of occ) {
          if (oc.o === o || oc.d >= dist) continue;
          // closest approach of the camera→object line to the occluder centre
          const dx = p.x - camPos.x, dy = p.y - camPos.y, dz = p.z - camPos.z;
          const ox = oc.x - camPos.x, oy = oc.y - camPos.y, oz = oc.z - camPos.z;
          const tt = (ox * dx + oy * dy + oz * dz) / (dist * dist);
          if (tt <= 0 || tt >= 1) continue;
          const cx = ox - dx * tt, cy = oy - dy * tt, cz = oz - dz * tt;
          if (cx * cx + cy * cy + cz * cz < oc.r * oc.r) { hidden = true; break; }
        }
        if (hidden) continue;
        const rng = o.labelRange || DEFAULT_RANGE[o.kind] || [1.5, 1e6];
        const r = Math.max(o.radius || 0, 1e-9);
        const minD = rng[0] * r, maxD = rng[1] * r;
        if (dist < minD || dist > maxD) continue;
        // extra absolute caps
        if (o.maxLabelDistance && dist > o.maxLabelDistance) continue;
        if (o.labelVisible && !o.labelVisible(dist)) continue;
        p.project(cam);
        if (p.z > 1 || p.z < -1) continue;
        if (Math.abs(p.x) > 1.05 || Math.abs(p.y) > 1.05) continue;
        // check it's in front of the camera
        const sx = (p.x * 0.5 + 0.5) * w, sy = (-p.y * 0.5 + 0.5) * h;
        const rpx = (r / dist) * fovScale;
        // fade near range limits (log-space)
        const fIn = clamp(Math.log(dist / minD) / 0.5, 0, 1);
        const fOut = clamp(Math.log(maxD / dist) / 0.9, 0, 1);
        let alpha = Math.min(fIn, fOut);
        if (o.labelAlpha) alpha *= o.labelAlpha(dist);
        if (alpha <= 0.02) continue;
        cands.push({ o, sx, sy, rpx, alpha, pri: (o.priority || 1) + (o === this.selected ? 1000 : 0) + (o === this.hoverObj ? 500 : 0) });
      }
    }
    cands.sort((a, b) => b.pri - a.pri);
    const rects = this._rects; rects.length = 0;
    let used = 0;
    for (const c of cands) {
      if (used >= this.maxLabels) break;
      // overlap test first (measured without layout), so rejected candidates never touch the DOM
      const name = i18n.name(c.o);
      const tw = this._measure(name, c.o.kind);
      const x = c.sx + Math.max(c.rpx, 4) + 10, y = c.sy;
      const rect = { x0: x, y0: y - 8, x1: x + tw, y1: y + 8 };
      let overlap = false;
      for (const r of rects) { if (rect.x0 < r.x1 && rect.x1 > r.x0 && rect.y0 < r.y1 && rect.y1 > r.y0) { overlap = true; break; } }
      if (overlap && c.pri < 1000) continue;
      rects.push(rect);
      const el = this._get(used);
      if (el._obj !== c.o) {
        el._obj = c.o;
        el.lastElementChild.textContent = name;
        el.className = 'label k-' + c.o.kind;
        el.style.color = '';
      }
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translateY(-50%)`;
      el.style.opacity = c.alpha.toFixed(2);
      el.style.display = '';
      el.classList.toggle('selected', c.o === this.selected);
      used++;
    }
    for (let i = used; i < this.pool.length; i++) { const el = this.pool[i]; if (el.style.display !== 'none') { el.style.display = 'none'; el._obj = null; } }
  }
}
