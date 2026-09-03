import { bus } from '../core/EventBus.js';
import { CAM_MODE } from './CameraController.js';
import { i18n, t } from '../i18n/index.js';
import { TOURS, observeSteps } from './Tours.js';
import { clamp, damp } from '../core/Units.js';

// Guided tours and the OBSERVE auto-cinematic: scripted flights through the
// scales of the universe with documentary captions, slow orbital drifts with
// elevation changes at each stop, and time acceleration so worlds visibly turn.
// Escape, the tour button or any travel request ends the sequence.
export class CinematicTour {
  constructor({ engine, registry, cameraCtl, ui, time }) {
    this.engine = engine; this.registry = registry; this.cameraCtl = cameraCtl; this.ui = ui; this.time = time;
    this.active = false; this.step = -1; this.phase = 'idle'; this.t = 0;
    this.steps = []; this.tourId = null; this.observing = false; this.paused = false; this._skipping = false;
    this.sys = { update: (dt) => this.update(dt) };
    bus.on('tour:toggle', () => this.active ? this.stop(t('tTourEnd')) : bus.emit('tour:menu'));
    bus.on('tour:start', id => this.start(id));
    bus.on('observe', o => this.observe(o));
    bus.on('escape', () => { if (this.active) this.stop(t('tTourEnd')); });
    bus.on('camera:travel:cancel', () => { if (this.active && !this._skipping) this.stop(t('tTourEnd')); });
    bus.on('tour:pause', () => this.togglePause());
    bus.on('tour:next', () => this.next());
    bus.on('tour:prev', () => this.prev());
  }

  get tours() { return TOURS; }

  start(id = 'solar') {
    const tour = TOURS[id]; if (!tour) return;
    this.observing = false;
    this._begin(tour.steps, id, tour.speed ?? 600);
    this.ui.toast(`${tour.name[i18n.lang] || tour.name.en}`, 3000);
  }

  /** OBSERVE: a 25-second automatic sequence around one object. */
  observe(o) {
    if (!o || !o.getPosition) return;
    this.observing = true;
    this._begin(observeSteps(o, i18n.lang), 'observe', Math.max(this.time.effectiveSpeed, o.kind === 'planet' || o.kind === 'moon' ? 200 : 1));
  }

  _begin(steps, id, speed) {
    if (this.active) this._end();
    this.steps = steps; this.tourId = id;
    this.active = true; this.step = -1; this.phase = 'travel'; this.paused = false; this.cameraCtl.travelPaused = false;
    this.prevSpeed = this.time.effectiveSpeed;
    this.prevHz = this.ui.state.habitable;
    this.time.setSpeed(speed);
    this.cameraCtl.inputEnabled = false;
    document.getElementById('btn-tour').classList.add('active');
    this.engine.addSystem(this.sys);
    bus.emit('tour:begin', id);
    this._next();
  }

  _end() {
    this.active = false; this.phase = 'idle'; this.paused = false; this.cameraCtl.travelPaused = false;
    const i = this.engine.systems.indexOf(this.sys); if (i >= 0) this.engine.systems.splice(i, 1);
    this.cameraCtl.inputEnabled = true;
    if (this.cameraCtl.travel) { this.cameraCtl.travel.onArrive = null; }
    this.time.setSpeed(this.prevSpeed || 1);
    if (this._hzTurnedOn && !this.prevHz) { bus.emit('toggle', 'habitable', false); this._hzTurnedOn = false; }
    document.getElementById('btn-tour').classList.remove('active');
    this.ui.caption(null);
    bus.emit('tour:end');
  }

  stop(msg) {
    if (!this.active) return;
    this._end();
    if (msg) this.ui.toast(msg);
  }

  /** Pause / resume the sequence (the flight in progress freezes too). */
  togglePause() {
    if (!this.active) return;
    this.paused = !this.paused;
    this.cameraCtl.travelPaused = this.paused;
    if (this.paused) this.time.pause(); else this.time.resume();
    bus.emit('tour:state');
  }
  /** Jump to the next stop (skipping the current flight or dwell). */
  next() { if (!this.active) return; this._jump(this.step + 1); }
  /** Back to the previous stop. */
  prev() { if (!this.active) return; this._jump(Math.max(this.step - 1, 0)); }
  _jump(i) {
    if (i >= this.steps.length) { this._end(); this.ui.toast(t(this.observing ? 'tObserveDone' : 'tTourDone')); return; }
    this._skipping = true;
    if (this.cameraCtl.travel) { this.cameraCtl.travel.onArrive = null; this.cameraCtl.cancelTravel(); }
    this._skipping = false;
    if (this.paused) { this.paused = false; this.cameraCtl.travelPaused = false; this.time.resume(); }
    this.step = i - 1;
    this._next();
    bus.emit('tour:state');
  }
  get stepInfo() { const s = this.steps[this.step]; const o = s && this.registry.get(s.id); return { i: this.step + 1, n: this.steps.length, name: o ? i18n.name(o) : '', paused: this.paused }; }

  _next() {
    this.step++;
    if (this.step >= this.steps.length) { this._end(); this.ui.toast(t(this.observing ? 'tObserveDone' : 'tTourDone')); return; }
    const s = this.steps[this.step];
    const obj = this.registry.get(s.id);
    if (!obj) { this._next(); return; }
    this.current = s;
    this.phase = 'travel';
    this.ui.caption(null);
    if (s.hz && !this.ui.state.habitable) { bus.emit('toggle', 'habitable', true); this._hzTurnedOn = true; }
    bus.emit('select:request', obj);
    this.cameraCtl.travelTo(obj, { distance: s.dist, duration: s.duration, mode: CAM_MODE.ORBIT, onArrive: () => this._arrived() });
    bus.emit('tour:state');
  }

  _arrived() {
    if (!this.active) return;
    this.phase = 'dwell'; this.t = 0;
    const s = this.current;
    const cap = s.cap ? (s.cap[i18n.lang] || s.cap.en) : null;
    if (cap && (cap[0] || cap[1])) this.ui.caption(cap[0], cap[1]);
    // realistic flight would drift away from the scripted view: park the camera in orbit mode for the sequence
    if (this.cameraCtl.mode === CAM_MODE.SHIP) { this.cameraCtl.mode = CAM_MODE.ORBIT; this.cameraCtl.setMode(CAM_MODE.ORBIT, this.registry.get(s.id)); }
    this._phiTarget = s.phi != null ? s.phi : this.cameraCtl.orbit.phi;
  }

  update(dt) {
    if (!this.active) return;
    if (this.paused) return;
    if (this.phase === 'dwell') {
      this.t += dt;
      const o = this.cameraCtl.orbit, s = this.current;
      // gentle drift: azimuth at the step's rate, elevation eased toward the target with a slow breathing motion
      o.theta += s.orbit * dt;
      const breathe = Math.sin(this.t * 0.35) * (s.elevate || 0.06);
      o.phi = damp(o.phi, clamp(this._phiTarget + breathe, -1.3, 1.3), 1.2, dt);
      // slow dolly in during the dwell (5 % over the stop) for a cinematic feel
      o.distTarget *= Math.exp(-0.006 * dt);
      if (this.t > s.dwell) this._next();
    }
  }
}
