import * as THREE from 'three';
import { LOGDEPTH_PARS_VERT, LOGDEPTH_VERT, LOGDEPTH_PARS_FRAG, LOGDEPTH_FRAG, SIMPLEX3D, HASH, COLOR_UTILS } from '../shaders/chunks.js';

// The Sun (and any star visited up close): a photosphere of animated
// granulation with sunspots and limb darkening, a chromosphere of licking
// prominences visible at the limb, and a streamer corona billboard. Output is
// HDR so bloom and the lens flare do the rest.

const surfVert = /* glsl */`
  varying vec3 vN; varying vec3 vPos; varying vec2 vUv; varying vec3 vView;
  ${LOGDEPTH_PARS_VERT}
  void main() {
    vN = normal; vPos = position; vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = -mv.xyz;
    gl_Position = projectionMatrix * mv;
    ${LOGDEPTH_VERT}
  }
`;
const surfFrag = /* glsl */`
  precision highp float;
  varying vec3 vN; varying vec3 vPos; varying vec2 vUv; varying vec3 vView;
  uniform float uTime, uTemp, uIntensity, uDetail;
  uniform sampler2D uMap; uniform float uHasMap;
  uniform vec3 uTint;
  ${HASH}
  ${SIMPLEX3D}
  ${COLOR_UTILS}
  ${LOGDEPTH_PARS_FRAG}
  void main() {
    ${LOGDEPTH_FRAG}
    vec3 n = normalize(vN);
    vec3 p = n * 3.0;
    float t = uTime * 0.05;
    // granulation: cellular-ish via ridged noise, multi-scale, animated
    float g1 = max(1.0 - abs(snoise(vec3(p * 14.0 + t * 1.5))), 0.0);
    float g2 = max(1.0 - abs(snoise(vec3(p * 32.0 - t * 2.5 + 7.0))), 0.0);
    float g3 = max(1.0 - abs(snoise(vec3(p * 70.0 + t * 4.0 + 13.0))), 0.0);
    float gran = pow(g1, 2.2) * 0.6 + pow(g2, 2.2) * 0.35 * uDetail + pow(g3, 2.0) * 0.2 * uDetail;
    // large-scale brightness variation (supergranulation / faculae)
    float big = fbm(p * 2.0 + t * 0.3, 3) * 0.5 + 0.5;
    // sunspots: thresholded low-frequency noise, umbra + penumbra, concentrated at mid latitudes
    float lat = abs(n.y);
    float band = smoothstep(0.05, 0.2, lat) * (1.0 - smoothstep(0.45, 0.65, lat));
    float sp = fbm(p * 1.6 + vec3(5.0, t * 0.1, 2.0), 2) * 0.5 + 0.5;
    float spv = sp * (0.6 + 0.5 * band);
    float spot = smoothstep(0.72, 0.80, spv);           // penumbra
    float umbra = smoothstep(0.79, 0.85, spv);          // dark core
    float spotDark = 1.0 - spot * 0.55 - umbra * 0.4;
    // limb darkening
    float mu = max(dot(n, normalize(vView)), 0.0);
    float limb = 0.3 + 0.7 * pow(mu, 0.55);
    vec3 base = blackbody(uTemp) * uTint;
    // colour: photosphere warm; spots cooler/redder
    vec3 col = base * (0.45 + 1.1 * gran + 0.25 * big) * spotDark;
    col = mix(col, base * vec3(0.9, 0.55, 0.35) * 0.35, spot * 0.6);
    if (uHasMap > 0.5) { vec3 m = texture2D(uMap, vUv).rgb; col *= 0.85 + 0.3 * m; }
    col *= limb * uIntensity;
    gl_FragColor = vec4(col, 1.0);
  }
`;
const chromoVert = /* glsl */`
  varying vec3 vN; varying vec3 vView; varying vec3 vPos;
  ${LOGDEPTH_PARS_VERT}
  void main() {
    vN = normal; vPos = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = -mv.xyz;
    gl_Position = projectionMatrix * mv;
    ${LOGDEPTH_VERT}
  }
`;
const chromoFrag = /* glsl */`
  precision highp float;
  varying vec3 vN; varying vec3 vView; varying vec3 vPos;
  uniform float uTime, uIntensity; uniform vec3 uColor;
  ${HASH}
  ${SIMPLEX3D}
  ${LOGDEPTH_PARS_FRAG}
  void main() {
    ${LOGDEPTH_FRAG}
    vec3 n = normalize(vN);
    float mu = abs(dot(n, normalize(vView)));
    float rim = pow(max(1.0 - mu, 0.0), 2.5);
    float t = uTime * 0.08;
    vec3 p = normalize(vPos) * 6.0;
    // licking flames: ridged noise stretched radially and animated
    float f1 = max(1.0 - abs(snoise(p * 3.0 + vec3(0.0, t * 2.0, 0.0))), 0.0);
    float f2 = max(1.0 - abs(snoise(p * 7.0 - vec3(t * 3.0, 0.0, t))), 0.0);
    float flames = pow(f1, 3.0) * 0.7 + pow(f2, 4.0) * 0.5;
    float a = rim * (0.35 + flames) * uIntensity;
    // prominences: sparse big arcs
    float prom = smoothstep(0.6, 0.9, fbm(p * 1.2 + vec3(t * 0.5), 3) * 0.5 + 0.5) * rim * 1.5;
    vec3 col = uColor * (a + prom * vec3(1.0, 0.45, 0.3).r);
    col += vec3(1.0, 0.35, 0.2) * prom * 0.8;
    gl_FragColor = vec4(col * 1.2, clamp(a + prom, 0.0, 1.0));
  }
`;
const coronaVert = /* glsl */`
  varying vec2 vUv;
  ${LOGDEPTH_PARS_VERT}
  void main() {
    vUv = position.xy;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    ${LOGDEPTH_VERT}
  }
`;
const coronaFrag = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  uniform float uTime, uIntensity, uInner; uniform vec3 uColor;
  ${HASH}
  ${SIMPLEX3D}
  ${LOGDEPTH_PARS_FRAG}
  void main() {
    ${LOGDEPTH_FRAG}
    float r = length(vUv) * 2.0;          // 1.0 at quad edge
    float ri = uInner;                    // sun radius in quad units
    if (r < ri * 0.98) discard;
    float ang = atan(vUv.y, vUv.x);
    float t = uTime * 0.02;
    // streamers: angular noise with radial stretch
    float s1 = clamp(fbm(vec3(cos(ang) * 3.0, sin(ang) * 3.0, r * 0.8 + t), 4) * 0.5 + 0.5, 0.0, 1.0);
    float s2 = clamp(fbm(vec3(cos(ang) * 9.0 + 3.0, sin(ang) * 9.0, r * 1.5 - t * 1.5), 3) * 0.5 + 0.5, 0.0, 1.0);
    float streamers = pow(s1, 2.5) * 0.9 + pow(s2, 3.0) * 0.5;
    float x = max(r - ri, 0.0) / ri;      // distance from the limb in radii
    float fall = 1.0 / (1.0 + x * 9.0) * exp(-x * 1.1);
    float edge = 1.0 - smoothstep(0.8, 1.0, r);
    float a = fall * (0.12 + 0.55 * streamers) * edge * uIntensity;
    // bright inner ring (K corona)
    a += exp(-x * 30.0) * 0.35 * edge * uIntensity;
    gl_FragColor = vec4(uColor * a, a);
  }
`;

export class StarBody {
  /**
   * opts: { radius (scene units), temp (K), tint [r,g,b], mapTexture?, intensity, name }
   */
  constructor(opts) {
    this.opts = opts;
    this.group = new THREE.Group();
    const temp = opts.temp || 5772;
    const tint = new THREE.Color(...(opts.tint || [1, 1, 1]));
    this.surfMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uTemp: { value: temp }, uIntensity: { value: opts.intensity ?? 3.2 }, uDetail: { value: 1 }, uMap: { value: opts.map || null }, uHasMap: { value: opts.map ? 1 : 0 }, uTint: { value: tint } },
      vertexShader: surfVert, fragmentShader: surfFrag,
    });
    this.surface = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 96), this.surfMat);
    this.surface.renderOrder = 50;
    this.group.add(this.surface);
    const chromoColor = new THREE.Color().setRGB(1.0, 0.55, 0.3).lerp(tint, 0.3);
    this.chromoMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uIntensity: { value: 1.0 }, uColor: { value: chromoColor } },
      vertexShader: chromoVert, fragmentShader: chromoFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide,
    });
    this.chromo = new THREE.Mesh(new THREE.SphereGeometry(1.035, 96, 64), this.chromoMat);
    this.chromo.renderOrder = 51;
    this.group.add(this.chromo);
    const coronaColor = new THREE.Color().setRGB(1.0, 0.85, 0.65).lerp(tint, 0.4);
    this.coronaMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uIntensity: { value: 1.0 }, uInner: { value: 1 / 4 }, uColor: { value: coronaColor } },
      vertexShader: coronaVert, fragmentShader: coronaFrag, transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    // 4 radii half-width: the streamer falloff is below 0.5 % beyond ~3 radii, and the quad costs 2.25x fewer fragments than 6
    this.corona = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), this.coronaMat);
    this.corona.renderOrder = 52;
    this.group.add(this.corona);
    this.geoLow = new THREE.SphereGeometry(1, 32, 24);
    this.geoHigh = this.surface.geometry;
  }
  /** camera: THREE.Camera; apparent radius px for LOD. */
  update(t, camera, rpx) {
    this.surfMat.uniforms.uTime.value = t;
    this.chromoMat.uniforms.uTime.value = t;
    this.coronaMat.uniforms.uTime.value = t;
    // corona billboard faces the camera
    this.corona.quaternion.copy(camera.quaternion);
    this.group.updateMatrixWorld(true);
    const parentQ = this.group.getWorldQuaternion(new THREE.Quaternion());
    this.corona.quaternion.copy(parentQ.invert().multiply(camera.quaternion));
    const detail = THREE.MathUtils.clamp((rpx - 40) / 400, 0, 1);
    this.surfMat.uniforms.uDetail.value = detail;
    this.surface.geometry = rpx > 60 ? this.geoHigh : this.geoLow;
    this.chromo.visible = rpx > 6;
    this.coronaMat.uniforms.uIntensity.value = THREE.MathUtils.clamp(rpx / 30, 0.15, 1.0) * 0.6;
  }
}
