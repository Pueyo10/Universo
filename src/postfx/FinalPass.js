import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { HASH } from '../shaders/chunks.js';

// Final compositing: exposure, warp streaks (travel), chromatic aberration,
// screen-space lens flare, ACES tone mapping, vignette, grain, sRGB.
const FinalShader = {
  uniforms: {
    tDiffuse: { value: null },
    uExposure: { value: 1.0 },
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uAspect: { value: 1.77 },
    uVignette: { value: 0.32 },
    uAberration: { value: 0.35 },
    uGrain: { value: 0.03 },
    uWarp: { value: 0.0 },
    uWarpCenter: { value: new THREE.Vector2(0.5, 0.5) },
    uLens: { value: 1.0 },
    uSunScreen: { value: new THREE.Vector2(-10, -10) },
    uSunVisible: { value: 0.0 },
    uSunSize: { value: 0.01 },
    uSunColor: { value: new THREE.Color(1.0, 0.93, 0.8) },
    uFade: { value: 1.0 },
    uSaturation: { value: 1.05 },
    uBand: { value: 0 },
    uHaze: { value: 0.0 },
    uHazeColor: { value: new THREE.Color(0.6, 0.75, 1.0) },
    tLum: { value: null },
    uAutoExp: { value: 1.0 },
    uKey: { value: 0.16 },
    uExpMin: { value: 0.35 },
    uExpMax: { value: 3.5 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */`
    precision highp float;
    uniform sampler2D tDiffuse, tLum;
    uniform float uExposure, uTime, uAspect, uVignette, uAberration, uGrain, uWarp, uLens, uSunVisible, uSunSize, uFade, uSaturation, uBand, uHaze, uAutoExp, uKey, uExpMin, uExpMax;
    uniform vec3 uHazeColor;
    uniform vec2 uResolution, uWarpCenter, uSunScreen;
    uniform vec3 uSunColor;
    varying vec2 vUv;
    ${HASH}

    const mat3 ACESInputMat = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
    const mat3 ACESOutputMat = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
    vec3 RRTAndODTFit(vec3 v) { vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
    vec3 aces(vec3 c) { c = ACESInputMat * (c / 0.6); c = RRTAndODTFit(c); c = ACESOutputMat * c; return clamp(c, 0.0, 1.0); }

    vec3 sampleScene(vec2 uv) {
      vec3 c = texture2D(tDiffuse, uv).rgb;
      // NaN/Inf scrub: a single bad pixel must never survive to the screen
      bvec3 bad = bvec3(isnan(c.r) || isinf(c.r), isnan(c.g) || isinf(c.g), isnan(c.b) || isinf(c.b));
      return max(mix(c, vec3(0.0), vec3(bad)), 0.0);
    }

    vec3 flare(vec2 uv) {
      vec2 sun = uSunScreen;
      vec2 d = uv - sun; d.x *= uAspect;
      float dist = length(d);
      vec3 c = vec3(0.0);
      // glare disc around the sun (scaled with apparent size)
      float core = uSunSize * 1.4 + 0.004;
      c += uSunColor * 0.9 * exp(-dist * dist / (core * core * 0.9)) * 0.3;
      c += uSunColor * 0.03 / (dist * 40.0 + 0.08);
      // anamorphic streak
      float streak = exp(-abs(d.y) * 220.0) * exp(-abs(d.x) * 7.0) * 0.22;
      c += vec3(0.45, 0.65, 1.0) * streak;
      // subtle diagonal spikes
      float ang = atan(d.y, d.x);
      float spikes = pow(abs(cos(ang * 3.0)), 60.0) * exp(-dist * 18.0) * 0.1;
      c += uSunColor * spikes;
      // ghosts along the line through the screen centre
      vec2 dir = vec2(0.5) - sun;
      for (int i = 1; i <= 6; i++) {
        float fi = float(i);
        vec2 gp = sun + dir * (0.28 * fi + 0.1 * sin(fi * 1.7));
        vec2 gd = (uv - gp); gd.x *= uAspect;
        float gr = 0.012 + 0.035 * hash11(fi * 7.1);
        float g = smoothstep(gr, gr * 0.45, length(gd));
        float ring = smoothstep(0.004, 0.0, abs(length(gd) - gr * 1.6));
        vec3 tint = mix(vec3(0.35, 0.6, 1.0), vec3(1.0, 0.55, 0.35), hash11(fi * 3.3));
        c += tint * (g * 0.06 + ring * 0.02) * (0.6 + 0.4 * hash11(fi * 5.9));
      }
      // wide halo
      vec2 hp = sun + dir * 1.35; vec2 hd = uv - hp; hd.x *= uAspect;
      c += vec3(0.5, 0.75, 1.0) * smoothstep(0.02, 0.0, abs(length(hd) - 0.32)) * 0.05;
      return c;
    }

    void main() {
      vec2 uv = vUv;
      vec2 cen = uv - 0.5; cen.x *= uAspect;
      float r = length(cen);

      // warp streaks (travel): radial blur toward the warp centre
      vec3 col;
      if (uWarp > 0.002) {
        vec2 d = uv - uWarpCenter;
        float len = length(d);
        vec3 acc = vec3(0.0); float ws = 0.0;
        float strength = uWarp * 0.28 * smoothstep(0.0, 0.5, len);
        for (int i = 0; i < 14; i++) {
          float t = float(i) / 14.0;
          float w = 1.0 - t * 0.6;
          acc += sampleScene(uv - d * t * strength) * w; ws += w;
        }
        col = acc / ws;
        // extra brightness on streaks
        col *= 1.0 + uWarp * 0.35;
      } else {
        col = sampleScene(uv);
      }

      // chromatic aberration (tiny, increases toward edges and during warp)
      float ab = (uAberration * 0.0016 + uWarp * 0.006) * r;
      if (ab > 0.00005) {
        vec2 off = normalize(cen + 1e-6) * ab;
        col.r = sampleScene(uv + off).r;
        col.b = sampleScene(uv - off).b;
      }

      // photographic auto exposure: key / adapted mean luminance, bounded so deep space stays dark and the Sun stays bright
      float expo = uExposure;
      if (uAutoExp > 0.5) { float avg = exp(texture2D(tLum, vec2(0.5)).r); expo *= clamp(uKey / max(avg, 1e-5), uExpMin, uExpMax); }
      col *= expo;
      // atmospheric entry haze: scattered light fills the frame as the camera descends
      if (uHaze > 0.001) col = mix(col, uHazeColor * (0.6 + 0.4 * expo), uHaze);

      if (uLens > 0.5 && uSunVisible > 0.001) col += flare(uv) * uSunVisible * expo;
      // observatory false colour: keep structure, tint by band, boost contrast so faint emission reads
      if (uBand > 0.5) {
        float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
        vec3 tint = uBand < 1.5 ? vec3(1.0, 0.55, 0.3) : uBand < 2.5 ? vec3(0.55, 0.65, 1.0) : uBand < 3.5 ? vec3(0.75, 0.6, 1.0) : vec3(0.55, 1.0, 0.7);
        col = mix(col, tint * l, 0.55) * (uBand < 3.5 && uBand > 2.5 ? 1.8 : 1.25);
      }

      // tone map
      col = aces(col);
      // saturation
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSaturation);
      // vignette
      col *= 1.0 - uVignette * smoothstep(0.35, 1.25, r);
      // grain
      float g = hash12(gl_FragCoord.xy + fract(uTime * 13.7) * 1000.0) - 0.5;
      col += g * uGrain * (0.25 + 0.75 * (1.0 - l));
      col = max(col, 0.0);
      // linear → sRGB
      col = pow(col, vec3(1.0 / 2.2));
      col *= uFade;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export class FinalPass extends ShaderPass {
  constructor() {
    super(FinalShader);
    this.needsSwap = true;
  }
  setSize(w, h) {
    this.uniforms.uResolution.value.set(w, h);
    this.uniforms.uAspect.value = w / h;
  }
}
