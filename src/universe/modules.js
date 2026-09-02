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
  ];
  let i = 0;
  for (const [name, fn] of steps) {
    progress(0.2 + 0.7 * (i / steps.length), name);
    try { await fn(); } catch (e) { console.error(`[module ${name}]`, e); }
    await new Promise(r => setTimeout(r, 0));
    i++;
  }
}
