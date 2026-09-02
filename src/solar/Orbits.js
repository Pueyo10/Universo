import * as THREE from 'three';
import { DEG, AU, KM, DAY_MS, J2000_MS } from '../core/Units.js';

// Keplerian orbit propagation (heliocentric ecliptic J2000) and orbit paths.

/** Solve Kepler's equation M = E - e sin E (radians). */
export function solveKepler(M, e) {
  M = M % (2 * Math.PI); if (M < 0) M += 2 * Math.PI;
  let E = e < 0.8 ? M : Math.PI;
  for (let i = 0; i < 30; i++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-12) break;
  }
  return E;
}

/**
 * Position (scene units, ecliptic frame: X, Y=north, Z) from Standish-style elements at T centuries past J2000.
 * el = {a,e,I,L,wbar,O, da,de,dI,dL,dwbar,dO}
 */
export function keplerPosition(el, T, out = new THREE.Vector3(), scale = AU) {
  const a = el.a + el.da * T, e = el.e + el.de * T, I = (el.I + el.dI * T) * DEG;
  const L = (el.L + el.dL * T) * DEG, wbar = (el.wbar + el.dwbar * T) * DEG, O = (el.O + el.dO * T) * DEG;
  const w = wbar - O;
  const M = L - wbar;
  const E = solveKepler(M, e);
  const xp = a * (Math.cos(E) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  return perifocalToScene(xp, yp, w, O, I, out).multiplyScalar(scale);
}

/** Perifocal (xp, yp) → ecliptic (x, y_ecl, z_ecl) → scene (X, Y=z_ecl, Z=-y_ecl). */
export function perifocalToScene(xp, yp, w, O, I, out) {
  const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(O), sO = Math.sin(O), cI = Math.cos(I), sI = Math.sin(I);
  const x = (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp;
  const y = (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp;
  const z = (sw * sI) * xp + (cw * sI) * yp;
  return out.set(x, z, -y);
}

/** Orbit normal in scene frame for elements. */
export function orbitNormal(el, T, out = new THREE.Vector3()) {
  const I = (el.I + el.dI * T) * DEG, O = (el.O + el.dO * T) * DEG;
  // ecliptic normal: (sinI sinO, -sinI cosO, cosI)
  const x = Math.sin(I) * Math.sin(O), y = -Math.sin(I) * Math.cos(O), z = Math.cos(I);
  return out.set(x, z, -y).normalize();
}

/** Comet position from perihelion elements: q (AU), e, i, O, w (deg), period (years), tp (ms). */
export function cometPosition(c, ms, out = new THREE.Vector3()) {
  const a = c.q / (1 - c.e);
  const P = c.periY * 365.25 * DAY_MS;
  let M = (2 * Math.PI * ((ms - c.tp) / P)) % (2 * Math.PI);
  const E = solveKepler(M, c.e);
  const xp = a * (Math.cos(E) - c.e), yp = a * Math.sqrt(1 - c.e * c.e) * Math.sin(E);
  return perifocalToScene(xp, yp, c.w * DEG, c.O * DEG, c.i * DEG, out).multiplyScalar(AU);
}

/** Build a closed orbit line geometry (positions relative to the focus) for elements at T. */
export function orbitPath(el, T, segments = 256, scale = AU) {
  const pts = new Float32Array((segments + 1) * 3);
  const a = el.a + el.da * T, e = el.e + el.de * T, I = (el.I + el.dI * T) * DEG;
  const wbar = (el.wbar + el.dwbar * T) * DEG, O = (el.O + el.dO * T) * DEG;
  const w = wbar - O;
  const v = new THREE.Vector3();
  for (let i = 0; i <= segments; i++) {
    const E = (i / segments) * Math.PI * 2;
    const xp = a * (Math.cos(E) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
    perifocalToScene(xp, yp, w, O, I, v).multiplyScalar(scale);
    pts[i * 3] = v.x; pts[i * 3 + 1] = v.y; pts[i * 3 + 2] = v.z;
  }
  return pts;
}

export function cometPath(c, segments = 512) {
  const a = c.q / (1 - c.e);
  const pts = new Float32Array((segments + 1) * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i <= segments; i++) {
    // concentrate samples near perihelion using eccentric anomaly
    const E = (i / segments) * Math.PI * 2;
    const xp = a * (Math.cos(E) - c.e), yp = a * Math.sqrt(1 - c.e * c.e) * Math.sin(E);
    perifocalToScene(xp, yp, c.w * DEG, c.O * DEG, c.i * DEG, v).multiplyScalar(AU);
    pts[i * 3] = v.x; pts[i * 3 + 1] = v.y; pts[i * 3 + 2] = v.z;
  }
  return pts;
}

/**
 * Circular moon orbit in a given plane basis: returns position relative to parent (scene units).
 * basis = {u, v} orthonormal vectors in the orbital plane; angle in radians.
 */
export function circularPosition(radiusUnits, angle, basisU, basisV, out = new THREE.Vector3()) {
  return out.copy(basisU).multiplyScalar(Math.cos(angle) * radiusUnits).addScaledVector(basisV, Math.sin(angle) * radiusUnits);
}
