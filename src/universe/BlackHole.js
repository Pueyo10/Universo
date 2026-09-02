import * as THREE from 'three';
import { LY, KM, GALAXY_MATRIX, GAL_EW, fmtNum } from '../core/Units.js';
import { Rng } from '../core/Random.js';
import { nearStarVert, nearStarFrag } from '../shaders/starShader.js';
import { LOGDEPTH_PARS_VERT, LOGDEPTH_VERT, LOGDEPTH_PARS_FRAG, LOGDEPTH_FRAG, HASH } from '../shaders/chunks.js';

// Sagittarius A*: a 4.3-million-solar-mass black hole at the galactic centre.
// Rendered by the screen-space geodesic pass (BlackHolePass) when close, with
// the nuclear star cluster swirling around it and a hot-gas glow.
const RS_KM = 2 * 6.674e-11 * 4.297e6 * 1.9885e30 / (299792458 ** 2) / 1000; // ≈ 1.27e7 km

const clusterVert = /* glsl */`
  attribute float lum; attribute vec3 color; attribute float seed;
  attribute vec3 orbit;   // radius, phase, incl
  varying vec3 vColor; varying float vAlpha, vSize;
  uniform float uExposure, uPixelRatio, uTime, uFade;
  ${LOGDEPTH_PARS_VERT}
  mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, s, 0.0, 1.0, 0.0, -s, 0.0, c); }
  void main() {
    // Keplerian swirl: angular speed ∝ r^-1.5 (time scaled for visibility)
    float r = orbit.x;
    float ang = orbit.y + uTime * 0.02 / pow(max(r, 0.002), 1.5) * 0.0005;
    vec3 p = vec3(cos(ang) * r, 0.0, sin(ang) * r);
    float ci = cos(orbit.z), si = sin(orbit.z);
    p = vec3(p.x, p.z * si, p.z * ci);
    p = rotY(seed * 6.2831) * p;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float dLy = length(mv.xyz) / ${LY.toExponential(6)};
    float flux = lum / max(dLy * dLy, 1e-10) * uExposure;
    float b = pow(flux * 0.002, 0.4);
    float size = clamp(1.0 + b * 3.0, 0.0, 14.0);
    vColor = color; vAlpha = clamp(b * 0.5, 0.0, 0.85) * uFade; vSize = size;
    gl_PointSize = max(size, 1.0) * uPixelRatio;
    if (vAlpha < 0.004) gl_PointSize = 0.0;
    gl_Position = projectionMatrix * mv;
    ${LOGDEPTH_VERT}
  }
`;

export class BlackHole {
  constructor(ctx) {
    this.ctx = ctx; this.engine = ctx.engine; this.registry = ctx.registry;
    this.rs = RS_KM * KM;                    // scene units
    this.pos = ctx.universe.galaxy.centerScene.clone();
    this.axis = GAL_EW.clone().applyAxisAngle(new THREE.Vector3(1, 0, 0), 0.35).normalize();
    this.group = new THREE.Group();
    this.group.position.copy(this.pos);
    this.engine.scene.add(this.group);
    this._buildCluster();
    this._buildGlow();
    this._register();
    this.active = false;
  }

  _buildCluster() {
    const rng = new Rng(4242);
    const n = 2500;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), lum = new Float32Array(n), seed = new Float32Array(n), orbit = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      // radii from 0.003 ly (S-stars) to 3 ly, power-law cusp
      const r = rng.powerLaw(0.003, 3.0, -1.4);
      const t = rng.float();
      const hot = t < 0.3;
      col[i * 3] = hot ? 0.7 : 1.0; col[i * 3 + 1] = hot ? 0.8 : 0.85; col[i * 3 + 2] = hot ? 1.0 : 0.6;
      lum[i] = hot ? 300 + 6000 * rng.float() : 20 + 400 * rng.float();
      seed[i] = rng.float();
      orbit[i * 3] = r; orbit[i * 3 + 1] = rng.float() * Math.PI * 2; orbit[i * 3 + 2] = rng.gauss() * 0.5;
      pos[i * 3] = r; pos[i * 3 + 1] = 0; pos[i * 3 + 2] = 0;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('lum', new THREE.BufferAttribute(lum, 1));
    geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    geo.setAttribute('orbit', new THREE.BufferAttribute(orbit, 3));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 4);
    this.clusterMat = new THREE.ShaderMaterial({
      uniforms: { uExposure: { value: 1 }, uPixelRatio: { value: 1 }, uTime: { value: 0 }, uFade: { value: 1 } },
      vertexShader: clusterVert, fragmentShader: nearStarFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.cluster = new THREE.Points(geo, this.clusterMat);
    this.cluster.scale.setScalar(LY);
    // orient so that the cluster's y-axis is the galactic pole
    this.cluster.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), GAL_EW);
    this.cluster.frustumCulled = false; this.cluster.renderOrder = 12;
    this.group.add(this.cluster);
  }

  _buildGlow() {
    // hot accretion glow sprite (scale with Rs) — bloom picks this up when near
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,220,180,1)'); g.addColorStop(0.2, 'rgba(255,170,110,0.6)'); g.addColorStop(0.6, 'rgba(180,90,60,0.15)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9 });
    this.glow = new THREE.Sprite(mat);
    this.glow.scale.setScalar(this.rs * 60);
    this.glow.renderOrder = 35;
    this.group.add(this.glow);
  }

  _register() {
    const self = this;
    this.obj = this.registry.add({
      id: 'sgr-a', name: 'Sagittarius A*', kind: 'blackhole', kindLabel: 'Supermassive black hole', aliases: ['Sgr A*', 'Sagittarius A', 'Galactic black hole', 'Black hole'],
      color: '#ffb070', radius: this.rs, priority: 9, labelRange: [1.5, 1e13], minViewDistance: this.rs * 6, axis: this.axis, approachElevation: 0.32,
      getPosition(out) { return out.copy(self.pos); },
      data: { type: 'Supermassive black hole', mass: '4.3 million M☉', schwarzschild: `${fmtNum(RS_KM / 1e6, 3)} million km (0.085 AU · 18 R☉)`, distance: '26,700 ly from the Sun', discovered: '1974 (radio source) · imaged 2022 by the EHT', rotation: 'Spinning, near the maximum' },
      description: 'The supermassive black hole at the centre of the Milky Way, 4.3 million times the mass of the Sun packed inside a horizon 25 million kilometres across. Stars of the nuclear cluster whip around it at thousands of kilometres per second; the closest, S2, completes an orbit every 16 years. Its shadow was imaged by the Event Horizon Telescope in 2022. Light passing nearby is bent into rings and mirrored images — fly close to see the lensing.',
      facts: ['Its event horizon would fit inside the orbit of Mercury.', 'Andrea Ghez and Reinhard Genzel won the 2020 Nobel Prize for tracking stars around it.', 'It is surprisingly quiet: it consumes matter at a tiny fraction of its possible rate.'],
    });
  }

  update(dt, t, camPos) {
    const d = camPos.distanceTo(this.pos);
    const cam = this.engine.camera;
    const h = window.innerHeight;
    const fovScale = h / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
    const px = (42 * this.rs) / d * fovScale;
    const pass = this.engine.blackHolePass;
    const shouldEnable = px > 1.5;
    pass.enabled = shouldEnable;      // the whole screen-space pass is skipped when the hole is not on screen
    if (shouldEnable) {
      const qs = this.engine.q.nebulaSteps;
      pass.update(this.pos, this.rs, this.axis, t, qs >= 64 ? 220 : qs >= 44 ? 160 : qs >= 32 ? 110 : 80);
      pass.uniforms.uDiskOuter.value = 14.0; pass.uniforms.uDiskBrightness.value = 1.1;
    } else {
      pass.uniforms.uActive.value = 0;
    }
    this.active = shouldEnable;
    this.glow.visible = !shouldEnable || d > this.rs * 30;
    this.glow.material.opacity = shouldEnable ? 0.0 : 0.9;
    const cu = this.clusterMat.uniforms;
    cu.uTime.value = t; cu.uPixelRatio.value = this.engine.renderer.getPixelRatio();
    cu.uExposure.value = this.ctx.universe.stars ? this.ctx.universe.stars.exposure : 1;
  }
}
