import * as THREE from 'three';
import { AU, KM, LY } from '../core/Units.js';

// Realistic flight: the camera is a ship with mass-less thrusters in a real
// gravitational field. Velocity is integrated against SIMULATION time (so the
// time controls make orbits visible), gravity comes from every body that has a
// mass (Sun, planets, moons, dwarfs, stars, Sgr A*), and the predicted path is
// the exact two-body conic around the dominant attractor.
//
// Units: scene unit = 1000 km. G in scene units = 6.674e-11 / (1e6)^3.
export const G_SCENE = 6.674e-11 / 1e18;          // units^3 / (kg s^2)
export const GM_SUN = G_SCENE * 1.9885e30;         // ≈ 132.7 units^3/s^2
const MSUN = 1.9885e30;

export class ShipPhysics {
  constructor(registry, time) {
    this.registry = registry; this.time = time;
    this.velocity = new THREE.Vector3();          // units per simulated second
    this.thrust = new THREE.Vector3();            // requested acceleration direction (ship frame), |t| ≤ 1
    this.thrustAccel = 9.81;                      // m/s² at full throttle (1 g)
    this.boost = 1;
    this.enginesOn = true;
    this.gravity = new THREE.Vector3();           // last gravitational acceleration (units/s²)
    this.dominant = null;                         // body with the largest acceleration on us
    this.dominantAccel = 0;
    this.landed = false;
    this.speedLimited = false;
    this.maxSubsteps = 96;
    this._tmp = new THREE.Vector3(); this._tmp2 = new THREE.Vector3(); this._rel = new THREE.Vector3(); this._vrel = new THREE.Vector3();
    this._attractors = [];
    this._attrFrame = -1;
  }

  /** Bodies that pull on the ship. Cached per frame; stars are included with a mass estimated from luminosity. */
  attractors(pos) {
    const out = this._attractors; out.length = 0;
    for (const o of this.registry.objects) {
      if (!o.getPosition) continue;
      let gm = o.gm;
      if (gm == null) {
        if (o.massKg) gm = o.massKg * G_SCENE;
        else if (o.kind === 'star' && o.lum != null) gm = Math.pow(Math.max(o.lum, 1e-4), 1 / 3.5) * MSUN * G_SCENE;
        else if (o.kind === 'blackhole') gm = 4.297e6 * MSUN * G_SCENE;
        else if (o.kind === 'sun') gm = GM_SUN;
        else gm = 0;
        o.gm = gm;
      }
      if (gm <= 0) continue;
      // cheap reject: influence negligible beyond ~1 ly for stars, everything counts inside the Solar System
      const p = o.getPosition(this._tmp);
      const d2 = p.distanceToSquared(pos);
      if (o.kind === 'star' && d2 > (2 * LY) * (2 * LY)) continue;
      if (gm / d2 < 1e-16) continue;
      out.push(o);
    }
    return out;
  }

  /** Gravitational acceleration at pos (units/s²); also tracks the dominant attractor. */
  accel(pos, out, track = false) {
    out.set(0, 0, 0);
    let best = null, bestA = 0;
    for (const o of this._attractors) {
      const p = o.getPosition(this._tmp);
      const d = this._tmp2.copy(p).sub(pos);
      const r2 = Math.max(d.lengthSq(), 1e-12);
      const r = Math.sqrt(r2);
      const a = o.gm / r2;
      out.addScaledVector(d, a / r);
      if (track && a > bestA) { bestA = a; best = o; }
    }
    if (track) { this.dominant = best; this.dominantAccel = bestA; }
    return out;
  }

  /**
   * Integrate one real frame. pos is the ship position (float64 Vector3, modified in place).
   * shipQuat gives the thrust frame. dtReal in seconds. Returns simulated seconds advanced.
   */
  step(pos, shipQuat, dtReal) {
    const speed = this.time.effectiveSpeed;
    if (speed === 0) return 0;
    let dtSim = dtReal * speed;
    this.attractors(pos);
    this.accel(pos, this.gravity, true);
    // substep so that the dominant orbit is sampled finely (Δt ≤ 1/120 of the local period)
    let n = 1;
    if (this.dominant) {
      const p = this.dominant.getPosition(this._tmp); const r = Math.max(p.distanceTo(pos), 1e-6);
      const T = 2 * Math.PI * Math.sqrt(r * r * r / this.dominant.gm);
      n = Math.ceil(dtSim / (T / 120));
    }
    this.speedLimited = false;
    if (n > this.maxSubsteps) { dtSim *= this.maxSubsteps / n; n = this.maxSubsteps; this.speedLimited = true; }
    const h = dtSim / n;
    // thrust in world frame (m/s² -> units/s²: 1 unit = 1e6 m)
    const thrustW = this._vrel.copy(this.thrust).applyQuaternion(shipQuat).multiplyScalar(this.enginesOn ? this.thrustAccel * this.boost / 1e6 : 0);
    const a = this._rel;
    for (let i = 0; i < n; i++) {
      // velocity Verlet (kick-drift-kick)
      this.accel(pos, a).add(thrustW);
      this.velocity.addScaledVector(a, h * 0.5);
      pos.addScaledVector(this.velocity, h);
      this.accel(pos, a).add(thrustW);
      this.velocity.addScaledVector(a, h * 0.5);
    }
    // surface collision with the dominant body (soft landing: stop relative motion)
    this.landed = false;
    if (this.dominant && this.dominant.radius) {
      const p = this.dominant.getPosition(this._tmp);
      const d = this._tmp2.copy(pos).sub(p);
      const minR = this.dominant.radius * (this.dominant.kind === 'sun' || this.dominant.kind === 'star' ? 1.02 : 1.0002);
      if (d.length() < minR) {
        pos.copy(p).addScaledVector(d.normalize(), minR);
        const bv = this.bodyVelocity(this.dominant, this._vrel);
        this.velocity.copy(bv);
        this.landed = true;
      }
    }
    return dtSim;
  }

  /** Velocity of a body (units/s), if it publishes one. */
  bodyVelocity(o, out) { if (o && o.getVelocity) return o.getVelocity(out); return out.set(0, 0, 0); }

  /** Set the ship into a circular orbit around body at the current position (prograde in the body's orbital plane). */
  circularize(pos, body) {
    const p = body.getPosition(this._tmp);
    const r = this._rel.copy(pos).sub(p);
    const d = r.length(); if (d < 1e-9) return;
    const n = body.orbitNormal ? body.orbitNormal : (body.pole || new THREE.Vector3(0, 1, 0));
    const tangent = this._tmp2.crossVectors(n, r).normalize();
    if (tangent.lengthSq() < 1e-6) tangent.set(1, 0, 0);
    const v = Math.sqrt(body.gm / d);
    this.velocity.copy(this.bodyVelocity(body, this._vrel)).addScaledVector(tangent, v);
    this.landed = false;
  }

  /** Match the body's velocity (station keeping). */
  matchVelocity(body) { this.bodyVelocity(body, this.velocity); }

  /**
   * Orbital state relative to the dominant body: speed, specific energy, periapsis/apoapsis, eccentricity, period.
   */
  orbitState(pos) {
    const b = this.dominant; if (!b) return null;
    const p = b.getPosition(this._tmp);
    const r = this._rel.copy(pos).sub(p);
    const v = this._vrel.copy(this.velocity).sub(this.bodyVelocity(b, this._tmp2));
    const rl = r.length(), v2 = v.lengthSq(), mu = b.gm;
    const eps = v2 / 2 - mu / rl;
    const h = new THREE.Vector3().crossVectors(r, v);
    const evec = new THREE.Vector3().crossVectors(v, h).multiplyScalar(1 / mu).sub(r.clone().multiplyScalar(1 / rl));
    const e = evec.length();
    const a = eps < 0 ? -mu / (2 * eps) : Infinity;
    const peri = (h.lengthSq() / mu) / (1 + e);
    const apo = e < 1 ? a * (1 + e) : Infinity;
    const T = e < 1 ? 2 * Math.PI * Math.sqrt(a * a * a / mu) : Infinity;
    const vEsc = Math.sqrt(2 * mu / rl), vCirc = Math.sqrt(mu / rl);
    return { body: b, r: rl, speed: Math.sqrt(v2), relSpeed: Math.sqrt(v2), eps, e, a, peri, apo, T, vEsc, vCirc, bound: eps < 0, h, evec };
  }

  /** Sample the predicted conic around the dominant body into `out` (Float32Array, n*3) in world coords (relative to camera position `camPos` for float precision). */
  predictPath(pos, out, n, camPos) {
    const st = this.orbitState(pos); if (!st) return 0;
    const b = st.body; const p = b.getPosition(this._tmp);
    const mu = b.gm; const h = st.h; const hl = h.length(); if (hl < 1e-9) return 0;
    const e = st.e;
    // perifocal frame
    const ex = e > 1e-6 ? st.evec.clone().normalize() : this._rel.copy(pos).sub(p).normalize();
    const ez = h.clone().normalize();
    const ey = new THREE.Vector3().crossVectors(ez, ex);
    const pParam = hl * hl / mu;
    // current true anomaly
    const rNow = this._rel.copy(pos).sub(p);
    const nu0 = Math.atan2(rNow.dot(ey), rNow.dot(ex));
    const maxNu = e < 1 ? Math.PI : Math.acos(-1 / e) * 0.985;   // hyperbola: stop before the asymptote
    let k = 0;
    for (let i = 0; i < n; i++) {
      const nu = e < 1 ? nu0 + (i / (n - 1)) * 2 * Math.PI : -maxNu + (i / (n - 1)) * 2 * maxNu;
      const rr = pParam / (1 + e * Math.cos(nu));
      if (!(rr > 0) || rr > 1e14) continue;
      const x = p.x + (ex.x * Math.cos(nu) + ey.x * Math.sin(nu)) * rr - camPos.x;
      const y = p.y + (ex.y * Math.cos(nu) + ey.y * Math.sin(nu)) * rr - camPos.y;
      const z = p.z + (ex.z * Math.cos(nu) + ey.z * Math.sin(nu)) * rr - camPos.z;
      out[k * 3] = x; out[k * 3 + 1] = y; out[k * 3 + 2] = z; k++;
    }
    return k;
  }
}

/** Human-readable speed in km/s or fraction of c. */
export function fmtSpeedKms(unitsPerS) {
  const kms = unitsPerS * 1000;
  const c = 299792.458;
  if (kms >= 0.01 * c) return `${(kms / c).toFixed(3)} c`;
  if (kms >= 1000) return `${Math.round(kms).toLocaleString('en-US')} km/s`;
  if (kms >= 1) return `${kms.toFixed(2)} km/s`;
  return `${(kms * 1000).toFixed(1)} m/s`;
}
