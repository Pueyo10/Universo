import * as THREE from 'three';
import { bus } from '../core/EventBus.js';
import { LabelSystem } from '../systems/Labels.js';
import { SelectionSystem } from '../systems/SelectionSystem.js';
import { CAM_MODE } from '../camera/CameraController.js';
import { formatDistance, formatSpeed, formatDate, fmtNum, AU } from '../core/Units.js';
import { i18n, t } from '../i18n/index.js';

const $ = (id) => document.getElementById(id);

export class UIManager {
  constructor(ctx) {
    this.ctx = ctx;
    const { engine, registry, cameraCtl, time, universe } = ctx;
    this.engine = engine; this.registry = registry; this.cameraCtl = cameraCtl; this.time = time; this.universe = universe;
    this.state = { orbits: true, labels: true, constellations: false, grid: false, realScale: false, audio: false, debug: false, uiHidden: false };
    this.labels = new LabelSystem(engine, registry, $('labels'), cameraCtl);
    this.selection = new SelectionSystem(engine, registry, engine.canvas, cameraCtl);
    this.selected = null;
    this._t = 0; this._infoT = 0;
    this._v = new THREE.Vector3();
    this._bindHUD();
    this._bindSearch();
    this._bindKeys();
    this._bindLanguage();
    bus.on('select', o => this.showInfo(o));
    bus.on('travel:request', o => this.travelTo(o));
    bus.on('camera:mode', m => { this._mode = m; $('ro-camera').textContent = t(m); });
    bus.on('time:speed', s => this._syncTimeButtons(s));
    this._syncTimeButtons(time.effectiveSpeed);
    this.hud = $('hud');
    this.hud.classList.add('hidden');
    i18n.applyDom();
  }

  // ------------------------------------------------------------- language
  _bindLanguage() {
    const btn = $('btn-lang');
    const sync = () => { btn.textContent = i18n.lang === 'es' ? 'EN' : 'ES'; btn.title = i18n.lang === 'es' ? 'Switch to English' : 'Cambiar a español'; $('set-lang').value = i18n.lang; $('ro-camera').textContent = t(this._mode || this.cameraCtl.mode); };
    btn.addEventListener('click', () => i18n.toggle());
    $('set-lang').addEventListener('change', e => i18n.setLang(e.target.value));
    sync();
    bus.on('lang', () => {
      sync();
      i18n.applyDom();
      $('ro-camera').textContent = t(this._mode || this.cameraCtl.mode);
      if (this.selected) this.showInfo(this.selected);
      this.labels.refresh();
      this.toast(t('tLang'));
    });
  }

  // ------------------------------------------------------------- HUD binding
  _bindHUD() {
    const tc = $('time-controls');
    tc.querySelectorAll('.tbtn[data-speed]').forEach(b => b.addEventListener('click', () => this.time.setSpeed(Number(b.dataset.speed))));
    $('btn-now').addEventListener('click', () => { this.time.setNow(); this.toast(t('tTimeReset')); });
    const tog = (id, key, fn) => {
      const el = $(id);
      el.addEventListener('click', () => { this.state[key] = !this.state[key]; el.dataset.on = String(this.state[key]); fn && fn(this.state[key]); bus.emit('toggle', key, this.state[key]); });
    };
    tog('tog-orbits', 'orbits');
    tog('tog-labels', 'labels', v => { this.labels.enabled = v; });
    tog('tog-constellations', 'constellations');
    tog('tog-grid', 'grid');
    tog('tog-scale', 'realScale', v => this.toast(v ? t('tRealScale') : t('tVisualScale')));
    tog('tog-audio', 'audio');
    tog('tog-debug', 'debug', v => { $('debug-panel').hidden = !v; });
    $('btn-reset').addEventListener('click', () => this.resetCamera());
    $('btn-tour').addEventListener('click', () => bus.emit('tour:toggle'));
    $('btn-hide-ui').addEventListener('click', () => this.toggleUI());
    $('btn-settings').addEventListener('click', () => { const p = $('settings-panel'); p.hidden = !p.hidden; $('help-panel').hidden = true; });
    $('btn-help').addEventListener('click', () => { const p = $('help-panel'); p.hidden = !p.hidden; $('settings-panel').hidden = true; });
    $('info-close').addEventListener('click', () => this.selection.select(null));
    $('info-focus').addEventListener('click', () => this.focus(this.selected));
    $('info-travel').addEventListener('click', () => this.travelTo(this.selected));
    $('info-follow').addEventListener('click', () => this.follow(this.selected));
    const s = this.engine.settings;
    $('set-quality').value = this.engine.qualityMode;
    $('set-quality').addEventListener('change', e => { this.engine.setQuality(e.target.value); this.toast(t('tQuality', { q: e.target.value === 'auto' ? `auto → ${this.engine.qualityName}` : e.target.value })); });
    $('set-bloom').addEventListener('input', e => { s.bloom = Number(e.target.value); });
    $('set-exposure').addEventListener('input', e => { s.exposure = Number(e.target.value); });
    $('set-fov').addEventListener('input', e => { s.fov = Number(e.target.value); });
    $('set-stars').addEventListener('input', e => { s.starDensity = Number(e.target.value); bus.emit('settings:stars', s.starDensity); });
    $('set-sens').addEventListener('input', e => { this.cameraCtl.sensitivity = Number(e.target.value); });
    $('set-autoexp').addEventListener('change', e => { s.autoExposure = e.target.checked; });
    $('set-lens').addEventListener('change', e => { s.lens = e.target.checked; });
    $('set-inverty').addEventListener('change', e => { this.cameraCtl.invertY = e.target.checked; });
    document.addEventListener('pointerdown', e => { if (!$('search').contains(e.target)) this._hideSearch(); });
  }

  _syncTimeButtons(speed) {
    $('time-controls').querySelectorAll('.tbtn[data-speed]').forEach(b => b.classList.toggle('active', Number(b.dataset.speed) === speed));
  }

  // ------------------------------------------------------------- search
  _bindSearch() {
    const input = $('search-input'), res = $('search-results');
    let active = -1, items = [];
    const render = () => {
      const q = input.value;
      items = this.registry.search(q, 10);
      if (!q.trim()) { res.hidden = true; return; }
      res.hidden = false;
      if (!items.length) { res.innerHTML = `<div class="sr-empty">${t('noResults')}</div>`; return; }
      res.innerHTML = items.map((o, i) => `
        <div class="sr-item ${i === active ? 'active' : ''}" data-i="${i}">
          <div class="sr-name">${esc(i18n.name(o))}${o.parent ? `<small>${esc(i18n.name(o.parent))}</small>` : ''}</div>
          <div class="sr-kind">${esc(i18n.kind(o.kind))}</div>
          <div class="sr-actions">
            <button class="btn" data-act="focus" data-i="${i}">${t('focus')}</button>
            <button class="btn btn-accent" data-act="travel" data-i="${i}">${t('travelTo')}</button>
            <button class="btn" data-act="follow" data-i="${i}">${t('follow')}</button>
          </div>
        </div>`).join('');
    };
    input.addEventListener('input', () => { active = -1; render(); });
    input.addEventListener('focus', () => render());
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { active = Math.min(items.length - 1, active + 1); render(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { active = Math.max(0, active - 1); render(); e.preventDefault(); }
      else if (e.key === 'Enter') { const o = items[Math.max(0, active)]; if (o) { this.travelTo(o); this._hideSearch(); input.blur(); } }
      else if (e.key === 'Escape') { this._hideSearch(); input.blur(); }
    });
    res.addEventListener('click', e => {
      const b = e.target.closest('[data-act]');
      const it = e.target.closest('.sr-item');
      const i = Number((b || it)?.dataset.i);
      const o = items[i]; if (!o) return;
      const act = b?.dataset.act || 'travel';
      if (act === 'focus') this.focus(o); else if (act === 'follow') this.follow(o); else this.travelTo(o);
      this._hideSearch(); input.blur();
    });
  }
  _hideSearch() { $('search-results').hidden = true; }
  focusSearch() { const i = $('search-input'); i.focus(); i.select(); }

  // ------------------------------------------------------------- keys
  _bindKeys() {
    window.addEventListener('keydown', e => {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); this.focusSearch(); return; }
      switch (e.code) {
        case 'Slash': e.preventDefault(); this.focusSearch(); break;
        case 'Space': e.preventDefault(); this.time.toggle(); break;
        case 'BracketRight': this.time.faster(); this.toast(t('tTime', { x: fmtNum(this.time.effectiveSpeed) })); break;
        case 'BracketLeft': this.time.slower(); this.toast(this.time.effectiveSpeed ? t('tTime', { x: fmtNum(this.time.effectiveSpeed) }) : t('tPaused')); break;
        case 'KeyN': this.time.setNow(); this.toast(t('tTimeReset')); break;
        case 'KeyO': $('tog-orbits').click(); break;
        case 'KeyL': $('tog-labels').click(); break;
        case 'KeyC': $('tog-constellations').click(); break;
        case 'KeyG': $('tog-grid').click(); break;
        case 'KeyV': $('tog-scale').click(); break;
        case 'KeyM': $('tog-audio').click(); break;
        case 'KeyH': this.toggleUI(); break;
        case 'F3': e.preventDefault(); $('tog-debug').click(); break;
        case 'KeyR': this.resetCamera(); break;
        case 'KeyT': bus.emit('tour:toggle'); break;
        case 'KeyF': if (this.selected) { e.shiftKey ? this.follow(this.selected) : this.focus(this.selected); } break;
        case 'Enter': if (this.selected) this.travelTo(this.selected); break;
        case 'Digit1': this.cameraCtl.setMode(CAM_MODE.FREE); this.toast(t('tFree')); break;
        case 'Digit2': if (this.selected) { this.cameraCtl.setMode(CAM_MODE.ORBIT, this.selected); this.toast(t('tOrbit', { name: i18n.name(this.selected) })); } break;
        case 'Digit3': if (this.selected) { this.cameraCtl.setMode(CAM_MODE.FOLLOW, this.selected); this.toast(t('tFollow', { name: i18n.name(this.selected) })); } break;
        case 'Escape':
          if (this.cameraCtl.travel) { this.cameraCtl.cancelTravel(); this.toast(t('tCancelled')); }
          else if (!$('settings-panel').hidden || !$('help-panel').hidden) { $('settings-panel').hidden = true; $('help-panel').hidden = true; }
          else bus.emit('escape');
          break;
      }
    });
  }

  // ------------------------------------------------------------- actions
  travelTo(o) { if (!o) return; this.selection.select(o); this.cameraCtl.travelTo(o); this.toast(t('tTravelling', { name: i18n.name(o) })); }
  _far(o) { const d = o.getPosition(this._v).distanceTo(this.cameraCtl.position); return d > (o.radius || 1) * 60; }
  focus(o) {
    if (!o) return; this.selection.select(o);
    if (this._far(o)) { this.cameraCtl.travelTo(o, { mode: CAM_MODE.ORBIT }); this.toast(t('tTravelling', { name: i18n.name(o) })); return; }
    this.cameraCtl.setMode(CAM_MODE.ORBIT, o); this.cameraCtl.lookAt(o.getPosition(this._v)); this.toast(t('tOrbiting', { name: i18n.name(o) }));
  }
  follow(o) {
    if (!o) return; this.selection.select(o);
    if (this._far(o)) { this.cameraCtl.travelTo(o, { mode: CAM_MODE.FOLLOW }); this.toast(t('tTravelling', { name: i18n.name(o) })); return; }
    this.cameraCtl.setMode(CAM_MODE.FOLLOW, o); this.toast(t('tFollowing', { name: i18n.name(o) }));
  }
  resetCamera() { bus.emit('camera:reset'); }
  toggleUI() { this.state.uiHidden = !this.state.uiHidden; this.hud.classList.toggle('hidden', this.state.uiHidden); $('labels').style.opacity = this.state.uiHidden ? 0 : 1; }
  showUI() { this.state.uiHidden = false; this.hud.classList.remove('hidden'); }

  toast(msg, ms = 1800) {
    const el = $('toast'); el.textContent = msg; el.classList.add('show');
    clearTimeout(this._toastT); this._toastT = setTimeout(() => el.classList.remove('show'), ms);
  }
  caption(title, sub = '', ms = 0) {
    const c = $('caption');
    if (!title) { c.classList.remove('show'); return; }
    c.innerHTML = (sub ? `<small>${esc(sub)}</small>` : '') + esc(title);
    c.classList.add('show');
    clearTimeout(this._capT);
    if (ms) this._capT = setTimeout(() => c.classList.remove('show'), ms);
  }

  // ------------------------------------------------------------- info panel
  showInfo(o) {
    this.selected = o;
    const panel = $('info-panel');
    if (!o) { panel.hidden = true; return; }
    panel.hidden = false;
    $('info-kind').textContent = i18n.kindLabel(o).toUpperCase();
    $('info-name').textContent = i18n.name(o);
    $('info-sub').textContent = i18n.text(o, 'subtitle') || '';
    $('info-desc').textContent = i18n.text(o, 'description') || '';
    $('info-facts').innerHTML = (i18n.text(o, 'facts') || []).map(f => `<div class="info-fact">${esc(f)}</div>`).join('');
    const ch = $('info-children');
    const kids = (o.children || []).filter(c => c.searchable !== false).slice(0, 24);
    ch.innerHTML = kids.length ? `<div class="info-children-title">${o.kind === 'planet' || o.kind === 'dwarf' ? t('moons') : t('related')}</div>` + kids.map(c => `<button class="chip" data-id="${esc(c.id)}">${esc(i18n.name(c))}</button>`).join('') : '';
    ch.querySelectorAll('.chip').forEach(b => b.addEventListener('click', () => { const k = this.registry.get(b.dataset.id); if (k) this.travelTo(k); }));
    this._renderInfoGrid(o);
  }
  _renderInfoGrid(o) {
    const grid = $('info-grid');
    const rows = i18n.dataRows(o);
    const p = o.getPosition ? o.getPosition(this._v) : null;
    if (p) {
      rows.unshift([t('distFromCamera'), formatDistance(p.distanceTo(this.cameraCtl.position))]);
      if (o.kind !== 'sun' && o.kind !== 'galaxy' && o.kind !== 'region' && p.length() < 1e6 * AU) rows.splice(1, 0, [t('distFromSun'), formatDistance(p.length())]);
    }
    grid.innerHTML = rows.map(([k, v]) => `<div class="ig"><div class="ig-k">${esc(k)}</div><div class="ig-v">${esc(v)}</div></div>`).join('');
  }

  // ------------------------------------------------------------- per-frame
  update(dt) {
    this._t += dt;
    this.labels.hoverObj = this.selection.hovered;
    this.selection.update();
    this.labels.update();
    if (this._t > 0.15) {
      this._t = 0;
      const pos = this.cameraCtl.position;
      $('ro-region').textContent = t(this.universe.regionName(pos));
      $('ro-pos').textContent = `${formatDistance(pos.length())} ${t('fromSun')}`;
      const n = this.cameraCtl.nearest;
      const tgt = this.cameraCtl.target || n.obj;
      if (tgt && tgt.getPosition) {
        const d = tgt.getPosition(this._v).distanceTo(pos) - (tgt.radius || 0);
        $('ro-target').textContent = `${i18n.name(tgt)} · ${formatDistance(Math.max(d, 0))}`;
      } else $('ro-target').textContent = '—';
      $('ro-speed').textContent = this.cameraCtl.currentSpeed > 1e-6 ? formatSpeed(this.cameraCtl.currentSpeed) : '0';
      $('time-date').textContent = formatDate(this.time.simMs) + (this.time.paused ? '  ❚❚' : this.time.speed !== 1 ? `  ×${fmtNum(this.time.speed)}` : '');
      if (this.state.debug) this._renderDebug();
    }
    if (this.selected && !$('info-panel').hidden) { this._infoT += dt; if (this._infoT > 0.5) { this._infoT = 0; this._renderInfoGrid(this.selected); } }
  }
  _renderDebug() {
    const e = this.engine, s = e.stats, c = this.cameraCtl, p = c.position;
    const st = this.universe.stars;
    const lines = [
      `FPS            ${e.fps.toFixed(0)}   frame ${(e.frameMs || e.dt * 1000).toFixed(1)} ms   js ${e.jsMs.toFixed(1)} ms${e.gpuMs ? '   gpu ' + e.gpuMs.toFixed(1) + ' ms' : ''}`,
      `Quality        ${e.qualityMode === 'auto' ? 'auto → ' : ''}${e.qualityName}   render scale ${(e.renderScale * 100).toFixed(0)}%  (${e.renderer.getDrawingBufferSize(this._v2 || (this._v2 = new THREE.Vector2())).x}×${e.renderer.getDrawingBufferSize(this._v2).y})   ${e.gpuName}`,
      `Draw calls     ${s.drawCalls}   tris ${fmtNum(s.triangles)}   points ${fmtNum(s.points)}`,
      `Galaxy stars   ${fmtNum(this.universe.galaxy.starCount)}`,
      `Chunk stars    ${st ? fmtNum(st.renderedStars) + '  chunks ' + st.activeChunks + (st.pending ? '  generating ' + st.pending : '') + '  LOD ' + st.lodLevel : '—'}`,
      `Nebula/BH      ${this.universe.nebulae ? this.universe.nebulae.visibleCount : 0} vis · BH lensing ${e.blackHolePass.uniforms.uActive.value > 0 ? 'on' : 'off'}`,
      `Camera mode    ${c.mode}   fov ${(e.camera.fov).toFixed(1)}   warp ${c.warp.toFixed(2)}`,
      `Speed scale    ${formatSpeed(c.speedScale)}/s   nearest ${c.nearest.obj ? c.nearest.obj.name : '—'} ${formatDistance(Math.max(c.nearest.dist, 0))}`,
      `Position (Mm)  ${p.x.toExponential(3)}  ${p.y.toExponential(3)}  ${p.z.toExponential(3)}`,
      `Exposure       ${(e.finalPass.uniforms.uExposure.value).toFixed(3)}   textures ${s.textures}  programs ${s.programs}`,
      `Sim time       ${formatDate(this.time.simMs)}  ×${this.time.effectiveSpeed}   lang ${i18n.lang}`,
    ];
    $('debug-panel').textContent = lines.join('\n');
  }
}

function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
