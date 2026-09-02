import * as THREE from 'three';
import { AU, KM, DEG, radecToVector, daysSinceJ2000 } from '../core/Units.js';
import { SPACECRAFT } from '../data/SolarSystemData.js';
import { Body, VISUAL } from './Body.js';

// Procedural spacecraft models (Voyager, Pioneer, New Horizons, ISS, Hubble,
// JWST) at plausible current positions: deep-space probes drift outward along
// their real sky directions, orbiters circle Earth, JWST rides a halo orbit
// around Sun–Earth L2.
const MAT = {
  gold: () => new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.9, roughness: 0.25 }),
  foil: () => new THREE.MeshStandardMaterial({ color: 0xd8b25e, metalness: 0.8, roughness: 0.4 }),
  white: () => new THREE.MeshStandardMaterial({ color: 0xe8e8e8, metalness: 0.1, roughness: 0.6 }),
  silver: () => new THREE.MeshStandardMaterial({ color: 0xb8bcc4, metalness: 0.9, roughness: 0.3 }),
  dark: () => new THREE.MeshStandardMaterial({ color: 0x2a2a2e, metalness: 0.3, roughness: 0.8 }),
  panel: () => new THREE.MeshStandardMaterial({ color: 0x3b3320, metalness: 0.6, roughness: 0.35, side: THREE.DoubleSide, emissive: 0x1a1408, emissiveIntensity: 0.3 }),
  shield: () => new THREE.MeshStandardMaterial({ color: 0xe0d6c2, metalness: 0.6, roughness: 0.4, side: THREE.DoubleSide }),
  black: () => new THREE.MeshStandardMaterial({ color: 0x0a0a0c, metalness: 0.2, roughness: 0.9 }),
};

function dishAndBus(dishR, opts = {}) {
  const g = new THREE.Group();
  const dish = new THREE.Mesh(new THREE.SphereGeometry(dishR * 1.15, 40, 20, 0, Math.PI * 2, 0, 0.55), MAT.white());
  dish.rotation.x = Math.PI; dish.position.y = dishR * 0.4;
  g.add(dish);
  const feed = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, dishR * 0.9, 8), MAT.dark()); feed.position.y = dishR * 0.55; g.add(feed);
  const bus = new THREE.Mesh(new THREE.CylinderGeometry(dishR * 0.45, dishR * 0.45, 0.5, 10), MAT.foil()); bus.position.y = -0.3; g.add(bus);
  if (opts.rtg) {
    const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 3.5, 6), MAT.dark()); boom.rotation.z = Math.PI / 2; boom.position.set(-2.2, -0.3, 0); g.add(boom);
    for (let i = 0; i < 3; i++) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.45, 8), MAT.dark()); r.rotation.z = Math.PI / 2; r.position.set(-3 - i * 0.5, -0.3, 0); g.add(r); }
  }
  if (opts.magBoom) {
    const mb = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 13, 6), MAT.silver()); mb.rotation.z = Math.PI / 2; mb.position.set(7.5, -0.3, 0.3); g.add(mb);
  }
  if (opts.sciBoom) {
    const sb = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.5, 6), MAT.dark()); sb.position.set(0.8, -0.3, 1.6); sb.rotation.x = Math.PI / 2; g.add(sb);
    const cam = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.3), MAT.white()); cam.position.set(0.8, -0.3, 2.9); g.add(cam);
  }
  return g;
}

const MODELS = {
  voyager: () => dishAndBus(1.85, { rtg: true, magBoom: true, sciBoom: true }),
  pioneer: () => dishAndBus(1.37, { rtg: true, magBoom: false }),
  newhorizons: () => { const g = dishAndBus(1.05, { rtg: true }); const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.7, 2.7), MAT.foil()); body.position.y = -0.35; g.add(body); return g; },
  iss: () => {
    const g = new THREE.Group();
    const truss = new THREE.Mesh(new THREE.BoxGeometry(109, 4.5, 4.5), MAT.silver()); g.add(truss);
    for (let i = 0; i < 8; i++) {
      const x = (i < 4 ? -1 : 1) * (18 + (i % 4) * 12) - (i < 4 ? 0 : 0);
      const side = (i % 2 === 0) ? 1 : -1;
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(11.5, 35), MAT.panel());
      panel.position.set(x, side * 21, 0); panel.rotation.y = Math.PI / 2;
      g.add(panel);
    }
    const modules = [[0, 0, 0, 12], [0, 0, 14, 10], [0, 0, -13, 9], [0, 0, 26, 8], [0, 0, -24, 8], [-8, 0, 14, 7], [8, 0, 14, 7]];
    for (const [x, y, z, len] of modules) { const m = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, len, 16), MAT.white()); m.rotation.x = Math.PI / 2; m.position.set(x, y - 6, z); g.add(m); }
    for (let i = 0; i < 4; i++) { const rad = new THREE.Mesh(new THREE.PlaneGeometry(3, 14), MAT.white()); rad.position.set(-40 + i * 6, -10, 3); rad.rotation.x = Math.PI / 2; g.add(rad); }
    return g;
  },
  hubble: () => {
    const g = new THREE.Group();
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, 13.2, 32), MAT.silver()); tube.rotation.z = Math.PI / 2; g.add(tube);
    const aft = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 3.5, 32), MAT.foil()); aft.rotation.z = Math.PI / 2; aft.position.x = -5; g.add(aft);
    for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 7.5), MAT.panel()); p.position.set(1, 0, s * 5.8); p.rotation.x = Math.PI / 2; p.rotation.z = 0; g.add(p); }
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.2, 4.2, 4.2), MAT.silver()); door.position.set(6.8, 1.5, 0); door.rotation.z = 0.5; g.add(door);
    return g;
  },
  jwst: () => {
    const g = new THREE.Group();
    const hexR = 0.75;
    const gold = MAT.gold();
    const hex = new THREE.CylinderGeometry(hexR, hexR, 0.08, 6);
    for (let q = -2; q <= 2; q++) for (let r = -2; r <= 2; r++) {
      const s = -q - r; if (Math.max(Math.abs(q), Math.abs(r), Math.abs(s)) > 2) continue;
      if (q === 0 && r === 0) continue;
      const x = hexR * Math.sqrt(3) * (q + r / 2), z = hexR * 1.5 * r;
      const m = new THREE.Mesh(hex, gold); m.position.set(x, 0.3, z); m.rotation.y = Math.PI / 6; g.add(m);
    }
    for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3; const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 8, 6), MAT.dark()); strut.position.set(Math.cos(a) * 2.2, 4, Math.sin(a) * 2.2); strut.rotation.z = Math.cos(a) * 0.5; strut.rotation.x = -Math.sin(a) * 0.5; g.add(strut); }
    const sec = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.1, 16), gold); sec.position.y = 7.5; g.add(sec);
    // sunshield: five kite-shaped layers
    const shape = new THREE.Shape(); shape.moveTo(-10.5, 0); shape.lineTo(-4, 7); shape.lineTo(4, 7); shape.lineTo(10.5, 0); shape.lineTo(4, -7); shape.lineTo(-4, -7); shape.closePath();
    const sg = new THREE.ShapeGeometry(shape);
    for (let i = 0; i < 5; i++) { const s = new THREE.Mesh(sg, i === 0 ? MAT.silver() : MAT.shield()); s.rotation.x = -Math.PI / 2; s.position.y = -1.2 - i * 0.35; s.scale.setScalar(1 - i * 0.03); g.add(s); }
    const bus = new THREE.Mesh(new THREE.BoxGeometry(3.5, 2.2, 3.5), MAT.dark()); bus.position.y = -4; g.add(bus);
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.8), MAT.panel()); panel.position.set(0, -4.5, 3.5); g.add(panel);
    return g;
  },
};

export class Spacecraft extends Body {
  constructor(def, manager, parentBody) {
    super({ ...def, kind: 'spacecraft', radiusKm: def.model === 'iss' ? 0.055 : def.model === 'jwst' ? 0.012 : def.model === 'hubble' ? 0.007 : 0.004 }, manager, parentBody);
    this.model = MODELS[def.model]();
    // model units are metres; group scale = radius (scene units); model radius ≈ radiusKm*1000 m
    const metresPerRadius = this.radiusKm * 1000;
    this.model.scale.setScalar(1 / metresPerRadius);
    this.group.add(this.model);
    this.epoch = Date.UTC(2026, 6, 1);
    const d = def;
    if (d.parent === 'earth' && !d.l2) {
      this.dir0 = radecToVector(d.ra || 0, d.dec || 0);
    }
  }
  update(simMs, scaleT) {
    const d = this.def;
    const earth = this.parent;
    const days = daysSinceJ2000(simMs);
    if (d.distAU) {
      const years = (simMs - this.epoch) / (365.25 * 86400e3);
      const rAU = d.distAU + d.driftAUperYear * years;
      const dir = radecToVector(d.ra, d.dec);
      this.realPosition.copy(dir).multiplyScalar(rAU * AU);
      const r = this.realPosition.length(); const rv = Body.orbitVisual(r);
      this.visualPosition.copy(this.realPosition).multiplyScalar(rv / r);
      this.position.copy(this.realPosition).lerp(this.visualPosition, scaleT);
      this.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().negate()); // dish points at Earth/Sun
    } else if (d.l2) {
      const sunEarth = earth.position.clone().normalize();
      const l2Real = earth.realPosition.clone().add(sunEarth.clone().multiplyScalar(d.l2DistKm * KM));
      // halo: circle in the plane perpendicular to the Sun–Earth line, period ~ 180 days
      const ang = days * (2 * Math.PI / 180);
      const u = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3().crossVectors(sunEarth, u).normalize();
      const halo = u.clone().multiplyScalar(Math.cos(ang)).addScaledVector(v, Math.sin(ang)).multiplyScalar(d.haloKm * KM);
      const off = sunEarth.multiplyScalar(d.l2DistKm * KM).add(halo);
      const offVisual = off.clone().multiplyScalar(earth.radius / earth.realRadius * 0.08);
      this.position.copy(earth.position).add(off.lerp(offVisual, scaleT));
      this.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), this.position.clone().normalize()); // sunshield faces the Sun
    } else if (d.altitudeKm) {
      // circular orbit in Earth's equatorial frame
      const pole = earth.pole;
      const ref = new THREE.Vector3(1, 0, 0);
      const node = new THREE.Vector3().crossVectors(pole, ref).normalize();
      const n = pole.clone().applyAxisAngle(node, d.inclination * DEG);
      const bu = node.clone(); const bv = new THREE.Vector3().crossVectors(n, bu).normalize();
      const ang = (days * 1440 / d.periodMin) * Math.PI * 2 + (d.model === 'iss' ? 0 : 2.1);
      const altReal = (6371 + d.altitudeKm) * KM;
      const altVisual = earth.radius * (1 + d.altitudeKm / 6371 * 1.0 + 0.02);
      const rr = altReal + (altVisual - altReal) * scaleT;
      this.position.copy(earth.position).addScaledVector(bu, Math.cos(ang) * rr).addScaledVector(bv, Math.sin(ang) * rr);
      this.orbitNormal.copy(n); this.orbitRadius = rr; this.orbitBasis = { u: bu, v: bv };
      // orientation: nadir-pointing, velocity along +x
      const nadir = earth.position.clone().sub(this.position).normalize();
      const vel = new THREE.Vector3().crossVectors(n, this.position.clone().sub(earth.position)).normalize();
      const m = new THREE.Matrix4().makeBasis(vel, nadir.clone().negate(), new THREE.Vector3().crossVectors(vel, nadir.clone().negate()));
      this.quaternion.setFromRotationMatrix(m);
    }
    this.radius = this.realRadius * (1 + scaleT * (VISUAL.smallRadius - 1));
    this.group.position.copy(this.position); this.group.quaternion.copy(this.quaternion); this.group.scale.setScalar(this.radius);
    this.group.updateMatrix(); this.group.matrixWorld.copy(this.group.matrix);
  }
}

export function buildSpacecraft(manager, bodiesById) {
  return SPACECRAFT.map(def => new Spacecraft(def, manager, def.parent ? bodiesById[def.parent] : null));
}
