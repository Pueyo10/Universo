import * as THREE from 'three';
import { LY, PC, radecToVector, GALAXY_MATRIX_INV, SUN_GAL_POS, SUN_RADIUS_KM, KM, fmtNum } from '../core/Units.js';
import { Rng, hash3 } from '../core/Random.js';
import { starColor } from './GalaxyModel.js';
import { STARS, SPECIAL_STARS, PULSARS, STAR_DESCRIPTIONS } from '../data/StarCatalog.js';
import { EXTRA_STARS } from '../data/Constellations.js';
import { KNOWN_HOSTS, KNOWN_SYSTEMS } from '../data/Exoplanets.js';
import { nearStarVert, nearStarFrag } from '../shaders/starShader.js';
import { bus } from '../core/EventBus.js';
import { i18n } from '../i18n/index.js';

// Resolved stars around the camera:
//  • the real bright-star catalogue (≈ 550 named stars with true positions)
//  • procedural star chunks in 4 nested LOD levels — small cells with every
//    star nearby, huge cells with only supergiants far away — generated on
//    demand from the galaxy density model with deterministic per-cell seeds.
//    Generation runs in Web Workers so the main thread never stalls while the
//    camera moves; results arrive as typed arrays and are wrapped in a
//    geometry (microseconds).
const LEVELS = [
  { size: 48,   minLum: 0,    cap: 1200 },
  { size: 192,  minLum: 0.6,  cap: 2600 },
  { size: 768,  minLum: 20,   cap: 5000 },
  { size: 3072, minLum: 600,  cap: 6000 },
];
const SPECTRAL_TEMP = { O: 38000, B: 17000, A: 8500, F: 6800, G: 5700, K: 4400, M: 3300, W: 60000, L: 20000, D: 15000 };

export class StarFieldManager {
  constructor(ctx) {
    this.ctx = ctx;
    this.engine = ctx.engine; this.registry = ctx.registry;
    this.group = new THREE.Group();
    this.group.name = 'StarField';
    this.engine.scene.add(this.group);
    this.cells = new Map();          // key -> Points (userData: level, ix, iy, iz, count, meta)
    this.queue = [];                 // cells wanted but not yet requested
    this.inFlight = new Map();       // job id -> key
    this.renderedStars = 0; this.activeChunks = 0; this.lodLevel = 0;
    this.exposure = 1.0;
    this.densityScale = ctx.engine.q.chunkStars;
    this.userDensity = 1;
    this._gen = 0;                   // generation counter: invalidates in-flight jobs on rebuild
    this._jobId = 0;
    this._tmp = new THREE.Vector3();
    this.material = new THREE.ShaderMaterial({
      uniforms: { uExposure: { value: 1 }, uPixelRatio: { value: 1 }, uMaxSize: { value: 26 }, uFade: { value: 1 }, uTime: { value: 0 }, uMinLum: { value: 0 }, uBand: { value: 0 } },
      vertexShader: nearStarVert, fragmentShader: nearStarFrag,
      transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending,
    });
    this._buildCatalog();
    this._startWorkers();
    bus.on('settings:stars', v => { this.userDensity = v; this._rebuildAll(); });
    bus.on('quality', () => { const d = this.engine.q.chunkStars; if (d !== this.densityScale) { this.densityScale = d; this._rebuildAll(); } });
    this.frame = 0;
  }

  // ---------------------------------------------------------------- workers
  _startWorkers() {
    const n = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 4) - 2));
    this.workers = [];
    const m3 = new THREE.Matrix3().setFromMatrix4(GALAXY_MATRIX_INV);
    const init = { type: 'init', levels: LEVELS, galInv: Array.from(m3.elements), sunGal: [SUN_GAL_POS.x, SUN_GAL_POS.y, SUN_GAL_POS.z], densityScale: this.densityScale, userDensity: this.userDensity };
    for (let i = 0; i < n; i++) {
      const w = new Worker(new URL('../workers/chunkWorker.js', import.meta.url), { type: 'module' });
      const rec = { w, busy: 0 };
      w.onmessage = (e) => this._onWorkerMessage(rec, e.data);
      w.onerror = (e) => { console.error('[chunkWorker]', e.message || e); };
      w.postMessage(init);
      this.workers.push(rec);
    }
    this.maxInFlightPerWorker = 2;
  }

  _onWorkerMessage(rec, m) {
    if (m.type === 'ready') { rec.ready = true; return; }
    if (m.type !== 'cell') return;
    rec.busy--;
    const key = this.inFlight.get(m.id);
    this.inFlight.delete(m.id);
    if (!key || m.gen !== this._gen) return;                 // stale (rebuilt or no longer tracked)
    if (!this._needed || !this._needed.has(key)) return;    // camera moved on
    if (this.cells.has(key)) return;
    const { level, ix, iy, iz } = parseKey(key);
    this.cells.set(key, this._makeCell(level, ix, iy, iz, m));
  }

  _dispatch() {
    if (!this.queue.length) return;
    this.queue.sort((a, b) => a.prio - b.prio);
    for (const rec of this.workers) {
      if (!rec.ready) continue;
      while (rec.busy < this.maxInFlightPerWorker && this.queue.length) {
        const q = this.queue.shift();
        if (this.cells.has(q.key)) continue;
        const id = ++this._jobId;
        this.inFlight.set(id, q.key);
        rec.busy++;
        rec.w.postMessage({ type: 'cell', id, gen: this._gen, level: q.level, ix: q.ix, iy: q.iy, iz: q.iz });
      }
    }
  }

  _makeCell(level, ix, iy, iz, r) {
    const size = LEVELS[level].size;
    const centerScene = new THREE.Vector3((ix + 0.5) * size, (iy + 0.5) * size, (iz + 0.5) * size).multiplyScalar(LY);
    if (!r.count) {
      const empty = new THREE.Points(new THREE.BufferGeometry(), this.material);
      empty.visible = false;
      empty.userData = { level, ix, iy, iz, count: 0 };
      return empty;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(r.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(r.col, 3));
    geo.setAttribute('lum', new THREE.BufferAttribute(r.lum, 1));
    geo.setAttribute('seed', new THREE.BufferAttribute(r.seed, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), size * 0.87);
    const pts = new THREE.Points(geo, this.material);
    pts.position.copy(centerScene);
    pts.scale.setScalar(LY);
    pts.frustumCulled = true;
    pts.renderOrder = 11;
    pts.userData = { level, ix, iy, iz, count: r.count, meta: { pos: r.pos, lum: r.lum, col: r.col } };
    this.group.add(pts);
    return pts;
  }

  // ---------------------------------------------------------------- catalogue
  _buildCatalog() {
    const list = [...STARS, ...EXTRA_STARS];
    for (const h of KNOWN_HOSTS) if (!list.some(x => x[0] === h[0])) list.push(h);   // exoplanet hosts not in the bright-star catalogue
    const n = list.length;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), lum = new Float32Array(n), seed = new Float32Array(n);
    const c = [0, 0, 0];
    this.catalog = [];
    const v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const [name, ra, dec, dist, mag, sp] = list[i];
      radecToVector(ra, dec, v).multiplyScalar(dist);   // ly
      pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
      const dpc = dist / 3.26156;
      const M = mag - 5 * Math.log10(Math.max(dpc, 0.1) / 10);
      const L = Math.pow(10, (4.83 - M) / 2.5);
      const special = SPECIAL_STARS[name];
      let temp = SPECTRAL_TEMP[sp.charAt(0)] || 5500;
      if (/I[ab]|II/.test(sp) && temp < 5000) temp *= 0.92;
      if (special?.kind === 'whitedwarf') temp = 25000;
      starColor(temp, c);
      col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
      lum[i] = L; seed[i] = (i * 0.618) % 1;
      const radiusSun = Math.sqrt(L) * Math.pow(5772 / temp, 2);
      const scenePos = v.clone().multiplyScalar(LY);
      const obj = {
        id: 'star-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name, kind: 'star', kindLabel: special?.kind === 'whitedwarf' ? 'White dwarf' : special?.kind === 'supergiant' ? 'Supergiant star' : special?.kind === 'reddwarf' ? 'Red dwarf' : special?.kind === 'wolfrayet' ? 'Wolf–Rayet star' : special?.kind === 'lbv' ? 'Luminous blue variable' : 'Star',
        color: '#' + new THREE.Color(c[0], c[1], c[2]).getHexString(),
        radius: Math.max(radiusSun, 0.01) * SUN_RADIUS_KM * KM, priority: Math.max(0, 6 - mag), temp, lum: L, distLy: dist, mag, spectral: sp, special,
        aliases: [], labelRange: [1.5, 1e15],
        getPosition(out) { return out.copy(scenePos); },
        lightDir: null,
        data: { type: obj_kind(sp, special), spectralType: sp, distance: `${fmtNum(dist, 3)} ly (${fmtNum(dpc, 3)} pc)`, apparentMag: mag.toFixed(2), absoluteMag: M.toFixed(2), luminosity: `${fmtNum(L, 3)} L☉`, temperature: `≈ ${fmtNum(temp, 3)} K`, radius: `≈ ${fmtNum(radiusSun, 3)} R☉` },
        description: STAR_DESCRIPTIONS[name] || i18n.tpl('starGeneric', { name, desc: spectralDesc(sp, 'en'), dist: fmtNum(dist, 3), lum: fmtNum(L, 2) }).en,
        scenePos,
        i18n: STAR_DESCRIPTIONS[name] ? undefined : { es: { description: i18n.tpl('starGeneric', { name, desc: spectralDesc(sp, 'es'), dist: fmtNum(dist, 3), lum: fmtNum(L, 2) }).es } },
      };
      // label visibility: brighter stars from farther away
      obj.maxLabelDistance = (mag < 1.5 ? 2500 : mag < 2.5 ? 900 : mag < 3.5 ? 300 : 60) * LY;
      if (KNOWN_SYSTEMS[name]) { obj.knownSystem = KNOWN_SYSTEMS[name]; obj.priority = Math.max(obj.priority, 4); obj.maxLabelDistance = Math.max(obj.maxLabelDistance, 400 * LY); obj.data.planets = String(KNOWN_SYSTEMS[name].planets.length) + (i18n.lang === 'es' ? ' confirmados' : ' confirmed'); if (KNOWN_SYSTEMS[name].lum) obj.lum = KNOWN_SYSTEMS[name].lum; if (KNOWN_SYSTEMS[name].temp) obj.temp = KNOWN_SYSTEMS[name].temp; }
      this.catalog.push(obj);
      this.registry.add(obj);
    }
    // pulsars as special objects
    for (const [name, ra, dec, dist, desc] of PULSARS) {
      radecToVector(ra, dec, v).multiplyScalar(dist * LY);
      const p = v.clone();
      this.registry.add({ id: 'pulsar-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name, kind: 'star', kindLabel: 'Pulsar', color: '#b0d0ff', radius: 12 * KM, priority: 2, labelRange: [2, 1e9], maxLabelDistance: 400 * LY,
        getPosition(out) { return out.copy(p); }, data: { type: 'Neutron star (pulsar)', distance: `${fmtNum(dist, 3)} ly`, radius: '≈ 12 km', mass: '≈ 1.4 M☉', density: '≈ 10¹⁷ kg/m³' },
        description: desc + '. A city-sized neutron star spinning many times per second, sweeping beams of radiation across space like a lighthouse.', pulsar: true });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('lum', new THREE.BufferAttribute(lum, 1));
    geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 30000);
    this.catalogPoints = new THREE.Points(geo, this.material);
    this.catalogPoints.scale.setScalar(LY);
    this.catalogPoints.frustumCulled = false;
    this.catalogPoints.renderOrder = 12;
    this.group.add(this.catalogPoints);
  }

  // ---------------------------------------------------------------- cells
  _cellKey(l, x, y, z) { return `${l}:${x}:${y}:${z}`; }

  _rebuildAll() {
    for (const [k, cell] of this.cells) { this.group.remove(cell); cell.geometry.dispose(); }
    this.cells.clear();
    this.queue.length = 0;
    this.inFlight.clear();
    this._gen++;
    for (const rec of this.workers) { rec.busy = 0; rec.w.postMessage({ type: 'density', densityScale: this.densityScale, userDensity: this.userDensity }); }
  }

  update(dt, t, camPos) {
    this.frame++;
    const u = this.material.uniforms;
    u.uTime.value = t; u.uExposure.value = this.exposure; u.uPixelRatio.value = this.engine.renderer.getPixelRatio();
    // which cells are needed (recomputed only when the camera changes cell)
    const needed = this._needed || (this._needed = new Set());
    const cx0 = Math.floor(camPos.x / LY / LEVELS[0].size), cy0 = Math.floor(camPos.y / LY / LEVELS[0].size), cz0 = Math.floor(camPos.z / LY / LEVELS[0].size);
    const moved = cx0 !== this._lcx || cy0 !== this._lcy || cz0 !== this._lcz;
    if (moved || this.frame === 1) {
      this._lcx = cx0; this._lcy = cy0; this._lcz = cz0;
      needed.clear();
      const queued = new Set(this.queue.map(q => q.key));
      const flying = new Set(this.inFlight.values());
      for (let level = 0; level < LEVELS.length; level++) {
        const size = LEVELS[level].size;
        const cx = Math.floor(camPos.x / LY / size), cy = Math.floor(camPos.y / LY / size), cz = Math.floor(camPos.z / LY / size);
        for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
          const key = this._cellKey(level, cx + x, cy + y, cz + z);
          needed.add(key);
          if (!this.cells.has(key) && !queued.has(key) && !flying.has(key)) this.queue.push({ key, level, ix: cx + x, iy: cy + y, iz: cz + z, prio: level + Math.abs(x) + Math.abs(y) + Math.abs(z) });
        }
      }
      // remove cells no longer needed
      for (const [k, cell] of this.cells) {
        if (!needed.has(k)) { this.group.remove(cell); cell.geometry.dispose(); this.cells.delete(k); }
      }
      this.queue = this.queue.filter(q => needed.has(q.key));
    }
    this._dispatch();
    // stats (cheap: only when cells changed)
    if (this._statCount !== this.cells.size || moved) {
      this._statCount = this.cells.size;
      let n = 0, a = 0;
      for (const cell of this.cells.values()) { if (cell.userData.count) { n += cell.userData.count; a++; } }
      this.renderedStars = n + this.catalog.length; this.activeChunks = a;
    }
    this.lodLevel = camPos.length() / LY < 200 ? 'local' : 'galactic';
  }

  /** Number of cells still being generated (queued or in a worker). */
  get pending() { return this.queue.length + this.inFlight.size; }

  /** Pick a procedural star near screen position; returns a transient registry-like object or null. */
  pick(mx, my, maxPx = 10) {
    const cam = this.engine.camera;
    const w = window.innerWidth, h = window.innerHeight;
    const camPos = this.ctx.cameraCtl.position;
    let best = null, bestD = maxPx;
    const v = new THREE.Vector3();
    for (const cell of this.cells.values()) {
      const ud = cell.userData; if (!ud.count) continue;
      if (ud.level > 2) continue;
      const { pos, lum } = ud.meta;
      const base = cell.position;
      for (let i = 0; i < ud.count; i++) {
        v.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]).multiplyScalar(LY).add(base);
        const dist = v.distanceTo(camPos);
        // only reasonably bright on screen
        if (lum[i] / (dist / LY) ** 2 < 2e-6) continue;
        v.project(cam);
        if (v.z > 1 || v.z < -1) continue;
        const sx = (v.x * 0.5 + 0.5) * w, sy = (-v.y * 0.5 + 0.5) * h;
        const d = Math.hypot(sx - mx, sy - my);
        if (d < bestD) { bestD = d; best = { cell, i }; }
      }
    }
    if (!best) return null;
    return this._makeStarObject(best.cell, best.i);
  }

  _makeStarObject(cell, i) {
    const ud = cell.userData; const { pos, lum, col } = ud.meta;
    const p = new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]).multiplyScalar(LY).add(cell.position);
    const id = `pstar-${ud.level}-${ud.ix}-${ud.iy}-${ud.iz}-${i}`;
    const existing = this.registry.get(id); if (existing) return existing;
    const L = lum[i];
    const color = new THREE.Color(col[i * 3], col[i * 3 + 1], col[i * 3 + 2]);
    // infer temperature from colour ratio (approx)
    const temp = Math.round(Math.min(45000, Math.max(2500, 5800 * Math.pow(Math.max(0.05, col[i * 3 + 2] / Math.max(col[i * 3], 0.01)), 1.4) * (col[i * 3 + 2] > col[i * 3] ? 1.6 : 0.85))));
    const cls = temp > 30000 ? 'O' : temp > 10000 ? 'B' : temp > 7500 ? 'A' : temp > 6000 ? 'F' : temp > 5200 ? 'G' : temp > 3700 ? 'K' : 'M';
    const radiusSun = Math.sqrt(L) * Math.pow(5772 / temp, 2);
    const mass = Math.pow(L, 1 / 3.5);
    const dist = p.length() / LY;
    const rng = new Rng(hash3(ud.ix * 7 + i, ud.iy * 13, ud.iz * 17, 5));
    const name = `USC ${1000 + rng.int(9000)}-${rng.int(999)}`;
    const kindLabel = L > 5000 ? 'Supergiant star' : (L > 40 && temp < 5000) ? 'Red giant' : L < 0.02 ? 'Red dwarf' : 'Star';
    const kindKey = L > 5000 ? 'kindSuper' : (L > 40 && temp < 5000) ? 'kindRedGiant' : L < 0.02 ? 'kindRedDwarf' : 'kindStar';
    const tplParams = { cls, dist: fmtNum(dist, 3), kind: kindLabel.toLowerCase() };
    const obj = {
      id, name, kind: 'star', kindLabel, color: '#' + color.getHexString(), radius: Math.max(radiusSun, 0.05) * SUN_RADIUS_KM * KM, priority: 1,
      procedural: true, temp, lum: L, seed: hash3(ud.ix, ud.iy, ud.iz, i), labelRange: [1.5, 4e5], maxLabelDistance: 40 * LY,
      getPosition(out) { return out.copy(p); }, scenePos: p,
      data: { type: `${cls}-type ${kindLabel.toLowerCase()} (procedural)`, spectralType: cls + (L > 40 ? 'III' : 'V'), distance: `${fmtNum(dist, 3)} ly`, luminosity: `${fmtNum(L, 3)} L☉`, temperature: `≈ ${fmtNum(temp, 3)} K`, radius: `≈ ${fmtNum(radiusSun, 3)} R☉`, mass: `≈ ${fmtNum(mass, 2)} M☉` },
      description: i18n.tpl('starProc', tplParams).en,
      i18n: { es: { description: i18n.tpl('starProc', tplParams).es, data: { type: i18n.tpl('starProcType', { cls, kind: i18n.tpl(kindKey, {}).es }).es } } },
    };
    this.registry.add(obj);
    return obj;
  }
}

function parseKey(key) { const [l, x, y, z] = key.split(':').map(Number); return { level: l, ix: x, iy: y, iz: z }; }

function obj_kind(sp, special) {
  if (special?.kind === 'whitedwarf') return 'White dwarf';
  if (special?.kind === 'wolfrayet') return 'Wolf–Rayet star';
  if (special?.kind === 'lbv') return 'Luminous blue variable';
  if (/Ia|Ib/.test(sp)) return sp.charAt(0) + '-type supergiant';
  if (/III|II/.test(sp)) return sp.charAt(0) + '-type giant';
  if (/IV/.test(sp)) return sp.charAt(0) + '-type subgiant';
  return sp.charAt(0) + '-type main-sequence star';
}
function spectralDesc(sp, lang = 'en') {
  const c = sp.charAt(0);
  const colKey = { O: 'cBlue', B: 'cBW', A: 'cWhite', F: 'cYW', G: 'cYellow', K: 'cOrange', M: 'cRed' }[c] || 'cWhite';
  const clsKey = /Ia|Ib/.test(sp) ? 'clsSuper' : /III|II/.test(sp) ? 'clsGiant' : 'clsMain';
  const col = i18n.tpl(colKey, {})[lang], cls = i18n.tpl(clsKey, {})[lang];
  return lang === 'es' ? `${cls} ${col}` : `${col} ${cls}`;
}
