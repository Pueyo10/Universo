import * as THREE from 'three';
import { LY, AU, GALAXY_MATRIX, SUN_GAL_POS, smoothstep, clamp } from '../core/Units.js';
import { bus } from '../core/EventBus.js';

// Reference grids: a galactic polar grid (light-years) in the galactic plane
// and an ecliptic grid (AU) around the Sun. Each fades in at its own scale.
function circle(r, segs, y = 0) {
  const a = [];
  for (let i = 0; i < segs; i++) {
    const t0 = (i / segs) * Math.PI * 2, t1 = ((i + 1) / segs) * Math.PI * 2;
    a.push(Math.cos(t0) * r, y, Math.sin(t0) * r, Math.cos(t1) * r, y, Math.sin(t1) * r);
  }
  return a;
}

export class GridLayer {
  constructor(ctx) {
    this.ctx = ctx; this.engine = ctx.engine;
    this.enabled = false;
    // --- galactic grid (model frame: u,v in plane, w up → in group we map (x, z) plane with y up, then rotate) ---
    const g = [];
    for (let r = 10000; r <= 60000; r += 10000) g.push(...circle(r, 180));
    for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2; g.push(0, 0, 0, Math.cos(a) * 65000, 0, Math.sin(a) * 65000); }
    const ggeo = new THREE.BufferGeometry(); ggeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(g), 3));
    ggeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 70000);
    this.galMat = new THREE.LineBasicMaterial({ color: 0x6f8fc8, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    this.galGrid = new THREE.LineSegments(ggeo, this.galMat);
    // group: circle built in XZ plane with Y up; galaxy model has w (north) as third axis → basis (e_u, e_v, e_w) maps model (x,y,z) → need plane XZ → model (u,v): x→u, z→v, y→w
    const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0)); // swap y/z
    const center = new THREE.Vector3(-SUN_GAL_POS.x, -SUN_GAL_POS.y, -SUN_GAL_POS.z).applyMatrix4(GALAXY_MATRIX).multiplyScalar(LY);
    this.galGrid.matrixAutoUpdate = false;
    this.galGrid.matrix.copy(GALAXY_MATRIX).multiply(new THREE.Matrix4().makeBasis(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0))).scale(new THREE.Vector3(LY, LY, LY)).setPosition(center);
    this.galGrid.frustumCulled = false; this.galGrid.visible = false; this.galGrid.renderOrder = 8;
    this.engine.scene.add(this.galGrid);
    // --- ecliptic grid ---
    const e = [];
    for (const r of [0.5, 1, 2, 5, 10, 20, 30, 50, 100]) e.push(...circle(r, 256));
    for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; e.push(0, 0, 0, Math.cos(a) * 110, 0, Math.sin(a) * 110); }
    const egeo = new THREE.BufferGeometry(); egeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(e), 3));
    egeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 120);
    this.eclMat = new THREE.LineBasicMaterial({ color: 0x6f8fc8, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    this.eclGrid = new THREE.LineSegments(egeo, this.eclMat);
    this.eclGrid.scale.setScalar(AU);
    this.eclGrid.frustumCulled = false; this.eclGrid.visible = false; this.eclGrid.renderOrder = 8;
    this.engine.scene.add(this.eclGrid);
    bus.on('toggle', (k, v) => { if (k === 'grid') this.enabled = v; });
  }
  update(dt, t, camPos) {
    const d = camPos.length();
    const galT = this.enabled ? smoothstep(300 * LY, 3000 * LY, d) * 0.35 : 0;
    const eclT = this.enabled ? (1 - smoothstep(300 * AU, 3000 * AU, d)) * smoothstep(0.02 * AU, 0.2 * AU, d) * 0.3 : 0;
    this.galMat.opacity += (galT - this.galMat.opacity) * Math.min(1, dt * 4);
    this.eclMat.opacity += (eclT - this.eclMat.opacity) * Math.min(1, dt * 4);
    this.galGrid.visible = this.galMat.opacity > 0.004;
    this.eclGrid.visible = this.eclMat.opacity > 0.004;
  }
}
