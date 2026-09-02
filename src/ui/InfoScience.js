import { PHYS, physicalRows, scaleFact, starProfile } from '../data/PhysicalData.js';
import { factsFor } from '../data/Facts.js';
import { i18n, t } from '../i18n/index.js';

// Science sections of the info panel: composition bars, atmosphere, astrobiology
// interest, stellar profile + evolutionary track, scale fact and extra facts.
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const COLORS = ['#7fb4ff', '#8fe3b4', '#ffd080', '#ff9fb4', '#c8b4ff', '#9fd8ff', '#ffb070', '#b0b8c8'];

function bars(items) {
  const total = items.reduce((a, [, v]) => a + v, 0) || 1;
  return `<div class="comp-bar">${items.map(([k, v], i) => `<i style="width:${(100 * v / total).toFixed(2)}%;background:${COLORS[i % COLORS.length]}" title="${esc(k)} ${v}%"></i>`).join('')}</div>` +
    `<div class="comp-legend">${items.map(([k, v], i) => `<span><b style="background:${COLORS[i % COLORS.length]}"></b>${esc(k)} <em>${v < 0.01 ? '<0.01' : v < 1 ? v.toFixed(2) : v.toFixed(v < 10 ? 1 : 0)}%</em></span>`).join('')}</div>`;
}

/** Extra data-grid rows (label key, value) for the object, merged by the caller. */
export function extraRows(o) {
  const lang = i18n.lang;
  if (o.kind === 'star' && !o.procedural) return starProfile(o, lang).rows;
  if (PHYS[o.id]) return physicalRows(o.id, lang);
  return [];
}

/** HTML for the science sections; empty string when nothing applies. */
export function scienceHtml(o) {
  const lang = i18n.lang; const es = lang === 'es';
  const parts = [];
  const d = PHYS[o.id];
  if (d) {
    if (d.composition) parts.push(`<div class="info-section"><div class="info-section-title">${esc(t('composition'))}</div>${bars(d.composition.map(([k, v]) => [i18n.value(k), v]))}${d.notes ? `<div class="info-note">${esc(d.notes[lang] || d.notes.en)}</div>` : ''}</div>`);
    if (d.atmosphere) parts.push(`<div class="info-section"><div class="info-section-title">${esc(t('atmosphereComp'))}</div>${bars(d.atmosphere)}${d.atmoNote ? `<div class="info-note">${esc(d.atmoNote[lang] || d.atmoNote.en)}</div>` : ''}</div>`);
    if (d.astrobiology) parts.push(`<div class="info-section astro"><div class="info-section-title">${esc(t('astrobiology'))}</div><div class="info-text">${esc(d.astrobiology[lang] || d.astrobiology.en)}</div><div class="info-note">${esc(t('astroNote'))}</div></div>`);
    const sf = scaleFact(o.id, lang);
    if (sf) parts.push(`<div class="info-section"><div class="info-section-title">${esc(t('scaleFact'))}</div><div class="info-text">${esc(sf)}</div></div>`);
  }
  if (o.astrobiology) parts.push(`<div class="info-section astro"><div class="info-section-title">${esc(t('astrobiology'))}</div><div class="info-text">${esc(o.astrobiology[lang] || o.astrobiology.en)}</div><div class="info-note">${esc(t('astroNote'))}</div></div>`);
  if (o.inHabitableZone) parts.push(`<div class="info-section"><div class="info-section-title">${esc(t('habitableZone'))}</div><div class="info-text">${esc(t('hzPlanetNote'))}</div></div>`);
  if (o.kind === 'star' && o.knownSystem) parts.push(`<div class="info-section"><div class="info-section-title">${esc(t('knownPlanets'))}</div><div class="info-text">${esc(t('knownPlanetsNote', { n: o.knownSystem.planets.length }))}</div></div>`);
  if (o.kind === 'star' && !o.procedural) {
    const p = starProfile(o, lang);
    parts.push(`<div class="info-section"><div class="info-section-title">${esc(t('starEvolution'))}</div><div class="evo">${p.path.map((s, i) => `<span class="evo-step${i === p.current ? ' now' : i < p.current ? ' past' : ''}">${esc(s)}</span>`).join('<span class="evo-arrow">→</span>')}</div><div class="info-note">${esc(t('starEvoNote'))}</div></div>`);
  }
  if (o.kind === 'blackhole') {
    parts.push(`<div class="info-section"><div class="info-section-title">${esc(t('bhAnatomy'))}</div><div class="info-text">${esc(t('bhAnatomyText'))}</div></div>`);
  }
  const facts = factsFor(o, lang, 6);
  if (facts.length) parts.push(`<div class="info-section"><div class="info-section-title">${esc(t('interestingFacts'))}</div>${facts.map(f => `<div class="info-fact">${esc(f)}</div>`).join('')}</div>`);
  return parts.join('');
}
