import { bus } from '../core/EventBus.js';
import { AU, LY, clamp, smoothstep, damp } from '../core/Units.js';

// Procedural ambient score (not "sound in space"): a deep drone, filtered
// wind, a slow chord pad through generated reverb, and sparse pentatonic
// pings. Layers cross-fade with context: the Sun, planets, deep space.
export class AudioManager {
  constructor(cameraCtl) {
    this.cameraCtl = cameraCtl;
    this.enabled = false; this.ctx = null; this.built = false;
    this.mix = { drone: 0, wind: 0, pad: 0, pings: 0 };
    this.target = { drone: 0.5, wind: 0.3, pad: 0.6, pings: 0.7 };
    this._pingT = 4;
    bus.on('toggle', (k, v) => { if (k === 'audio') this.setEnabled(v); });
  }

  setEnabled(v) {
    this.enabled = v;
    if (v) { this._ensure(); this.ctx?.resume(); }
    if (this.master) this.master.gain.setTargetAtTime(v ? 0.35 : 0, this.ctx.currentTime, 0.5);
  }

  _ensure() {
    if (this.built) return;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const ctx = this.ctx = new AC();
    this.built = true;
    this.master = ctx.createGain(); this.master.gain.value = 0; this.master.connect(ctx.destination);
    // reverb
    const conv = ctx.createConvolver();
    const len = ctx.sampleRate * 4; const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6) * 0.5; }
    conv.buffer = ir; const revGain = ctx.createGain(); revGain.gain.value = 0.6; conv.connect(revGain); revGain.connect(this.master);
    this.reverb = conv;
    // drone
    this.droneGain = ctx.createGain(); this.droneGain.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 180; lp.Q.value = 0.7;
    for (const [f, type, g] of [[55, 'sawtooth', 0.12], [55.4, 'sawtooth', 0.1], [27.5, 'sine', 0.35], [82.5, 'triangle', 0.05]]) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; const gg = ctx.createGain(); gg.gain.value = g; o.connect(gg); gg.connect(lp); o.start();
    }
    lp.connect(this.droneGain); this.droneGain.connect(this.master); this.droneGain.connect(conv);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.05; const lfoG = ctx.createGain(); lfoG.gain.value = 60; lfo.connect(lfoG); lfoG.connect(lp.frequency); lfo.start();
    this.droneFilter = lp;
    // wind (filtered noise)
    const nb = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate); const nd = nb.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource(); noise.buffer = nb; noise.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 500; bp.Q.value = 0.6;
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0;
    noise.connect(bp); bp.connect(this.windGain); this.windGain.connect(this.master); this.windGain.connect(conv); noise.start();
    const wl = ctx.createOscillator(); wl.frequency.value = 0.07; const wlG = ctx.createGain(); wlG.gain.value = 300; wl.connect(wlG); wlG.connect(bp.frequency); wl.start();
    // pad: A minor-ish chord with slow detune
    this.padGain = ctx.createGain(); this.padGain.gain.value = 0;
    const padLp = ctx.createBiquadFilter(); padLp.type = 'lowpass'; padLp.frequency.value = 900;
    for (const f of [110, 164.8, 220, 261.6, 329.6]) {
      for (const det of [-3, 3]) { const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f; o.detune.value = det; const gg = ctx.createGain(); gg.gain.value = 0.05; o.connect(gg); gg.connect(padLp); o.start(); }
    }
    padLp.connect(this.padGain); this.padGain.connect(conv); this.padGain.connect(this.master);
    const trem = ctx.createOscillator(); trem.frequency.value = 0.11; const tremG = ctx.createGain(); tremG.gain.value = 0.25; trem.connect(tremG); tremG.connect(this.padGain.gain); trem.start();
    this.pingGain = ctx.createGain(); this.pingGain.gain.value = 0; this.pingGain.connect(conv); this.pingGain.connect(this.master);
  }

  _ping() {
    const ctx = this.ctx; if (!ctx) return;
    const notes = [440, 523.25, 587.33, 659.25, 783.99, 880, 1046.5];
    const f = notes[Math.floor(Math.random() * notes.length)] * (Math.random() < 0.3 ? 0.5 : 1);
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
    const g = ctx.createGain(); const t = ctx.currentTime;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.08, t + 0.4); g.gain.exponentialRampToValueAtTime(0.0005, t + 5);
    o.connect(g); g.connect(this.pingGain); o.start(t); o.stop(t + 5.2);
  }

  update(dt) {
    if (!this.enabled || !this.ctx) return;
    const cam = this.cameraCtl;
    const near = cam.nearest;
    const dSun = cam.position.length();
    // context
    const nearSun = near.obj && near.obj.kind === 'sun' && near.dist < near.obj.radius * 30;
    const nearPlanet = near.obj && (near.obj.kind === 'planet' || near.obj.kind === 'moon') && near.dist < near.obj.radius * 40;
    const deep = dSun > 5 * LY;
    const warp = cam.warp;
    this.target.drone = nearSun ? 0.9 : deep ? 0.35 : 0.5;
    this.target.wind = nearSun ? 0.6 : nearPlanet ? 0.35 : 0.15 + warp * 0.8;
    this.target.pad = nearPlanet ? 0.8 : deep ? 0.55 : 0.45;
    this.target.pings = deep ? 0.9 : nearPlanet ? 0.5 : 0.6;
    for (const k of Object.keys(this.mix)) this.mix[k] = damp(this.mix[k], this.target[k], 0.8, dt);
    const t = this.ctx.currentTime;
    this.droneGain.gain.setTargetAtTime(this.mix.drone * 0.5, t, 0.3);
    this.windGain.gain.setTargetAtTime(this.mix.wind * 0.12, t, 0.3);
    this.padGain.gain.setTargetAtTime(this.mix.pad * 0.5, t, 0.3);
    this.pingGain.gain.setTargetAtTime(this.mix.pings * 0.8, t, 0.3);
    this.droneFilter.frequency.setTargetAtTime(nearSun ? 320 : 180, t, 1.0);
    this._pingT -= dt;
    if (this._pingT <= 0) { this._ping(); this._pingT = 5 + Math.random() * 10; }
  }
}
