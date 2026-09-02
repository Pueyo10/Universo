import { bus } from '../core/EventBus.js';
import { DAY_MS, J2000_MS } from '../core/Units.js';

export const SPEED_STEPS = [0, 1, 10, 100, 1000, 10000, 100000, 1000000, 10000000];

export class TimeManager {
  constructor() {
    this.simMs = Date.now();
    this.speed = 1;
    this._lastSpeed = 1;
    this.paused = false;
    this.elapsed = 0;
  }
  get daysSinceJ2000() { return (this.simMs - J2000_MS) / DAY_MS; }
  get centuries() { return (this.simMs - J2000_MS) / (DAY_MS * 36525); }
  get effectiveSpeed() { return this.paused ? 0 : this.speed; }
  update(dt) {
    this.elapsed += dt;
    if (!this.paused) this.simMs += dt * 1000 * this.speed;
  }
  setSpeed(s) {
    if (s === 0) { this.pause(); return; }
    this.speed = s; this.paused = false; this._lastSpeed = s;
    bus.emit('time:speed', this.effectiveSpeed);
  }
  pause() { this.paused = true; bus.emit('time:speed', 0); }
  resume() { this.paused = false; if (this.speed === 0) this.speed = this._lastSpeed || 1; bus.emit('time:speed', this.effectiveSpeed); }
  toggle() { this.paused ? this.resume() : this.pause(); }
  faster() {
    const i = SPEED_STEPS.indexOf(this.paused ? 0 : this.speed);
    const n = Math.min(SPEED_STEPS.length - 1, (i < 0 ? 1 : i) + 1);
    this.setSpeed(SPEED_STEPS[n]);
  }
  slower() {
    const i = SPEED_STEPS.indexOf(this.paused ? 0 : this.speed);
    const n = Math.max(0, (i < 0 ? 1 : i) - 1);
    this.setSpeed(SPEED_STEPS[n]);
  }
  setNow() { this.simMs = Date.now(); bus.emit('time:set'); }
}
