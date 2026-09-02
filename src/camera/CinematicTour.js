import * as THREE from 'three';
import { bus } from '../core/EventBus.js';
import { CAM_MODE } from './CameraController.js';
import { i18n, t } from '../i18n/index.js';

// The "Cinematic Tour": a scripted flight through the scales of the universe
// with captions, slow orbital drifts at each stop, and time acceleration so
// worlds visibly turn. Escape or the tour button ends it.
const STEPS = [
  { id: 'milkyway', dist: 3.2, dwell: 9, orbit: 0.06, cap: 'milkyway1', duration: 9 },
  { id: 'arm-4', dist: 3.5, dwell: 6, orbit: 0.05, cap: 'spur', duration: 8 },
  { id: 'sun', dist: 9, dwell: 8, orbit: 0.08, cap: 'sun', duration: 9 },
  { id: 'mercury', dist: 4.5, dwell: 4, orbit: 0.12, cap: 'mercury', duration: 6 },
  { id: 'venus', dist: 4.5, dwell: 4, orbit: 0.10, cap: 'venus', duration: 6 },
  { id: 'mars', dist: 4.5, dwell: 5, orbit: 0.10, cap: 'mars', duration: 6 },
  { id: 'jupiter', dist: 5.5, dwell: 9, orbit: 0.07, cap: 'jupiter', duration: 7 },
  { id: 'io', dist: 5, dwell: 4, orbit: 0.12, cap: 'io', duration: 5 },
  { id: 'saturn', dist: 6.5, dwell: 10, orbit: 0.06, cap: 'saturn', duration: 7 },
  { id: 'titan', dist: 4.5, dwell: 4, orbit: 0.12, cap: 'titan', duration: 5 },
  { id: 'earth', dist: 4.2, dwell: 10, orbit: 0.06, cap: 'earth', duration: 8 },
  { id: 'moon', dist: 4.5, dwell: 5, orbit: 0.1, cap: 'moon', duration: 5 },
  { id: 'sgr-a', dist: 24, dwell: 9, orbit: 0.05, cap: 'sgra', duration: 12 },
  { id: 'milkyway', dist: 3.6, dwell: 7, orbit: 0.05, cap: 'milkyway2', duration: 10 },
];

export class CinematicTour {
  constructor({ engine, registry, cameraCtl, ui, time }) {
    this.engine = engine; this.registry = registry; this.cameraCtl = cameraCtl; this.ui = ui; this.time = time;
    this.active = false; this.step = -1; this.phase = 'idle'; this.t = 0;
    this.sys = { update: (dt) => this.update(dt) };
    bus.on('tour:toggle', () => this.active ? this.stop(t('tTourEnd')) : this.start());
    bus.on('escape', () => { if (this.active) this.stop(t('tTourEnd')); });
    bus.on('camera:travel:cancel', () => { if (this.active) this.stop(t('tTourEnd')); });
  }

  start() {
    if (this.active) return;
    this.active = true; this.step = -1; this.phase = 'travel';
    this.prevSpeed = this.time.effectiveSpeed;
    this.time.setSpeed(600);
    this.cameraCtl.inputEnabled = false;
    document.getElementById('btn-tour').classList.add('active');
    this.engine.addSystem(this.sys);
    this.ui.toast(t('tTourStart'), 3000);
    this._next();
  }

  stop(msg) {
    if (!this.active) return;
    this.active = false; this.phase = 'idle';
    const i = this.engine.systems.indexOf(this.sys); if (i >= 0) this.engine.systems.splice(i, 1);
    this.cameraCtl.inputEnabled = true;
    if (this.cameraCtl.travel) { this.cameraCtl.travel.onArrive = null; }
    this.time.setSpeed(this.prevSpeed || 1);
    document.getElementById('btn-tour').classList.remove('active');
    this.ui.caption(null);
    if (msg) this.ui.toast(msg);
    bus.emit('tour:end');
  }

  _next() {
    this.step++;
    if (this.step >= STEPS.length) { this.stop(t('tTourDone')); return; }
    const s = STEPS[this.step];
    const obj = this.registry.get(s.id);
    if (!obj) { this._next(); return; }
    this.current = s;
    this.phase = 'travel';
    this.ui.caption(null);
    bus.emit('select:request', obj);
    this.cameraCtl.travelTo(obj, { distance: s.dist, duration: s.duration, mode: CAM_MODE.ORBIT, onArrive: () => this._arrived() });
  }

  _arrived() {
    if (!this.active) return;
    this.phase = 'dwell'; this.t = 0;
    const s = this.current;
    const cap = t('tourSteps')[s.cap] || [i18n.name(this.registry.get(s.id)), ''];
    this.ui.caption(cap[0], cap[1]);
  }

  update(dt) {
    if (!this.active) return;
    if (this.phase === 'dwell') {
      this.t += dt;
      // gentle orbital drift
      const o = this.cameraCtl.orbit;
      o.theta += this.current.orbit * dt;
      o.phi += Math.sin(this.t * 0.4) * 0.01 * dt;
      if (this.t > this.current.dwell) this._next();
    }
  }
}
