import { UI } from './ui.js';
import { ES_CONTENT, ES_VALUES, ES_TEMPLATES } from './es-content.js';
import { bus } from '../core/EventBus.js';

// Lightweight i18n: UI strings, object content overrides (name / subtitle /
// description / facts / data) and a phrase table that translates the English
// data values ("365.256 days" → "365,256 días") when no explicit override exists.
const params = new URLSearchParams(location.search);
let lang = params.get('lang') || localStorage.getItem('mw.lang') || ((navigator.language || 'en').toLowerCase().startsWith('es') ? 'es' : 'en');
if (lang !== 'es') lang = 'en';

// sort phrase table longest-first so multi-word phrases win
const VALUE_RULES = Object.entries(ES_VALUES).sort((a, b) => b[0].length - a[0].length).map(([k, v]) => [new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), v]);

export const i18n = {
  get lang() { return lang; },
  setLang(l) {
    l = l === 'es' ? 'es' : 'en';
    if (l === lang) return;
    lang = l;
    localStorage.setItem('mw.lang', l);
    document.documentElement.lang = l;
    bus.emit('lang', l);
  },
  toggle() { this.setLang(lang === 'es' ? 'en' : 'es'); },
  /** UI string with {param} interpolation. */
  t(key, p) {
    let s = UI[lang][key] ?? UI.en[key] ?? key;
    if (p) for (const k of Object.keys(p)) s = s.replace(new RegExp('\\{' + k + '\\}', 'g'), p[k]);
    return s;
  },
  key(k) { return UI[lang].keys[k] ?? UI.en.keys[k] ?? k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()); },
  kind(k) { return UI[lang].kinds[k] ?? UI.en.kinds[k] ?? k; },
  kindLabel(o) {
    const kl = o.kindLabel;
    if (kl) return UI[lang].kindLabels[kl] ?? (lang === 'es' && ES_CONTENT[o.id]?.kindLabel) ?? kl;
    return this.kind(o.kind);
  },
  /** Localised display name of a registry object. */
  name(o) { if (!o) return ''; if (lang === 'es') { const c = ES_CONTENT[o.id]; if (c?.name) return c.name; if (o.i18n?.es?.name) return o.i18n.es.name; } return o.name; },
  /** Localised text field: subtitle / description / facts */
  text(o, field) {
    if (lang === 'es') {
      const c = ES_CONTENT[o.id]; if (c && c[field] != null) return c[field];
      if (o.i18n?.es && o.i18n.es[field] != null) return o.i18n.es[field];
      if (field === 'subtitle' && o.parent && !o.subtitle) return this.t(o.kind === 'moon' ? 'moonOf' : 'planetOf', { name: this.name(o.parent) });
      if (field === 'description' && o.description) return this.value(o.description);
      if (field === 'facts' && o.facts) return o.facts.map(f => this.value(f));
    }
    if (field === 'subtitle' && !o.subtitle && o.parent) return this.t(o.kind === 'moon' ? 'moonOf' : 'planetOf', { name: this.name(o.parent) });
    return o[field];
  },
  /** Localised data rows: [[label, value], ...] */
  dataRows(o) {
    const d = o.data || {};
    const over = lang === 'es' ? (ES_CONTENT[o.id]?.data || o.i18n?.es?.data || null) : null;
    const rows = [];
    for (const k of Object.keys(d)) {
      if (d[k] == null || d[k] === '') continue;
      const v = over && over[k] != null ? over[k] : (lang === 'es' ? this.value(String(d[k])) : String(d[k]));
      rows.push([this.key(k), v]);
    }
    return rows;
  },
  /** Translate an English data value / short sentence via the phrase table (es only). */
  value(s) {
    if (lang !== 'es' || !s) return s;
    let out = String(s);
    for (const [re, v] of VALUE_RULES) out = out.replace(re, v);
    return out;
  },
  /** Template-based text for procedural objects. Returns {en, es}. */
  tpl(name, params) {
    const f = (t) => t.replace(/\{(\w+)\}/g, (_, k) => params[k] ?? '');
    return { en: f(ES_TEMPLATES.en[name] || ''), es: f(ES_TEMPLATES.es[name] || '') };
  },
  /** Attach Spanish names as search aliases so both languages find everything. */
  attachAliases(registry) {
    for (const o of registry.objects) {
      const c = ES_CONTENT[o.id];
      const es = c?.name || o.i18n?.es?.name;
      if (es && es !== o.name && !o.aliases.includes(es)) o.aliases.push(es);
      if (c?.aliases) for (const a of c.aliases) if (!o.aliases.includes(a)) o.aliases.push(a);
    }
  },
  /** Apply data-i18n attributes in the DOM. */
  applyDom(root = document) {
    root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = this.t(el.dataset.i18n); });
    root.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = this.t(el.dataset.i18nTitle); });
    root.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = this.t(el.dataset.i18nPh); });
    document.documentElement.lang = lang;
  },
  ES_CONTENT,
};

document.documentElement.lang = lang;
export const t = (k, p) => i18n.t(k, p);
