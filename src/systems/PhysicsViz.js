import * as THREE from 'three';
import { bus } from '../core/EventBus.js';
import { AU } from '../core/Units.js';

// PHYSICS VISUALIZATION: velocity and gravity vectors, the predicted two-body
// path of the ship, rotation axes, orbital planes and barycentres of the
// selected body. Everything is drawn camera-relative (float64 -> float32 safe)
// and hidden unless the science layer is on.
const N_PATH = 256;

export class PhysicsViz {
  constructor(ctx) {
    this.ctx = ctx; this.engine = ctx.engine; this.registry = ctx.registry; this.cam = ctx.cameraCtl;
    this.enabled = false;
    this.group = new THREE.Group();
    this.group.renderOrder = 80;
    this.engine.scene.add(this.group);
    const mk = (color, opacity, n) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e15);
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
      line.frustumCulled = false; line.renderOrder = 80; line.visible = false;
      this.group.add(line);
      return line;
    };
    this.path = mk(0x7fffd0, 0.7, N_PATH);            // predicted ship orbit
    this.velArrow = mk(0x7fb4ff, 0.95, 2);            // ship velocity (relative to dominant body)
    this.gravArrow = mk(0xffb070, 0.95, 2);           // gravitational acceleration
    this.bodyVel = mk(0x7fb4ff, 0.8, 2);              // selected body velocity
    this.axis = mk(0xffffff, 0.55, 2);                // rotation axis of the selected body
    this.plane = this._ring(0x9fb6ff, 0.35, 128);     // orbital plane of the selected body (around its parent)
    this.equator = this._ring(0xffffff, 0.25, 96);    // equator (shows axial tilt against the orbit plane)
    this.bary = this._marker(0xffd080);               // barycentre marker
    this.selected = null;
    this._v = new THREE.Vector3(); this._v2 = new THREE.Vector3(); this._v3 = new THREE.Vector3(); this._q = new THREE.Quaternion();
    bus.on('select', o => { this.selected = o; });
    bus.on('toggle', (k, v) => { if (k === 'physics') this.setEnabled(v); });
  }

  _ring(color, opacity, n) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array((n + 1) * 3);
    for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2; pos[i * 3] = Math.cos(a); pos[i * 3 + 2] = Math.sin(a); }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 2);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
    line.frustumCulled = false; line.renderOrder = 80; line.visible = false; line.matrixAutoUpdate = true;
    this.group.add(line);
    return line;
  }
  _marker(color) {
    const geo = new THREE.BufferGeometry();
    const s = 1; const pos = new Float32Array([-s, 0, 0, s, 0, 0, 0, -s, 0, 0, s, 0, 0, 0, -s, 0, 0, s]);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 2);
    const m = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, depthTest: false }));
    m.frustumCulled = false; m.renderOrder = 81; m.visible = false;
    this.group.add(m);
    return m;
  }

  setEnabled(v) { this.enabled = v; if (!v) for (const c of this.group.children) c.visible = false; }

  _seg(line, a, b, camPos) {
    const p = line.geometry.attributes.position.array;
    p[0] = a.x - camPos.x; p[1] = a.y - camPos.y; p[2] = a.z - camPos.z;
    p[3] = b.x - camPos.x; p[4] = b.y - camPos.y; p[5] = b.z - camPos.z;
    line.geometry.attributes.position.needsUpdate = true;
    line.geometry.setDrawRange(0, 2);
    line.visible = true;
  }

  update(dt, t, camPos) {
    if (!this.enabled) return;
    this.group.position.copy(camPos);   // camera-relative drawing
    const cam = this.cam; const ship = cam.ship;
    const fovScale = window.innerHeight / (2 * Math.tan(THREE.MathUtils.degToRad(this.engine.camera.fov) / 2));
    // ---- ship: predicted path, velocity & gravity vectors (ship mode only)
    if (cam.mode === 'SHIP' && ship && ship.dominant) {
      const arr = this.path.geometry.attributes.position.array;
      const k = ship.predictPath(cam.position, arr, N_PATH, camPos);
      if (k > 1) { this.path.geometry.attributes.position.needsUpdate = true; this.path.geometry.setDrawRange(0, k); this.path.visible = true; } else this.path.visible = false;
      // arrows scaled to a fixed on-screen length (60 px at the ship position ≈ 60/fovScale rad × 1 unit ahead)
      const L = 1.0 * (this.cam.nearest.dist > 0 ? Math.max(this.cam.nearest.dist * 0.15, 1e-3) : 1);
      const rel = this._v.copy(ship.velocity).sub(ship.bodyVelocity(ship.dominant, this._v2));
      if (rel.lengthSq() > 0) this._seg(this.velArrow, camPos, this._v3.copy(camPos).addScaledVector(rel.normalize(), L), camPos); else this.velArrow.visible = false;
      if (ship.gravity.lengthSq() > 0) this._seg(this.gravArrow, camPos, this._v3.copy(camPos).addScaledVector(this._v2.copy(ship.gravity).normalize(), L * 0.7), camPos); else this.gravArrow.visible = false;
    } else { this.path.visible = false; this.velArrow.visible = false; this.gravArrow.visible = false; }
    // ---- selected body: axis, equator, orbital plane, barycentre, velocity
    const o = this.selected;
    if (o && o.getPosition && o.radius) {
      const p = o.getPosition(this._v);
      const d = p.distanceTo(camPos);
      const R = o.radius;
      const near = R / d * fovScale > 2;   // only when the body is more than a couple of pixels
      if (near && o.pole) {
        this._seg(this.axis, this._v2.copy(p).addScaledVector(o.pole, -R * 1.8), this._v3.copy(p).addScaledVector(o.pole, R * 1.8), camPos);
        this.equator.visible = true;
        this.equator.position.copy(p).sub(camPos); this.equator.scale.setScalar(R * 1.02);
        this.equator.quaternion.setFromUnitVectors(this._v2.set(0, 1, 0), o.pole);
      } else { this.axis.visible = false; this.equator.visible = false; }
      if (o.getVelocity) {
        const v = o.getVelocity(this._v2);
        if (v.lengthSq() > 0) this._seg(this.bodyVel, p, this._v3.copy(p).addScaledVector(v.normalize(), R * 3), camPos); else this.bodyVel.visible = false;
      } else this.bodyVel.visible = false;
      // orbital plane around the parent (moons) or the Sun (planets)
      const parent = o.parent && o.parent.getPosition ? o.parent : null;
      const orbitR = parent ? p.distanceTo(parent.getPosition(this._v2)) : (o.kind === 'planet' || o.kind === 'dwarf' || o.kind === 'asteroid' || o.kind === 'comet' ? p.length() : 0);
      if (orbitR > 0 && o.orbitNormal) {
        const center = parent ? parent.getPosition(this._v2) : this._v2.set(0, 0, 0);
        this.plane.visible = true;
        this.plane.position.copy(center).sub(camPos); this.plane.scale.setScalar(orbitR);
        this.plane.quaternion.setFromUnitVectors(this._v3.set(0, 1, 0), o.orbitNormal);
        this.plane.material.opacity = 0.35 * Math.min(1, orbitR / d);
      } else this.plane.visible = false;
      const bc = o.barycenter || (o.parent && o.parent.barycenter);
      if (bc && near) { this.bary.visible = true; this.bary.position.copy(bc).sub(camPos); this.bary.scale.setScalar(Math.max(R * 0.12, d * 0.006)); }
      else this.bary.visible = false;
    } else { this.axis.visible = false; this.equator.visible = false; this.plane.visible = false; this.bary.visible = false; this.bodyVel.visible = false; }
  }
}
