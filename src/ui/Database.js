import * as THREE from 'three';
import { bus } from '../core/EventBus.js';
import { i18n, t } from '../i18n/index.js';
import { formatDistance, formatLightTime, formatDistanceAstro, AU, LY } from '../core/Units.js';

// COSMIC DATABASE: the integrated encyclopedia (categories, search, travel),
// plus the exploration tools that live with it — bookmarks, navigation
// history, COMPARE SIZE, MEASURE DISTANCE, the cosmic timeline and the
// "extremes of the universe" list.
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CATS = [
  ['planets', o => o.kind === 'planet' || o.kind === 'dwarf'],
  ['moons', o => o.kind === 'moon'],
  ['stars', o => o.kind === 'star' && !o.pulsar && !o.procedural],
  ['blackholes', o => o.kind === 'blackhole' || o.pulsar],
  ['nebulae', o => o.kind === 'nebula' && !o.procedural && !o.id.startsWith('pneb')],
  ['galaxies', o => o.kind === 'galaxy'],
  ['clusters', o => o.kind === 'region' && (o.kindLabel || '').match(/group|cluster|supercluster|web/i)],
  ['asteroids', o => o.kind === 'asteroid'],
  ['comets', o => o.kind === 'comet'],
  ['spacecraft', o => o.kind === 'spacecraft'],
  ['sites', o => o.kind === 'site'],
  ['phenomena', o => o.kind === 'region' && !(o.kindLabel || '').match(/group|cluster|supercluster|web/i)],
];
// extremes: [key, registry id, EN, ES]
const EXTREMES = [
  ['exLargestStar', 'star-betelgeuse', 'Largest star in the sky (radius ≈ 900 R☉) — UY Scuti and Stephenson 2-18 are larger but too faint to include', 'La estrella más grande del cielo (radio ≈ 900 R☉); UY Scuti y Stephenson 2-18 son mayores, pero demasiado débiles para incluirlas'],
  ['exHottestStar', 'star-zeta-puppis', 'Hottest naked-eye star: Zeta Puppis, an O4 supergiant at 40,000 K', 'La estrella más caliente visible a simple vista: Zeta Puppis, supergigante O4 a 40.000 K'],
  ['exBrightest', 'star-sirius', 'Brightest star in the night sky (apparent magnitude −1.46)', 'La estrella más brillante del cielo nocturno (magnitud aparente −1,46)'],
  ['exNearest', 'star-proxima-centauri', 'Nearest star: 4.24 light-years', 'La estrella más cercana: 4,24 años luz'],
  ['exFastestSpin', 'pulsar-psr-j0437-4715', 'Fastest spinning object here: 174 rotations per second (the record, PSR J1748−2446ad, spins 716 times a second)', 'El objeto que gira más rápido aquí: 174 vueltas por segundo (el récord, PSR J1748−2446ad, gira 716 veces por segundo)'],
  ['exDensest', 'pulsar-crab-pulsar', 'Densest matter: a neutron star packs 1.4 solar masses into 20 km — a teaspoon weighs a billion tonnes', 'La materia más densa: una estrella de neutrones concentra 1,4 masas solares en 20 km; una cucharilla pesa mil millones de toneladas'],
  ['exMagnetic', 'magnetar-sgr-1806-20', 'Strongest magnetic field: 10¹⁵ gauss', 'El campo magnético más intenso: 10¹⁵ gauss'],
  ['exBiggestBH', 'gal-messier-87', 'Largest black hole here: M87*, 6.5 billion solar masses (TON 618 reaches 40 billion)', 'El mayor agujero negro aquí: M87*, 6.500 millones de masas solares (TON 618 llega a 40.000 millones)'],
  ['exColdest', 'triton', 'Coldest surface visited: Triton, −235 °C (the Boomerang Nebula, at 1 K, is the coldest known place)', 'La superficie más fría visitada: Tritón, −235 °C (la nebulosa Boomerang, a 1 K, es el lugar más frío conocido)'],
  ['exHottestPlanet', 'venus', 'Hottest planet: Venus, 464 °C', 'El planeta más caliente: Venus, 464 °C'],
  ['exTallest', 'site-olympus-mons', 'Tallest mountain: Olympus Mons, 21.9 km', 'La montaña más alta: el monte Olimpo, 21,9 km'],
  ['exWindiest', 'neptune', 'Fastest winds: Neptune, 2,100 km/h', 'Los vientos más rápidos: Neptuno, 2.100 km/h'],
  ['exStructure', 'laniakea', 'Largest structure here: Laniakea, 520 million light-years (the Hercules–Corona Borealis Great Wall spans ~10 billion)', 'La mayor estructura aquí: Laniakea, 520 millones de años luz (la Gran Muralla de Hércules–Corona Boreal abarca ~10.000 millones)'],
  ['exFarthest', 'cosmic-web', 'Farthest reach of this simulation: ~500 million light-years — 1 % of the observable universe\'s radius', 'El alcance máximo de esta simulación: ~500 millones de años luz, el 1 % del radio del universo observable'],
];
const TIMELINE = [
  [13.8e9, 'Big Bang', 'Big Bang'], [13.8e9 - 380000 / 1e9 * 1e9, 'First light (CMB) — 380,000 years after', 'Primera luz (fondo cósmico), 380.000 años después'], [13.6e9, 'First stars and galaxies', 'Primeras estrellas y galaxias'],
  [13.2e9, 'Milky Way\'s oldest stars form', 'Se forman las estrellas más viejas de la Vía Láctea'], [10e9, 'Thin disc of the Milky Way assembles', 'Se ensambla el disco fino de la Vía Láctea'],
  [4.6e9, 'Sun and Solar System form', 'Se forman el Sol y el Sistema Solar'], [4.5e9, 'Earth forms; the Moon after a giant impact', 'Se forma la Tierra; la Luna tras un impacto gigante'],
  [3.8e9, 'Earliest evidence of life', 'Primeras evidencias de vida'], [2.4e9, 'Oxygen fills Earth\'s atmosphere', 'El oxígeno llena la atmósfera terrestre'], [0.54e9, 'Cambrian explosion of animal life', 'Explosión cámbrica de la vida animal'],
  [66e6, 'Chicxulub impact ends the dinosaurs', 'El impacto de Chicxulub extingue a los dinosaurios'], [300000, 'Homo sapiens', 'Homo sapiens'], [67, 'First satellite (1957) · humans on the Moon (1969)', 'Primer satélite (1957) · humanos en la Luna (1969)'], [0, 'Today', 'Hoy'],
  [-5e9, 'Sun becomes a red giant', 'El Sol se convierte en gigante roja'], [-4.5e9, 'Milky Way and Andromeda merge', 'La Vía Láctea y Andrómeda se fusionan'],
];

export class Database {
  constructor(ui) {
    this.ui = ui; this.registry = ui.registry; this.cam = ui.cameraCtl;
    this.el = document.getElementById('database');
    this.cat = 'planets';
    try { this.bookmarks = JSON.parse(localStorage.getItem('mw.bookmarks') || '[]'); } catch (_) { this.bookmarks = []; }
    this.history = [];
    this.measure = { a: null, b: null };
    bus.on('camera:arrive', o => this._pushHistory(o));
    bus.on('lang', () => { if (!this.el.hidden) this.render(); });
    this.el.addEventListener('click', e => this._onClick(e));
    document.getElementById('btn-database').addEventListener('click', () => this.toggle());
    document.getElementById('db-search').addEventListener('input', () => this.render());
    document.getElementById('info-bookmark').addEventListener('click', () => { if (this.ui.selected) this.toggleBookmark(this.ui.selected); });
    document.getElementById('info-measure').addEventListener('click', () => { if (this.ui.selected) this.setMeasure(this.ui.selected); });
    document.getElementById('info-compare').addEventListener('click', () => { if (this.ui.selected) { this.cat = 'compare'; this._compareWith = this.ui.selected; this.open(); } });
  }

  toggle() { if (this.el.hidden) this.open(); else this.el.hidden = true; }
  open() { this.el.hidden = false; for (const id of ['settings-panel', 'help-panel', 'science-panel', 'tour-menu', 'info-panel']) document.getElementById(id).hidden = true; this.render(); }

  _pushHistory(o) { if (!o) return; this.history = [o, ...this.history.filter(x => x !== o)].slice(0, 12); }
  toggleBookmark(o) {
    const i = this.bookmarks.indexOf(o.id);
    if (i >= 0) this.bookmarks.splice(i, 1); else this.bookmarks.unshift(o.id);
    this.bookmarks = this.bookmarks.slice(0, 40);
    try { localStorage.setItem('mw.bookmarks', JSON.stringify(this.bookmarks)); } catch (_) { }
    this.ui.toast(t(i >= 0 ? 'bookmarkRemoved' : 'bookmarkAdded', { name: i18n.name(o) }));
    this.ui.updateBookmarkButton(o);
  }
  isBookmarked(o) { return this.bookmarks.includes(o.id); }
  setMeasure(o) {
    if (!this.measure.a || (this.measure.a && this.measure.b)) { this.measure = { a: o, b: null }; this.ui.toast(t('measureA', { name: i18n.name(o) })); }
    else { this.measure.b = o; this.cat = 'measure'; this.open(); }
  }

  _list(objs) {
    return `<div class="db-list">${objs.map(o => `<div class="db-item" data-id="${esc(o.id)}"><span class="db-dot" style="background:${esc(o.color || '#fff')}"></span><span class="db-name">${esc(i18n.name(o))}</span><span class="db-kind">${esc(i18n.kindLabel(o))}</span><span class="db-actions"><button class="btn" data-act="select">${esc(t('focus'))}</button><button class="btn btn-accent" data-act="travel">${esc(t('travelTo'))}</button></span></div>`).join('') || `<div class="sr-empty">${esc(t('noResults'))}</div>`}</div>`;
  }

  render() {
    const lang = i18n.lang;
    const q = document.getElementById('db-search').value.trim().toLowerCase();
    const tabs = [...CATS.map(([k]) => k), 'bookmarks', 'history', 'extremes', 'compare', 'measure', 'timeline'];
    document.getElementById('db-tabs').innerHTML = tabs.map(k => `<button class="db-tab${k === this.cat ? ' on' : ''}" data-cat="${k}">${esc(t('db_' + k))}</button>`).join('');
    let body = '';
    const cat = this.cat;
    const filt = CATS.find(([k]) => k === cat);
    if (filt) {
      let objs = this.registry.objects.filter(o => o.searchable !== false && filt[1](o));
      if (q) objs = objs.filter(o => i18n.name(o).toLowerCase().includes(q) || o.name.toLowerCase().includes(q) || o.aliases.some(a => a.toLowerCase().includes(q)));
      objs.sort((a, b) => (b.priority || 0) - (a.priority || 0) || i18n.name(a).localeCompare(i18n.name(b)));
      body = `<div class="db-count">${objs.length}</div>` + this._list(objs.slice(0, 200));
    } else if (cat === 'bookmarks') {
      const objs = this.bookmarks.map(id => this.registry.get(id)).filter(Boolean);
      body = objs.length ? this._list(objs) : `<div class="sr-empty">${esc(t('noBookmarks'))}</div>`;
    } else if (cat === 'history') {
      body = this.history.length ? this._list(this.history) : `<div class="sr-empty">${esc(t('noHistory'))}</div>`;
    } else if (cat === 'extremes') {
      body = `<div class="db-list">${EXTREMES.map(([k, id, en, es]) => { const o = this.registry.get(id); return `<div class="db-item ex" data-id="${esc(id)}"><div class="db-ex"><div class="db-name">${esc(o ? i18n.name(o) : id)}</div><div class="db-desc">${esc(lang === 'es' ? es : en)}</div></div>${o ? `<span class="db-actions"><button class="btn btn-accent" data-act="travel">${esc(t('travelTo'))}</button></span>` : ''}</div>`; }).join('')}</div>`;
    } else if (cat === 'compare') {
      body = this._compare();
    } else if (cat === 'measure') {
      body = this._measure();
    } else if (cat === 'timeline') {
      body = `<div class="tl">${TIMELINE.map(([y, en, es]) => `<div class="tl-row${y === 0 ? ' now' : ''}${y < 0 ? ' future' : ''}"><div class="tl-when">${esc(fmtYears(y, lang))}</div><div class="tl-what">${esc(lang === 'es' ? es : en)}</div></div>`).join('')}<div class="info-note">${esc(t('timelineNote'))}</div></div>`;
    }
    document.getElementById('db-body').innerHTML = body;
  }

  /** COMPARE SIZE: objects drawn as circles to a common linear scale (radii). */
  _compare() {
    const base = this._compareWith || this.registry.get('earth');
    const picks = [this.registry.get('earth'), this.registry.get('jupiter'), this.registry.get('sun'), this.registry.get('star-sirius'), this.registry.get('star-betelgeuse'), this.registry.get('sgr-a'), this.registry.get('moon'), this.registry.get('mars')].filter(Boolean);
    const set = [base, ...picks.filter(o => o !== base)].slice(0, 6);
    const maxR = Math.max(...set.map(o => o.radius || 1));
    const W = 300;
    const svg = set.map((o, i) => { const r = Math.max(2, (o.radius / maxR) * (W / 2 - 8)); return { o, r }; });
    let x = 8; const rows = svg.map(({ o, r }) => { const cx = x + r; x += 2 * r + 10; return { o, r, cx }; });
    const total = x;
    const scale = total > W ? W / total : 1;
    const svgHtml = `<svg viewBox="0 0 ${W} ${Math.max(90, (W / 2) * scale + 20)}" class="cmp-svg">${rows.map(({ o, r, cx }) => `<circle cx="${(cx * scale).toFixed(1)}" cy="${((W / 2) * scale / 2 + 10).toFixed(1)}" r="${(r * scale).toFixed(1)}" fill="${esc(o.color || '#fff')}" fill-opacity="0.75" stroke="rgba(255,255,255,0.4)"/>`).join('')}</svg>`;
    const rowsHtml = rows.map(({ o }) => `<div class="cmp-row" data-id="${esc(o.id)}"><span class="db-dot" style="background:${esc(o.color || '#fff')}"></span><span class="db-name">${esc(i18n.name(o))}</span><span class="cmp-val">${esc(formatRadius(o.radius))}</span><span class="cmp-val">× ${(o.radius / base.radius).toPrecision(3)}</span></div>`).join('');
    return `<div class="info-note">${esc(t('compareNote', { name: i18n.name(base) }))}</div>${svgHtml}${rowsHtml}<div class="info-note">${esc(t('compareHint'))}</div>`;
  }

  /** MEASURE DISTANCE between two selected objects (live). */
  _measure() {
    const { a, b } = this.measure;
    if (!a) return `<div class="sr-empty">${esc(t('measureHint'))}</div>`;
    if (!b) return `<div class="sr-empty">${esc(t('measureA', { name: i18n.name(a) }))} — ${esc(t('measureHintB'))}</div>`;
    const pa = a.getPosition(new THREE.Vector3()), pb = b.getPosition(new THREE.Vector3());
    const d = pa.distanceTo(pb);
    const rows = [[t('measureFrom'), i18n.name(a)], [t('measureTo'), i18n.name(b)], ['km', `${Math.round(d * 1000).toLocaleString('en-US')} km`], [t('uAU'), `${(d / AU).toPrecision(5)} AU`], [t('lightTime'), formatLightTime(d)], [t('uLy'), `${(d / LY).toPrecision(5)} ly`], ['pc / kpc / Mpc', formatDistanceAstro(d)]];
    return `<div class="info-grid">${rows.map(([k, v]) => `<div class="ig"><div class="ig-k">${esc(k)}</div><div class="ig-v">${esc(v)}</div></div>`).join('')}</div><div class="info-note">${esc(t('measureLive'))}</div>`;
  }

  _onClick(e) {
    const tab = e.target.closest('.db-tab'); if (tab) { this.cat = tab.dataset.cat; this.render(); return; }
    const item = e.target.closest('[data-id]'); if (!item) return;
    const o = this.registry.get(item.dataset.id); if (!o) return;
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'travel') { this.ui.travelTo(o); this.el.hidden = true; }
    else if (act === 'select' || !act) { this.ui.selection.select(o); if (this.cat === 'compare') { this._compareWith = o; this.render(); } }
  }

  update() { if (!this.el.hidden && this.cat === 'measure' && this.measure.b && (this._mt = (this._mt || 0) + 1) % 30 === 0) this.render(); }
}

function fmtYears(y, lang) {
  const es = lang === 'es';
  const ago = es ? 'hace' : '', fut = es ? 'dentro de' : 'in';
  const abs = Math.abs(y);
  const n = abs >= 1e9 ? `${(abs / 1e9).toLocaleString(es ? 'es-ES' : 'en-US', { maximumSignificantDigits: 3 })} ${es ? 'mil millones de años' : 'billion years'}` : abs >= 1e6 ? `${(abs / 1e6).toLocaleString(es ? 'es-ES' : 'en-US', { maximumSignificantDigits: 3 })} ${es ? 'millones de años' : 'million years'}` : `${abs.toLocaleString(es ? 'es-ES' : 'en-US')} ${es ? 'años' : 'years'}`;
  if (y === 0) return es ? 'Hoy' : 'Today';
  return y > 0 ? (es ? `${ago} ${n}` : `${n} ago`) : `${fut} ${n}`;
}
function formatRadius(units) { const km = units * 1000; return km >= 1e6 ? `${(km / 695700).toPrecision(3)} R☉` : `${Math.round(km).toLocaleString('en-US')} km`; }
