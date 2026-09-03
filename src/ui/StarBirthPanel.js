import { bus } from '../core/EventBus.js';
import { i18n, t } from '../i18n/index.js';
import { SUN_RADIUS_KM, KM, clamp } from '../core/Units.js';
import { PHASES, FACTS, fmtYears, phaseFor, U_MAX } from '../starbirth/StarBirthData.js';

// Control panel + bottom readout for the star-formation simulation: stage chips,
// scrub bar, time controls, view modes, mass variants, stage explanations, live
// physical readouts, scale comparison and rotating curiosities.
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const RSUN = SUN_RADIUS_KM * KM;
const fmtAU = (v, lang) => {
  const au = lang === 'es' ? 'UA' : 'AU';
  if (v >= 1000) return `${Math.round(v).toLocaleString(lang === 'es' ? 'es-ES' : 'en-US')} ${au}`;
  if (v >= 0.5) return `${Number(v.toPrecision(3))} ${au}`;
  return `${Math.round(v * 149597870).toLocaleString(lang === 'es' ? 'es-ES' : 'en-US')} km`;
};

export class StarBirthPanel {
  constructor(ui) {
    this.ui = ui; this.sim = ui.universe.starBirth; this.el = $('sb-panel'); this.hud = $('sb-hud');
    this._frame = 0; this._factI = Math.floor(Math.random() * FACTS.length); this._factT = 0; this._dragging = false; this._lastPhase = -1;
    this._bind();
    bus.on('starbirth:begin', () => this.open());
    bus.on('starbirth:end', () => this.close());
    bus.on('starbirth:phase', () => this.renderPhase());
    bus.on('starbirth:seek', () => this.renderPhase());
    bus.on('starbirth:mass', () => { this._renderChips(); this.renderPhase(); this._syncMass(); });
    bus.on('starbirth:speed', () => this._syncSpeed());
    bus.on('starbirth:mode', () => this._syncMode());
    bus.on('starbirth:tour', on => this._syncTour(on));
    bus.on('starbirth:tourdone', () => { ui.toast(t('sbTourDone'), 6000); });
    bus.on('starbirth:ready', () => { if (!this.sim.tour) ui.toast(t('sbHint'), 6000); });
    bus.on('starbirth:caption', c => ui.caption(c.title, c.sub, c.ms));
    bus.on('starbirth:ignite', () => { if (!this.sim.tour && this.sim.mode !== 'explain') ui.toast(t('sbIgnited'), 4000); });
    bus.on('lang', () => { this._renderChips(); this.renderPhase(); this._syncMode(); this._syncMass(); this._syncTour(this.sim.tour); });
    this._renderChips();
  }

  _bind() {
    const sim = this.sim;
    $('sb-close').addEventListener('click', () => bus.emit('starbirth:stop'));
    $('sb-hide').addEventListener('click', () => { this.el.classList.toggle('collapsed'); $('sb-hide').textContent = this.el.classList.contains('collapsed') ? '▴' : '▾'; });
    $('sb-tour').addEventListener('click', () => sim.tour ? sim.stopTour(false) : sim.startTour());
    $('sb-free').addEventListener('click', () => { if (sim.tour) sim.stopTour(false); sim.focus(); });
    $('sb-prev').addEventListener('click', () => sim.seekPhase(sim.phase - (sim.u - sim.phase < 0.2 ? 1 : 0)));
    $('sb-next').addEventListener('click', () => sim.seekPhase(sim.phase + 1));
    $('sb-restart').addEventListener('click', () => { sim.seek(0); sim.setSpeed(sim.speed); });
    $('sb-speed').querySelectorAll('.tbtn').forEach(b => b.addEventListener('click', () => sim.setSpeed(Number(b.dataset.sp))));
    $('sb-mode').querySelectorAll('button').forEach(b => b.addEventListener('click', () => sim.setMode(b.dataset.m)));
    $('sb-mass').querySelectorAll('button').forEach(b => b.addEventListener('click', () => sim.setMass(b.dataset.mass)));
    $('sb-layer').addEventListener('change', e => sim.setLayer(Number(e.target.value)));
    const sc = $('sb-scrub'); sc.max = String(U_MAX - 0.001);
    sc.addEventListener('input', () => { this._dragging = true; sim.seek(Number(sc.value)); });
    const done = () => { this._dragging = false; };
    sc.addEventListener('change', done); sc.addEventListener('pointerup', done); sc.addEventListener('blur', done);
  }

  open() {
    this.el.hidden = false; this.el.classList.remove('collapsed'); $('sb-hide').textContent = '▾'; this.hud.hidden = false;
    $('btn-starbirth').classList.add('active'); this.ui.hud.classList.add('sb-active');
    for (const id of ['settings-panel', 'help-panel', 'science-panel', 'tour-menu', 'database']) $(id).hidden = true;
    this.renderPhase(); this._syncSpeed(); this._syncMode(); this._syncMass(); this._syncTour(this.sim.tour);
  }
  close() { this.el.hidden = true; this.hud.hidden = true; $('btn-starbirth').classList.remove('active'); this.ui.hud.classList.remove('sb-active'); this.ui.caption(null); }

  _renderChips() {
    const lang = i18n.lang;
    const m = this.sim.m;
    const chip = (i) => `<button class="sb-chip" data-p="${i}"><i>${i + 1}</i>${esc(phaseFor(i, m).name[lang])}</button>`;
    $('sb-phases').innerHTML = `<div class="sb-group">${esc(t('sbGroupForm'))}</div>` + PHASES.slice(0, 7).map((p, i) => chip(i)).join('') + `<div class="sb-group">${esc(t('sbGroupLife'))}</div>` + PHASES.slice(7).map((p, i) => chip(i + 7)).join('');
    $('sb-phases').querySelectorAll('.sb-chip').forEach(b => b.addEventListener('click', () => this.sim.seekPhase(Number(b.dataset.p))));
  }

  renderPhase() {
    const sim = this.sim, lang = i18n.lang, p = sim.phase, m = sim.m, ph = phaseFor(p, m);
    $('sb-phases').querySelectorAll('.sb-chip').forEach(b => { const i = Number(b.dataset.p); b.classList.toggle('on', i === p); b.classList.toggle('done', i < p); });
    $('sb-card').innerHTML = `<div class="sb-phase-k">${esc(t('sbPhaseOf', { n: p + 1 }))} · ${esc(ph.name[lang])}</div><h3>${esc(ph.title[lang])}</h3><p>${esc(ph.text[lang])}</p><ul>${ph.points.map(x => `<li>${esc(x[lang])}</li>`).join('')}</ul>`;
    const stats = ph.stats(m).map(([k, v]) => [k[lang] || k, v && typeof v === 'object' ? v[lang] : v]);
    $('sb-stats-static').innerHTML = stats.map(([k, v]) => `<div class="ig"><div class="ig-k">${esc(k)}</div><div class="ig-v">${esc(v)}</div></div>`).join('');
    $('sb-mass-note').textContent = m.note[lang];
    this._renderScale(); this._renderFact();
    this._lastPhase = p;
  }

  _renderScale() {
    const m = this.sim.m, lang = i18n.lang;
    const cloudAU = m.cloudPc * 206265, diskAU = m.diskAU, starAU = m.radiusSun * 0.00465;
    const items = [[t('sbCloud'), cloudAU], [t('sbDisc'), diskAU], [t('sbStar'), starAU]];
    const lmin = Math.log10(starAU) - 0.4, lmax = Math.log10(cloudAU);
    const bars = items.map(([k, v]) => { const w = clamp((Math.log10(v) - lmin) / (lmax - lmin), 0.03, 1) * 100; return `<div class="sb-bar"><span>${esc(k)}</span><i style="width:${w.toFixed(1)}%"></i><b>${esc(fmtAU(v, lang))}</b></div>`; }).join('');
    const dm = 100 * diskAU / cloudAU, smm = 100 * starAU / cloudAU * 1000;
    const dur = m.years.map((y, i) => `<div class="sb-dur"><span>${esc(phaseFor(i, m).name[lang])}</span><b>${esc(fmtYears(y, lang))}</b></div>`).join('');
    $('sb-scale').innerHTML = `<div class="info-section-title">${esc(t('sbScale'))}</div>${bars}<div class="info-note">${esc(t('sbScaleNote', { d: dm.toFixed(1), s: smm < 1 ? smm.toFixed(2) : smm.toFixed(1) }))}</div><div class="info-section-title sb-sec">${esc(t('sbDurations'))}</div>${dur}`;
  }
  _renderFact() { $('sb-fact').innerHTML = `<div class="info-section-title">${esc(t('sbFact'))}</div><div class="sb-fact-text">${esc(FACTS[this._factI][i18n.lang])}</div>`; }

  _syncSpeed() { const s = this.sim.paused ? 0 : this.sim.speed; $('sb-speed').querySelectorAll('.tbtn').forEach(b => b.classList.toggle('active', Number(b.dataset.sp) === s)); }
  _syncMode() { $('sb-mode').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.m === this.sim.mode)); $('sb-sci-row').hidden = this.sim.mode !== 'sci'; }
  _syncMass() { $('sb-mass').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.mass === this.sim.massKey)); $('sb-sub').textContent = this.sim.m.sub[i18n.lang]; }
  _syncTour(on) { const b = $('sb-tour'); b.classList.toggle('active', !!on); b.textContent = t(on ? 'sbTourStop' : 'sbTour'); $('btn-starbirth').classList.toggle('active', this.sim.active); }

  update(dt) {
    const sim = this.sim; if (!sim || !sim.active) return;
    this._frame++;
    this._factT += dt; if (this._factT > 28) { this._factT = 0; this._factI = (this._factI + 1) % FACTS.length; this._renderFact(); }
    if (this._frame % 3) return;
    const P = sim.P, lang = i18n.lang;
    if (!this._dragging) $('sb-scrub').value = sim.u.toFixed(3);
    const yps = sim.yearsPerSecond;
    const rate = sim.paused ? t('pause') : t('sbRate', { y: fmtYears(yps, lang) });
    $('sb-age').textContent = `${t('sbAge')}: ${fmtYears(P.age, lang)}`;
    $('sb-rate').textContent = rate;
    const kK = v => `${Math.round(v).toLocaleString('en-US')} K`;
    const live = [
      [t('sbSurfaceT'), P.starOn > 0.01 ? kK(P.T) : '—'],
      [t('sbCoreT'), P.coreT < 1e4 ? kK(P.coreT) : `${(P.coreT / 1e6).toPrecision(2)} × 10⁶ K`],
      [t('sbCoreDens'), P.coreDens >= 1 ? `${P.coreDens.toPrecision(2)} g/cm³` : `${P.coreDens.toExponential(1)} g/cm³`],
      [t('sbRadius'), P.starOn > 0.01 ? `${(P.R / RSUN).toPrecision(2)} R☉` : '—'],
      [t('sbLum'), P.starOn > 0.01 ? `${P.L < 0.01 ? P.L.toExponential(1) : P.L.toPrecision(2)} L☉` : '—'],
      [t('sbMassAcc'), `${P.massAcc.toPrecision(2)} / ${sim.m.mass} M☉`],
    ];
    $('sb-stats-live').innerHTML = live.map(([k, v]) => `<div class="ig"><div class="ig-k">${esc(k)}</div><div class="ig-v mono">${esc(v)}</div></div>`).join('');
    if (sim.phase !== this._lastPhase) this.renderPhase();
    const ph = phaseFor(sim.phase, sim.m); const prog = (sim.u / U_MAX * 100).toFixed(1);
    const hide = this.ui.state.uiHidden || !!this.ui.cameraCtl.travel;   // the travel readout uses the same spot
    if (this.hud.hidden !== hide) this.hud.hidden = hide;
    if (!hide) this.hud.innerHTML = `<div class="sb-hud-row"><span class="sb-hud-phase">${sim.phase + 1}/${U_MAX} · ${esc(ph.name[lang])}</span><span class="sb-hud-age mono">${esc(fmtYears(P.age, lang))}</span><span class="sb-hud-rate">${esc(rate)}</span></div><div class="sb-hud-bar"><i style="width:${prog}%"></i></div>`;
  }
}
