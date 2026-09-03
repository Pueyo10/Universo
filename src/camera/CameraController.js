import * as THREE from 'three';
import { bus } from '../core/EventBus.js';
import { clamp, damp, lerp, smoothstep, LY, AU } from '../core/Units.js';
import { ShipPhysics } from '../physics/ShipPhysics.js';

export const CAM_MODE = { FREE: 'FREE', SHIP: 'SHIP', ORBIT: 'ORBIT', FOLLOW: 'FOLLOW', TRAVEL: 'TRAVEL', CINEMATIC: 'CINEMATIC' };

const MAJOR_KINDS = new Set(['sun', 'star', 'planet', 'dwarf', 'moon', 'blackhole']);
const easeInOut = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

// Camera controller with free flight, orbit, follow (orbital-frame chase),
// scale-aware speeds and cinematic travel in log-distance space.
export class CameraController {
  constructor(engine, registry, canvas, time = null) {
    this.engine = engine;
    this.camera = engine.camera;
    this.registry = registry;
    this.canvas = canvas;
    this.time = time;
    this.mode = CAM_MODE.FREE;
    // REALISTIC FLIGHT PHYSICS: a ship with inertia, thrust and real gravity (see physics/ShipPhysics)
    this.ship = time ? new ShipPhysics(registry, time) : null;
    this.flightRealistic = false;        // when true, "free" flight means the ship
    this.roll = 0;                       // camera roll (photo mode / cinematic)
    this.position = new THREE.Vector3(0, 0, 0);          // float64 world position
    this.quaternion = new THREE.Quaternion();
    this.yaw = 0; this.pitch = 0;                          // free-look
    this.velocity = new THREE.Vector3();
    this.keys = new Set();
    this.mouse = { x: 0, y: 0, dx: 0, dy: 0, down: false, button: 0, moved: 0 };
    this.sensitivity = 1.0;
    this.invertY = false;
    this.target = null;                                    // registry object
    this.orbit = { theta: 0, phi: 0.35, dist: 10, thetaV: 0, phiV: 0, distTarget: 10 };
    this.followOffset = new THREE.Vector3();
    this.speedScale = 1;                                   // units/sec base
    this.nearest = { obj: null, dist: Infinity, centerDist: Infinity };
    this.travel = null;
    this.enabled = true;
    this.inputEnabled = true;
    this.warp = 0;
    this.fovMul = 1;
    this.currentSpeed = 0;
    this._lastPos = new THREE.Vector3();
    this._tmp = new THREE.Vector3(); this._tmp2 = new THREE.Vector3(); this._tmp3 = new THREE.Vector3();
    this._q = new THREE.Quaternion(); this._q2 = new THREE.Quaternion();
    this._m = new THREE.Matrix4();
    this.up = new THREE.Vector3(0, 1, 0);
    this.wheelAccum = 0;
    this._bind();
  }

  // ------------------------------------------------------------- input
  _bind() {
    const c = this.canvas;
    c.addEventListener('contextmenu', e => e.preventDefault());
    c.addEventListener('pointerdown', e => {
      if (!this.inputEnabled) return;
      this.mouse.down = true; this.mouse.button = e.button; this.mouse.moved = 0;
      this.mouse.x = e.clientX; this.mouse.y = e.clientY;
      c.setPointerCapture(e.pointerId);
      c.focus();
    });
    c.addEventListener('pointermove', e => {
      if (!this.mouse.down) return;
      const dx = e.clientX - this.mouse.x, dy = e.clientY - this.mouse.y;
      this.mouse.x = e.clientX; this.mouse.y = e.clientY;
      this.mouse.moved += Math.abs(dx) + Math.abs(dy);
      if (!this.inputEnabled) return;
      this._look(dx, dy);
    });
    const up = e => { this.mouse.down = false; try { c.releasePointerCapture(e.pointerId); } catch (_) { } };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('wheel', e => {
      e.preventDefault();
      if (!this.inputEnabled) return;
      const d = Math.sign(e.deltaY) * clamp(Math.abs(e.deltaY) / 100, 0.3, 3);
      this.wheelAccum += d;
    }, { passive: false });
    window.addEventListener('keydown', e => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA')) return;
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  _look(dx, dy) {
    const s = 0.0022 * this.sensitivity;
    const iy = this.invertY ? -1 : 1;
    if (this.mode === CAM_MODE.FREE || this.mode === CAM_MODE.SHIP) {
      this.yaw -= dx * s; this.pitch -= dy * s * iy;
      this.pitch = clamp(this.pitch, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
    } else if (this.mode === CAM_MODE.ORBIT || this.mode === CAM_MODE.FOLLOW) {
      this.orbit.thetaV -= dx * s * 1.2; this.orbit.phiV += dy * s * 1.2 * iy;
    } else if (this.mode === CAM_MODE.TRAVEL) {
      // allow gentle look-around while travelling: cancel travel if dragged a lot
      if (this.mouse.moved > 60) this.cancelTravel();
    }
  }

  // ------------------------------------------------------------- modes
  setMode(mode, target = null) {
    const prev = this.mode;
    if (target) this.target = target;
    if ((mode === CAM_MODE.ORBIT || mode === CAM_MODE.FOLLOW) && !this.target) mode = CAM_MODE.FREE;
    if (mode === CAM_MODE.FREE && this.flightRealistic && this.ship) mode = CAM_MODE.SHIP;
    if (mode === CAM_MODE.SHIP && !this.ship) mode = CAM_MODE.FREE;
    if (mode === CAM_MODE.SHIP && prev !== CAM_MODE.SHIP) this._enterShip(prev);
    this.mode = mode;
    if (mode === CAM_MODE.ORBIT || mode === CAM_MODE.FOLLOW) {
      // derive orbit params from current pose
      const tp = this.target.getPosition(this._tmp);
      const off = this._tmp2.copy(this.position).sub(tp);
      const d = Math.max(off.length(), this.target.radius * 1.001);
      const frame = this._frameFor(this.target, mode);
      const local = off.clone().applyMatrix4(frame.inv);
      this.orbit.dist = d; this.orbit.distTarget = d;
      this.orbit.theta = Math.atan2(local.x, local.z);
      this.orbit.phi = Math.asin(clamp(local.y / d, -1, 1));
      this.orbit.thetaV = 0; this.orbit.phiV = 0;
    } else if (mode === CAM_MODE.FREE || mode === CAM_MODE.SHIP) {
      this._syncYawPitchFromQuat();
    }
    if (prev !== mode) bus.emit('camera:mode', mode);
  }

  /** Switch flight model. Realistic: inertia + gravity; exploration: damped free camera. */
  setFlightRealistic(v) {
    this.flightRealistic = !!v;
    if (v && (this.mode === CAM_MODE.FREE || this.mode === CAM_MODE.ORBIT || this.mode === CAM_MODE.FOLLOW)) this.setMode(CAM_MODE.SHIP, this.target);
    else if (this.mode === CAM_MODE.SHIP && !v) { this.mode = CAM_MODE.FREE; this.velocity.set(0, 0, 0); bus.emit('camera:mode', this.mode); }
    bus.emit('flight:mode', this.flightRealistic);
  }

  /** Entering ship mode: start co-moving with the body we are closest to (or orbiting), so nothing lurches. */
  _enterShip(prev) {
    const sh = this.ship;
    sh.attractors(this.position); sh.accel(this.position, sh.gravity, true);
    const ref = (prev === CAM_MODE.ORBIT || prev === CAM_MODE.FOLLOW) && this.target ? this.target : (sh.dominant || this.nearest.obj);
    if (ref && ref.gm) {
      // if we were orbiting a body at a sensible distance, insert into a circular orbit; otherwise just co-move
      const d = ref.getPosition(this._tmp).distanceTo(this.position);
      if ((prev === CAM_MODE.ORBIT || prev === CAM_MODE.FOLLOW) && d < (ref.radius || 0) * 200) sh.circularize(this.position, ref);
      else sh.matchVelocity(ref);
    } else sh.velocity.set(0, 0, 0);
    sh.thrust.set(0, 0, 0);
  }

  _syncYawPitchFromQuat() {
    const f = this._tmp.set(0, 0, -1).applyQuaternion(this.quaternion);
    this.yaw = Math.atan2(-f.x, -f.z);
    this.pitch = Math.asin(clamp(f.y, -1, 1));
  }

  /** Reference frame for orbiting: world for ORBIT, orbital frame (radial/normal/tangential) for FOLLOW. */
  _frameFor(obj, mode) {
    const m = this._m.identity();
    if (mode === CAM_MODE.FOLLOW && obj.parent && obj.parent.getPosition) {
      const p = obj.getPosition(new THREE.Vector3());
      const pp = obj.parent.getPosition(new THREE.Vector3());
      const radial = p.sub(pp).normalize();
      const normal = obj.orbitNormal ? obj.orbitNormal.clone() : new THREE.Vector3(0, 1, 0);
      const tangent = new THREE.Vector3().crossVectors(normal, radial).normalize();
      normal.crossVectors(radial, tangent).normalize();
      m.makeBasis(tangent, normal, radial);
    }
    return { m, inv: m.clone().invert() };
  }

  // ------------------------------------------------------------- travel
  /**
   * Cinematic travel to an object. opts: {distance (units of radius or absolute via absDistance), duration, onArrive, mode, dir}
   */
  travelTo(obj, opts = {}) {
    if (!obj || !obj.getPosition) return;
    const tp = obj.getPosition(new THREE.Vector3());
    const d0 = Math.max(this.position.distanceTo(tp), obj.radius * 1.0001);
    const radiusMul = opts.distance ?? this._defaultViewDistance(obj);
    const d1 = opts.absDistance ?? Math.max(obj.radius * radiusMul, obj.minViewDistance || 0);
    const ratio = Math.abs(Math.log10(Math.max(d0, 1e-6) / Math.max(d1, 1e-6)));
    const duration = opts.duration ?? clamp(2.2 + ratio * 0.95, 2.5, 13);
    const startDir = this._tmp.copy(this.position).sub(tp).normalize();
    if (!isFinite(startDir.x)) startDir.set(0, 0.2, 1).normalize();
    const endDir = opts.dir ? opts.dir.clone().normalize() : this._niceApproachDir(obj, startDir);
    this.travel = {
      obj, t: 0, duration, d0, d1, startDir: startDir.clone(), endDir, startQuat: this.quaternion.clone(),
      onArrive: opts.onArrive, endMode: opts.mode || CAM_MODE.ORBIT, ratio, startPos: this.position.clone(),
      lookOffset: opts.lookOffset || 0,
    };
    this.target = obj;
    this.mode = CAM_MODE.TRAVEL;
    bus.emit('camera:mode', this.mode);
    bus.emit('camera:travel', obj);
  }

  _defaultViewDistance(obj) {
    switch (obj.kind) {
      case 'galaxy': return 2.6;
      case 'region': return 2.2;
      case 'nebula': return 2.4;
      case 'blackhole': return 18;
      case 'star': return 12;
      case 'sun': return 6;
      case 'spacecraft': return 12;
      case 'moon': return 4.5;
      case 'planet': return obj.hasRings ? 5.5 : 4.2;
      default: return 4;
    }
  }

  /** Choose an approach direction lit by the Sun (for solar bodies) or offset from the start direction. */
  _niceApproachDir(obj, startDir) {
    const dir = startDir.clone();
    if (obj.lightDir) {
      // lightDir: direction from object toward the light source (Sun)
      const l = obj.lightDir(new THREE.Vector3());
      // aim from the sunlit side, slightly above and to the side
      const side = new THREE.Vector3().crossVectors(l, this.up).normalize();
      if (!isFinite(side.x) || side.lengthSq() < 0.01) side.set(1, 0, 0);
      dir.copy(l).multiplyScalar(0.72).addScaledVector(side, 0.62).addScaledVector(this.up, 0.30).normalize();
      // keep continuity: blend a bit toward start dir when they are not opposite
      if (dir.dot(startDir) > -0.2) dir.lerp(startDir, 0.25).normalize();
    } else if (obj.axis) {
      // objects with a disc/axis (galaxies, black hole): approach from a pleasing elevation above the plane
      const axis = obj.axis.clone().normalize();
      if (axis.dot(startDir) < 0) axis.negate();
      const side = startDir.clone().sub(axis.clone().multiplyScalar(startDir.dot(axis)));
      if (side.lengthSq() < 1e-6) side.set(1, 0, 0).sub(axis.clone().multiplyScalar(axis.x));
      side.normalize();
      const el = obj.approachElevation ?? 0.62;
      dir.copy(side).multiplyScalar(Math.cos(el)).addScaledVector(axis, Math.sin(el)).normalize();
    } else {
      // tilt above the plane a bit
      dir.addScaledVector(this.up, 0.35).normalize();
    }
    return dir;
  }

  cancelTravel() {
    if (!this.travel) return;
    const t = this.travel; this.travel = null;
    this.warp = 0;
    this.setMode(t.obj ? CAM_MODE.ORBIT : CAM_MODE.FREE, t.obj);
    bus.emit('camera:travel:cancel');
  }

  _updateTravel(dt) {
    const tr = this.travel;
    if (this.travelPaused) return;
    tr.t += dt;
    const u = clamp(tr.t / tr.duration, 0, 1);
    const e = easeInOut(u);
    const tp = tr.obj.getPosition(this._tmp3);
    const d = Math.exp(lerp(Math.log(tr.d0), Math.log(tr.d1), e));
    // direction: slerp from start to end dir (as quaternion rotation between vectors)
    const dir = this._tmp.copy(tr.startDir);
    const qd = this._q.setFromUnitVectors(tr.startDir, tr.endDir);
    const qi = this._q2.identity().slerp(qd, easeInOut(clamp(u * 1.15, 0, 1)));
    dir.applyQuaternion(qi).normalize();
    this.position.copy(tp).addScaledVector(dir, d);
    // orientation: look at target; blend from start quaternion during the first part
    const lookQ = this._q.setFromRotationMatrix(this._m.lookAt(this.position, tp, this.up));
    const blend = smoothstep(0, 0.3, u);
    this.quaternion.copy(tr.startQuat).slerp(lookQ, blend);
    // speed metrics (log-space speed) for warp/FOV effects
    const speedLog = Math.abs(Math.log(tr.d0 / tr.d1)) * (u < 0.5 ? 12 * u * u : 12 * (1 - u) * (1 - u)) / tr.duration; // derivative of ease
    const warpTarget = clamp(speedLog / 3.0, 0, 1) * clamp(tr.ratio / 4, 0, 1);
    this.warp = damp(this.warp, warpTarget, 6, dt);
    this.fovMul = 1 - 0.28 * this.warp;
    if (u >= 1) {
      const { obj, onArrive, endMode } = tr;
      this.travel = null;
      this.warp = 0;
      if (this.flightRealistic && this.ship && (endMode === CAM_MODE.ORBIT || endMode === CAM_MODE.FREE)) {
        // realistic flight: arrive in a real orbit around the destination (or co-moving if it has no mass)
        this.mode = CAM_MODE.ORBIT; this.target = obj;
        this.setMode(CAM_MODE.SHIP, obj);
      } else this.setMode(endMode, obj);
      bus.emit('camera:arrive', obj);
      if (onArrive) onArrive();
    }
  }

  // ------------------------------------------------------------- per-frame
  update(dt) {
    if (!this.enabled) return;
    this._lastPos.copy(this.position);
    // nearest body for scale-aware speed
    this.registry.nearest(this.position, o => o.kind !== 'region' && o.kind !== 'galaxy' && o.kind !== 'nebula' && o.kind !== 'cluster', this.nearest);
    const surf = Math.max(this.nearest.dist, 1e-3);
    // base speed: a fraction of distance to nearest surface per second, with floor
    this.speedScale = Math.max(surf * 0.9, 0.05);

    if (this.mode === CAM_MODE.TRAVEL && this.travel) {
      this._updateTravel(dt);
    } else if (this.mode === CAM_MODE.FREE) {
      this._updateFree(dt);
      this.warp = damp(this.warp, 0, 5, dt);
      this.fovMul = damp(this.fovMul, 1, 5, dt);
    } else if (this.mode === CAM_MODE.SHIP) {
      this._updateShip(dt);
      this.warp = damp(this.warp, 0, 5, dt);
      this.fovMul = damp(this.fovMul, 1, 5, dt);
    } else if (this.mode === CAM_MODE.ORBIT || this.mode === CAM_MODE.FOLLOW) {
      this._updateOrbit(dt);
      this.warp = damp(this.warp, 0, 5, dt);
      this.fovMul = damp(this.fovMul, 1, 5, dt);
    } else if (this.mode === CAM_MODE.CINEMATIC) {
      // driven externally
      this.fovMul = damp(this.fovMul, this.cinematicFov || 1, 3, dt);
    }
    this.wheelAccum = 0;
    this.camera.position.copy(this.position);
    this.camera.quaternion.copy(this.quaternion);
    if (this.roll) this.camera.quaternion.multiply(this._q2.setFromAxisAngle(this._tmp.set(0, 0, 1), this.roll));
    this.camera.updateMatrixWorld(true);
    this.engine.fovMultiplier = this.fovMul;
    this.currentSpeed = this.position.distanceTo(this._lastPos) / Math.max(dt, 1e-4);
  }

  _updateFree(dt) {
    // orientation from yaw/pitch
    this.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    const k = this.keys;
    const dir = this._tmp.set(0, 0, 0);
    if (k.has('KeyW') || k.has('ArrowUp')) dir.z -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) dir.z += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) dir.x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) dir.x += 1;
    if (k.has('KeyE') || k.has('Space') && false) dir.y += 1;
    if (k.has('KeyQ')) dir.y -= 1;
    let boost = 1;
    if (k.has('ShiftLeft') || k.has('ShiftRight')) boost *= 6;
    if (k.has('ControlLeft') || k.has('ControlRight')) boost *= 0.12;
    if (dir.lengthSq() > 0) {
      dir.normalize().applyQuaternion(this.quaternion);
      const target = dir.multiplyScalar(this.speedScale * boost);
      this.velocity.lerp(target, 1 - Math.exp(-6 * dt));
    } else {
      this.velocity.multiplyScalar(Math.exp(-5 * dt));
    }
    // wheel: log-zoom toward the pointed direction (or hovered/selected target)
    if (this.wheelAccum !== 0) {
      const fwd = this._tmp2.set(0, 0, -1).applyQuaternion(this.quaternion);
      const step = -this.wheelAccum * 0.15;
      const z = this.zoomTarget && this.zoomTarget.getPosition ? this.zoomTarget.getPosition(this._tmp3) : null;
      if (z) {
        const off = this._tmp.copy(this.position).sub(z);
        const d = off.length();
        const minD = (this.zoomTarget.radius || 0) * 1.05;
        const nd = Math.max(minD, d * Math.exp(-step));
        this.position.copy(z).addScaledVector(off.normalize(), nd);
      } else {
        this.velocity.addScaledVector(fwd, step * this.speedScale * 5);
      }
    }
    this.position.addScaledVector(this.velocity, dt);
    // keep out of bodies
    this._collide();
  }

  /** Realistic flight: thrusters + gravity integrated against simulated time. */
  _updateShip(dt) {
    const sh = this.ship;
    this.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    const k = this.keys;
    const th = sh.thrust.set(0, 0, 0);
    if (k.has('KeyW') || k.has('ArrowUp')) th.z -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) th.z += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) th.x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) th.x += 1;
    if (k.has('KeyE')) th.y += 1;
    if (k.has('KeyQ')) th.y -= 1;
    if (th.lengthSq() > 0) th.normalize();
    sh.boost = (k.has('ShiftLeft') || k.has('ShiftRight')) ? 10 : (k.has('ControlLeft') || k.has('ControlRight')) ? 0.1 : 1;
    // flight assist: reference = nearest major body (planets, moons, stars — not probes or asteroids); thrust and the speed cap scale with
    // the distance to its surface, so the ship answers the stick at 1× time and eases off as a world fills the window
    const nm = this.registry.nearest(this.position, o => MAJOR_KINDS.has(o.kind), this._nearMajor || (this._nearMajor = { obj: null, dist: Infinity, centerDist: Infinity }));
    const dRef = Math.max(nm.dist, 0.02);
    sh.assistBody = nm.obj; sh.assist = dRef * 0.8; sh.assistVmax = dRef * 2.0;
    // brake: Space kills the velocity relative to the dominant body (same as X)
    if (k.has('Space') && sh.dominant) sh.matchVelocity(sh.dominant);
    // wheel: throttle (thrust acceleration) in log steps, 0.1 m/s² … 1000 m/s²
    if (this.wheelAccum !== 0) { sh.thrustAccel = clamp(sh.thrustAccel * Math.exp(-this.wheelAccum * 0.25), 0.1, 1000); bus.emit('ship:throttle', sh.thrustAccel); }
    // X: kill relative velocity (match the dominant body) · C: circular orbit around it
    if (k.has('KeyX') && sh.dominant) sh.matchVelocity(sh.dominant);
    if (k.has('KeyC') && sh.dominant && !this._circ) { this._circ = true; sh.circularize(this.position, sh.dominant); bus.emit('ship:circularized', sh.dominant); }
    if (!k.has('KeyC')) this._circ = false;
    sh.step(this.position, this.quaternion, dt);
    this.velocity.copy(sh.velocity);
  }

  _collide() {
    const n = this.nearest;
    if (!n.obj) return;
    const p = n.obj.getPosition(this._tmp3);
    const off = this._tmp.copy(this.position).sub(p);
    const minD = n.obj.radius * (n.obj.kind === 'sun' || n.obj.kind === 'star' ? 1.02 : 1.0005);
    if (off.length() < minD) { this.position.copy(p).addScaledVector(off.normalize(), minD); this.velocity.multiplyScalar(0.2); }
  }

  _updateOrbit(dt) {
    const o = this.orbit, t = this.target;
    if (!t) { this.setMode(CAM_MODE.FREE); return; }
    // wheel zoom in log space
    if (this.wheelAccum !== 0) o.distTarget *= Math.exp(this.wheelAccum * 0.11);
    const minD = (t.orbitMin ?? t.radius) * (t.kind === 'sun' || t.kind === 'star' ? 1.05 : 1.0008);
    o.distTarget = clamp(o.distTarget, minD, Math.max(t.radius * 1e6, 1e12));
    o.dist = Math.exp(damp(Math.log(o.dist), Math.log(o.distTarget), 7, dt));
    // keyboard: WASD orbits, QE zoom
    const k = this.keys;
    const kv = 1.6 * dt;
    if (k.has('KeyA') || k.has('ArrowLeft')) o.thetaV += kv * 0.4;
    if (k.has('KeyD') || k.has('ArrowRight')) o.thetaV -= kv * 0.4;
    if (k.has('KeyW') || k.has('ArrowUp')) o.phiV += kv * 0.4;
    if (k.has('KeyS') || k.has('ArrowDown')) o.phiV -= kv * 0.4;
    if (k.has('KeyE')) o.distTarget *= Math.exp(-1.2 * dt);
    if (k.has('KeyQ')) o.distTarget *= Math.exp(1.2 * dt);
    o.theta += o.thetaV; o.phi += o.phiV;
    o.thetaV *= Math.exp(-9 * dt); o.phiV *= Math.exp(-9 * dt);
    o.phi = clamp(o.phi, -Math.PI / 2 + 0.02, Math.PI / 2 - 0.02);
    const frame = this._frameFor(t, this.mode);
    const local = this._tmp.set(Math.cos(o.phi) * Math.sin(o.theta), Math.sin(o.phi), Math.cos(o.phi) * Math.cos(o.theta)).multiplyScalar(o.dist);
    local.applyMatrix4(frame.m);
    const tp = t.getPosition(this._tmp3);
    this.position.copy(tp).add(local);
    this.quaternion.setFromRotationMatrix(this._m.lookAt(this.position, tp, this.up));
  }

  /** Instantly place the camera. */
  setPose(pos, lookAt) {
    this.position.copy(pos);
    if (lookAt) this.quaternion.setFromRotationMatrix(this._m.lookAt(pos, lookAt, this.up));
    this._syncYawPitchFromQuat();
    this.velocity.set(0, 0, 0);
    this.camera.position.copy(this.position); this.camera.quaternion.copy(this.quaternion); this.camera.updateMatrixWorld(true);
  }

  lookAt(target) {
    this.quaternion.setFromRotationMatrix(this._m.lookAt(this.position, target, this.up));
    this._syncYawPitchFromQuat();
  }

  getForward(out = new THREE.Vector3()) { return out.set(0, 0, -1).applyQuaternion(this.quaternion); }
}
