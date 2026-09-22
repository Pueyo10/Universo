import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

// Precomputed atmosphere tables (after Hillaire 2020, "A Scalable and Production Ready Sky and Atmosphere
// Rendering Technique"): a transmittance LUT T(r, mu) and a multiple-scattering LUT psi_ms(r, mu_sun).
// Built once per planet from its scale heights, optical depths and ground albedo; the shell shader then
// replaces the analytic sun transmittance with a lookup and adds the isotropic multiple-scattering term,
// which is what turns single-scattering twilights (green bands, black horizons) into real ones.
// Units: planet radii. Rg = 1, Rt = top of the shell.

const COMMON = /* glsl */`
  uniform float uRg, uRt, uHr, uHm, uBetaM, uBetaMe, uAlbedo;
  uniform vec3 uBetaR, uBetaE;
  vec2 raySphere(vec3 ro, vec3 rd, float R) {
    float b = dot(ro, rd); float c = dot(ro, ro) - R * R; float h = b * b - c;
    if (h < 0.0) return vec2(-1.0);
    h = sqrt(h); return vec2(-b - h, -b + h);
  }
  vec2 dens(float r) { float h = max(r - uRg, 0.0); return vec2(exp(-h / uHr), exp(-h / uHm)); }
  // position along [t0, t1] for parameter s in [0,1]: cubic warp on both sides of tc (the lowest point), where the density peaks
  float warpT(float s, float t0, float tc, float t1) {
    float len = max(t1 - t0, 1e-9);
    float a = clamp((tc - t0) / len, 0.001, 0.999);
    float u = s < a ? (s - a) / a : (s - a) / (1.0 - a);
    return tc + u * u * u * (u < 0.0 ? (tc - t0) : (t1 - tc));
  }
  vec3 extinction(float r) { vec2 d = dens(r); return uBetaE * d.x + vec3(uBetaMe * d.y); }
  // Hillaire's transmittance parametrisation: uv <-> (view height r, view zenith cosine mu)
  void uvToTransParams(vec2 uv, out float r, out float mu) {
    float H = sqrt(max(0.0, uRt * uRt - uRg * uRg));
    float rho = H * uv.y;
    r = sqrt(rho * rho + uRg * uRg);
    float dMin = uRt - r, dMax = rho + H;
    float d = dMin + uv.x * (dMax - dMin);
    mu = d == 0.0 ? 1.0 : (H * H - rho * rho - d * d) / (2.0 * r * d);
    mu = clamp(mu, -1.0, 1.0);
  }
  vec2 transParamsToUv(float r, float mu) {
    float H = sqrt(max(0.0, uRt * uRt - uRg * uRg));
    float rho = sqrt(max(0.0, r * r - uRg * uRg));
    float disc = r * r * (mu * mu - 1.0) + uRt * uRt;
    float d = max(0.0, -r * mu + sqrt(max(disc, 0.0)));
    float dMin = uRt - r, dMax = rho + H;
    return vec2(clamp((d - dMin) / max(dMax - dMin, 1e-6), 0.0, 1.0), clamp(rho / max(H, 1e-6), 0.0, 1.0));
  }
`;
const VERT = /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const TRANS_FRAG = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  ${COMMON}
  void main() {
    float r, mu; uvToTransParams(vUv, r, mu);
    vec3 ro = vec3(0.0, r, 0.0), rd = vec3(sqrt(max(0.0, 1.0 - mu * mu)), mu, 0.0);
    float tEnd = raySphere(ro, rd, uRt).y;
    float tc = clamp(-dot(ro, rd), 0.0, tEnd);
    vec3 od = vec3(0.0);
    const int N = 96;
    float tPrev = 0.0;
    for (int i = 0; i < N; i++) {
      float t1 = warpT((float(i) + 1.0) / float(N), 0.0, tc, tEnd);
      float tm = warpT((float(i) + 0.5) / float(N), 0.0, tc, tEnd);
      float dt = max(t1 - tPrev, 0.0); tPrev = t1;
      od += extinction(length(ro + rd * tm)) * dt;
    }
    gl_FragColor = vec4(exp(-od), 1.0);
  }
`;

const MULTI_FRAG = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tTrans;
  ${COMMON}
  vec3 sunTrans(vec3 p, vec3 L) {
    float r = length(p);
    if (raySphere(p, L, uRg).x > 0.0) return vec3(0.0);
    return texture2D(tTrans, transParamsToUv(r, dot(p, L) / r)).rgb;
  }
  void main() {
    float muS = vUv.x * 2.0 - 1.0;
    float r = uRg + (uRt - uRg) * vUv.y;
    r = clamp(r, uRg + 1e-5, uRt - 1e-5);
    vec3 L = vec3(sqrt(max(0.0, 1.0 - muS * muS)), muS, 0.0);
    vec3 x = vec3(0.0, r, 0.0);
    vec3 L2 = vec3(0.0), fms = vec3(0.0);
    const int DIRS = 64, STEPS = 28;
    const float PI = 3.14159265;
    for (int k = 0; k < DIRS; k++) {
      // spherical Fibonacci directions
      float fk = float(k) + 0.5;
      float z = 1.0 - 2.0 * fk / float(DIRS);
      float phi = fk * 2.399963;
      float s = sqrt(max(0.0, 1.0 - z * z));
      vec3 w = vec3(s * cos(phi), z, s * sin(phi));
      float tTop = raySphere(x, w, uRt).y;
      vec2 tg = raySphere(x, w, uRg);
      bool hitsGround = tg.x > 0.0;
      float tEnd = hitsGround ? tg.x : tTop;
      vec3 T = vec3(1.0), l2 = vec3(0.0), f = vec3(0.0);
      float tc = clamp(-dot(x, w), 0.0, tEnd), tPrev = 0.0;
      for (int i = 0; i < STEPS; i++) {
        float t1 = warpT((float(i) + 1.0) / float(STEPS), 0.0, tc, tEnd);
        float tm = warpT((float(i) + 0.5) / float(STEPS), 0.0, tc, tEnd);
        float dt = max(t1 - tPrev, 0.0); tPrev = t1;
        vec3 p = x + w * tm;
        float rp = length(p);
        vec2 d = dens(rp);
        vec3 sigS = uBetaR * d.x + vec3(uBetaM * d.y);
        vec3 sigE = extinction(rp);
        vec3 Ts = exp(-sigE * dt);
        // integrate sigS * T over the step analytically (Hillaire)
        vec3 intS = (sigS - sigS * Ts) / max(sigE, vec3(1e-6));
        vec3 sun = sunTrans(p, L);
        l2 += T * intS * sun / (4.0 * PI);   // uniform phase for the second order
        f += T * intS;
        T *= Ts;
      }
      if (hitsGround) {
        vec3 pg = x + w * tEnd; vec3 n = normalize(pg);
        l2 += T * sunTrans(pg, L) * uAlbedo * max(dot(n, L), 0.0) / PI;
      }
      L2 += l2 / float(DIRS); fms += f / float(DIRS);
    }
    vec3 psi = L2 / max(vec3(1.0) - fms, vec3(0.05));
    gl_FragColor = vec4(psi, 1.0);
  }
`;

export class AtmosphereLUT {
  /**
   * renderer: WebGLRenderer; p: { Rt, Hr, Hm, betaR (Vector3), betaE (Vector3, scattering + absorption), betaM, betaMe, albedo }
   * All lengths in planet radii (Rg = 1), betas per planet radius.
   */
  constructor(renderer, p) {
    const uniforms = {
      uRg: { value: 1 }, uRt: { value: p.Rt }, uHr: { value: p.Hr }, uHm: { value: p.Hm },
      uBetaR: { value: p.betaR.clone() }, uBetaE: { value: p.betaE.clone() }, uBetaM: { value: p.betaM }, uBetaMe: { value: p.betaMe }, uAlbedo: { value: p.albedo ?? 0.3 },
    };
    const mk = (w, h) => new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, stencilBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping, generateMipmaps: false });
    this.transRT = mk(256, 64);
    this.multiRT = mk(32, 32);
    const prev = renderer.getRenderTarget();
    const quad = new FullScreenQuad(new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: TRANS_FRAG, depthTest: false, depthWrite: false }));
    renderer.setRenderTarget(this.transRT); quad.render(renderer);
    quad.material.dispose();
    quad.material = new THREE.ShaderMaterial({ uniforms: { ...uniforms, tTrans: { value: this.transRT.texture } }, vertexShader: VERT, fragmentShader: MULTI_FRAG, depthTest: false, depthWrite: false });
    renderer.setRenderTarget(this.multiRT); quad.render(renderer);
    quad.material.dispose(); quad.dispose();
    renderer.setRenderTarget(prev);
    this.transmittance = this.transRT.texture;
    this.multi = this.multiRT.texture;
  }
  dispose() { this.transRT.dispose(); this.multiRT.dispose(); }
}
