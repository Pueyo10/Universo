import * as THREE from 'three';
import { AU, KM, LY, SUN_RADIUS_KM, formatDistance, clamp, smoothstep, damp, lerp } from '../core/Units.js';
import { bus } from '../core/EventBus.js';
import { SUN, PLANETS, DWARF_PLANETS, MOONS } from '../data/SolarSystemData.js';
import { Body, VISUAL } from './Body.js';
import { StarBody } from './Sun.js';
import { PlanetRenderer } from './Planet.js';
import { Rings } from './Rings.js';
import { Belts } from './Belts.js';
import { buildComets } from './Comets.js';
import { buildSpacecraft } from './Spacecraft.js';
import { OrbitLines, Markers } from './OrbitLines.js';
import { generateSurfaceAsync, generateRingTexture, normalFromImage } from './TextureFactory.js';
import { ExoSystemManager } from './ExoSystem.js';
import { SurfaceSites } from './SurfaceSites.js';
import { HabitableZoneLayer } from './HabitableZone.js';
import { Plumes } from './Plumes.js';
import { Auroras } from './Aurora.js';

// Orchestrates the Solar System: bodies, orbits, rendering LOD, scale mode,
// exposure, the Sun's lens flare / occlusion and the sunlight for spacecraft.
export class SolarSystemManager {
  constructor(ctx) {
    this.ctx = ctx; this.engine = ctx.engine; this.registry = ctx.registry; this.time = ctx.time; this.cameraCtl = ctx.cameraCtl;
    this.bodies = []; this.byId = {};
    this.scaleT = 0; this.scaleTarget = 0;
    this.loader = new THREE.TextureLoader();
    this._v = new THREE.Vector3(); this._v2 = new THREE.Vector3();
    this.exposure = 1;
    this.group = new THREE.Group();
    this.engine.scene.add(this.group);
    this.upgradeQueue = [];
    this.upgradeReady = false;
    bus.on('intro:done', () => { this.upgradeReady = true; });
    bus.on('toggle', (k, v) => { if (k === 'realScale') this.scaleTarget = v ? 0 : 1; if (k === 'orbits') { this.orbits.enabled = v; } });
    bus.on('camera:travel', o => { if (o && o.kind === 'star' && o.procedural !== undefined) this.exo.ensure(o); });
    bus.on('select', o => { if (o && o.kind === 'star' && o.scenePos) this.exo.ensure(o); });
  }

  _tex(path, srgb = true) {
    return new Promise(res => this.loader.load(path, t => { t.colorSpace = THREE.NoColorSpace; t.anisotropy = 8; t.wrapS = THREE.RepeatWrapping; t.minFilter = THREE.LinearMipmapLinearFilter; res(t); }, undefined, () => res(null)));
  }

  async build() {
    const prog = this.ctx.progress || (() => {});
    // ---- Sun
    const sunTex = await this._tex(SUN.texture);
    const sun = new Body({ ...SUN, kind: 'sun' }, this);
    sun.star = new StarBody({ radius: sun.realRadius, temp: 5772, tint: [1.0, 0.86, 0.62], map: sunTex, intensity: 3.0 });
    sun.group.add(sun.star.group);
    this._register(sun, SUN);
    this.sun = sun;
    this.group.add(sun.group);
    // ---- planets & dwarfs
    this.orbits = new OrbitLines(this);
    this.markers = new Markers(this);
    this.markers.add(sun);
    this.ringTextures = { saturn: generateRingTexture('saturn', 2048), uranus: generateRingTexture('uranus', 1024), neptune: generateRingTexture('neptune', 1024) };
    const defs = [...PLANETS, ...DWARF_PLANETS];
    // kick off every procedural surface in the worker pool now; the build loop below awaits them in order
    for (const def of [...defs, ...MOONS]) {
      if (def.texture) continue;
      if (def.procedural) generateSurfaceAsync(def.procedural, { width: 512, seed: hash(def.id), normalStrength: 6 });
      else generateSurfaceAsync('generic', { width: 512, seed: hash(def.id), tint: [0.6, 0.58, 0.55] });
    }
    for (let i = 0; i < defs.length; i++) {
      const def = defs[i];
      prog(0.22 + 0.25 * (i / defs.length), `Building ${def.name}`);
      await this._buildPlanet(def, null);
      await tick();
    }
    // ---- moons
    for (let i = 0; i < MOONS.length; i++) {
      const def = MOONS[i];
      prog(0.47 + 0.15 * (i / MOONS.length), `Building ${def.name}`);
      const parent = this.byId[def.parent];
      if (!parent) continue;
      await this._buildPlanet({ ...def, kind: 'moon', radiusKm: def.r }, parent);
      if (i % 3 === 2) await tick();
    }
    // ---- belts, comets, spacecraft
    prog(0.63, 'Asteroid belt & Kuiper belt');
    this.belts = new Belts(this.ctx, this);
    await tick();
    prog(0.66, 'Comets');
    this.comets = buildComets(this);
    for (const c of this.comets) { this.group.add(c.group); this._register(c, c.c); this.markers.add(c); this.orbits.add(c, { segments: 512, opacity: 0.2 }); }
    prog(0.68, 'Spacecraft');
    this.spacecraft = buildSpacecraft(this, this.byId);
    for (const s of this.spacecraft) { this.group.add(s.group); this._register(s, s.def); this.markers.add(s); if (s.def.altitudeKm) this.orbits.add(s, { segments: 128, opacity: 0.18 }); }
    // sunlight for standard materials (spacecraft, comet nuclei)
    this.light = new THREE.DirectionalLight(0xfff4e6, 3.2);
    this.engine.scene.add(this.light); this.engine.scene.add(this.light.target);
    this.engine.scene.add(new THREE.AmbientLight(0x334455, 0.12));
    this.exo = new ExoSystemManager(this.ctx, this);
    this.sites = new SurfaceSites(this.ctx, this);
    this.habitable = new HabitableZoneLayer(this.ctx, this);
    this.plumes = new Plumes(this.ctx, this);
    this.auroras = new Auroras(this.ctx, this);
    this.update(0, 0, this.cameraCtl.position);
    return this;
  }

  async _buildPlanet(def, parent) {
    const body = new Body(def, this, parent);
    this.group.add(body.group);
    // textures
    let map = null, night = null, cloud = null, normal = null, spec = null, emissive = null;
    if (def.texture) {
      map = await this._tex(def.texture);
      if (def.nightTexture) night = await this._tex(def.nightTexture);
      if (def.cloudTexture) cloud = await this._tex(def.cloudTexture);
      if (def.normalTexture) normal = await this._tex(def.normalTexture, false);
      if (def.specularTexture) spec = await this._tex(def.specularTexture, false);
      if (def.fakeNormal && map && map.image) normal = normalFromImage(map.image, def.fakeNormal, 1024);
    } else if (def.procedural) {
      // fast 512px version now; large bodies get a 1024px upgrade after the intro
      const tex = await generateSurfaceAsync(def.procedural, { width: 512, seed: hash(def.id), normalStrength: 6 });
      map = tex.map; normal = tex.normalMap; emissive = tex.emissiveMap;
      if ((def.r || def.radiusKm) >= 1000) this.upgradeQueue.push({ id: def.id, recipe: def.procedural });
    } else {
      const tex = await generateSurfaceAsync('generic', { width: 512, seed: hash(def.id), tint: [0.6, 0.58, 0.55] });
      map = tex.map; normal = tex.normalMap;
    }
    const ringTex = def.rings ? this.ringTextures[def.id] : null;
    body.renderer = new PlanetRenderer(body, { map, night, cloud, normal, spec, emissive }, { ringTex, normalScale: def.normalTexture ? 0.9 : (def.fakeNormal ? 0.7 : 1.0) });
    if (def.rings) body.rings = new Rings(body, ringTex, { maxRocks: this.engine.q.ringParticles });
    this._register(body, def);
    this.markers.add(body);
    if (body.elements || (parent && def.a)) this.orbits.add(body, { segments: parent ? 128 : 360 });
    return body;
  }

  _register(body, def) {
    const self = this;
    Object.assign(body, {
      aliases: def.aliases || [], color: def.color || '#ffffff', priority: body.kind === 'sun' ? 9 : body.kind === 'planet' ? 8 : body.kind === 'dwarf' ? 4 : body.kind === 'moon' ? 3 : 2,
      data: def.data, description: def.description, facts: def.facts, subtitle: def.subtitle, kindLabel: def.kindLabel,
      getPosition(out) { return out.copy(body.position); },
      lightDir(out) { return body.kind === 'sun' ? out.set(0, 1, 0) : out.copy(body.position).negate().normalize(); },
      hasRings: !!def.rings,
    });
    if (body.kind === 'planet' || body.kind === 'dwarf') body.labelRange = [1.2, 3e6];
    if (body.kind === 'moon') body.labelRange = [1.2, 1200];
    if (body.kind === 'sun') body.labelRange = [1.5, 5e6];
    if (body.kind === 'spacecraft') body.labelRange = [1.5, 5e6];
    if (body.kind === 'comet' || body.kind === 'asteroid') body.labelRange = [1.5, 1e7];
    this.registry.add(body);
    this.bodies.push(body);
    this.byId[body.id] = body;
  }

  update(dt, t, camPos) {
    // background texture upgrades (after the intro): generated in a worker, one at a time, swapped in when ready
    if (this.upgradeReady && this.upgradeQueue.length && !this._upgrading) {
      const { id, recipe } = this.upgradeQueue.shift();
      const b = this.byId[id];
      if (b && b.renderer) {
        this._upgrading = true;
        generateSurfaceAsync(recipe, { width: 1024, seed: hash(id), normalStrength: 6 }).then(tex => {
          const u = b.renderer.surfMat.uniforms;
          u.uMap.value = tex.map; u.uNormalMap.value = tex.normalMap; if (tex.emissiveMap) u.uEmissiveMap.value = tex.emissiveMap;
        }).finally(() => { this._upgrading = false; });
      }
    }
    const simMs = this.time.simMs;
    // positions are normally advanced by updatePositions() *before* the camera runs
    // (otherwise an orbiting camera lags the body by one frame and shakes at high time speeds)
    if (this._posFrame !== this.engine.frame) this.updatePositions(dt);
    // ---- exposure: darker near the Sun / bright bodies, brighter in deep space
    const dSun = camPos.length();
    const near = this.cameraCtl.nearest;
    let target = 1.0;
    if (dSun < 400 * AU) target = 0.85;
    if (near.obj && near.obj.kind === 'sun' && near.dist < near.obj.radius * 12) target = 0.36;
    this.exposure = damp(this.exposure, target, 2, dt);
    const settings = this.engine.settings;
    const sceneExposure = settings.exposure * (settings.autoExposure ? this.exposure : 1);
    this.engine.finalPass.uniforms.uExposure.value = sceneExposure;
    // star field exposure: dim point stars when close to bright bodies, brighter far away
    const starExp = settings.autoExposure ? clamp(0.35 + 0.65 * smoothstep(50 * AU, 5000 * AU, dSun), 0.35, 1.0) * (1 + 0.6 * smoothstep(3000 * LY, 60000 * LY, dSun)) : 1;
    if (this.ctx.universe.stars) this.ctx.universe.stars.exposure = starExp;
    this.ctx.universe.galaxy.setStarExposure(clamp(0.5 + 0.5 * smoothstep(5 * LY, 500 * LY, dSun), 0.5, 1) * 1.0);
    // ---- render updates
    const cam = this.engine.camera;
    const h = window.innerHeight;
    const fovScale = h / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
    const sunPos = this.sun.position;
    const shadowMoons = [];
    for (const b of this.bodies) {
      const d = camPos.distanceTo(b.position);
      const rpx = b.radius / Math.max(d - b.radius, 1e-9) * fovScale;
      b.rpx = rpx;
      if (b.kind === 'sun') { b.star.update(t, cam, rpx); continue; }
      if (b.renderer) {
        shadowMoons.length = 0;
        if (b.kind === 'planet' && b.children) { for (const m of b.children) if (m.kind === 'moon') shadowMoons.push(m); shadowMoons.sort((a, c) => c.radius - a.radius); }
        else if (b.kind === 'moon' && b.parent) shadowMoons.push(b.parent);   // the planet's shadow on its moon: lunar eclipses
        b.renderer.update(t, camPos, sunPos, rpx, shadowMoons, 1.0);
        if (b.rings) b.rings.update(t, camPos, sunPos, rpx, 1.0, cam);
        b.group.visible = rpx > 0.4;
      } else if (b.kind === 'comet') {
        b.updateVisuals(t, camPos, 1.0, this.engine.renderer.getPixelRatio());
        b.group.visible = rpx > 0.3;
      } else if (b.kind === 'spacecraft') {
        b.group.visible = rpx > 0.3;
      }
    }
    this.belts.update(dt, t, camPos, this.time.daysSinceJ2000, this.scaleT, 1.0);
    this.orbits.update(camPos, this.scaleT);
    this.markers.update(camPos, cam);
    this.exo.update(dt, t, camPos, simMs, this.scaleT, 1.0);
    if (this.habitable) this.habitable.update(dt, t, camPos);
    if (this.plumes) this.plumes.update(dt, t, camPos);
    if (this.auroras) this.auroras.update(dt, t, camPos, sunPos);
    // ---- sunlight for standard materials: from the Sun toward the camera's neighbourhood
    this.light.position.copy(camPos).negate().normalize().multiplyScalar(10);
    this.light.position.add(camPos); this.light.target.position.copy(camPos);
    this.light.intensity = 3.2 * sceneExposure;
    // ---- lens flare: sun screen position & occlusion
    this._updateFlare(camPos, cam, fovScale);
    // ---- atmospheric entry: haze, exposure and colour as the camera descends into an atmosphere
    this._updateAtmosphereEntry(camPos, near);
  }

  /** Advance the scale blend and every body position for the current simulated time. Call before the camera. */
  updatePositions(dt) {
    this._posFrame = this.engine.frame;
    this.scaleT = damp(this.scaleT, this.scaleTarget, 3, dt);
    if (Math.abs(this.scaleT - this.scaleTarget) < 0.002) this.scaleT = this.scaleTarget;
    const simMs = this.time.simMs;
    for (const b of this.bodies) b.update(simMs, this.scaleT);   // parents first: bodies array is in creation order
    this._applyBarycenters(simMs);
    if (this.exo) this.exo.updatePositions(simMs, this.scaleT);
  }

  /**
   * Real two-body systems orbit their common centre of mass: shift a flagged parent
   * (Earth, Pluto) off the Keplerian point by -sum(m_i r_i) / (M + sum m_i) and carry its
   * moons along. Visible in the physics visualisation as the barycentre marker.
   */
  _applyBarycenters(simMs) {
    for (const b of this.bodies) {
      if (!b.def.barycenter || !b.def.massKg || !b.children.length) continue;
      let M = b.def.massKg; const sum = this._v.set(0, 0, 0);
      for (const m of b.children) { if (m.kind !== 'moon' || !m.def || !m.def.massKg) continue; M += m.def.massKg; sum.addScaledVector(this._v2.copy(m.position).sub(b.position), m.def.massKg); }
      if (M <= b.def.massKg) continue;
      const shift = sum.multiplyScalar(-1 / M);
      b.barycenter = (b.barycenter || new THREE.Vector3()).copy(b.position);   // the Keplerian point IS the barycentre
      // velocity must be measured on the shifted positions only (a pre-shift sample would read the shift itself as ~300 units/s)
      b.deferVelocity = true; b.position.add(shift); b.trackVelocity(simMs); b.syncGroup();
      for (const m of b.children) { if (m.kind !== 'moon' || !m.def) continue; m.deferVelocity = true; m.position.add(shift); m.trackVelocity(simMs); m.syncGroup(); }
    }
  }

  _updateAtmosphereEntry(camPos, near) {
    const fp = this.engine.finalPass.uniforms;
    let haze = 0;
    const b = near.obj;
    if (b && b.def && b.def.atmosphere && b.renderer) {
      const atmo = b.def.atmosphere;
      const alt = near.dist / b.radius;                 // altitude in radii
      const top = atmo.height * 1.2;
      if (alt < top) {
        const depth = 1 - alt / top;                    // 0 at the top of the atmosphere, 1 at the surface
        const dens = Math.min(atmo.density, 3) / 3;
        // day side only: the haze is scattered sunlight
        const sunDir = this._v.copy(b.position).negate().normalize();
        const up = this._v2.copy(camPos).sub(b.position).normalize();
        const day = clamp(0.15 + 0.85 * smoothstep(-0.2, 0.3, up.dot(sunDir)), 0, 1);
        haze = Math.pow(depth, 1.6) * (0.25 + 0.75 * dens) * day * (atmo.thick ? 0.95 : 0.7);
        const c = atmo.color; fp.uHazeColor.value.setRGB(c[0], c[1], c[2]);
        // realistic flight: buffet at high speed inside the atmosphere
        if (this.cameraCtl.mode === 'SHIP' && this.cameraCtl.ship) {
          const v = this.cameraCtl.ship.velocity.length() * 1000;   // km/s relative to the Sun; use relative to body
          const rel = this._v.copy(this.cameraCtl.ship.velocity).sub(b.velocity).length() * 1000;
          const shake = clamp((rel - 2) / 6, 0, 1) * depth * 0.004;
          if (shake > 0) { this.cameraCtl.yaw += (Math.random() - 0.5) * shake; this.cameraCtl.pitch += (Math.random() - 0.5) * shake; }
        }
      }
    }
    fp.uHaze.value = damp(fp.uHaze.value, haze, 4, this.engine.dt || 0.016);
  }

  _updateFlare(camPos, cam, fovScale) {
    const fp = this.engine.finalPass.uniforms;
    const sunPos = this.sun.position;
    const d = camPos.distanceTo(sunPos);
    const v = this._v.copy(sunPos).project(cam);
    const onScreen = v.z < 1 && v.z > -1 && Math.abs(v.x) < 1.4 && Math.abs(v.y) < 1.4;
    let vis = 0;
    if (onScreen && d > this.sun.radius * 1.05) {
      vis = 1;
      // occlusion by bodies between camera and Sun
      const dir = this._v2.copy(sunPos).sub(camPos).normalize();
      for (const b of this.bodies) {
        if (b === this.sun || b.kind === 'spacecraft') continue;
        const toB = b.position.clone().sub(camPos);
        const along = toB.dot(dir);
        if (along <= 0 || along >= d) continue;
        const perp = toB.sub(dir.clone().multiplyScalar(along)).length();
        // angular comparison: body angular radius vs sun angular radius
        const bAng = b.radius / along, sAng = this.sun.radius / d;
        const sep = perp / along;
        const cover = clamp((bAng + sAng - sep) / (2 * sAng), 0, 1);
        vis *= 1 - cover;
        if (vis <= 0.001) break;
      }
      // fade when the Sun is a distant star
      vis *= 1 - smoothstep(3000 * AU, 40000 * AU, d);
      // fade at screen edge
      vis *= 1 - smoothstep(1.0, 1.4, Math.max(Math.abs(v.x), Math.abs(v.y)));
    }
    fp.uSunScreen.value.set(v.x * 0.5 + 0.5, v.y * 0.5 + 0.5);
    fp.uSunVisible.value = damp(fp.uSunVisible.value, vis, 8, this.engine.dt || 0.016);
    const angR = Math.atan(this.sun.radius / d);
    fp.uSunSize.value = angR / THREE.MathUtils.degToRad(cam.fov) ;
  }
}

function tick() { return new Promise(r => setTimeout(r, 0)); }
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
