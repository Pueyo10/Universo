export class EventBus {
  constructor() { this._l = new Map(); }
  on(type, fn) {
    if (!this._l.has(type)) this._l.set(type, new Set());
    this._l.get(type).add(fn);
    return () => this.off(type, fn);
  }
  once(type, fn) {
    const off = this.on(type, (...a) => { off(); fn(...a); });
    return off;
  }
  off(type, fn) { this._l.get(type)?.delete(fn); }
  emit(type, ...args) {
    const s = this._l.get(type);
    if (!s) return;
    for (const fn of [...s]) { try { fn(...args); } catch (e) { console.error(`[event ${type}]`, e); } }
  }
}

export const bus = new EventBus();
