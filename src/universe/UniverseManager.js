import * as THREE from 'three';
import { BackgroundSky } from './BackgroundSky.js';
import { GalaxyManager } from './GalaxyManager.js';
import { LY, AU } from '../core/Units.js';

// Composes every world system and drives their per-frame updates in order.
export class UniverseManager {
  constructor(engine, registry, time) {
    this.engine = engine;
    this.registry = registry;
    this.time = time;
    this.systems = [];
    this.camPos = new THREE.Vector3();
    this.progress = () => {};
  }

  async build(progress = () => {}) {
    this.progress = progress;
    progress(0.05, 'Deep sky');
    this.sky = new BackgroundSky(this.engine);
    await tick();
    progress(0.12, 'Sampling the Milky Way');
    this.galaxy = new GalaxyManager(this.engine, this.registry, this.engine.q);
    await tick();
    // optional modules are attached later by main (solar system, nebulae, ...)
    return this;
  }

  add(system) { this.systems.push(system); return system; }

  update(dt, t, camera) {
    this.camPos.copy(camera.position);
    const dGC = this.camPos.distanceTo(this.galaxy.centerScene) / LY;
    const s = Math.min(Math.max((dGC - 60000) / 80000, 0), 1);
    this.sky.material.uniforms.uGalaxyFade.value = 1 - s * s * (3 - 2 * s);
    this.sky.update(dt, t);
    this.galaxy.update(dt, t, this.camPos);
    for (const s of this.systems) s.update(dt, t, this.camPos);
  }

  /** A human-readable region name for the HUD. */
  regionName(pos) {
    const dSun = pos.length();
    if (dSun < 0.02 * AU) return 'rCorona';
    if (dSun < 2.5 * AU) return 'rInner';
    if (dSun < 35 * AU) return 'rOuter';
    if (dSun < 120 * AU) return 'rKuiper';
    if (dSun < 2 * LY) return 'rOort';
    if (dSun < 3000 * LY) return 'rSpur';
    const g = this.galaxy;
    const dGC = pos.distanceTo(g.centerScene);
    if (dGC < 6000 * LY) return 'rBulge';
    if (dGC < 60000 * LY && Math.abs(pos.clone().sub(g.centerScene).dot(new THREE.Vector3(0, 1, 0))) < 1e9 * LY) return 'rDisc';
    if (dGC < 200000 * LY) return 'rHalo';
    if (dGC < 5e6 * LY) return 'rLocal';
    if (dGC < 80e6 * LY) return 'rSupercluster';
    return 'rWeb';
  }
}

function tick() { return new Promise(r => setTimeout(r, 0)); }
