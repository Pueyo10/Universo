# Rendering validation

The frame order is `RenderPass → TAAPass → BlackHolePass → ExposurePass (meter only)
→ UnrealBloomPass → FinalPass (apply exposure, ACES and lens effects)`.
The two reduced-resolution volume layers are drawn before RenderPass. Explicit `low`
skips TAA; `?notaa` is respected across preset changes. `?nodrs` disables automatic
budget adjustments and the auto-low temporal trial.

## Repeatable checks

Run `npm test` for controller hysteresis/floors, CPU-bound behaviour, texture budget
and pinning, shared tile vertices/skirts, non-blocking/disjoint GPU query handling,
sky framing/adaptation/lock, and moon registration/shadow candidate selection.

Run `npm run dev` and open `/tests/graphics.html`. This uses actual WebGL draws and
test-only readbacks to check disocclusion, retained accumulation on stable surfaces,
resolution/far-plane changes, poisoned pixels outside the input viewport, exposure
normalisation/locking, bloom independence, same-frame exposure, volume resizing,
and preset/DPR dimensions. Ring checks compare the GPU slab integral against numerical
quadrature, test grazing transmission and total/partial/annular eclipses, and draw
moon shadows with the production ring material. The page title must start with `PASS`, every result must
be true, and the browser must report no shader or WebGL errors. Repeat at device
pixel ratios 1 and 2. These checks do not benchmark the target integrated GPU.

## Visual and performance acceptance

Use a specific integrated GPU and browser at 1920×1080 with output DPR 1, on AC power.
Warm the same route before measuring; test cold streaming separately. Compare the
same date, camera, settings and route, with both Auto and explicit Low. Test:

- Earth: day/night coasts, close ground detail, slow zoom across LOD thresholds,
  lateral movement, leaving and returning after cache eviction.
- Saturn: thin ring edges during camera rotation; rapid travel and camera reset.
- Nebula and star birth: moving into a volume, low dynamic scale, scrubbing time.
- A wide star field: stationary fine stars, camera rotation, and a distant camera cut.
- Switch low/medium/high/ultra, resize the window, hide and restore the tab, change
  simulated time, lock/unlock exposure, and change bloom while viewing a static scene.

F3 exposes per-pass GPU times, current input scale and subsystem budgets. Record
frame-time p50/p95/p99, CPU update time, GPU pass times, input resolution, memory
residency and streaming hitches. The pass timers cover rendering; GPU particle
simulation and texture uploads performed during system updates are outside those
queries. Use end-to-end frame times to catch these costs. Aim for a GPU budget near
13 ms and frame times within 16.7 ms; an FPS average alone is insufficient.

## Limits of this implementation

- Reactivity is a colour-change heuristic, not a material mask or object-motion buffer.
  Animated transparent content can still leave trails; object motion blur is unchanged.
- The depth history adds one full-size R32F allocation (about 7.9 MiB at 1080p) and a
  depth copy over the current input viewport. TAA still resolves at output resolution.
- The auto-low trial is conservative and scene-dependent. It compares the same input
  scale with/without TAA, using GPU timing when available and frame timing otherwise.
  A later expensive TAA frame can return it to the spatial path.
- Tile edge blending is a narrow fallback to the base map, not neighbour-filled mipmap
  gutters. It softens borders but may still reveal differences between NASA mosaics
  and the base source. Ocean colour matching is a visual adjustment, not radiometry.
- The 64 MiB streamed texture budget excludes CPU decoded images, local 8K maps and
  framebuffers. Network concurrency and the decoded queue are bounded separately;
  a full cache of visible fallbacks delays further uploads instead of exceeding the cap.
- Browsers without timer-query support use a conservative wall-time heuristic.
- Sky contrast is an artistic adjustment for the compressed HDR range. It estimates
  illuminated solar-system disc coverage in the view, then fades the procedural sky
  and stellar flux together. It respects exposure lock/manual mode; no readback or
  extra pass is needed. It does not model visual acuity or absolute radiometry, and
  currently does not meter exoplanet discs or the star-birth scene this way.
- Ring texture alpha is interpreted as normal-incidence opacity, not measured optical
  depth. [Beer-Lambert transmission](https://pbr-book.org/4ed/Volume_Scattering/Transmittance)
  and an analytic single-scattering slab drive both faces and ring shadows on planets.
  The forward phase lobe and faint ambient term remain approximations; multiple
  scattering, radial self-shadowing wakes and rock-to-rock shadows are not simulated.
  Grazing cosines are bounded at 0.015 for numerical stability in the zero-thickness mesh.
- Ring moon shadows use up to four relevant spherical occluders, conservative CPU
  footprint culling, and finite-solar-disc overlap in the shader. Subpixel moons are
  omitted. No shadow maps, new render targets, or new composer passes are allocated.

## Lighting/rings validation (2026-09-05)

Eight Node checks and 25 WebGL checks passed (the latter at DPR 1 and 2). Browser
captures compared Earth, Saturn's lit/unlit rings and open sky at the same date
(2026-09-05 00:00 UTC), camera poses, Medium preset, 1280x720, render scale 1,
and Observation mode. Low/Medium/High/Ultra also rendered the moon-shadow view;
the temporal presets were checked at 55% input resolution without WebGL errors.

A reproducible alignment **in this simulator's orbital model** is Tethys at
2025-02-01 18:00 UTC. Its shadow centre in Saturn-equatorial radius units is
approximately `(-1.909399, 0, -0.316895)`. View this point from an offset
`(0, 0.7, 0.2)` in the same frame. This is a rendering fixture, not an independently
verified astronomical event prediction. Registration now avoids duplicate parent
links, which otherwise counted each moon twice in eclipse lists and barycentre sums.

An isolated ring draw benchmark on the RTX 5060 Ti used a 1280x720 RGBA16F target,
about 259,000 lit pixels, eight batches of 32 draws per variant, and asynchronous
GPU queries. Median old/new/new-with-four-occluder draws were all approximately
0.027 ms (differences below 0.001 ms). This bounds only that synthetic workload
on this GPU; full-scene timings varied enough that no general speedup is claimed.
The integrated-GPU acceptance route remains required.

Validation in this workspace used Chromium on an NVIDIA RTX 5060 Ti. A 60 fps claim
for integrated GPUs still requires the acceptance route above on that hardware.
