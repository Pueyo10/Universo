import { bus } from '../core/EventBus.js';
import { i18n, t } from '../i18n/index.js';
import { freshFact } from '../data/Facts.js';

// Exploration feedback: the first time the camera arrives at (or gets close to)
// an important object a DISCOVERED card appears; while lingering near known
// objects, an occasional, discreet "did you know" fact is shown. Discoveries
// persist in localStorage. Both are optional (Settings).
const KEY = 'mw.discovered';
const IMPORTANT = new Set(['sun', 'planet', 'dwarf', 'moon', 'asteroid', 'comet', 'spacecraft', 'nebula', 'blackhole', 'galaxy', 'star']);

export class DiscoverySystem {
  constructor(ctx, ui) {
    this.ctx = ctx; this.ui = ui; this.cam = ctx.cameraCtl; this.registry = ctx.registry;
    this.enabled = true; this.factsEnabled = true;
    try { this.found = new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch (_) { this.found = new Set(); }
    this.count = this.found.size;
    this._lastFact = 0; this._near = null; this._nearSince = 0;
    this.el = document.getElementById('discovery');
    this.factEl = document.getElementById('didyouknow');
    bus.on('camera:arrive', o => this.check(o, true));
    bus.on('toggle', (k, v) => { if (k === 'discovery') { this.enabled = v; this.factsEnabled = v; } });
  }

  check(o, arrived = false) {
    if (!this.enabled || !o || !IMPORTANT.has(o.kind) || o.procedural) return;
    if (this.found.has(o.id)) return;
    this.found.add(o.id); this.count = this.found.size;
    try { localStorage.setItem(KEY, JSON.stringify([...this.found])); } catch (_) { }
    this.show(o);
  }

  show(o) {
    const el = this.el; if (!el) return;
    const sub = i18n.text(o, 'subtitle') || i18n.kindLabel(o);
    const fact = freshFact(o, i18n.lang);
    el.innerHTML = `<div class="dc-tag">${t('discovered')} · ${this.count}</div><div class="dc-name">${esc(i18n.name(o))}</div><div class="dc-sub">${esc(sub)}</div>${fact ? `<div class="dc-fact">${esc(fact.text)}</div>` : ''}`;
    el.classList.add('show');
    clearTimeout(this._t); this._t = setTimeout(() => el.classList.remove('show'), fact ? 9000 : 6000);
    bus.emit('discovery', o);
  }

  update(dt, time) {
    if (!this.factsEnabled || this.ui.state.uiHidden) return;
    // contextual fact: after lingering ≥ 12 s near a body (within 30 radii), at most one per 90 s
    const n = this.cam.nearest.obj;
    if (n && IMPORTANT.has(n.kind) && this.cam.nearest.dist < (n.radius || 0) * 30) {
      if (n !== this._near) { this._near = n; this._nearSince = time; }
      else if (time - this._nearSince > 12 && time - this._lastFact > 90 && !this.el.classList.contains('show')) {
        const f = freshFact(n, i18n.lang);
        if (f) { this._lastFact = time; this.showFact(f, n); } else this._lastFact = time - 60;   // retry later
      }
    } else this._near = null;
  }

  showFact(f, o) {
    const el = this.factEl; if (!el) return;
    el.innerHTML = `<div class="dk-tag">${t('didYouKnow')} <span class="dk-cat">${t('cat_' + f.cat)}</span></div><div class="dk-text">${esc(f.text)}</div>`;
    el.classList.add('show');
    clearTimeout(this._ft); this._ft = setTimeout(() => el.classList.remove('show'), 9000);
  }
}
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
