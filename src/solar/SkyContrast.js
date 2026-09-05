import * as THREE from 'three';

// Artistic adaptation for the renderer's compressed HDR range, not photometry.
// Estimate the lit disc area in the view on the CPU; no GPU readback, new pass,
// or dependence on selection/distance-to-Sun. A night hemisphere stays dark.
export class SkyContrast {
  constructor() {
    this.value = 1;
    this.coverage = 0;
    this._view = new THREE.Vector3();
    this._toCamera = new THREE.Vector3();
    this._sun = new THREE.Vector3();
    this._inverse = new THREE.Quaternion();
  }

  update(dt, camera, camPos, bodies, sun, settings) {
    if (!settings.autoExposure) { this.value = 1; return this.value; }
    if (settings.exposureLock) return this.value;
    const hy = THREE.MathUtils.degToRad(camera.fov) * 0.5;
    const hx = Math.atan(Math.tan(hy) * camera.aspect);
    this._inverse.copy(camera.quaternion).invert();
    let coverage = 0;
    for (const b of bodies) {
      if (!b.renderer && b !== sun) continue;
      const toCamera = this._toCamera.copy(camPos).sub(b.position);
      const d = toCamera.length();
      if (d <= b.radius) continue;
      const a = Math.asin(Math.min(b.radius / d, 1));
      if (a < 0.001) continue;
      const v = this._view.copy(toCamera).negate().applyQuaternion(this._inverse);
      const x = Math.atan2(v.x, -v.z), y = Math.atan2(v.y, Math.hypot(v.x, v.z));
      const wx = Math.max(0, Math.min(x + a, hx) - Math.max(x - a, -hx));
      const wy = Math.max(0, Math.min(y + a, hy) - Math.max(y - a, -hy));
      if (wx === 0 || wy === 0) continue;
      let phase = 1;
      if (b !== sun) {
        const cos = THREE.MathUtils.clamp(toCamera.multiplyScalar(1 / d).dot(this._sun.copy(sun.position).sub(b.position).normalize()), -1, 1);
        const angle = Math.acos(cos);
        phase = (Math.sin(angle) + (Math.PI - angle) * cos) / Math.PI;
      } else {
        // Do not darken the star field for a Sun hidden behind a planet.
        let visible = 1;
        const dir = toCamera.multiplyScalar(-1 / d);
        for (const occ of bodies) {
          if (occ === sun || !occ.renderer) continue;
          const p = this._sun.copy(occ.position).sub(camPos), along = p.dot(dir);
          if (along <= 0 || along >= d) continue;
          const sep = p.addScaledVector(dir, -along).length() / along;
          visible *= THREE.MathUtils.smoothstep(sep, Math.max(0, occ.radius / along - a), occ.radius / along + a);
        }
        phase = visible * 80;
      }
      coverage += Math.min(1, Math.PI * wx * wy / (16 * hx * hy)) * phase;
    }
    this.coverage = coverage;
    const target = 0.035 + 0.965 * Math.exp(-28 * coverage);
    const rate = target < this.value ? 3.5 : 0.8;
    this.value += (target - this.value) * (1 - Math.exp(-rate * Math.min(dt, 0.1)));
    return this.value;
  }
}
