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

## Live / En vivo

https://pueyo10.github.io/Universo/ — open it in a WebGL2 browser (Chrome, Edge, Firefox).

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

## Phase 2 — physics, science, immersion

* **Realistic flight physics** (`4` or the *Flight* toggle): the camera becomes a
  ship with inertia and thrusters in the real gravitational field of every body
  (GM from the Sun, planets, moons, stars, Sgr A*). Velocity is integrated
  against simulated time, so the time controls make orbits visible; the ship
  HUD shows speed, the dominant attractor, periapsis/apoapsis and whether the
  trajectory is bound or escaping. `X` matches the local body's velocity, `C`
  inserts into a circular orbit, the wheel sets the throttle. Travel arrives in
  a real orbit. *Exploration* mode keeps the free camera.
* **Physics visualization** (`P`): predicted orbit (exact two-body conic),
  velocity and gravity vectors, rotation axes, equators, orbital planes and
  barycentres. Earth–Moon and Pluto–Charon really orbit their centres of mass.
* **Body velocities, 26 moons, real asteroids** (Vesta, Pallas, Eros, Bennu),
  lunar eclipses (the planet's shadow on its moons) and a **Find next eclipse**
  tool that scans the simulation for solar and lunar eclipses.
* **Science panel**: habitable zones (Kopparapu limits), magnetospheres,
  heliosphere & solar wind, redshift/blueshift tinting, and the
  **Observatory** — visible, infrared, ultraviolet, X-ray and radio views of
  the whole scene (false colour, educational).
* **Deep data**: derived physics (density, gravity, escape velocity…),
  composition and atmosphere bars, astrobiology interest, stellar profiles with
  evolutionary tracks, light-travel times, travel-time references (Voyager,
  0.1 c, c), scale facts, provenance badges (observed / estimated / simulated /
  procedural), a categorised curiosities database, discovery events and
  contextual "did you know" cards.
* **Content**: eight real exoplanet systems (Proxima b, TRAPPIST-1 a–h,
  Kepler-186f, Kepler-452b, 51 Peg b, HD 189733 b, Kepler-22b, TOI-700),
  binary companions, pulsars and magnetars with sweeping beams, Enceladus / Io /
  Triton plumes, auroras, surface sites (Apollo landings, Mars rovers,
  landmarks), Local Group dwarfs, Virgo Cluster, Laniakea and a simulated
  cosmic web of filaments, clusters and voids.
* **Simulations**: SUPERNOVA (collapse → flash → shock → remnant, clearly
  labelled) and gravitational time dilation read-outs near Sgr A*.
* **Exploration**: eight guided tours with documentary captions (Solar System,
  Giants, Black Holes, Search for Life, Stellar Evolution, Galaxies, Extreme
  Worlds, Cosmic Scale), OBSERVE auto-cinematics, the **Cosmic Database** (`B`)
  with bookmarks, history, compare-size, measure-distance, cosmic timeline and
  extremes, a galactic **star map** (`K`), **photo mode** (`F2`) and an
  **immersive mode** (`H`) with adaptive ambient audio (nebula, black hole,
  Earth, intergalactic silence) and pulsar sonification.


## Birth of a Star — interactive simulation

`✦ Star birth` in the top bar (also in the tour menu, or search "star formation"). A molecular-cloud core 30 light-years from the Orion Nebula collapses into a star in seven continuous stages: molecular cloud → gravitational collapse → protostar → protoplanetary disc → bipolar jets (Herbig–Haro knots) → hydrogen ignition → main sequence.

- **Continuous physics**: every visual quantity (radius, temperature, luminosity, core state, disc, jets, envelope) is a smooth function of one simulation clock, so the sequence can be paused, accelerated (1×–1000×), scrubbed and rewound; processes overlap as in nature and the pace never jumps between stages. Real ages and "1 s ≈ N years" are shown at all times.
- **Three views**: normal (cinematic), scientific (infall arrows, gravity-vs-pressure arrows, density / temperature / flow colour layers, live readouts) and explained (timed captions).
- **Three masses**: 0.2 M☉ red dwarf, Sun-like, 15 M☉ blue giant (ionises its cloud; its young star qualifies for the supernova simulation).
- **Guided sequence**: ~5 min spline camera through every scale with captions; `Esc` hands control back. Structures (core, protostar, disc, both jets, sibling protostars) are labelled and selectable.
- **Rendering**: the cloud is a ray-marched volume in a reduced-resolution layer composited *after* the star layers, so the dark cloud hides the stars behind it (its extinction also dims the embedded protostar; the infrared observatory band sees through it). GPU-driven dust / disc / jet particles, Keplerian disc shader, jet beams with moving knots, StarBody photosphere for the star.

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
| Camera modes | `1` free · `2` orbit · `3` follow · `4` realistic flight · `R` reset · `T` tours |
| UI | `H` immersive · `F2` photo mode · `F3` stats · `B` database · `K` star map · `P` physics · `Esc` cancel / hide info panel (a side tab brings it back; `▾` folds it to the header) |
| Ship (Flight toggle / `4`) | `W A S D Q E` thrust · `Shift` boost · wheel = throttle · `Space` / `X` brake (match the reference body) · `C` circular orbit · flight assist scales thrust and caps speed with the distance to the nearest world; accelerate time to see real gravity |
| Star birth | `Space` pause · `[` `]` speed · `Esc` leaves the guided sequence, then the simulation |

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
