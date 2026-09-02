import * as THREE from 'three';
import { LY, GALAXY_MATRIX_INV, SUN_GAL_POS, sceneToGal } from '../core/Units.js';
import { GALAXY, armTheta } from '../universe/GalaxyModel.js';
import { i18n } from '../i18n/index.js';

// STAR MAP: a top-down galactic chart (canvas) for orientation — spiral arms,
// bulge, the Sun, the galactic centre, your position and heading, the selected
// object and the nearest named stars. Scale adapts from the solar neighbourhood
// to the whole galaxy.
export class StarMap {
  constructor(ui) {
    this.ui = ui; this.cam = ui.cameraCtl; this.registry = ui.registry;
    this.canvas = document.getElementById('starmap');
    this.ctx = this.canvas.getContext('2d');
    this.enabled = false;
    this._v = new THREE.Vector3(); this._g = new THREE.Vector3();
    this.canvas.addEventListener('click', () => this.zoomToggle());
    this.zoomMode = 0;   // 0 auto, 1 galaxy, 2 local
    document.getElementById('tog-map').addEventListener('click', () => { this.enabled = !this.enabled; this.canvas.hidden = !this.enabled; document.getElementById('tog-map').dataset.on = String(this.enabled); });
  }
  zoomToggle() { this.zoomMode = (this.zoomMode + 1) % 3; }

  update() {
    if (!this.enabled || this.ui.state.uiHidden) return;
    const c = this.ctx, W = this.canvas.width, H = this.canvas.height;
    const camGal = sceneToGal(this.cam.position, this._g);      // ly, galaxy frame (u toward Sun, w = north)
    const rCam = Math.hypot(camGal.x, camGal.y);
    // choose scale: whole galaxy (65 kly) or local (2 kly) around the camera
    const dSun = this.cam.position.length() / LY;
    const local = this.zoomMode === 2 || (this.zoomMode === 0 && dSun < 1500);
    const span = local ? 3000 : 140000;                             // ly across the map
    const cx = local ? camGal.x : 0, cy = local ? camGal.y : 0;
    const s = W / span;
    const X = (u) => W / 2 + (u - cx) * s, Y = (v) => H / 2 - (v - cy) * s;
    c.clearRect(0, 0, W, H);
    c.fillStyle = 'rgba(4,6,12,0.82)'; c.fillRect(0, 0, W, H);
    // disc + bulge
    c.save(); c.beginPath(); c.arc(X(0), Y(0), GALAXY.discMax * s, 0, Math.PI * 2); c.fillStyle = 'rgba(120,140,200,0.06)'; c.fill();
    c.beginPath(); c.arc(X(0), Y(0), GALAXY.bulgeR * s, 0, Math.PI * 2); c.fillStyle = 'rgba(255,220,170,0.18)'; c.fill();
    // bar
    c.translate(X(0), Y(0)); c.rotate(-GALAXY.bar.angle); c.fillStyle = 'rgba(255,220,170,0.12)'; c.beginPath(); c.ellipse(0, 0, GALAXY.bar.len * 0.6 * s, GALAXY.bar.w * 0.5 * s, 0, 0, Math.PI * 2); c.fill(); c.restore();
    // arms
    c.lineWidth = Math.max(1, 1400 * s); c.strokeStyle = 'rgba(160,190,255,0.35)';
    for (const a of GALAXY.arms) {
      c.beginPath();
      for (let r = a.rMin; r <= a.rMax; r += 400) { const th = armTheta(a, r); const x = X(r * Math.cos(th)), y = Y(r * Math.sin(th)); if (r === a.rMin) c.moveTo(x, y); else c.lineTo(x, y); }
      c.stroke();
    }
    // grid rings (kly)
    c.lineWidth = 1; c.strokeStyle = 'rgba(255,255,255,0.06)';
    const step = local ? 500 : 10000;
    for (let r = step; r <= (local ? 1500 : 60000); r += step) { c.beginPath(); c.arc(X(local ? camGal.x : 0), Y(local ? camGal.y : 0), r * s, 0, Math.PI * 2); c.stroke(); }
    // named stars nearby (local mode)
    if (local) {
      c.fillStyle = 'rgba(255,240,220,0.7)'; c.font = '9px Inter, sans-serif';
      for (const o of this.registry.objects) {
        if (o.kind !== 'star' || o.procedural || !o.scenePos || (o.mag != null && o.mag > 1.6)) continue;
        const g = sceneToGal(o.scenePos, this._v);
        if (Math.abs(g.x - cx) > span / 2 || Math.abs(g.y - cy) > span / 2) continue;
        c.beginPath(); c.arc(X(g.x), Y(g.y), 1.5, 0, Math.PI * 2); c.fill();
        c.fillText(i18n.name(o), X(g.x) + 4, Y(g.y) + 3);
      }
    }
    // galactic centre & Sun
    const dot = (x, y, r, col) => { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fillStyle = col; c.fill(); };
    dot(X(0), Y(0), 3, '#ffd080');
    dot(X(SUN_GAL_POS.x), Y(SUN_GAL_POS.y), 2.5, '#fff1c0');
    c.fillStyle = 'rgba(255,255,255,0.7)'; c.font = '9px Inter, sans-serif';
    c.fillText(i18n.lang === 'es' ? 'Sol' : 'Sun', X(SUN_GAL_POS.x) + 5, Y(SUN_GAL_POS.y) - 4);
    c.fillText('Sgr A*', X(0) + 5, Y(0) - 4);
    // selected object
    const sel = this.ui.selected;
    if (sel && sel.getPosition) { const g = sceneToGal(sel.getPosition(this._v), this._v); c.strokeStyle = '#8fbcff'; c.lineWidth = 1.2; c.beginPath(); c.arc(X(g.x), Y(g.y), 5, 0, Math.PI * 2); c.stroke(); }
    // camera: position + heading (projected)
    const fwd = this.cam.getForward(this._v); const fg = this._v.clone().applyMatrix4(GALAXY_MATRIX_INV);
    const px = X(camGal.x), py = Y(camGal.y);
    c.strokeStyle = '#7fffd0'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(px, py); c.lineTo(px + fg.x * 14, py - fg.y * 14); c.stroke();
    dot(px, py, 3, '#7fffd0');
    // legend
    c.fillStyle = 'rgba(255,255,255,0.5)'; c.font = '9px JetBrains Mono, monospace';
    c.fillText(local ? `${(span / 1000).toFixed(0)} kly` : `${(span / 1000).toFixed(0)} kly`, 8, H - 8);
    c.fillText(`h ${(Math.abs(camGal.z)).toFixed(0)} ly ${camGal.z >= 0 ? 'N' : 'S'}`, W - 82, H - 8);
  }
}
