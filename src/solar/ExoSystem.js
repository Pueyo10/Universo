import * as THREE from 'three';
import { AU, KM, LY, SUN_RADIUS_KM, EARTH_RADIUS_KM, fmtNum, expLerp } from '../core/Units.js';
import { Rng } from '../core/Random.js';
import { StarBody } from './Sun.js';
import { PlanetRenderer } from './Planet.js';
import { generateSurfaceAsync, generateRingTexture } from './TextureFactory.js';
import { Rings } from './Rings.js';
import { VISUAL } from './Body.js';
import { i18n } from '../i18n/index.js';
import { EARTH_RADIUS_KM as RE } from '../core/Units.js';

// Procedural planetary systems around any star the user travels to: the star
// rendered with the Sun shader (tinted by temperature) and 0–6 planets with
// recipes chosen by equilibrium temperature (lava, desert, ocean, ice, gas).
const GREEK = ['b', 'c', 'd', 'e', 'f', 'g'];

export class ExoSystemManager {
  constructor(ctx, solar) {
    this.ctx = ctx; this.solar = solar; this.engine = ctx.engine; this.registry = ctx.registry;
    this.systems = new Map();
    this.pending = [];
  }

  ensure(starObj) {
    if (!starObj || starObj.kind !== 'star' || this.systems.has(starObj.id)) return;
    if (starObj.pulsar) return;
    const sys = this._create(starObj);
    this.systems.set(starObj.id, sys);
  }

  _create(star) {
    const rng = new Rng((star.seed ?? star.name.length * 977) >>> 0);
    const temp = star.temp || 5500, L = star.lum || 1;
    const tint = new THREE.Color().setRGB(1, 1, 1);
    const group = new THREE.Group();
    group.position.copy(star.scenePos);
    this.engine.scene.add(group);
    const starBody = new StarBody({ radius: star.radius, temp, tint: [1, 1, 1], intensity: Math.min(3.2, Math.max(0.7, 2.4 * Math.pow(temp / 5772, 0.9))) });
    starBody.group.scale.setScalar(star.radius);
    group.add(starBody.group);
    const sys = { star, group, starBody, planets: [], rng, t0: performance.now(), known: !!star.knownSystem };
    // binary companions: known pairs (Sirius B white dwarf, Alpha Centauri B) and ~30 % of procedural stars.
    // Both stars orbit the barycentre; the primary's own point stays put (its motion is far below label scale).
    const bin = star.special && star.special.kind === 'binary' ? star.special : (star.procedural && rng.float() < 0.3 ? { kind: 'binary', procedural: true } : null);
    if (bin && !star.pulsar && !this.registry.get(star.id + '-b')) {   // skip when the catalogue already holds the real companion (e.g. Sirius B)
      const wd = bin.companion === 'white dwarf';
      const cTemp = wd ? 25000 : temp * (0.55 + 0.4 * rng.float());
      const cRadius = wd ? 0.0085 * 695700 * KM : star.radius * (0.4 + 0.5 * rng.float());
      const cMass = wd ? 1.0 : Math.pow(cRadius / star.radius, 0.8);   // M☉ (rough)
      const comp = new StarBody({ radius: cRadius, temp: cTemp, tint: [1, 1, 1], intensity: wd ? 3.0 : 2.0 });
      comp.group.scale.setScalar(cRadius);
      group.add(comp.group);
      const aAU = wd ? 20 : 3 + 40 * rng.float();
      const mPrim = Math.pow(L, 1 / 3.5);
      sys.binary = { body: comp, aAU, periodY: Math.sqrt(aAU ** 3 / Math.max(mPrim + cMass, 0.2)), phase: rng.float() * Math.PI * 2, incl: (rng.float() - 0.5) * 0.6, e: 0.2 + 0.5 * rng.float(), mass: cMass, mPrim };
      const cid = star.id + '-companion';
      const cname = wd ? star.name + ' B' : star.name + ' B';
      const cpos = new THREE.Vector3();
      sys.binary.position = cpos;
      this.registry.add({ id: cid, name: cname, kind: 'star', kindLabel: wd ? 'White dwarf' : 'Companion star', color: wd ? '#dfe8ff' : star.color, radius: cRadius, priority: 2, parent: star, aliases: [], labelRange: [1.5, 1e6], lum: wd ? 0.03 : L * 0.2, temp: cTemp, massKg: cMass * 1.9885e30, provenance: bin.procedural ? 'procedural' : 'observed',
        getPosition(out) { return out.copy(cpos); }, getVelocity(out) { return out.copy(sys.binary.velocity || new THREE.Vector3()); },
        data: { type: wd ? 'White dwarf companion' : 'Binary companion', semiMajorAxis: `${aAU.toFixed(1)} AU`, orbitalPeriod: `${sys.binary.periodY.toFixed(1)} years`, eccentricity: sys.binary.e.toFixed(2) },
        description: wd ? `The white dwarf companion of ${star.name}: the collapsed core of a star that was once the more massive of the pair, packing about a solar mass into an Earth-sized body.` : `The companion of ${star.name}. Both stars orbit their common centre of mass; more than half of all Sun-like stars belong to binary or multiple systems.`,
        i18n: { es: { description: wd ? `La enana blanca compañera de ${star.name}: el núcleo colapsado de una estrella que fue la más masiva del par, con cerca de una masa solar en un cuerpo del tamaño de la Tierra.` : `La compañera de ${star.name}. Ambas estrellas orbitan su centro de masas común; más de la mitad de las estrellas similares al Sol pertenecen a sistemas binarios o múltiples.` } } });
    }
    // planets: a real (observed) system when we have one, otherwise procedural
    const known = star.knownSystem ? star.knownSystem.planets : null;
    const nPlanets = known ? known.length : temp > 25000 ? rng.int(2) : rng.intRange(0, 6);
    const a0 = 0.08 * Math.sqrt(L) * (0.8 + 0.6 * rng.float());
    let a = a0;
    for (let i = 0; i < nPlanets; i++) {
      const kp = known ? known[i] : null;
      if (kp) a = kp.a; else a *= 1.5 + rng.float() * 0.9;
      const teq = kp && kp.teq ? kp.teq : 278 * Math.pow(L, 0.25) / Math.sqrt(a);
      let recipe, type = 'rocky', radiusE, atmo = null, rings = null;
      const roll = rng.float();
      if (kp) {
        recipe = kp.recipe; radiusE = kp.radiusE; type = recipe === 'gas' ? 'gas' : 'rocky';
        atmo = recipe === 'gas' ? { color: [0.9, 0.85, 0.7], height: 0.01, density: 0.6, mie: 0.5, rayleigh: [0.6, 0.55, 0.45], gas: true }
          : recipe === 'ocean' ? { color: [0.4, 0.6, 1.0], height: 0.018, density: 1.0, mie: 0.5, rayleigh: [0.2, 0.45, 1.0] }
          : recipe === 'ice' ? { color: [0.7, 0.8, 1.0], height: 0.02, density: 0.4, mie: 0.3, rayleigh: [0.4, 0.6, 1.0] }
          : recipe === 'desert' ? { color: [0.9, 0.7, 0.5], height: 0.02, density: 0.6, mie: 0.8, rayleigh: [0.8, 0.5, 0.3] } : null;
      }
      else if (teq > 900) { recipe = 'lava'; radiusE = 0.5 + 1.3 * rng.float(); }
      else if (teq > 330) { recipe = 'desert'; radiusE = 0.4 + 1.4 * rng.float(); if (rng.float() < 0.5) atmo = { color: [0.9, 0.7, 0.5], height: 0.02, density: 0.6, mie: 0.8, rayleigh: [0.8, 0.5, 0.3] }; }
      else if (teq > 240 && roll < 0.7) { recipe = 'ocean'; radiusE = 0.7 + 1.0 * rng.float(); atmo = { color: [0.4, 0.6, 1.0], height: 0.018, density: 1.0, mie: 0.5, rayleigh: [0.2, 0.45, 1.0] }; }
      else if (teq > 120 && roll < 0.5) { recipe = 'ice'; radiusE = 0.5 + 1.2 * rng.float(); atmo = rng.float() < 0.4 ? { color: [0.7, 0.8, 1.0], height: 0.02, density: 0.4, mie: 0.3, rayleigh: [0.4, 0.6, 1.0] } : null; }
      else { recipe = 'gas'; type = 'gas'; radiusE = 3.5 + 9 * rng.float(); atmo = { color: [0.9, 0.85, 0.7], height: 0.01, density: 0.6, mie: 0.5, rayleigh: [0.6, 0.55, 0.45], gas: true }; if (rng.float() < 0.45) rings = { inner: 1.3 + 0.3 * rng.float(), outer: 2.0 + 0.6 * rng.float(), faint: rng.float() < 0.5 }; }
      const tintA = [0.6 + 0.4 * rng.float(), 0.5 + 0.4 * rng.float(), 0.4 + 0.5 * rng.float()];
      const tintB = [0.9, 0.85 + 0.1 * rng.float(), 0.7 + 0.2 * rng.float()];
      const massRel = Math.pow(L, 1 / 3.5);
      const periodY = kp && kp.periodD ? kp.periodD / 365.25 : Math.sqrt(a * a * a / Math.max(massRel, 0.1));
      let letterIdx = i; while (!kp && this.registry.find(`${star.name} ${GREEK[letterIdx] || 'z'}`) && letterIdx < GREEK.length - 1) letterIdx++;
      const kindWord = recipe === 'gas' ? 'Gas giant' : recipe.charAt(0).toUpperCase() + recipe.slice(1) + ' world';
      const def = { id: `${star.id}-p${i + 1}`, name: kp ? `${star.name} ${kp.letter}` : `${star.name} ${GREEK[letterIdx] || (i + 1)}`, kind: 'planet', color: recipe === 'lava' ? '#ff7a40' : recipe === 'ocean' ? '#5fa8ff' : recipe === 'gas' ? '#e0c8a0' : recipe === 'ice' ? '#cfe8ff' : '#d8b080', radiusKm: radiusE * EARTH_RADIUS_KM, type, atmosphere: atmo, rings, procedural: recipe, oblateness: type === 'gas' ? 0.05 : 0,
        data: kp ? { type: `${kindWord} (${kp.hz ? 'habitable zone · ' : ''}surface procedural)`, radius: `${fmtNum(radiusE, 3)} R⊕`, ...(kp.mass ? { mass: kp.mass } : {}), semiMajorAxis: `${fmtNum(a, 4)} AU`, orbitalPeriod: `${fmtNum(kp.periodD, 4)} days`, temperature: `≈ ${Math.round(teq)} K equilibrium`, ...(kp.discovered ? { discovered: kp.discovered } : {}) }
                 : { type: `${kindWord} (procedural)`, radius: `${fmtNum(radiusE, 2)} R⊕`, semiMajorAxis: `${fmtNum(a, 3)} AU`, orbitalPeriod: `${fmtNum(periodY * 365.25, 3)} days`, temperature: `≈ ${Math.round(teq)} K equilibrium`, atmosphere: atmo ? 'Yes' : 'None' },
        description: kp && kp.desc ? kp.desc.en : (star.knownSystem && star.knownSystem.desc ? star.knownSystem.desc.en : i18n.tpl('exoDesc', { kind: i18n.tpl({ gas: 'kGas', lava: 'kLava', desert: 'kDesert', ocean: 'kOcean', ice: 'kIce' }[recipe], {}).en, star: star.name, a: fmtNum(a, 2), teq: Math.round(teq) }).en), subtitle: i18n.tpl('exoSub', { star: star.name }).en,
        provenance: kp ? (kp.provenance || 'observed') : 'procedural', astro: kp && kp.astro ? kp.astro : null, hz: !!(kp && kp.hz) };
      const kindKey = { gas: 'kGas', lava: 'kLava', desert: 'kDesert', ocean: 'kOcean', ice: 'kIce' }[recipe];
      const esName = i18n.ES_CONTENT[star.id]?.name || star.i18n?.es?.name || star.name;
      def.i18n = { es: { name: def.name.replace(star.name, esName), subtitle: i18n.tpl('exoSub', { star: esName }).es, description: kp && kp.desc ? kp.desc.es : (star.knownSystem && star.knownSystem.desc ? star.knownSystem.desc.es : i18n.tpl('exoDesc', { kind: i18n.tpl(kindKey, {}).es, star: esName, a: fmtNum(a, 2), teq: Math.round(teq) }).es) } };
      const planet = { def, a, periodY, phase: rng.float() * Math.PI * 2, incl: rng.gauss() * 0.03, node: rng.float() * Math.PI * 2, tintA, tintB, position: new THREE.Vector3(), velocity: new THREE.Vector3(), realRadius: def.radiusKm * KM, radius: def.radiusKm * KM, pole: new THREE.Vector3(0, 1, 0), quaternion: new THREE.Quaternion(), group: new THREE.Group(), renderer: null, built: false, rotationPeriodD: 0.4 + 3 * rng.float(), recipe };
      planet.group.matrixAutoUpdate = false;
      this.engine.scene.add(planet.group);
      // registry object
      const self = this;
      const obj = Object.assign(planet, {
        id: def.id, name: def.name, kind: 'planet', color: def.color, priority: kp ? 3 : 2, parent: star, aliases: [], labelRange: [1.2, 2e6], data: def.data, description: def.description, subtitle: def.subtitle, i18n: def.i18n, provenance: def.provenance, astrobiology: def.astro, inHabitableZone: def.hz, procedural: !kp,
        getPosition(out) { return out.copy(planet.position); },
        getVelocity(out) { return out.copy(planet.velocity); },
        massKg: def.radiusKm * def.radiusKm * def.radiusKm * (type === 'gas' ? 1.2e12 : 5.5e12) * 4.19,   // rough: density × volume (kg, with radius in km)
        lightDir(out) { return out.copy(star.scenePos).sub(planet.position).normalize(); },
        worldToLocal(p, out) { out.copy(p).sub(planet.position).applyQuaternion(planet.quaternion.clone().invert()); out.x /= planet.group.scale.x; out.y /= planet.group.scale.y; out.z /= planet.group.scale.z; return out; },
        worldDirToLocal(d, out) { return out.copy(d).applyQuaternion(planet.quaternion.clone().invert()).normalize(); },
        manager: this.solar,
      });
      this.registry.add(obj);
      sys.planets.push(planet);
      this.pending.push({ sys, planet });
    }
    return sys;
  }

  _buildPlanet(sys, p) {
    const def = p.def;
    const size = 512;
    const seed = (sys.rng.int(1e9)) >>> 0;
    p.building = true;
    // surfaces are generated in a worker; the planet appears when its textures arrive
    generateSurfaceAsync(p.recipe, { width: size, seed, tint: p.tintA, tint2: p.tintB, emissive: p.recipe === 'lava', water: p.recipe === 'ocean', normalStrength: 5 }).then(tex => {
      if (sys.disposed) return;
      const ringTex = def.rings ? generateRingTexture('saturn', 1024) : null;
      p.renderer = new PlanetRenderer(p, { map: tex.map, normal: tex.normalMap, emissive: tex.emissiveMap, spec: tex.specMap }, { ringTex, normalScale: 1.2 });
      if (def.rings) p.rings = new Rings(p, ringTex, { maxRocks: 2000 });
    }).catch(e => console.error(e)).finally(() => { p.built = true; p.building = false; });
  }

  /** Planet positions for the simulated time (called before the camera). */
  updatePositions(simMs, scaleT) {
    const days = (simMs - Date.UTC(2000, 0, 1, 12)) / 86400e3;
    const dtS = this._lastSimMs != null ? (simMs - this._lastSimMs) / 1000 : 0;
    for (const sys of this.systems.values()) {
      if (sys.binary) {
        // Keplerian relative orbit; the companion carries (mPrim / (mPrim + m)) of the separation from the barycentre at the primary's position
        const b = sys.binary; const M = (days / (b.periodY * 365.25)) * Math.PI * 2 + b.phase;
        let E = M; for (let k = 0; k < 6; k++) E -= (E - b.e * Math.sin(E) - M) / (1 - b.e * Math.cos(E));
        const a = b.aAU * AU, x = a * (Math.cos(E) - b.e), y = a * Math.sqrt(1 - b.e * b.e) * Math.sin(E);
        const f = b.mPrim / (b.mPrim + b.mass);
        const prev = b.position.clone();
        b.position.set(x * f, y * f * Math.sin(b.incl), y * f * Math.cos(b.incl)).add(sys.star.scenePos);
        if (Math.abs(dtS) > 1e-6) b.velocity = prev.sub(b.position).multiplyScalar(-1 / dtS);
        b.body.group.position.copy(b.position).sub(sys.star.scenePos);
      }
      for (const p of sys.planets) {
        const mul = p.def.type === 'gas' ? VISUAL.giantRadius : VISUAL.rockyRadius;
        p.radius = expLerp(p.realRadius, p.realRadius * mul, scaleT);
        const ang = p.phase + (days / (p.periodY * 365.25)) * Math.PI * 2;
        const aReal = p.a * AU;
        const aVis = VISUAL.orbitMul * Math.pow(p.a, VISUAL.orbitPow) * AU;
        const aa = aReal + (aVis - aReal) * scaleT;
        const x = Math.cos(ang) * aa, z = Math.sin(ang) * aa;
        const y = Math.sin(ang + p.node) * aa * p.incl;
        if (Math.abs(dtS) > 1e-6) p.velocity.copy(p.position);
        p.position.set(x, y, z).add(sys.star.scenePos);
        if (Math.abs(dtS) > 1e-6) p.velocity.sub(p.position).multiplyScalar(-1 / dtS);
        const W = (days / p.rotationPeriodD) * Math.PI * 2;
        p.quaternion.setFromAxisAngle(p.pole, W % (Math.PI * 2));
        p.group.position.copy(p.position); p.group.quaternion.copy(p.quaternion); p.group.scale.setScalar(p.radius);
        if (p.def.oblateness) p.group.scale.y = p.radius * (1 - p.def.oblateness);
        p.group.updateMatrix(); p.group.matrixWorld.copy(p.group.matrix);
      }
    }
    this._lastSimMs = simMs;
  }

  update(dt, t, camPos, simMs, scaleT, exposure) {
    // hand pending planets to the texture worker (it serialises the work; nothing blocks here)
    while (this.pending.length) { const { sys, planet } = this.pending.shift(); try { this._buildPlanet(sys, planet); } catch (e) { console.error(e); planet.built = true; } }
    const cam = this.engine.camera;
    const h = window.innerHeight; const fovScale = h / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
    for (const [id, sys] of this.systems) {
      const d = camPos.distanceTo(sys.star.scenePos);
      const cc = this.ctx.cameraCtl;
      const wanted = cc.target === sys.star || (cc.travel && cc.travel.obj === sys.star) || (cc.target && cc.target.parent === sys.star) || (cc.travel && cc.travel.obj && cc.travel.obj.parent === sys.star);
      if (d > 3 * LY && !wanted) { this._dispose(sys); this.systems.delete(id); continue; }
      const rpx = sys.star.radius / d * fovScale;
      sys.starBody.update(t, cam, rpx);
      sys.starBody.group.visible = rpx > 0.5;
      if (sys.binary) { const db = camPos.distanceTo(sys.binary.position); const rpb = sys.binary.body.opts.radius / db * fovScale; sys.binary.body.update(t, cam, rpb); sys.binary.body.group.visible = rpb > 0.5; }
      for (const p of sys.planets) {
        if (p.renderer) {
          const dp = camPos.distanceTo(p.position);
          const prpx = p.radius / dp * fovScale;
          p.renderer.update(t, camPos, sys.star.scenePos, prpx, [], exposure);
          if (p.rings) p.rings.update(t, camPos, sys.star.scenePos, prpx, exposure, cam);
        }
      }
    }
  }

  _dispose(sys) {
    sys.disposed = true;
    if (sys.binary) this.registry.remove(sys.star.id + '-companion');
    this.engine.scene.remove(sys.group);
    for (const p of sys.planets) { this.engine.scene.remove(p.group); this.registry.remove(p.id); }
    this.pending = this.pending.filter(q => q.sys !== sys);
  }
}
