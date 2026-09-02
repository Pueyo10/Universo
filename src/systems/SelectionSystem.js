import * as THREE from 'three';
import { bus } from '../core/EventBus.js';

// Screen-space picking that works across 20 orders of magnitude: each object
// gets a pick radius = max(apparent radius, a few pixels); nested objects
// (a moon in front of its planet) win by being smaller; bodies hidden behind a
// large disc are rejected.
export class SelectionSystem {
  constructor(engine, registry, canvas, cameraCtl) {
    this.engine = engine; this.registry = registry; this.canvas = canvas; this.cameraCtl = cameraCtl;
    this.selected = null;
    this.hovered = null;
    this._v = new THREE.Vector3();
    this._frame = 0;
    this._mx = -1; this._my = -1;
    canvas.addEventListener('pointerup', e => {
      if (e.button !== 0) return;
      if (cameraCtl.mouse.moved > 6) return;
      const o = this.pick(e.clientX, e.clientY);
      if (o) this.select(o); else this.select(null);
    });
    canvas.addEventListener('dblclick', e => {
      const o = this.pick(e.clientX, e.clientY);
      if (o) { this.select(o); bus.emit('travel:request', o); }
    });
    canvas.addEventListener('pointermove', e => { this._mx = e.clientX; this._my = e.clientY; });
    bus.on('select:request', o => this.select(o));
  }

  select(o) {
    if (this.selected === o) { if (o) bus.emit('select', o); return; }
    this.selected = o;
    bus.emit('select', o);
  }

  pick(mx, my) {
    const cam = this.engine.camera;
    const w = window.innerWidth, h = window.innerHeight;
    const camPos = this.cameraCtl.position;
    const fovScale = h / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
    let best = null, bestScore = Infinity;
    const occluders = [];
    const items = [];
    for (const o of this.registry.objects) {
      if (!o.getPosition || o.radius == null || o.pickable === false) continue;
      const p = o.getPosition(this._v);
      const dist = p.distanceTo(camPos);
      if (dist < o.radius * 0.999) continue; // inside it
      p.project(cam);
      if (p.z > 1 || p.z < -1 || Math.abs(p.x) > 1.2 || Math.abs(p.y) > 1.2) continue;
      const sx = (p.x * 0.5 + 0.5) * w, sy = (-p.y * 0.5 + 0.5) * h;
      const rpx = (o.radius / dist) * fovScale;
      const dpx = Math.hypot(sx - mx, sy - my);
      if (rpx > 12 && dpx < rpx) occluders.push({ o, dist, rpx });
      const pickR = Math.max(rpx, o.kind === 'moon' || o.kind === 'spacecraft' ? 9 : 12);
      if (dpx > pickR) continue;
      items.push({ o, dist, rpx, dpx, pickR });
    }
    for (const it of items) {
      // rejected if a big disc in front of it contains the cursor
      let hidden = false;
      for (const oc of occluders) { if (oc.o !== it.o && oc.dist < it.dist && oc.rpx > it.rpx * 1.5 && it.dist - oc.dist > oc.o.radius) { hidden = true; break; } }
      if (hidden) continue;
      // prefer small apparent size (so nested objects win), then closeness to cursor
      const score = (it.dpx / it.pickR) + Math.log10(1 + it.rpx) * 0.6 - (it.o.priority || 0) * 0.01;
      if (score < bestScore) { bestScore = score; best = it.o; }
    }
    return best;
  }

  update() {
    this._frame++;
    if (this._frame % 4 !== 0 || this._mx < 0) return;
    if (this.cameraCtl.mouse.down) return;
    const o = this.pick(this._mx, this._my);
    if (o !== this.hovered) {
      this.hovered = o;
      this.canvas.style.cursor = o ? 'pointer' : '';
      bus.emit('hover', o);
    }
    this.cameraCtl.zoomTarget = o || this.selected;
  }
}
