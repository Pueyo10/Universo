// Pure controller, fed one averaged timing window (~0.6 s) at a time.
// Degrade only the expensive subsystem; recover slowly to avoid oscillation.
export class AdaptiveQuality {
  constructor() { this.reset(); }
  reset() {
    this.scene = 1; this.volume = 1; this.steps = 1; this.bloom = 1; this.particles = 1;
    this.lastChange = 0; this.recoverAfter = 0; this.reason = 'initial';
  }
  update({ time, gpu, wall, cpu, stages = {}, minScene = 0.5, volumeActive = false }) {
    if (time - this.lastChange < 0.6) return false;
    const overloaded = gpu != null ? gpu > 15.5 : wall > 17.8 && cpu < 11;
    if (overloaded) {
      let changed = false;
      const volumeHeavy = volumeActive && (gpu == null || (stages.volume || 0) > gpu * 0.3);
      if (volumeHeavy && this.volume > 0.55) {
        this.volume = Math.max(0.55, this.volume * 0.85); this.reason = 'volume'; changed = true;
      } else if ((stages.post || 0) > (gpu || Infinity) * 0.35 && this.bloom > 0.5) {
        this.bloom = Math.max(0.5, this.bloom * 0.85); this.reason = 'post'; changed = true;
      } else if (this.scene < 0.8 && (stages.scene || 0) > (gpu || Infinity) * 0.45 && this.particles > 0.5) {
        this.particles = Math.max(0.5, this.particles * 0.85); this.reason = 'particles'; changed = true;
      } else if (this.scene > minScene) {
        const factor = gpu == null ? 0.85 : Math.max(0.7, Math.min(0.95, Math.sqrt(13 / gpu)));
        this.scene = Math.max(minScene, this.scene * factor); this.reason = 'scene'; changed = true;
      } else if (volumeActive && this.steps > 0.6) {
        this.steps = Math.max(0.6, this.steps - 0.1); this.reason = 'volume steps'; changed = true;
      }
      if (changed) { this.lastChange = time; this.recoverAfter = time + 6; }
      return changed;
    }
    const headroom = gpu != null ? gpu < 10 : wall < 17.2 && cpu < 8;
    if (!headroom || time < this.recoverAfter || time - this.lastChange < 4) return false;
    for (const key of ['scene', 'volume', 'steps', 'bloom', 'particles']) {
      if (this[key] < 1) {
        this[key] = Math.min(1, this[key] * 1.08); this.lastChange = time;
        this.recoverAfter = time + (gpu == null ? 10 : 4); this.reason = 'recover ' + key;
        return true;
      }
    }
    return false;
  }
}
