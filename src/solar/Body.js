import * as THREE from 'three';
import { KM, AU, DEG, radecToVector, daysSinceJ2000, centuriesSinceJ2000, expLerp, lerp } from '../core/Units.js';
import { keplerPosition, orbitNormal } from './Orbits.js';
import { PLANET_ELEMENTS, ROTATION } from '../data/SolarSystemData.js';

// Visual-scale parameters (blended with real scale by SolarSystemManager.scaleT)
export const VISUAL = {
  sunRadius: 4.0,
  rockyRadius: 60,
  giantRadius: 22,
  moonRadius: 60,
  smallRadius: 400,      // asteroids, comets, KBOs, spacecraft scale
  orbitPow: 0.62,
  orbitMul: 0.555,       // AU → visual AU: mul * r^pow
  moonOrbitBase: 1.6,
  moonOrbitPow: 0.55,
  moonOrbitMul: 0.9,
};

/** Base class for every solar-system body: position, orientation, scaling. */
export class Body {
  constructor(def, manager, parent = null) {
    this.def = def; this.manager = manager; this.parent = parent;
    this.id = def.id; this.name = def.name; this.kind = def.kind || (parent ? 'moon' : 'planet');
    this.radiusKm = def.radiusKm ?? def.r ?? 1;
    this.realRadius = this.radiusKm * KM;
    this.radius = this.realRadius;
    this.position = new THREE.Vector3();
    this.realPosition = new THREE.Vector3();
    this.visualPosition = new THREE.Vector3();
    this.quaternion = new THREE.Quaternion();
    this.velocity = new THREE.Vector3();          // scene units per simulated second (finite difference)
    this._prevPos = new THREE.Vector3(); this._prevSimMs = null;
    this.pole = new THREE.Vector3(0, 1, 0);
    this.orbitNormal = new THREE.Vector3(0, 1, 0);
    this.group = new THREE.Group();
    this.group.name = def.name;
    this.group.matrixAutoUpdate = false;
    this.children = [];
    this.elements = def.elements ? PLANET_ELEMENTS[def.elements] : null;
    this.rotation = def.rotation ? ROTATION[def.rotation] : null;
    this._tmp = new THREE.Vector3();
    this._radialVisual = 1;
    if (parent) parent.children.push(this);
    this._setupOrbitFrame();
  }

  get visualMul() {
    const d = this.def;
    if (this.kind === 'sun') return VISUAL.sunRadius;
    if (this.kind === 'moon') return VISUAL.moonRadius;
    if (this.kind === 'spacecraft' || this.kind === 'comet' || this.kind === 'asteroid') return VISUAL.smallRadius;
    if (d.type === 'gas' || d.type === 'ice') return VISUAL.giantRadius;
    if (this.kind === 'dwarf') return VISUAL.rockyRadius * 1.5;
    return VISUAL.rockyRadius;
  }

  _setupOrbitFrame() {
    const d = this.def;
    if (!this.parent || this.elements) return;
    // moon orbit basis
    if (d.frame === 'ecliptic') {
      this.orbitBasisMode = 'ecliptic';
    } else {
      this.orbitBasisMode = 'equator';
    }
    this.orbitIncl = (d.i || 0) * DEG;
    this.orbitPhase0 = ((d.phase0 ?? (hashPhase(d.id))) * DEG);
    this.orbitNode = hashPhase(d.id + 'n') * DEG;
    this.retro = !!d.retro || this.orbitIncl > Math.PI / 2;
  }

  /** Heliocentric distance mapping for visual mode (scene units). */
  static orbitVisual(rUnits) {
    const rAU = rUnits / AU;
    return VISUAL.orbitMul * Math.pow(rAU, VISUAL.orbitPow) * AU;
  }

  /** Update position/orientation for sim time. scaleT ∈ [0,1] blends real→visual. */
  update(simMs, scaleT) {
    const T = centuriesSinceJ2000(simMs);
    const days = daysSinceJ2000(simMs);
    const d = this.def;
    // ---- radius
    const mul = this.visualMul;
    this.radius = expLerp(this.realRadius, this.realRadius * mul, scaleT);
    // ---- position
    if (this.elements) {
      keplerPosition(this.elements, T, this.realPosition);
      orbitNormal(this.elements, T, this.orbitNormal);
      const r = this.realPosition.length();
      const rv = Body.orbitVisual(r);
      this.visualPosition.copy(this.realPosition).multiplyScalar(rv / r);
      this.position.copy(this.realPosition).lerp(this.visualPosition, scaleT);
      if (this.parent) { this.position.add(this.parent.position); }
    } else if (this.parent && d.a) {
      // circular moon orbit
      const P = d.P;
      const n = (this.retro ? -1 : 1) * 2 * Math.PI / P;
      const ang = this.orbitPhase0 + n * days;
      const basis = this._moonBasis();
      const aReal = d.a * KM;
      const pr = this.parent.realRadius;
      const aVisual = this.parent.radius * (VISUAL.moonOrbitBase + Math.pow(aReal / pr, VISUAL.moonOrbitPow) * VISUAL.moonOrbitMul);
      const a = lerp(aReal, aVisual, scaleT);
      this.orbitRadius = a;
      this.orbitAngle = ang;
      this.position.copy(basis.u).multiplyScalar(Math.cos(ang) * a).addScaledVector(basis.v, Math.sin(ang) * a).add(this.parent.position);
      this.orbitNormal.copy(basis.n);
    } else if (this.customPosition) {
      this.customPosition(simMs, scaleT, this.position);
    }
    // ---- orientation
    this._updateOrientation(days);
    this.trackVelocity(simMs);
    this.syncGroup();
  }

  /** Finite-difference velocity in scene units per simulated second (kept across pauses). */
  trackVelocity(simMs) {
    if (this._prevSimMs != null) {
      const dtS = (simMs - this._prevSimMs) / 1000;
      if (Math.abs(dtS) > 1e-6) this.velocity.copy(this.position).sub(this._prevPos).multiplyScalar(1 / dtS);
    }
    this._prevPos.copy(this.position); this._prevSimMs = simMs;
  }
  getVelocity(out) { return out.copy(this.velocity); }

  /** Push position / orientation / scale into the Three group (float64 -> matrices). */
  syncGroup() {
    const d = this.def;
    this.group.position.copy(this.position);
    this.group.quaternion.copy(this.quaternion);
    this.group.scale.setScalar(this.radius);
    if (d.ellipsoid) this.group.scale.set(this.radius * d.ellipsoid[0], this.radius * d.ellipsoid[1], this.radius * d.ellipsoid[2]);
    else if (d.oblateness) this.group.scale.y = this.radius * (1 - d.oblateness);
    this.group.updateMatrix();
    this.group.matrixWorld.copy(this.group.matrix);
  }

  _moonBasis() {
    if (!this._basis) this._basis = { u: new THREE.Vector3(), v: new THREE.Vector3(), n: new THREE.Vector3() };
    const b = this._basis;
    let pole;
    if (this.orbitBasisMode === 'ecliptic') pole = new THREE.Vector3(0, 1, 0);
    else pole = this.parent.pole.clone();
    // node direction: perpendicular to pole, rotate by node angle
    const ref = Math.abs(pole.y) < 0.99 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const node = new THREE.Vector3().crossVectors(pole, ref).normalize().applyAxisAngle(pole, this.orbitNode);
    // tilt pole by inclination around the node
    const n = pole.clone().applyAxisAngle(node, this.orbitIncl > Math.PI / 2 ? Math.PI - this.orbitIncl : this.orbitIncl).normalize();
    if (this.retro && this.orbitIncl > Math.PI / 2) n.negate();
    b.n.copy(n);
    b.u.copy(node);
    b.v.crossVectors(n, node).normalize();
    return b;
  }

  _updateOrientation(days) {
    const d = this.def;
    let pole, W;
    if (this.rotation) {
      pole = radecToVector(this.rotation.ra, this.rotation.dec);
      W = (this.rotation.W0 + this.rotation.Wd * days) * DEG;
      if (d.id === 'charon') { pole = this.parent.pole.clone(); W = this.orbitAngle + Math.PI; }
    } else if (this.parent && d.a) {
      // synchronous rotation: pole ≈ orbit normal, prime meridian faces the parent
      pole = this.orbitNormal.clone();
      W = 0; // set below via facing
    } else if (d.rotationPeriodD) {
      pole = d.poleDir ? d.poleDir.clone() : new THREE.Vector3(0, 1, 0);
      W = (2 * Math.PI * days / d.rotationPeriodD) % (2 * Math.PI);
    } else {
      pole = new THREE.Vector3(0, 1, 0); W = 0;
    }
    this.pole.copy(pole);
    // build basis: Y = pole, X = prime meridian
    let x;
    if (this.parent && d.a && !this.rotation) {
      // prime meridian points to the parent (tidally locked)
      const toParent = this._tmp.copy(this.parent.position).sub(this.position).normalize();
      x = toParent.sub(pole.clone().multiplyScalar(toParent.dot(pole))).normalize();
      if (!isFinite(x.x) || x.lengthSq() < 1e-6) x = new THREE.Vector3(1, 0, 0);
    } else {
      // IAU node Q = (RA+90°, 0) in equatorial coords, rotated by W about the pole
      const q0 = this.rotation ? radecToVector(this.rotation.ra + 90, 0) : new THREE.Vector3(1, 0, 0);
      x = q0.sub(pole.clone().multiplyScalar(q0.dot(pole))).normalize().applyAxisAngle(pole, W);
    }
    const z = new THREE.Vector3().crossVectors(x, pole).normalize();
    const m = new THREE.Matrix4().makeBasis(x, pole, z);
    this.quaternion.setFromRotationMatrix(m);
  }

  /** Direction from this body toward the Sun (world). */
  sunDir(out = new THREE.Vector3()) { return out.copy(this.position).negate().normalize(); }
  /** World → local (unit-sphere) coordinates. */
  worldToLocal(p, out = new THREE.Vector3()) {
    const v = this._tmpL || (this._tmpL = new THREE.Vector3());
    v.copy(p).sub(this.position).applyQuaternion(this._invQ());
    v.x /= this.group.scale.x; v.y /= this.group.scale.y; v.z /= this.group.scale.z;
    if (out.isVector4) out.set(v.x, v.y, v.z, out.w); else out.copy(v);
    return out;
  }
  worldDirToLocal(d, out = new THREE.Vector3()) { return out.copy(d).applyQuaternion(this._invQ()).normalize(); }
  _invQ() { if (!this._iq) this._iq = new THREE.Quaternion(); return this._iq.copy(this.quaternion).invert(); }
}

function hashPhase(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 36000) / 100;
}
