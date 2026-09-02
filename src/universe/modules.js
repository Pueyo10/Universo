// Attaches the heavier world modules after the first frame is available.
// Each module is optional and independent; failures are logged, never fatal.
export async function attachModules(ctx) {
  const { progress } = ctx;
  const steps = [
    ['Solar System', async () => { const m = await import('../solar/SolarSystemManager.js'); ctx.solar = new m.SolarSystemManager(ctx); await ctx.solar.build(); ctx.universe.add(ctx.solar); ctx.universe.solar = ctx.solar; }],
    ['Stellar neighbourhood', async () => { const m = await import('./StarFieldManager.js'); ctx.stars = new m.StarFieldManager(ctx); ctx.universe.add(ctx.stars); ctx.universe.stars = ctx.stars; }],
    ['Constellations', async () => { const m = await import('./Constellations.js'); ctx.constellations = new m.ConstellationLayer(ctx); ctx.universe.add(ctx.constellations); ctx.universe.constellations = ctx.constellations; }],
    ['Nebulae', async () => { const m = await import('./NebulaManager.js'); ctx.nebulae = new m.NebulaManager(ctx); ctx.universe.add(ctx.nebulae); ctx.universe.nebulae = ctx.nebulae; }],
    ['Sagittarius A*', async () => { const m = await import('./BlackHole.js'); ctx.blackHole = new m.BlackHole(ctx); ctx.universe.add(ctx.blackHole); ctx.universe.blackHole = ctx.blackHole; }],
    ['Distant galaxies', async () => { const m = await import('./DistantGalaxies.js'); ctx.galaxies = new m.DistantGalaxies(ctx); ctx.universe.add(ctx.galaxies); ctx.universe.galaxies = ctx.galaxies; }],
    ['Grids', async () => { const m = await import('./Grids.js'); ctx.grids = new m.GridLayer(ctx); ctx.universe.add(ctx.grids); ctx.universe.grids = ctx.grids; }],
    ['Physics', async () => { const m = await import('../systems/PhysicsViz.js'); ctx.physicsViz = new m.PhysicsViz(ctx); ctx.universe.add(ctx.physicsViz); ctx.universe.physicsViz = ctx.physicsViz; }],
    ['Pulsars', async () => { const m = await import('./Pulsars.js'); ctx.pulsars = new m.Pulsars(ctx); ctx.universe.add(ctx.pulsars); ctx.universe.pulsars = ctx.pulsars; }],
    ['Supernova', async () => { const m = await import('./Supernova.js'); ctx.supernova = new m.SupernovaSim(ctx); ctx.universe.add(ctx.supernova); ctx.universe.supernova = ctx.supernova; }],
    ['Heliosphere', async () => { const m = await import('./Heliosphere.js'); ctx.heliosphere = new m.Heliosphere(ctx, ctx.solar); ctx.universe.add(ctx.heliosphere); ctx.universe.heliosphere = ctx.heliosphere; }],
    ['Observatory', async () => { const m = await import('./Observatory.js'); ctx.observatory = new m.Observatory(ctx); ctx.universe.observatory = ctx.observatory; }],
  ];
  let i = 0;
  for (const [name, fn] of steps) {
    progress(0.2 + 0.7 * (i / steps.length), name);
    try { await fn(); } catch (e) { console.error(`[module ${name}]`, e); }
    await new Promise(r => setTimeout(r, 0));
    i++;
  }
}
