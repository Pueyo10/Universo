import { bus } from '../core/EventBus.js';
import { AU, LY, clamp, smoothstep, damp } from '../core/Units.js';

// Procedural ambient score (not "sound in space"): a deep drone, filtered
// wind, a slow chord pad through generated reverb, and sparse pentatonic
// pings. Layers cross-fade with context: the Sun, planets, deep space.
export class AudioManager {
  constructor(cameraCtl, universe = null) {
    this.cameraCtl = cameraCtl; this.universe = universe;
    this.enabled = false; this.ctx = null; this.built = false;
    this.mix = { drone: 0, wind: 0, pad: 0, pings: 0, shimmer: 0, sub: 0 };
    this.target = { drone: 0.5, wind: 0.3, pad: 0.6, pings: 0.7, shimmer: 0, sub: 0 };
    this._pingT = 4;
    this.immersive = false;
    this.masterLevel = 0.35;
    bus.on('toggle', (k, v) => { if (k === 'audio') this.setEnabled(v); });
    bus.on('immersive', v => { this.immersive = v; if (this.master && this.enabled) this.master.gain.setTargetAtTime(v ? 0.5 : this.masterLevel, this.ctx.currentTime, 1.5); });
    // sonification: a pulsar's beam sweeping past us -> a short radio "click" at its real spin period (clearly synthetic)
    bus.on('pulsar:pulse', o => this.pulse(o));
    // star formation: the score follows the stage; ignition gets a synthetic swell
    this.sb = { active: false, phase: 0 };
    bus.on('starbirth:begin', () => { this.sb.active = true; });
    bus.on('starbirth:end', () => { this.sb.active = false; });
    bus.on('starbirth:phase', p => { this.sb.phase = p; });
    bus.on('starbirth:ignite', () => this.ignition());
  }

  setEnabled(v) {
    this.enabled = v;
    if (v) { this._ensure(); this.ctx?.resume(); }
    if (this.master) this.master.gain.setTargetAtTime(v ? (this.immersive ? 0.5 : this.masterLevel) : 0, this.ctx.currentTime, 0.5);
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
    // shimmer: high airy partials for nebulae (filtered noise + slow chorus)
    const sb = ctx.createBufferSource(); sb.buffer = nb; sb.loop = true;
    const hp = ctx.createBiquadFilter(); hp.type = 'bandpass'; hp.frequency.value = 2400; hp.Q.value = 1.2;
    this.shimmerGain = ctx.createGain(); this.shimmerGain.gain.value = 0;
    sb.connect(hp); hp.connect(this.shimmerGain); this.shimmerGain.connect(conv); this.shimmerGain.connect(this.master); sb.start();
    const sl = ctx.createOscillator(); sl.frequency.value = 0.09; const slG = ctx.createGain(); slG.gain.value = 900; sl.connect(slG); slG.connect(hp.frequency); sl.start();
    // sub: very low pulsing tone for black holes
    this.subGain = ctx.createGain(); this.subGain.gain.value = 0;
    const sub = ctx.createOscillator(); sub.type = 'sine'; sub.frequency.value = 31; sub.connect(this.subGain); sub.start();
    const subL = ctx.createOscillator(); subL.frequency.value = 0.17; const subLG = ctx.createGain(); subLG.gain.value = 0.5; subL.connect(subLG); subLG.connect(this.subGain.gain); subL.start();
    this.subGain.connect(this.master);
  }

  /** Synthetic pulsar click (data-inspired sonification, not a recording). */
  pulse(o) {
    if (!this.enabled || !this.ctx || !this.built) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o1 = ctx.createOscillator(); o1.type = 'square'; o1.frequency.value = 180 + Math.min((o.spinHz || 1) * 3, 400);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1800;
    o1.connect(f); f.connect(g); g.connect(this.master); o1.start(t); o1.stop(t + 0.1);
  }

  /** Ignition swell: a rising sine and a filtered noise burst through the reverb (synthetic, not a recording). */
  ignition() {
    if (!this.enabled || !this.ctx || !this.built) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(40, t); o.frequency.exponentialRampToValueAtTime(220, t + 2.5);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 1.2); g.gain.exponentialRampToValueAtTime(0.0001, t + 6);
    o.connect(g); g.connect(this.master); g.connect(this.reverb); o.start(t); o.stop(t + 6.2);
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
    const n = ctx.createBufferSource(); n.buffer = nb; const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(4000, t + 1.0); f.frequency.exponentialRampToValueAtTime(300, t + 2.0);
    const ng = ctx.createGain(); ng.gain.setValueAtTime(0.0001, t); ng.gain.exponentialRampToValueAtTime(0.25, t + 0.8); ng.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
    n.connect(f); f.connect(ng); ng.connect(this.master); ng.connect(this.reverb); n.start(t); n.stop(t + 2.5);
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
    // contexts: inside a nebula, near the black hole, near Earth (warmer), deep intergalactic space (near silence)
    const u = this.universe;
    const inNebula = !!(u && u.nebulae && u.nebulae.items.some(it => it.pos.distanceTo(cam.position) < it.R * 1.1));
    const nearBH = !!(u && u.blackHole && cam.position.distanceTo(u.blackHole.pos) < u.blackHole.rs * 400);
    const nearEarth = near.obj && near.obj.id === 'earth' && near.dist < near.obj.radius * 20;
    const intergalactic = u && u.galaxy ? cam.position.distanceTo(u.galaxy.centerScene) > 150000 * LY : false;
    const quiet = intergalactic ? 0.35 : 1;                               // vast emptiness: let silence speak
    this.target.drone = (nearSun ? 0.9 : nearBH ? 0.7 : deep ? 0.3 : 0.5) * quiet;
    this.target.wind = (nearSun ? 0.6 : nearPlanet ? 0.35 : inNebula ? 0.45 : 0.15 + warp * 0.8) * quiet;
    this.target.pad = (nearEarth ? 0.95 : nearPlanet ? 0.8 : inNebula ? 0.7 : deep ? 0.5 : 0.45) * quiet;
    this.target.pings = (nearBH ? 0.2 : deep ? 0.9 : nearPlanet ? 0.5 : 0.6) * quiet;
    this.target.shimmer = inNebula ? 1 : 0;
    this.target.sub = nearBH ? 1 : 0;
    const sbSim = u && u.starBirth;
    if (sbSim && this.sb.active && cam.position.distanceTo(sbSim.site) < sbSim.Sc * 25) {
      const p = this.sb.phase;
      this.target.drone = p <= 1 ? 0.75 : p === 5 ? 0.9 : 0.55; this.target.wind = p === 1 ? 0.5 : p === 4 ? 0.7 : 0.25; this.target.pad = p >= 6 ? 0.95 : 0.6;
      this.target.pings = p >= 3 ? 0.5 : 0.3; this.target.shimmer = p === 3 || p === 4 ? 0.8 : 0.3; this.target.sub = p === 5 ? 0.9 : p === 1 ? 0.4 : 0;
    }
    for (const k of Object.keys(this.mix)) this.mix[k] = damp(this.mix[k], this.target[k], 0.8, dt);
    const t = this.ctx.currentTime;
    this.droneGain.gain.setTargetAtTime(this.mix.drone * 0.5, t, 0.3);
    this.windGain.gain.setTargetAtTime(this.mix.wind * 0.12, t, 0.3);
    this.padGain.gain.setTargetAtTime(this.mix.pad * 0.5, t, 0.3);
    this.pingGain.gain.setTargetAtTime(this.mix.pings * 0.8, t, 0.3);
    this.shimmerGain.gain.setTargetAtTime(this.mix.shimmer * 0.06, t, 0.6);
    this.subGain.gain.setTargetAtTime(this.mix.sub * 0.35, t, 0.6);
    this.droneFilter.frequency.setTargetAtTime(nearSun ? 320 : nearBH ? 90 : 180, t, 1.0);
    // pad brightness: warmer near Earth, colder in deep space
    this._pingT -= dt;
    if (this._pingT <= 0) { this._ping(); this._pingT = (inNebula ? 3 : 5) + Math.random() * (intergalactic ? 25 : 10); }
  }
}
