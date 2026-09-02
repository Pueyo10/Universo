import * as THREE from 'three';
import { LY, GALAXY_MATRIX, SUN_GAL_POS, GC_DISTANCE_LY, sceneToGal, GAL_EW } from '../core/Units.js';
import { Rng } from '../core/Random.js';
import { sampleGalaxyStars, sampleArmSprites, GALAXY } from './GalaxyModel.js';
import { LOGDEPTH_PARS_VERT, LOGDEPTH_VERT, LOGDEPTH_PARS_FRAG, LOGDEPTH_FRAG, HASH, BAND_UTILS } from '../shaders/chunks.js';

// The galaxy-wide representation of the Milky Way: hundreds of thousands of
// luminosity-weighted star points, diffuse unresolved starlight billboards,
// multiplicative dust lanes, HII regions / young clusters, the bulge and the
// galactic core. Everything lives in a group whose origin is the galactic
// centre with model units = light-years (float32-safe), placed in the scene
// via a float64 matrix.

const starVert = /* glsl */`
  attribute float lum;
  attribute vec3 color;
  varying vec3 vColor;
  varying float vAlpha;
  uniform float uExposure, uPixelRatio, uMaxSize, uFade, uTime, uBand;
  ${LOGDEPTH_PARS_VERT}
  ${BAND_UTILS}
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float dLy = length(mv.xyz) / ${LY.toExponential(6)};   // distance in ly
    float flux = lum / max(dLy * dLy, 1e-6) * bandStarWeight(color, uBand);   // L☉ / ly²
    // reference: an L=1000 star seen from 150 kly renders at ~0.55 alpha
    float b = pow(flux * uExposure / 2.2e-6, 0.55);
    float alpha = clamp(b, 0.0, 0.55);
    float size = 1.0 + 1.4 * clamp(b, 0.0, 1.2);
    size = min(size, uMaxSize);
    // tiny sub-pixel twinkle for the brightest only
    alpha *= 0.94 + 0.06 * sin(uTime * 3.0 + position.x * 0.37 + position.y * 0.11);
    vColor = bandStarTint(color, uBand);
    vAlpha = alpha * uFade;
    gl_PointSize = size * uPixelRatio;
    if (alpha < 0.01) gl_PointSize = 0.0;
    gl_Position = projectionMatrix * mv;
    ${LOGDEPTH_VERT}
  }
`;
const starFrag = /* glsl */`
  precision highp float;
  varying vec3 vColor;
  varying float vAlpha;
  uniform sampler2D uSprite;
  ${LOGDEPTH_PARS_FRAG}
  void main() {
    ${LOGDEPTH_FRAG}
    vec2 c = gl_PointCoord - 0.5;
    float d2 = dot(c, c) * 4.0;
    float core = exp(-d2 * 5.0);
    float halo = exp(-d2 * 1.6) * 0.35;
    float a = (core + halo) * vAlpha;
    if (a < 0.003) discard;
    gl_FragColor = vec4(vColor * a * 1.15 + vec3(a * 0.12), a);
  }
`;

// Instanced billboard sprite shader (used for gas, dust, HII)
const spriteVert = /* glsl */`
  attribute vec3 iPos;
  attribute float iSize;
  attribute vec3 iColor;
  attribute float iAlpha;
  attribute float iRot;
  attribute float iSeed;
  uniform vec3 uCamRight, uCamUp, uCamPosModel;
  uniform float uFade, uNearFade, uInside, uBand, uKind;   // uKind: 0 glow · 1 dust · 2 HII
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vAlpha, vSeed;
  ${LOGDEPTH_PARS_VERT}
  void main() {
    float c = cos(iRot), s = sin(iRot);
    vec2 q = vec2(position.x * c - position.y * s, position.x * s + position.y * c);
    vec3 p = iPos + (uCamRight * q.x + uCamUp * q.y) * iSize;
    float dist = length(iPos - uCamPosModel);
    // fade sprites that are too close to the camera (local detail takes over)
    float nf = smoothstep(iSize * 0.6, iSize * 2.5, dist);
    vUv = position.xy;
    vColor = iColor;
    vAlpha = iAlpha * uFade * mix(1.0, nf, uNearFade) * uInside;
    // multiwavelength: glow dims in UV/X-ray/radio; HII bright in UV & radio, gone in X-ray; dust handled in its fragment
    if (uBand > 0.5 && uKind < 0.5) vAlpha *= uBand < 1.5 ? 0.9 : uBand < 2.5 ? 0.25 : uBand < 3.5 ? 0.04 : 0.6;
    if (uBand > 0.5 && uKind > 1.5) vAlpha *= uBand < 1.5 ? 0.6 : uBand < 2.5 ? 1.8 : uBand < 3.5 ? 0.1 : 2.2;
    if (uBand > 0.5 && uKind > 0.5 && uKind < 1.5) vAlpha *= uBand < 1.5 ? 1.2 : uBand < 2.5 ? 1.3 : uBand < 3.5 ? 0.0 : 0.9;
    vSeed = iSeed;
    // sprites faded to (near) nothing are collapsed off-screen so they cost no fill at all
    if (vAlpha < 0.004) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    ${LOGDEPTH_VERT}
  }
`;
const glowFrag = /* glsl */`
  precision highp float;
  varying vec2 vUv; varying vec3 vColor; varying float vAlpha, vSeed;
  uniform float uSoft, uBand;
  ${HASH}
  ${LOGDEPTH_PARS_FRAG}
  void main() {
    ${LOGDEPTH_FRAG}
    float r2 = dot(vUv, vUv) * 4.0;
    if (r2 > 1.0) discard;
    // soft blob with a bit of internal structure
    float ang = atan(vUv.y, vUv.x);
    float lobes = 0.85 + 0.15 * sin(ang * 3.0 + vSeed * 20.0) * sin(ang * 5.0 - vSeed * 7.0);
    float f = exp(-r2 * (2.2 + uSoft)) * lobes * (1.0 - r2);
    float a = f * vAlpha;
    if (a < 0.002) discard;
    vec3 col = vColor;
    if (uBand > 0.5) col = uBand < 1.5 ? mix(col, vec3(1.0, 0.5, 0.25), 0.7) : uBand < 2.5 ? mix(col, vec3(0.5, 0.6, 1.0), 0.8) : uBand < 3.5 ? mix(col, vec3(0.7, 0.55, 1.0), 0.8) : mix(col, vec3(0.5, 1.0, 0.65), 0.8);
    gl_FragColor = vec4(col * a, a);
  }
`;
const dustFrag = /* glsl */`
  precision highp float;
  varying vec2 vUv; varying vec3 vColor; varying float vAlpha, vSeed;
  uniform float uBand;
  ${HASH}
  ${LOGDEPTH_PARS_FRAG}
  void main() {
    ${LOGDEPTH_FRAG}
    float r2 = dot(vUv, vUv) * 4.0;
    if (r2 > 1.0) discard;
    float ang = atan(vUv.y, vUv.x);
    float lobes = 0.8 + 0.2 * sin(ang * 4.0 + vSeed * 30.0) * cos(ang * 2.0 + vSeed * 11.0);
    float f = exp(-r2 * 2.6) * lobes * (1.0 - r2);
    float a = clamp(f * vAlpha, 0.0, 1.0);
    if (a < 0.003) discard;   // multiplying by ~1 changes nothing: skip the blend
    if (uBand > 0.5 && (uBand < 1.5 || uBand > 3.5)) {
      // infrared / radio: cold dust EMITS (thermal glow / synchrotron & molecular lines) — additive blending
      vec3 em = uBand < 1.5 ? vec3(1.0, 0.45, 0.18) : vec3(0.35, 0.9, 0.55);
      gl_FragColor = vec4(em * a * 0.8, a);
      return;
    }
    // multiply blending: output mix(1, tint, a)
    gl_FragColor = vec4(mix(vec3(1.0), vColor, a), 1.0);
  }
`;

function makeSpriteGeometry(count) {
  const geo = new THREE.InstancedBufferGeometry();
  const quad = new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]);
  geo.setAttribute('position', new THREE.BufferAttribute(quad, 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  geo.instanceCount = count;
  return geo;
}

function makeSoftSprite(size = 64) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; return t;
}

export class GalaxyManager {
  constructor(engine, registry, quality) {
    this.engine = engine;
    this.registry = registry;
    this.group = new THREE.Group();
    this.group.name = 'MilkyWay';
    // origin at the galactic centre, units = ly
    this.group.matrixAutoUpdate = false;
    this._camModel = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._right = new THREE.Vector3(); this._up = new THREE.Vector3();
    this.fade = 1.0;
    this.exposure = 1.0;
    this.materials = [];
    this.spriteMaterials = [];
    this.starCount = quality.galaxyStars;
    this._buildStars(quality);
    this._buildSprites(quality);
    this._buildCore();
    engine.scene.add(this.group);
    this.updateMatrix();
    this._registerObjects();
  }

  /** Place group: scene position of the galactic centre relative to the Sun (scene origin). */
  updateMatrix() {
    const m = this.group.matrix;
    const rot = GALAXY_MATRIX.clone();
    // centre relative to Sun: model (0,0,0) - sun
    const c = new THREE.Vector3(-SUN_GAL_POS.x, -SUN_GAL_POS.y, -SUN_GAL_POS.z).applyMatrix4(GALAXY_MATRIX).multiplyScalar(LY);
    m.copy(rot).scale(new THREE.Vector3(LY, LY, LY)).setPosition(c);
    this.group.matrixWorld.copy(m);
    this.centerScene = c;
  }

  _buildStars(quality) {
    const { pos, col, lum } = sampleGalaxyStars(this.starCount, 4021);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('lum', new THREE.BufferAttribute(lum, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 100000);
    this.starMaterial = new THREE.ShaderMaterial({
      uniforms: { uExposure: { value: 1 }, uPixelRatio: { value: this.engine.q.pixelRatio }, uMaxSize: { value: 9 }, uFade: { value: 1 }, uTime: { value: 0 }, uBand: { value: 0 } },
      vertexShader: starVert, fragmentShader: starFrag,
      transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending,
    });
    this.stars = new THREE.Points(geo, this.starMaterial);
    this.stars.frustumCulled = false;
    this.stars.renderOrder = 10;
    this.group.add(this.stars);
    this.materials.push(this.starMaterial);
  }

  _spriteLayer(count, sampler, blending, frag, renderOrder, extra = {}) {
    const geo = makeSpriteGeometry(count);
    const iPos = new Float32Array(count * 3), iSize = new Float32Array(count), iColor = new Float32Array(count * 3), iAlpha = new Float32Array(count), iRot = new Float32Array(count), iSeed = new Float32Array(count);
    sampler(iPos, iSize, iColor, iAlpha, iRot, iSeed);
    geo.setAttribute('iPos', new THREE.InstancedBufferAttribute(iPos, 3));
    geo.setAttribute('iSize', new THREE.InstancedBufferAttribute(iSize, 1));
    geo.setAttribute('iColor', new THREE.InstancedBufferAttribute(iColor, 3));
    geo.setAttribute('iAlpha', new THREE.InstancedBufferAttribute(iAlpha, 1));
    geo.setAttribute('iRot', new THREE.InstancedBufferAttribute(iRot, 1));
    geo.setAttribute('iSeed', new THREE.InstancedBufferAttribute(iSeed, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 100000);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uCamRight: { value: new THREE.Vector3(1, 0, 0) }, uCamUp: { value: new THREE.Vector3(0, 1, 0) }, uCamPosModel: { value: new THREE.Vector3() },
        uFade: { value: 1 }, uNearFade: { value: extra.nearFade ?? 1 }, uSoft: { value: extra.soft ?? 0 }, uInside: { value: 1 }, uBand: { value: 0 }, uKind: { value: blending === THREE.MultiplyBlending ? 1 : (extra.hii ? 2 : 0) },
      },
      vertexShader: spriteVert, fragmentShader: frag,
      transparent: true, depthWrite: false, depthTest: true, blending, side: THREE.DoubleSide,
      premultipliedAlpha: blending === THREE.MultiplyBlending,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = renderOrder;
    mat.userData.insideFactor = extra.insideFactor ?? 1;
    this.group.add(mesh);
    this.spriteMaterials.push(mat);
    return mesh;
  }

  _buildSprites(quality) {
    const scale = quality.chunkStars; // reuse as density knob
    const G = GALAXY;
    // --- diffuse unresolved starlight (additive, big soft) ---
    const nGlow = Math.round(15000 * scale);
    this._spriteLayer(nGlow, (P, S, C, A, R, SD) => {
      const rng = new Rng(77);
      const { pos } = sampleArmSprites(nGlow, 91, { spread: 1.6, hScale: 550, rMinAll: 3000, discOnly: false });
      for (let i = 0; i < nGlow; i++) {
        const u = pos[i * 3], v = pos[i * 3 + 1], w = pos[i * 3 + 2];
        const r = Math.hypot(u, v);
        P[i * 3] = u; P[i * 3 + 1] = v; P[i * 3 + 2] = w;
        S[i] = 800 + 2400 * Math.pow(rng.float(), 1.5);
        const t = rng.float();
        // arms bluish-white, interarm warm
        const blue = [0.62, 0.74, 1.0], warm = [1.0, 0.86, 0.66];
        const mix = 0.35 + 0.65 * t;
        C[i * 3] = warm[0] * (1 - mix) + blue[0] * mix; C[i * 3 + 1] = warm[1] * (1 - mix) + blue[1] * mix; C[i * 3 + 2] = warm[2] * (1 - mix) + blue[2] * mix;
        A[i] = (0.7 + 0.7 * rng.float()) * Math.exp(-r / 26000);
        R[i] = rng.float() * Math.PI * 2; SD[i] = rng.float();
      }
    }, THREE.AdditiveBlending, glowFrag, 5, { soft: 0.6, insideFactor: 0.18 });

    // --- disc glow (interarm, smoother, warm) ---
    const nDisc = Math.round(5000 * scale);
    this._spriteLayer(nDisc, (P, S, C, A, R, SD) => {
      const rng = new Rng(78);
      const { pos } = sampleArmSprites(nDisc, 92, { hScale: 700, rMinAll: 2500, discOnly: true });
      for (let i = 0; i < nDisc; i++) {
        const u = pos[i * 3], v = pos[i * 3 + 1], w = pos[i * 3 + 2];
        const r = Math.hypot(u, v);
        P[i * 3] = u; P[i * 3 + 1] = v; P[i * 3 + 2] = w;
        S[i] = 1500 + 3200 * Math.pow(rng.float(), 1.3);
        C[i * 3] = 1.0; C[i * 3 + 1] = 0.9; C[i * 3 + 2] = 0.74;
        A[i] = (0.35 + 0.3 * rng.float()) * Math.exp(-r / 14000);
        R[i] = rng.float() * Math.PI * 2; SD[i] = rng.float();
      }
    }, THREE.AdditiveBlending, glowFrag, 4, { soft: 1.2, insideFactor: 0.12 });

    // --- dust lanes (multiplicative) ---
    const nDust = Math.round(14000 * scale);
    this.dust = this._spriteLayer(nDust, (P, S, C, A, R, SD) => {
      const rng = new Rng(79);
      const { pos } = sampleArmSprites(nDust, 93, { inward: 0.9, spread: 0.55, hScale: 210, rMinAll: 6500 });
      for (let i = 0; i < nDust; i++) {
        const u = pos[i * 3], v = pos[i * 3 + 1], w = pos[i * 3 + 2];
        const r = Math.hypot(u, v);
        P[i * 3] = u; P[i * 3 + 1] = v; P[i * 3 + 2] = w;
        S[i] = 350 + 1300 * Math.pow(rng.float(), 1.4);
        const k = 0.25 + 0.3 * rng.float();
        C[i * 3] = k * 0.95; C[i * 3 + 1] = k * 0.82; C[i * 3 + 2] = k * 0.7;
        A[i] = (0.22 + 0.3 * rng.float()) * Math.exp(-r / 40000);
        R[i] = rng.float() * Math.PI * 2; SD[i] = rng.float();
      }
    }, THREE.MultiplyBlending, dustFrag, 20, { nearFade: 1 });

    // --- mid-plane dust (the great rift seen from inside) ---
    const nPlane = Math.round(6000 * scale);
    this._spriteLayer(nPlane, (P, S, C, A, R, SD) => {
      const rng = new Rng(80);
      const { pos } = sampleArmSprites(nPlane, 94, { hScale: 140, rMinAll: 5000, discOnly: true });
      for (let i = 0; i < nPlane; i++) {
        const u = pos[i * 3], v = pos[i * 3 + 1], w = pos[i * 3 + 2];
        const r = Math.hypot(u, v);
        P[i * 3] = u; P[i * 3 + 1] = v; P[i * 3 + 2] = w;
        S[i] = 900 + 2200 * Math.pow(rng.float(), 1.2);
        const k = 0.5 + 0.3 * rng.float();
        C[i * 3] = k * 0.95; C[i * 3 + 1] = k * 0.85; C[i * 3 + 2] = k * 0.75;
        A[i] = (0.05 + 0.07 * rng.float()) * Math.exp(-r / 30000);
        R[i] = rng.float() * Math.PI * 2; SD[i] = rng.float();
      }
    }, THREE.MultiplyBlending, dustFrag, 21, { nearFade: 1 });

    // --- HII regions / young clusters (additive, pink-red & blue) ---
    const nHII = Math.round(2600 * scale);
    this.hii = this._spriteLayer(nHII, (P, S, C, A, R, SD) => {
      const rng = new Rng(81);
      const { pos } = sampleArmSprites(nHII, 95, { spread: 0.5, hScale: 160, rMinAll: 8000 });
      for (let i = 0; i < nHII; i++) {
        const u = pos[i * 3], v = pos[i * 3 + 1], w = pos[i * 3 + 2];
        P[i * 3] = u; P[i * 3 + 1] = v; P[i * 3 + 2] = w;
        const big = rng.float() < 0.15;
        S[i] = big ? 500 + 700 * rng.float() : 160 + 340 * rng.float();
        if (rng.float() < 0.72) { C[i * 3] = 1.0; C[i * 3 + 1] = 0.32; C[i * 3 + 2] = 0.42; } // H-alpha
        else { C[i * 3] = 0.55; C[i * 3 + 1] = 0.7; C[i * 3 + 2] = 1.0; } // young blue cluster
        A[i] = big ? 0.3 + 0.3 * rng.float() : 0.45 + 0.45 * rng.float();
        R[i] = rng.float() * Math.PI * 2; SD[i] = rng.float();
      }
    }, THREE.AdditiveBlending, glowFrag, 30, { soft: 0.0, insideFactor: 0.45, hii: true });
  }

  _buildCore() {
    // Bulge glow: a few layered sprites at the centre + nuclear region
    const n = 40;
    this.core = this._spriteLayer(n, (P, S, C, A, R, SD) => {
      const rng = new Rng(82);
      for (let i = 0; i < n; i++) {
        const t = i / n;
        const rr = t * 1800 * Math.pow(rng.float(), 0.5);
        const dir = rng.unitVector();
        P[i * 3] = dir[0] * rr; P[i * 3 + 1] = dir[1] * rr; P[i * 3 + 2] = dir[2] * rr * 0.55;
        S[i] = i < 6 ? 8000 + 4000 * rng.float() : i < 14 ? 600 + 1200 * rng.float() : 1500 + 3500 * rng.float();
        C[i * 3] = 1.0; C[i * 3 + 1] = 0.86 - 0.1 * t; C[i * 3 + 2] = 0.62 - 0.1 * t;
        A[i] = i < 6 ? 0.25 : i < 14 ? 0.8 : 0.35 + 0.25 * rng.float();
        R[i] = rng.float() * Math.PI * 2; SD[i] = rng.float();
      }
    }, THREE.AdditiveBlending, glowFrag, 6, { soft: 0.8, nearFade: 1, insideFactor: 0.35 });
  }

  _registerObjects() {
    const self = this;
    this.registry.add({
      id: 'milkyway', name: 'Milky Way', kind: 'galaxy', aliases: ['Galaxy', 'Via Lactea', 'Vía Láctea', 'Home galaxy'],
      color: '#c9c2ff', radius: 52000 * LY, priority: 10, labelRange: [3, 1e9], axis: GAL_EW.clone(), approachElevation: 0.6,
      getPosition(out) { return out.copy(self.centerScene); },
      data: { type: 'Barred spiral galaxy (SBbc)', diameter: '≈ 100 000 – 120 000 ly', mass: '≈ 1.5 × 10¹² M☉ (incl. dark matter)', stars: '100 – 400 billion', age: '≈ 13.6 billion years', rotation: '≈ 230 million years at the Sun', distance: 'We are inside it' },
      description: 'Our home galaxy: a barred spiral about 100,000 light-years across, with a central bar, four major spiral arms and a supermassive black hole, Sagittarius A*, at its heart. The Sun sits in the Orion Spur, roughly 26,700 light-years from the centre, orbiting once every 230 million years.',
      facts: ['The name comes from the Greek galaxías kýklos, "milky circle".', 'Around 7 new stars are born in the Milky Way every year.', 'It will merge with Andromeda in about 4.5 billion years.'],
    });
    this.registry.add({
      id: 'galactic-center', name: 'Galactic Centre', kind: 'region', aliases: ['Galactic Core', 'Bulge', 'Nucleus'],
      color: '#ffd9a0', radius: 5000 * LY, priority: 5, searchable: true, labelRange: [2.5, 40],
      getPosition(out) { return out.copy(self.centerScene); },
      data: { type: 'Galactic bulge / nuclear star cluster', distance: '≈ 26 700 ly from the Sun', size: '≈ 10 000 ly across' },
      description: 'The dense central bulge of the Milky Way, home to old, metal-rich stars, the nuclear star cluster and Sagittarius A*. From Earth it lies behind thick dust in the constellation Sagittarius.',
    });
    for (const a of GALAXY.arms) {
      const idx = GALAXY.arms.indexOf(a);
      const rr = Math.min(Math.max(a.rCross, a.rMin * 1.2), a.rMax * 0.8);
      const th = idx === 4 ? 0 : 0; // cross azimuth 0 ⇒ same side as Sun
      const model = new THREE.Vector3(rr * Math.cos(th), rr * Math.sin(th), 0);
      const pos = model.clone().sub(SUN_GAL_POS).applyMatrix4(GALAXY_MATRIX).multiplyScalar(LY);
      this.registry.add({
        id: 'arm-' + idx, name: a.name === 'Orion Spur' ? 'Orion Spur' : a.name + ' Arm', kind: 'region', aliases: a.name === 'Orion Spur' ? ['Orion Arm', 'Local Arm', 'Orion–Cygnus Arm'] : [a.name],
        color: '#9fb6ff', radius: a.width * 2 * LY, priority: 3, labelRange: [3, 30],
        getPosition(out) { return out.copy(pos); },
        data: { type: 'Spiral arm', pitchAngle: a.pitch.toFixed(1) + '°', width: '≈ ' + Math.round(a.width * 2).toLocaleString() + ' ly' },
        description: a.name === 'Orion Spur' ? 'The Orion Spur (or Local Arm) is the minor spiral arm segment that contains the Solar System, about 3,500 light-years wide and 10,000 long, between the Sagittarius and Perseus arms.' : `The ${a.name} arm is one of the spiral arms of the Milky Way, a region of enhanced star formation traced by young hot stars, HII regions and dust.`,
      });
    }
  }

  setStarExposure(e) { this.exposure = e; }

  update(dt, t, camPos) {
    const cam = this.engine.camera;
    // camera in model coordinates
    sceneToGal(camPos, this._camModel);
    // camera right/up in model space (rotation only; model axes = galaxy basis)
    const m = cam.matrixWorld.elements;
    this._right.set(m[0], m[1], m[2]).normalize();
    this._up.set(m[4], m[5], m[6]).normalize();
    // world -> model rotation = inverse of GALAXY_MATRIX (orthonormal)
    const inv = this._invRot || (this._invRot = new THREE.Matrix3().setFromMatrix4(GALAXY_MATRIX).transpose());
    this._right.applyMatrix3(inv); this._up.applyMatrix3(inv);
    const dGCly = camPos.distanceTo(this.centerScene) / LY;
    const sOut = Math.min(Math.max((dGCly - 45000) / 45000, 0), 1);
    const insideT = 1 - sOut * sOut * (3 - 2 * sOut);
    for (const mat of this.spriteMaterials) {
      mat.uniforms.uInside.value = 1 - insideT * (1 - mat.userData.insideFactor);
      mat.uniforms.uCamRight.value.copy(this._right);
      mat.uniforms.uCamUp.value.copy(this._up);
      mat.uniforms.uCamPosModel.value.copy(this._camModel);
      mat.uniforms.uFade.value = this.fade;
    }
    // exposure for the galaxy-wide layer: constant appearance from outside, dim from inside
    const dGC = camPos.distanceTo(this.centerScene) / LY;
    const eOut = Math.min(Math.pow(dGC / 150000, 2), 6);
    const eIn = 0.0015;
    const sIn = Math.min(Math.max((dGC - 40000) / 50000, 0), 1);
    const E = eIn + (eOut - eIn) * (sIn * sIn * (3 - 2 * sIn));
    this.starMaterial.uniforms.uTime.value = t;
    this.starMaterial.uniforms.uExposure.value = E * this.exposure;
    this.starMaterial.uniforms.uFade.value = this.fade;
    this.starMaterial.uniforms.uPixelRatio.value = this.engine.renderer.getPixelRatio();
  }
}
