# Milky Way — Interactive Universe

A real-time, explorable 3D universe in the browser: from a view of the whole
Milky Way down to the clouds of Earth, the rings of Saturn, the surface of Io,
the accretion disc of Sagittarius A* and procedurally generated planetary
systems around any star you fly to. Built with Three.js and custom GLSL.

## Language / Idioma

The whole experience is bilingual: interface, units, tour captions, region names
and every object (names, descriptions, data, curiosities). Switch with the
**ES / EN** button in the top bar, the *Language* setting, or `?lang=es`. The
choice is remembered; the first visit follows the browser language.

Toda la experiencia es bilingüe: interfaz, unidades, subtítulos del tour,
regiones y cada objeto (nombres, descripciones, datos, curiosidades). Cambia el
idioma con el botón **ES / EN** de la barra superior, el ajuste *Idioma* o
`?lang=es`. La elección se recuerda; la primera visita sigue el idioma del navegador.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production bundle in dist/
npm run preview    # serve the production bundle
```

Requires a WebGL2-capable browser. Quality defaults to **Auto**: a preset is
picked from the GPU (integrated → *low*, mid-range → *medium*, RTX/RX-class →
*high*) and **dynamic resolution scaling** then lowers the internal render
resolution as needed to hold 60 fps (it measures GPU time per frame when the
browser exposes timer queries, otherwise frame time). Force a preset with
`?q=low|medium|high|ultra`, disable the scaler with `?nodrs`, skip the opening
sequence with `?nointro`. Press `F3` for the stats overlay (frame / JS / GPU ms,
render scale, chunk generation).

## Controls

| Action | Input |
| --- | --- |
| Look | drag with the mouse |
| Move (free camera) | `W A S D`, `Q E` up/down, `Shift` boost, `Ctrl` slow |
| Zoom | mouse wheel (logarithmic, toward the hovered / selected object) |
| Select | click an object or its label · double-click travels there |
| Travel / focus / follow | `Enter` · `F` · `Shift+F` (or the buttons in the info panel) |
| Search | `/` or `Ctrl+K` — Earth, Saturn, Sagittarius A\*, Orion Nebula, Voyager 1, Andromeda… |
| Time | `Space` pause · `[` `]` slower / faster · `N` now |
| Toggles | `O` orbits · `L` labels · `C` constellations · `G` grid · `V` real / visual scale · `M` audio |
| Camera modes | `1` free · `2` orbit · `3` follow · `R` reset · `T` cinematic tour |
| UI | `H` hide UI · `F3` stats · `Esc` cancel travel / close |

## What is in the box

* **Scale.** One scene, one camera, from 100 m to 400 million light-years:
  float64 positions on the CPU, camera-relative float32 on the GPU, a
  logarithmic depth buffer, and every particle system stored in a small local
  frame (chunk, galaxy or body) so nothing jitters at any zoom.
* **Milky Way.** An analytic structural model (bulge, bar, four arms + Orion
  Spur, thin/thick disc, halo) samples 550 000 luminosity-weighted stars, 15 000
  diffuse-starlight billboards, 20 000 multiplicative dust sprites (real dark
  lanes), 2 600 HII regions and the nuclear glow. Inside the galaxy, nested LOD
  chunks (48 → 3 072 ly cells with luminosity cut-offs) generate hundreds of
  thousands of resolved stars on demand from the same density model, on top of
  ~550 real catalogue stars with true positions and 60 constellation figures.
* **Solar System.** Real JPL orbital elements propagated for the current date,
  IAU pole directions and rotation rates (the terminator is where it really is),
  27 moons (tidally locked, correct orbital planes), rings with real gap
  structure, Kuiper belt, scattered disc, Oort cloud, three comets with active
  tails, dwarf planets, Voyager 1/2, Pioneer 10/11, New Horizons, the ISS,
  Hubble and JWST at L2. A real-scale / visual-scale toggle blends smoothly
  between the two.
* **Planets.** Layered custom shaders: day/night with city lights, ocean
  specular, normal-mapped relief (real maps for Earth, derived for the others,
  procedural for every moon, Pluto and exoplanets), cloud layers with cloud
  shadows, a ray-marched single-scattering atmosphere (Rayleigh + Mie) with
  the planet's own shadow, moon-transit shadows on Jupiter, ring shadows on
  Saturn and Saturn's shadow across the rings, the polar hexagon, Neptune's
  storms, animated differential rotation and the Great Red Spot vortex. Fly
  into Saturn's rings and an instanced field of tumbling ice boulders appears.
* **Sun.** Animated granulation, sunspots with umbra/penumbra, limb darkening,
  a chromosphere of prominences and a streamer corona, plus a screen-space lens
  flare with analytic occlusion by planets.
* **Sagittarius A\*.** A post-processing pass integrates null geodesics in the
  Schwarzschild metric: gravitational lensing of the scene, the photon ring,
  the shadow and a relativistic accretion disc with Doppler beaming and
  gravitational redshift. The nuclear star cluster swirls around it.
* **Nebulae.** 20 real nebulae at their true positions plus ~60 procedural
  ones, each ray-marched as a volume with type-specific shaping (emission
  clouds with ionisation gradients and dust, planetary shells, supernova
  filaments, reflection nebulae).
* **Beyond.** Andromeda, Triangulum, the Magellanic Clouds, Centaurus A, M81,
  M82, the Whirlpool, Pinwheel, Sombrero and M87 at their real positions and
  orientations, and thousands of procedural galaxies along cosmic-web
  filaments — every one an oriented disc evaluated analytically in the shader.
* **Exoplanets.** Travel to any star (catalogue or procedural) and a planetary
  system is generated for it: lava, desert, ocean, ice and gas worlds sized and
  placed by the star's luminosity, with atmospheres and rings.
* **Post.** HDR pipeline, bloom, ACES, adaptive exposure, chromatic aberration,
  vignette, grain, warp streaks during long journeys, and a NaN scrubber so a
  single bad pixel can never blacken the frame.
* **Performance.** Star chunks and procedural planet surfaces are generated in
  Web Workers (the main thread never stalls while flying); nebulae are
  ray-marched in a reduced-resolution volumetric layer and composited before
  the rest of the scene; the smooth part of the deep sky is baked once into a
  cubemap; the black-hole pass runs only when Sgr A* is on screen; every shader
  is precompiled in the background during the intro; and dynamic resolution
  scaling keeps the frame under budget on weaker GPUs.
* **UI.** Search with Focus / Travel / Follow, an info panel with real data and
  curiosities, labels with occlusion and clutter control, time control from
  pause to 10 million×, a cinematic tour, a stats overlay, and a procedural
  ambient score (not "sound in space").

## Architecture

```
src/
  core/        Engine (renderer, HDR composer, quality presets, dynamic resolution,
               volumetric layer, shader precompile), Units & frames, seeded RNG, noise, events
  postfx/      FinalPass (tone map, flare, warp), BlackHolePass (geodesic lensing)
  workers/     chunkWorker (procedural star cells), textureWorker (planet surfaces)
  universe/    UniverseManager, GalaxyModel/Manager, StarFieldManager (LOD chunks),
               NebulaManager, BlackHole, DistantGalaxies, Constellations, Grids, BackgroundSky
  solar/       SolarSystemManager, Body (orbits & IAU rotation), Sun, Planet, Rings,
               Belts, Comets, Spacecraft, OrbitLines/Markers, ExoSystem,
               SurfaceGen (pure recipes) + TextureFactory (textures, worker pool)
  camera/      CameraController (free/orbit/follow/travel), CinematicTour
  systems/     Registry (every selectable object), Labels, SelectionSystem, TimeManager
  ui/          UIManager (HUD, search, info panel, settings, stats), IntroSequence
  audio/       AudioManager (procedural ambient)
  data/        SolarSystemData, StarCatalog, Constellations
```

## Credits

Planet maps © [Solar System Scope](https://www.solarsystemscope.com/textures/)
(CC BY 4.0). Everything else — galaxy, stars, nebulae, moons, Pluto, rings,
exoplanets, the black hole — is generated procedurally at runtime from seeds.
Orbital elements after Standish (JPL), rotation elements after the IAU WGCCRE
reports, star data from the Hipparcos / Yale catalogues.
