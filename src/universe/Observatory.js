import * as THREE from 'three';
import { bus } from '../core/EventBus.js';

// OBSERVATORY: the multiwavelength universe. Switching band changes what emits
// and what hides — an educational false-colour rendering, not a radiometric one:
//  visible  · what our eyes see
//  infrared · dust glows (warm), cool red stars brighten, hot blue stars fade, nebular dust lanes turn bright
//  uv       · only hot O/B stars, white dwarfs and ionised gas shine; dust absorbs
//  xray     · compact objects and hot gas: pulsars, Sgr A*, supernova remnants, coronae
//  radio    · the galactic plane's synchrotron glow, HII regions, pulsars, cold gas and dust
export const BANDS = ['visible', 'infrared', 'uv', 'xray', 'radio'];

export class Observatory {
  constructor(ctx) {
    this.ctx = ctx; this.engine = ctx.engine;
    this.band = 0;
    this.materials = new Set();       // ShaderMaterials with a uBand uniform
    this.dustMaterials = [];          // galaxy dust layers whose blending flips to additive in IR/radio
    bus.on('observatory', name => this.setBand(name));
  }

  /** Register a material (adds uBand if missing). */
  register(mat, isDust = false) {
    if (!mat || !mat.uniforms) return;
    if (!mat.uniforms.uBand) mat.uniforms.uBand = { value: this.band };
    this.materials.add(mat);
    if (isDust) this.dustMaterials.push({ mat, blending: mat.blending });
  }

  collect() {
    const u = this.ctx.universe;
    const g = u.galaxy;
    if (g) { this.register(g.starMaterial); for (const m of g.spriteMaterials) this.register(m, m.blending === THREE.MultiplyBlending); }
    if (u.stars) this.register(u.stars.material);
    if (u.nebulae) { for (const it of u.nebulae.items) this.register(it.mat); this.register(u.nebulae.starMaterial); }
    if (u.sky) this.register(u.sky.material);
    if (u.blackHole) this.register(u.blackHole.clusterMat);
    this.register(this.engine.finalPass.material);
  }

  setBand(name) {
    const i = typeof name === 'number' ? name : BANDS.indexOf(name);
    if (i < 0) return;
    this.band = i;
    this.collect();
    for (const m of this.materials) m.uniforms.uBand.value = i;
    // dust: absorbing (multiply) in visible/UV, emitting (additive) in infrared/radio
    const emit = i === 1 || i === 4;
    for (const d of this.dustMaterials) { d.mat.blending = emit ? THREE.AdditiveBlending : d.blending; d.mat.premultipliedAlpha = !emit; d.mat.needsUpdate = true; }
    // black hole & pulsar glows get much brighter in X-ray / radio
    const bh = this.ctx.universe.blackHole;
    if (bh && bh.glow) bh.glow.scale.setScalar(bh.rs * (i === 3 || i === 4 ? 400 : 60));
    if (this.ctx.universe.pulsars) for (const p of this.ctx.universe.pulsars.items) p.glow.scale.multiplyScalar(1);
    bus.emit('observatory:changed', BANDS[i]);
  }
}
