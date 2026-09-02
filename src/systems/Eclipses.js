import * as THREE from 'three';
import { KM } from '../core/Units.js';

// Eclipse finder: scans simulated time for alignments of Sun – occulter – target
// using the same orbital model that drives the scene (so what it finds is what
// you will see). Solar eclipse: the Moon's shadow reaches Earth. Lunar eclipse:
// the Moon enters Earth's umbra/penumbra. Also generic "transit" of a moon in
// front of its planet as seen from the Sun (its shadow crosses the disc).
const DAY = 86400e3;

export class EclipseFinder {
  constructor(solar) { this.solar = solar; this._a = new THREE.Vector3(); this._b = new THREE.Vector3(); this._c = new THREE.Vector3(); }

  /** Positions of a body at time ms without disturbing the live scene. */
  _positions(ids, ms) {
    const saved = this.solar.bodies.map(b => [b, b.position.clone(), b._prevSimMs, b._prevPos.clone()]);
    for (const b of this.solar.bodies) b.update(ms, this.solar.scaleT);
    this.solar._applyBarycenters(ms);
    const out = {}; for (const id of ids) out[id] = this.solar.byId[id].position.clone();
    for (const [b, p, t, pp] of saved) { b.position.copy(p); b._prevSimMs = t; b._prevPos.copy(pp); }
    return out;
  }

  /**
   * Shadow geometry: does body `occ` (radius Ro) cast its shadow onto body `tgt` (radius Rt)?
   * Returns { umbra, penumbra } depths in units of the target radius (>0 means shadow reaches the target).
   */
  _shadow(sunPos, occ, Ro, tgt, Rt) {
    const Rs = this.solar.sun.realRadius;
    const so = this._a.copy(occ).sub(sunPos); const dSO = so.length(); so.normalize();
    const st = this._b.copy(tgt).sub(sunPos);
    const along = st.dot(so);
    if (along <= dSO) return { umbra: -1, penumbra: -1 };        // target is not behind the occulter
    const perp = this._c.copy(st).sub(so.clone().multiplyScalar(along)).length();
    const dOT = along - dSO;
    // umbra cone: shrinks with (Rs - Ro)/dSO ; penumbra grows with (Rs + Ro)/dSO
    const umbraR = Ro - dOT * (Rs - Ro) / dSO;
    const penumbraR = Ro + dOT * (Rs + Ro) / dSO;
    return { umbra: (umbraR + Rt - perp) / Rt, penumbra: (penumbraR + Rt - perp) / Rt, perp, umbraR, penumbraR };
  }

  /**
   * kind: 'solar' (Moon shadow on Earth), 'lunar' (Earth shadow on Moon) or { occ, tgt } ids (moon shadow on planet).
   * Returns { ms, kind, total } for the next event after startMs within `days`, or null.
   */
  findNext(kind, startMs, days = 800) {
    const sunPos = this.solar.sun.position;    // the Sun is at the origin; keep general
    let occId, tgtId;
    if (kind === 'solar') { occId = 'moon'; tgtId = 'earth'; }
    else if (kind === 'lunar') { occId = 'earth'; tgtId = 'moon'; }
    else { occId = kind.occ; tgtId = kind.tgt; }
    const occ = this.solar.byId[occId], tgt = this.solar.byId[tgtId];
    if (!occ || !tgt) return null;
    const Ro = occ.realRadius, Rt = tgt.realRadius;
    // coarse scan then refine
    const period = (occ.def.P || tgt.def.P || 27.3) * DAY;
    const coarse = period / 60;
    let t = startMs + coarse;
    const endMs = startMs + days * DAY;
    let prev = -Infinity;
    while (t < endMs) {
      const P = this._positions([occId, tgtId], t);
      const sh = this._shadow(sunPos, P[occId], Ro, P[tgtId], Rt);
      if (sh.penumbra > 0) {
        // refine to the moment of deepest shadow within ± coarse
        let best = t, bestV = sh.umbra;
        for (let dt = -coarse; dt <= coarse; dt += coarse / 40) {
          const Q = this._positions([occId, tgtId], t + dt);
          const s2 = this._shadow(sunPos, Q[occId], Ro, Q[tgtId], Rt);
          if (s2.umbra > bestV) { bestV = s2.umbra; best = t + dt; }
        }
        if (bestV > -1e9) return { ms: best, kind, total: bestV > 0, depth: bestV, occ: occ.name, tgt: tgt.name };
      }
      prev = sh.penumbra;
      t += coarse;
    }
    return null;
  }
}
