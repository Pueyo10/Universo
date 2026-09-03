import * as THREE from 'three';
import { bus } from '../core/EventBus.js';
import { LabelSystem } from '../systems/Labels.js';
import { SelectionSystem } from '../systems/SelectionSystem.js';
import { CAM_MODE } from '../camera/CameraController.js';
import { formatDistance, formatSpeed, formatDate, formatLightTime, fmtNum, AU, LY } from '../core/Units.js';
import { fmtSpeedKms } from '../physics/ShipPhysics.js';
import { extraRows, scienceHtml } from './InfoScience.js';
import { DiscoverySystem } from '../systems/Discovery.js';
import { Database } from './Database.js';
import { StarMap } from './StarMap.js';
import { StarBirthPanel } from './StarBirthPanel.js';
import { i18n, t } from '../i18n/index.js';

const $ = (id) => document.getElementById(id);

export class UIManager {
  constructor(ctx) {
    this.ctx = ctx;
    const { engine, registry, cameraCtl, time, universe } = ctx;
    this.engine = engine; this.registry = registry; this.cameraCtl = cameraCtl; this.time = time; this.universe = universe;
    this.state = { orbits: true, labels: true, constellations: false, grid: false, realScale: false, audio: false, debug: false, uiHidden: false, physics: false, flight: false };
    this.labels = new LabelSystem(engine, registry, $('labels'), cameraCtl);
    this.selection = new SelectionSystem(engine, registry, engine.canvas, cameraCtl);
    this.discovery = new DiscoverySystem(ctx, this);
    this.database = new Database(this);
    this.starmap = new StarMap(this);
    this.starBirth = universe.starBirth ? new StarBirthPanel(this) : null;
    this.selected = null;
    this._t = 0; this._infoT = 0;
    this._v = new THREE.Vector3();
    this._bindHUD();
    this._bindSearch();
    this._bindKeys();
    this._bindLanguage();
    this._bindPhoto();
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
    tog('tog-physics', 'physics', v => { $('sci-physics').checked = v; });
    tog('tog-flight', 'flight', v => { this.cameraCtl.setFlightRealistic(v); $('sci-flight').value = v ? 'real' : 'explore'; this.toast(t(v ? 'tFlightReal2' : 'tFlightExplo'), 6000); });
    $('btn-science').addEventListener('click', () => { const p = $('science-panel'); p.hidden = !p.hidden; $('help-panel').hidden = true; $('settings-panel').hidden = true; });
    $('sci-flight').addEventListener('change', e => { const v = e.target.value === 'real'; if (this.state.flight !== v) $('tog-flight').click(); });
    $('sci-physics').addEventListener('change', e => { if (this.state.physics !== e.target.checked) $('tog-physics').click(); });
    $('sci-hz').addEventListener('change', e => { this.state.habitable = e.target.checked; bus.emit('toggle', 'habitable', e.target.checked); if (e.target.checked) this.toast(t('hzLegend'), 4000); });
    $('sci-mag').addEventListener('change', e => bus.emit('toggle', 'magnetosphere', e.target.checked));
    $('sci-helio').addEventListener('change', e => bus.emit('toggle', 'heliosphere', e.target.checked));
    $('sci-wind').addEventListener('change', e => bus.emit('toggle', 'solarwind', e.target.checked));
    $('sci-redshift').addEventListener('change', e => { this.state.redshift = e.target.checked; bus.emit('toggle', 'redshift', e.target.checked); if (e.target.checked) this.toast(t('redshiftNote'), 5000); if (this.selected) this.showInfo(this.selected); });
    $('sci-band').addEventListener('change', e => { bus.emit('observatory', e.target.value); this._bandTag(e.target.value); });
    bus.on('observatory:changed', b => { $('sci-band').value = b; this._bandTag(b); });
    bus.on('supernova:begin', () => { $('info-supernova').textContent = t('supernovaStop'); });
    bus.on('supernova:end', () => { $('info-supernova').textContent = t('supernovaStart'); $('sn-hud').hidden = true; });
    $('sci-solar-eclipse').addEventListener('click', () => this.findEclipse('solar'));
    $('sci-lunar-eclipse').addEventListener('click', () => this.findEclipse('lunar'));
    bus.on('ship:throttle', a => this.toast(`${t('shipThrottle')} ${a >= 1 ? a.toFixed(0) : a.toFixed(1)} m/s²`, 900));
    bus.on('ship:circularized', o => this.toast(`${t('shipOrbit')}: ${i18n.name(o)}`));
    tog('tog-debug', 'debug', v => { $('debug-panel').hidden = !v; });
    $('btn-reset').addEventListener('click', () => this.resetCamera());
    $('btn-tour').addEventListener('click', () => bus.emit('tour:toggle'));
    $('btn-starbirth').addEventListener('click', () => { const sb = this.universe.starBirth; if (!sb) return; if (sb.active) { if (this.starBirth.el.hidden) this.starBirth.el.hidden = false; bus.emit('starbirth:focus'); } else bus.emit('starbirth:start', {}); });
    $('btn-hide-ui').addEventListener('click', () => this.toggleUI());
    $('btn-settings').addEventListener('click', () => { const p = $('settings-panel'); p.hidden = !p.hidden; $('help-panel').hidden = true; });
    $('btn-help').addEventListener('click', () => { const p = $('help-panel'); p.hidden = !p.hidden; $('settings-panel').hidden = true; });
    $('info-close').addEventListener('click', () => this.hideInfo());
    $('info-tab').addEventListener('click', () => { this._infoHiddenFor = null; if (this.selected) this.showInfo(this.selected); });
    $('info-collapse').addEventListener('click', () => this.setInfoCollapsed(!this._infoCollapsed));
    try { this._infoCollapsed = localStorage.getItem('universo.infoCollapsed') === '1'; } catch (e) { this._infoCollapsed = false; }
    this.setInfoCollapsed(this._infoCollapsed, false);
    $('info-focus').addEventListener('click', () => this.focus(this.selected));
    $('info-travel').addEventListener('click', () => this.travelTo(this.selected));
    $('info-follow').addEventListener('click', () => this.follow(this.selected));
    $('info-observe').addEventListener('click', () => { if (this.selected) bus.emit('observe', this.selected); });
    $('info-supernova').addEventListener('click', () => { const sn = this.universe.supernova; if (!sn) return; if (sn.active) bus.emit('supernova:stop'); else if (this.selected) { const o = this.selected; bus.emit('supernova:start', o); this.selection.select(o); this.cameraCtl.travelTo(o, { distance: 40, duration: 3, mode: CAM_MODE.ORBIT }); this.toast(t('snStarted'), 5000); } });
    bus.on('tour:menu', () => this.toggleTourMenu());
    bus.on('tour:begin', () => { $('tour-menu').hidden = true; });
    bus.on('lang', () => this._renderTourMenu());
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
    $('set-discovery').addEventListener('change', e => { this.discovery.enabled = this.discovery.factsEnabled = e.target.checked; });
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
      const sb = this.universe.starBirth;
      if (sb && sb.active && (e.code === 'Space' || e.code === 'BracketRight' || e.code === 'BracketLeft')) { e.preventDefault(); if (e.code === 'Space') sb.togglePause(); else sb.stepSpeed(e.code === 'BracketRight' ? 1 : -1); return; }
      switch (e.code) {
        case 'Slash': e.preventDefault(); this.focusSearch(); break;
        case 'Space': e.preventDefault(); if (this.cameraCtl.mode !== CAM_MODE.SHIP) this.time.toggle(); break;
        case 'BracketRight': this.time.faster(); this.toast(t('tTime', { x: fmtNum(this.time.effectiveSpeed) })); break;
        case 'BracketLeft': this.time.slower(); this.toast(this.time.effectiveSpeed ? t('tTime', { x: fmtNum(this.time.effectiveSpeed) }) : t('tPaused')); break;
        case 'KeyN': this.time.setNow(); this.toast(t('tTimeReset')); break;
        case 'KeyO': $('tog-orbits').click(); break;
        case 'KeyL': $('tog-labels').click(); break;
        case 'KeyC': $('tog-constellations').click(); break;
        case 'KeyG': $('tog-grid').click(); break;
        case 'KeyP': $('tog-physics').click(); break;
        case 'KeyB': this.database.toggle(); break;
        case 'KeyK': $('tog-map').click(); break;
        case 'F2': e.preventDefault(); this.togglePhotoMode(); break;
        case 'Digit4': $('tog-flight').click(); break;
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
          else if (!$('settings-panel').hidden || !$('help-panel').hidden || !$('science-panel').hidden || !$('tour-menu').hidden || !$('database').hidden) { $('settings-panel').hidden = true; $('help-panel').hidden = true; $('science-panel').hidden = true; $('tour-menu').hidden = true; $('database').hidden = true; }
          else if (this.selected && !$('info-panel').hidden && !(this.ctx.tour && this.ctx.tour.active) && !(this.universe.supernova && this.universe.supernova.active)) this.hideInfo();
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

  updateBookmarkButton(o) { const b = $('info-bookmark'); const on = this.database && this.database.isBookmarked(o); b.textContent = on ? '★' : '☆'; b.classList.toggle('on', !!on); }

  _bandTag(b) {
    const el = $('band-tag');
    if (b === 'visible') { el.hidden = true; $('sci-band-note').textContent = t('bandNoteVisible'); return; }
    const key = 'band' + b.charAt(0).toUpperCase() + b.slice(1);
    el.hidden = false; el.innerHTML = `${esc(t(key))}<small>${esc(t('bandFalseColor'))}</small>`;
    $('sci-band-note').textContent = t('bandNote' + b.charAt(0).toUpperCase() + b.slice(1));
  }

  _renderSupernovaHud() {
    const sn = this.universe.supernova; const el = $('sn-hud');
    if (!sn || !sn.active || this.state.uiHidden) { if (!el.hidden) el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = `<div class="sn-phase">${esc(i18n.name(sn.star))} — ${esc(t(sn.phaseKey))}</div><div class="sn-note">${esc(t('snNote'))}</div><div class="sn-bar"><i style="width:${(sn.progress * 100).toFixed(1)}%"></i></div>`;
  }

  toggleTourMenu() {
    const p = $('tour-menu');
    p.hidden = !p.hidden;
    if (!p.hidden) { $('settings-panel').hidden = true; $('help-panel').hidden = true; $('science-panel').hidden = true; this._renderTourMenu(); }
  }
  _renderTourMenu() {
    const list = $('tour-list'); if (!list) return;
    const tour = this.ctx.tour || window.__universe?.tour;
    const tours = tour ? tour.tours : {};
    const lang = i18n.lang;
    list.innerHTML = (tour && tour.active ? `<button class="tour-item stop" data-tour="__stop">${esc(t('tourStop'))}</button>` : '') +
      (this.universe.starBirth ? `<button class="tour-item sb-item" data-tour="__starbirth"><div class="ti-name">✦ ${esc(t('sbTourName'))}</div><div class="ti-desc">${esc(t('sbTourDesc'))}</div><div class="ti-meta">${esc(t('sbTourMeta'))}</div></button>` : '') +
      Object.entries(tours).map(([id, tr]) => `<button class="tour-item" data-tour="${id}"><div class="ti-name">${esc(tr.name[lang] || tr.name.en)}</div><div class="ti-desc">${esc(tr.desc[lang] || tr.desc.en)}</div><div class="ti-meta">${esc(t('tourSteps2', { n: tr.steps.length }))}</div></button>`).join('');
    list.querySelectorAll('.tour-item').forEach(b => b.addEventListener('click', () => { const id = b.dataset.tour; $('tour-menu').hidden = true; if (id === '__stop') bus.emit('tour:toggle'); else if (id === '__starbirth') bus.emit('starbirth:start', { tour: true }); else bus.emit('tour:start', id); }));
  }
  /** IMMERSIVE MODE: no HUD, no labels, slower and smoother camera, richer ambient audio, gentler grain. */
  toggleUI() {
    this.state.uiHidden = !this.state.uiHidden;
    const on = this.state.uiHidden;
    this.hud.classList.toggle('hidden', on);
    $('labels').style.opacity = on ? 0 : 1;
    this._sensBackup = this._sensBackup ?? this.cameraCtl.sensitivity;
    if (on) { this._sensBackup = this.cameraCtl.sensitivity; this.cameraCtl.sensitivity = this._sensBackup * 0.55; this.engine.finalPass.uniforms.uGrain.value = 0.02; this.engine.finalPass.uniforms.uVignette.value = 0.42; if (this.state.debug) $('debug-panel').hidden = true; }
    else { this.cameraCtl.sensitivity = this._sensBackup; this.engine.finalPass.uniforms.uGrain.value = 0.03; this.engine.finalPass.uniforms.uVignette.value = 0.32; if (this.state.debug) $('debug-panel').hidden = false; }
    bus.emit('immersive', on);
  }

  /** PHOTO MODE: manual exposure / FOV / roll / grain / vignette, UI hidden, time paused. */
  togglePhotoMode() {
    const p = $('photo-panel');
    const on = p.hidden;
    p.hidden = !on;
    if (on) {
      this._photoBackup = { paused: this.time.paused, speed: this.time.speed, grain: this.engine.finalPass.uniforms.uGrain.value, vignette: this.engine.finalPass.uniforms.uVignette.value, fov: this.engine.settings.fov, exposure: this.engine.settings.exposure, autoExp: this.engine.settings.autoExposure };
      $('labels').style.opacity = 0; this.hud.classList.add('photo');
      for (const id of ['settings-panel', 'help-panel', 'science-panel', 'tour-menu', 'database']) $(id).hidden = true;
      $('photo-fov').value = this.engine.settings.fov; $('photo-exposure').value = this.engine.settings.exposure; $('photo-roll').value = 0; $('photo-grain').value = this.engine.finalPass.uniforms.uGrain.value; $('photo-vignette').value = this.engine.finalPass.uniforms.uVignette.value;
    } else {
      const b = this._photoBackup; if (b) { this.engine.finalPass.uniforms.uGrain.value = b.grain; this.engine.finalPass.uniforms.uVignette.value = b.vignette; this.engine.settings.fov = b.fov; this.engine.settings.exposure = b.exposure; this.engine.settings.autoExposure = b.autoExp; }
      this.cameraCtl.roll = 0; $('labels').style.opacity = this.state.uiHidden ? 0 : 1; this.hud.classList.remove('photo');
    }
  }
  _bindPhoto() {
    const fp = this.engine.finalPass.uniforms, s = this.engine.settings;
    $('btn-photo').addEventListener('click', () => this.togglePhotoMode());
    $('photo-close').addEventListener('click', () => this.togglePhotoMode());
    $('photo-fov').addEventListener('input', e => { s.fov = Number(e.target.value); });
    $('photo-exposure').addEventListener('input', e => { s.autoExposure = false; s.exposure = Number(e.target.value); fp.uExposure.value = s.exposure; });
    $('photo-roll').addEventListener('input', e => { this.cameraCtl.roll = Number(e.target.value) * Math.PI / 180; });
    $('photo-grain').addEventListener('input', e => { fp.uGrain.value = Number(e.target.value); });
    $('photo-vignette').addEventListener('input', e => { fp.uVignette.value = Number(e.target.value); });
    $('photo-labels').addEventListener('change', e => { $('labels').style.opacity = e.target.checked ? 1 : 0; });
    $('photo-pause').addEventListener('click', () => this.time.toggle());
    $('photo-hide').addEventListener('click', () => { $('photo-panel').classList.toggle('ghost'); });
  }
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
  hideInfo() {
    // Hide the data panel but keep the selection: a small tab lets the user pull it back out.
    if (!this.selected) return;
    this._infoHiddenFor = this.selected;
    $('info-panel').hidden = true;
    const tab = $('info-tab'); $('info-tab-name').textContent = i18n.name(this.selected); tab.hidden = false;
  }
  setInfoCollapsed(v, persist = true) {
    this._infoCollapsed = !!v;
    $('info-panel').classList.toggle('collapsed', this._infoCollapsed);
    const b = $('info-collapse'); b.title = t(this._infoCollapsed ? 'expand' : 'collapse'); b.dataset.i18nTitle = this._infoCollapsed ? 'expand' : 'collapse';
    if (persist) { try { localStorage.setItem('universo.infoCollapsed', this._infoCollapsed ? '1' : '0'); } catch (e) { /* private mode */ } }
  }
  showInfo(o) {
    this.selected = o;
    const panel = $('info-panel'); const tab = $('info-tab');
    if (!o) { panel.hidden = true; tab.hidden = true; this._infoHiddenFor = null; return; }
    if (this._infoHiddenFor && this._infoHiddenFor !== o) this._infoHiddenFor = null;
    const keepHidden = this._infoHiddenFor === o;
    panel.hidden = keepHidden; tab.hidden = !keepHidden;
    $('info-tab-name').textContent = i18n.name(o);
    const prov = o.provenance || (o.procedural || (o.id && (o.id.startsWith('pstar-') || o.id.startsWith('pneb-') || o.id.includes('-p') && o.parent && o.parent.kind === 'star')) ? 'procedural' : 'observed');
    $('info-kind').innerHTML = `${esc(i18n.kindLabel(o).toUpperCase())}<span class="info-badge ${prov}">${esc(t('prov' + prov.charAt(0).toUpperCase() + prov.slice(1)))}</span>`;
    $('info-name').textContent = i18n.name(o);
    $('info-sub').textContent = i18n.text(o, 'subtitle') || '';
    const ab = $('info-action');
    if (o.action) { ab.hidden = false; ab.textContent = o.actionLabel ? o.actionLabel() : '▶'; ab.onclick = () => o.action(); } else { ab.hidden = true; ab.onclick = null; }
    $('info-desc').textContent = i18n.text(o, 'description') || '';
    $('info-facts').innerHTML = (i18n.text(o, 'facts') || []).map(f => `<div class="info-fact">${esc(f)}</div>`).join('');
    const ch = $('info-children');
    const kids = (o.children || []).filter(c => c.searchable !== false).slice(0, 24);
    ch.innerHTML = kids.length ? `<div class="info-children-title">${o.kind === 'planet' || o.kind === 'dwarf' ? t('moons') : t('related')}</div>` + kids.map(c => `<button class="chip" data-id="${esc(c.id)}">${esc(i18n.name(c))}</button>`).join('') : '';
    ch.querySelectorAll('.chip').forEach(b => b.addEventListener('click', () => { const k = this.registry.get(b.dataset.id); if (k) this.travelTo(k); }));
    $('info-science').innerHTML = scienceHtml(o);
    this.updateBookmarkButton(o);
    import('../universe/Supernova.js').then(({ SupernovaSim }) => { $('info-supernova').hidden = !SupernovaSim.eligible(o); });
    this._renderInfoGrid(o);
  }
  _renderInfoGrid(o) {
    const grid = $('info-grid');
    const rows = i18n.dataRows(o);
    // measured / derived physical rows not already present in the object's own data
    const have = new Set(Object.keys(o.data || {}));
    for (const [k, v] of extraRows(o)) if (!have.has(k)) rows.push([i18n.key(k), v]);
    const p = o.getPosition ? o.getPosition(this._v) : null;
    if (p) {
      const dCam = p.distanceTo(this.cameraCtl.position);
      rows.unshift([t('distFromCamera'), formatDistance(dCam)]);
      if (o.kind !== 'sun' && o.kind !== 'galaxy' && o.kind !== 'region' && p.length() < 1e6 * AU) rows.splice(1, 0, [t('distFromSun'), formatDistance(p.length())]);
      // gravitational time dilation near compact objects (Schwarzschild factor at the camera)
      if (o.kind === 'blackhole' && o.radius) { const r = dCam; const f = r > o.radius ? Math.sqrt(1 - o.radius / r) : 0; if (f < 0.9999) rows.splice(2, 0, [t('timeDilation'), f > 0 ? `× ${f.toFixed(6)} — ${t('tdNote')} ${(60 / f).toFixed(2)} min ${i18n.lang === 'es' ? 'lejos' : 'far away'}` : t('tdInfinite')]); }
      // redshift (Hubble flow + known peculiar velocities for named galaxies)
      if (this.state.redshift && o.kind === 'galaxy' && o.id !== 'milkyway') { const dMly = p.length() / LY / 1e6; const vPec = { 'gal-andromeda-galaxy': -110, 'gal-triangulum-galaxy': -179, 'gal-large-magellanic-cloud': 262, 'gal-small-magellanic-cloud': 146 }[o.id]; const v = vPec != null ? vPec : 70 * dMly / 3.2616; const z = v / 299792.458; rows.splice(2, 0, [t('radialVelocity'), `${v > 0 ? '+' : ''}${Math.round(v)} km/s (${v > 0 ? 'redshift' : 'blueshift'})`], [t('redshiftZ'), z.toExponential(2)]); }
      // light travel time: from the camera, and from Earth for anything beyond the Solar System
      rows.splice(2, 0, [t('lightFromCamera'), formatLightTime(dCam)]);
      const earth = this.registry.get('earth');
      if (earth && o !== earth && p.length() > 2 * AU) rows.splice(3, 0, [t('lightFromEarth'), formatLightTime(p.distanceTo(earth.getPosition(this._v3 || (this._v3 = new THREE.Vector3()))))]);
    }
    grid.innerHTML = rows.map(([k, v]) => `<div class="ig"><div class="ig-k">${esc(k)}</div><div class="ig-v">${esc(v)}</div></div>`).join('');
    // travel-time references for the current distance
    if (p) {
      const dKm = p.distanceTo(this.cameraCtl.position) * 1000;
      const c = 299792.458;
      const fmtT = (s) => s < 3600 ? `${fmtNum(s / 60, 3)} min` : s < 86400 * 3 ? `${fmtNum(s / 3600, 3)} h` : s < 31557600 * 2 ? `${fmtNum(s / 86400, 3)} d` : s < 31557600 * 1e4 ? `${fmtNum(s / 31557600, 3)} ${i18n.lang === 'es' ? 'años' : 'years'}` : `${fmtNum(s / 31557600 / 1e6, 3)} ${i18n.lang === 'es' ? 'millones de años' : 'million years'}`;
      const refs = [[t('atVoyager'), 17], [t('atParker'), 190], [t('at001c'), 0.01 * c], [t('at01c'), 0.1 * c], [t('atC'), c]];
      $('info-speedrefs').innerHTML = `<div class="info-section-title">${esc(t('speedRefs'))}</div>` + refs.map(([k, v]) => `<div class="ig"><div class="ig-k">${esc(k)}</div><div class="ig-v">${esc(fmtT(dKm / v))}</div></div>`).join('') + `<div class="info-note">${esc(t('cNote'))}</div>`;
    } else $('info-speedrefs').innerHTML = '';
  }

  /** Find the next eclipse in the simulation, jump time there and frame it. */
  findEclipse(kind) {
    const solar = this.universe.solar; if (!solar) return;
    import('../systems/Eclipses.js').then(({ EclipseFinder }) => {
      const f = new EclipseFinder(solar);
      const r = f.findNext(kind, this.time.simMs + 3600e3);
      if (!r) { this.toast(t('eclipseNone'), 3500); return; }
      this.time.simMs = r.ms; this.time.setSpeed(1); this.time.pause();
      bus.emit('time:set');
      const what = `${t(kind === 'solar' ? 'eclipseSolar' : 'eclipseLunar')} (${t(r.total ? 'eclipseTotal' : 'eclipsePartial')})`;
      this.toast(t('eclipseFound', { date: formatDate(r.ms).slice(0, 16), kind: what }) + ` · ${t('provSimulated').toLowerCase()}`, 7000);
      const target = this.registry.get(kind === 'solar' ? 'earth' : 'moon');
      if (target) { this.selection.select(target); this.cameraCtl.travelTo(target, { distance: kind === 'solar' ? 5 : 6, duration: 5, mode: CAM_MODE.ORBIT }); }
    });
  }

  _renderShipHud() {
    const el = $('ship-hud');
    const cc = this.cameraCtl; const sh = cc.ship;
    if (cc.mode !== 'SHIP' || !sh || this.state.uiHidden) { if (!el.hidden) el.hidden = true; return; }
    el.hidden = false;
    const st = sh.orbitState(cc.position);
    const lines = [];
    lines.push(`<span class="sh-k">${esc(t('shipSpeed'))}</span>${fmtSpeedKms(sh.velocity.length())}`);
    if (st) {
      lines.push(`<span class="sh-k">${esc(t('shipRel'))}</span>${esc(i18n.name(st.body))} · ${fmtSpeedKms(st.relSpeed)}`);
      const status = sh.landed ? t('shipLanded') : st.bound ? t('shipBound') : t('shipEscape');
      let orb = status;
      if (st.bound && !sh.landed) orb += ` · ${t('shipPeri')} ${formatDistance(Math.max(st.peri - (st.body.radius || 0), 0))} · ${t('shipApo')} ${formatDistance(Math.max(st.apo - (st.body.radius || 0), 0))}`;
      lines.push(`<span class="sh-k">${esc(t('shipOrbit'))}</span>${esc(orb)}`);
      if (st.bound && isFinite(st.T)) lines.push(`<span class="sh-k">${esc(t('shipPeriod'))}</span>${st.T < 86400 ? fmtNum(st.T / 3600, 3) + ' h' : st.T < 31557600 * 2 ? fmtNum(st.T / 86400, 3) + ' d' : fmtNum(st.T / 31557600, 3) + ' y'}`);
    }
    const thr = sh.thrust.length() > 0 ? sh.thrustAccel * sh.boost : 0;
    lines.push(`<span class="sh-k">${esc(t('shipThrottle'))}</span>${sh.thrustAccel >= 1 ? sh.thrustAccel.toFixed(0) : sh.thrustAccel.toFixed(1)} m/s² <span class="${thr ? '' : 'sh-warn'}">(${thr ? (thr / 9.81).toFixed(2) + ' g' : t('shipOff')})</span>`);
    if (sh.speedLimited) lines.push(`<span class="sh-warn">${esc(t('tSpeedLimit'))}</span>`);
    el.innerHTML = lines.join('<br>');
  }

  _renderTravelHud() {
    const el = $('travel-hud');
    const tr = this.cameraCtl.travel;
    if (!tr || this.state.uiHidden) { if (!el.hidden) el.hidden = true; return; }
    el.hidden = false;
    const tp = tr.obj.getPosition(this._v);
    const remaining = Math.max(tp.distanceTo(this.cameraCtl.position) - (tr.obj.radius || 0), 0);
    const eta = Math.max(tr.duration - tr.t, 0);
    el.innerHTML = `<div><span>${esc(t('travelTo2'))}</span><b>${esc(i18n.name(tr.obj))}</b></div><div><span>${esc(t('tvDistance'))}</span><b>${esc(formatDistance(remaining))}</b></div><div><span>${esc(t('tvSpeed'))}</span><b>${esc(formatSpeed(this.cameraCtl.currentSpeed))}</b></div><div><span>${esc(t('tvEta'))}</span><b>${eta.toFixed(1)} s</b></div><div><span>${esc(t('tvLight'))}</span><b>${esc(formatLightTime(remaining))}</b></div>`;
  }

  // ------------------------------------------------------------- per-frame
  update(dt) {
    this._t += dt;
    this.labels.hoverObj = this.selection.hovered;
    this.selection.update();
    this.labels.update();
    if ((this._frame = (this._frame || 0) + 1) % 3 === 0) { this._renderShipHud(); this._renderTravelHud(); this._renderSupernovaHud(); }
    this.discovery.update(dt, this.engine.time);
    if (this.starBirth) this.starBirth.update(dt);
    this.database.update();
    if (this._frame % 2 === 0) this.starmap.update();
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
