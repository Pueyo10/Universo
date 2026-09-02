import * as THREE from 'three';
import { CAM_MODE } from '../camera/CameraController.js';
import { LY, GALAXY_MATRIX, smoothstep, lerp } from '../core/Units.js';
import { bus } from '../core/EventBus.js';
import { t } from '../i18n/index.js';

// Opening: black → faint stars → the Milky Way resolves from outside while
// the camera dollies in → title → free control. ~9 s, skippable.
export class IntroSequence {
  constructor({ engine, universe, cameraCtl, ui, introEl }) {
    this.engine = engine; this.universe = universe; this.cameraCtl = cameraCtl; this.ui = ui; this.el = introEl;
    this.t = 0; this.done = false; this.playing = false;
    this.title = introEl.querySelector('.intro-title');
    this.hint = document.getElementById('intro-hint');
    this.loading = document.getElementById('intro-loading');
    this.duration = 11;
    this._skip = () => this.finish(true);
  }

  play() {
    this.playing = true;
    this.loading.classList.add('hide');
    this.el.classList.add('transparent');
    // scene fade state
    this.universe.sky.material.uniforms.uIntensity.value = 0;
    this.universe.galaxy.fade = 0;
    this.engine.finalPass.uniforms.uFade.value = 0;
    const gc = this.universe.galaxy.centerScene;
    const dir = new THREE.Vector3(0.62, 0.55, 0.56).applyMatrix4(GALAXY_MATRIX).normalize();
    this.gc = gc; this.dir = dir;
    this.cameraCtl.mode = CAM_MODE.CINEMATIC;
    this.cameraCtl.inputEnabled = false;
    document.getElementById('labels').style.opacity = 0;
    this.sys = { update: (dt) => this.update(dt) };
    this.engine.addSystem(this.sys);
    setTimeout(() => { this.el.addEventListener('click', this._skip); window.addEventListener('keydown', this._skip); this.hint.classList.add('show'); }, 1500);
  }

  skipImmediately() {
    this.universe.sky.material.uniforms.uIntensity.value = 1;
    this.universe.galaxy.fade = 1;
    this.engine.finalPass.uniforms.uFade.value = 1;
    this.el.classList.add('fade');
    setTimeout(() => this.el.remove(), 100);
    if (!this.cameraCtl.travel) { this.cameraCtl.mode = CAM_MODE.FREE; this.cameraCtl._syncYawPitchFromQuat(); }
    this.cameraCtl.inputEnabled = true;
    this.ui.showUI();
    this.done = true;
    bus.emit('intro:done');
  }

  update(dt) {
    if (this.done) return;
    this.t += dt;
    const t = this.t;
    // fades
    this.engine.finalPass.uniforms.uFade.value = smoothstep(0, 1.5, t);
    this.universe.sky.material.uniforms.uIntensity.value = smoothstep(0.5, 3.5, t);
    this.universe.galaxy.fade = smoothstep(2.0, 6.5, t);
    // camera dolly from 190k ly to 120k ly with a slow lateral drift
    const u = smoothstep(0, this.duration, t);
    const d = lerp(190000, 118000, u) * LY;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), lerp(-0.12, 0.08, u));
    const dir = this.dir.clone().applyQuaternion(q);
    const pos = this.gc.clone().addScaledVector(dir, d);
    this.cameraCtl.position.copy(pos);
    this.cameraCtl.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(pos, this.gc, this.cameraCtl.up));
    this.cameraCtl.fovMul = 1;
    // title
    if (t > 3.2 && !this._titleShown) { this._titleShown = true; this.title.classList.add('show'); }
    if (t > 8.2 && this._titleShown && !this._titleHidden) { this._titleHidden = true; this.title.classList.remove('show'); }
    if (t > this.duration) this.finish(false);
  }

  finish(skipped) {
    if (this.done) return;
    this.done = true;
    this.el.removeEventListener('click', this._skip); window.removeEventListener('keydown', this._skip);
    this.universe.sky.material.uniforms.uIntensity.value = 1;
    this.universe.galaxy.fade = 1;
    this.engine.finalPass.uniforms.uFade.value = 1;
    this.el.classList.add('fade');
    setTimeout(() => this.el.remove(), 1700);
    const i = this.engine.systems.indexOf(this.sys); if (i >= 0) this.engine.systems.splice(i, 1);
    if (!this.cameraCtl.travel) { this.cameraCtl.mode = CAM_MODE.FREE; this.cameraCtl._syncYawPitchFromQuat(); }
    this.cameraCtl.inputEnabled = true;
    document.getElementById('labels').style.opacity = 1;
    this.ui.showUI();
    this.ui.toast(t('tIntro'), 4000);
    bus.emit('intro:done');
  }
}
