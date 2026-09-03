import * as THREE from 'three';
import { Engine } from './core/Engine.js';
import { Registry } from './systems/Registry.js';
import { TimeManager } from './systems/TimeManager.js';
import { UniverseManager } from './universe/UniverseManager.js';
import { CameraController, CAM_MODE } from './camera/CameraController.js';
import { LY, AU, GALAXY_MATRIX, SUN_GAL_POS } from './core/Units.js';
import { bus } from './core/EventBus.js';
import { i18n, t } from './i18n/index.js';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('gl');
canvas.tabIndex = 0;

const quality = params.get('q') || 'auto';   // auto: preset from the GPU, then dynamic resolution holds 60 fps
const engine = new Engine(canvas, quality);
const registry = new Registry();
const time = new TimeManager();
const universe = new UniverseManager(engine, registry, time);
const cameraCtl = new CameraController(engine, registry, canvas, time);

window.__universe = { engine, registry, time, universe, cameraCtl, THREE };

const introEl = document.getElementById('intro');
const barEl = document.getElementById('intro-bar-fill');
const statusEl = document.getElementById('intro-status');
i18n.applyDom();
const progress = (p, msg) => { barEl.style.width = `${Math.round(p * 100)}%`; if (msg) statusEl.textContent = msg; };

async function boot() {
  await universe.build(progress);
  // extended modules load lazily so the first frame arrives fast
  const { attachModules } = await import('./universe/modules.js');
  await attachModules({ engine, registry, time, universe, cameraCtl, progress });
  i18n.attachAliases(registry);
  bus.on('lang', () => i18n.attachAliases(registry));
  const { UIManager } = await import('./ui/UIManager.js');
  const ui = new UIManager({ engine, registry, time, universe, cameraCtl });
  window.__universe.ui = ui;

  // initial pose: outside the galaxy, looking at it
  const gc = universe.galaxy.centerScene;
  const startDir = new THREE.Vector3(0.62, 0.55, 0.56).applyMatrix4(GALAXY_MATRIX).normalize();
  const start = gc.clone().addScaledVector(startDir, 150000 * LY);
  cameraCtl.setPose(start, gc);

  engine.addSystem({ update: (dt, t) => { time.update(dt); } });
  engine.addSystem({ update: (dt) => { if (universe.solar) universe.solar.updatePositions(dt); } });   // bodies first, then the camera that tracks them
  engine.addSystem(cameraCtl);
  engine.addSystem({ update: (dt, t) => universe.update(dt, t, engine.camera) });
  engine.addSystem(ui);
  const { CinematicTour } = await import('./camera/CinematicTour.js');
  const tour = new CinematicTour({ engine, registry, cameraCtl, ui, time });
  const { AudioManager } = await import('./audio/AudioManager.js');
  const audio = new AudioManager(cameraCtl, universe);
  engine.addSystem(audio);
  window.__universe.tour = tour; window.__universe.audio = audio; ui.ctx.tour = tour;
  bus.on('camera:reset', () => { cameraCtl.cancelTravel(); cameraCtl.setMode('FREE'); cameraCtl.setPose(start, gc); ui.toast('Camera reset'); });
  // compile every shader now (loading screen) so no first visit stalls the frame loop
  const tWarm = performance.now();
  const nWarm = await engine.warmup([engine.scene, engine.nebulaScene, engine.volScene], [engine.blackHolePass.material], p => progress(0.9 + 0.1 * p, t('shaders')));
  if (params.has('debug')) console.log(`[warmup] ${nWarm} materials in ${((performance.now() - tWarm) / 1000).toFixed(1)}s`);
  progress(1, t('ready'));
  engine.start();

  const { IntroSequence } = await import('./ui/IntroSequence.js');
  const intro = new IntroSequence({ engine, universe, cameraCtl, ui, introEl });
  if (params.has('nointro')) intro.skipImmediately(); else intro.play();
}

boot().catch(err => {
  console.error(err);
  statusEl.textContent = 'Error: ' + err.message;
  statusEl.style.color = '#ff8080';
});
