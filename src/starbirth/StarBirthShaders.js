import { LOGDEPTH_PARS_VERT, LOGDEPTH_VERT, LOGDEPTH_PARS_FRAG, LOGDEPTH_FRAG, HASH, VALUE_NOISE3D, COLOR_UTILS } from '../shaders/chunks.js';

// GLSL for the star-formation simulation: a ray-marched molecular cloud whose
// density profile collapses, GPU-animated dust / disc / jet particles, a
// Keplerian disc, jet beams with Herbig–Haro knots, and science overlays.

export const CMAPS = /* glsl */`
vec3 cmapInferno(float t) {
  t = clamp(t, 0.0, 1.0);
  vec3 c = mix(vec3(0.0, 0.0, 0.03), vec3(0.32, 0.05, 0.55), smoothstep(0.0, 0.28, t));
  c = mix(c, vec3(0.85, 0.2, 0.2), smoothstep(0.28, 0.52, t));
  c = mix(c, vec3(1.0, 0.62, 0.1), smoothstep(0.52, 0.76, t));
  return mix(c, vec3(1.0, 1.0, 0.78), smoothstep(0.76, 1.0, t));
}
vec3 cmapTemp(float t) {
  t = clamp(t, 0.0, 1.0);
  vec3 c = mix(vec3(0.05, 0.15, 0.9), vec3(0.75, 0.15, 0.85), smoothstep(0.0, 0.3, t));
  c = mix(c, vec3(1.0, 0.25, 0.15), smoothstep(0.3, 0.55, t));
  c = mix(c, vec3(1.0, 0.75, 0.2), smoothstep(0.55, 0.8, t));
  return mix(c, vec3(1.0, 1.0, 1.0), smoothstep(0.8, 1.0, t));
}
`;

// ------------------------------------------------------------------ cloud volume (nebula layer)
export const cloudVert = /* glsl */`
  varying vec3 vViewDir;
  ${LOGDEPTH_PARS_VERT}
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewDir = mv.xyz;
    gl_Position = projectionMatrix * mv;
    ${LOGDEPTH_VERT}
  }
`;
export const cloudFrag = /* glsl */`
  precision highp float;
  varying vec3 vViewDir;
  uniform mat3 uCamToLocal;
  uniform vec3 uCamLocal;
  uniform float uTime, uSeed, uCollapse, uCavity, uDisperse, uStarLum, uIon, uSci, uFade, uBand, uInner, uExt;
  uniform vec3 uStarColor, uExtDir;
  uniform vec4 uSib[3];
  uniform int uSteps;
  ${HASH}
  ${VALUE_NOISE3D}
  ${CMAPS}
  ${LOGDEPTH_PARS_FRAG}
  float sphereExit(vec3 ro, vec3 rd) { float b = dot(ro, rd); float c = dot(ro, ro) - 1.0; float h = b * b - c; if (h < 0.0) return -1.0; return -b + sqrt(h); }
  float sphereEnter(vec3 ro, vec3 rd) { float b = dot(ro, rd); float c = dot(ro, ro) - 1.0; float h = b * b - c; if (h < 0.0) return -1.0; return -b - sqrt(h); }

  void sampleCloud(vec3 p, out vec3 emis, out float dens) {
    float r = length(p);
    vec3 q = p * 2.4 + vec3(uSeed * 13.1, uSeed * 7.7, uSeed * 3.3);
    vec3 w = vec3(vfbm(q * 0.6 + 3.1, 2), vfbm(q * 0.6 + 9.2, 2), vfbm(q * 0.6 + 5.4, 2)) - 0.5;
    float n = vfbm(q + w * 1.5 + vec3(0.0, uTime * 0.004, 0.0), 4);
    float fil = pow(max(1.0 - abs(vfbm(q * 2.6 + 7.0, 3) * 2.0 - 1.0), 0.0), 3.0);
    float env = 1.0 - smoothstep(0.5, 1.0, r);
    float c = uCollapse;
    // diffuse cloud: drains outward as the envelope falls in
    float base = (smoothstep(0.40, 0.75, n) * 1.1 + fil * 0.8) * env;
    base *= 1.0 - 0.55 * c * smoothstep(0.25, 0.9, r);
    // central core: narrower and denser as it collapses, plus an r^-2-like infalling envelope
    float sig = mix(0.30, 0.10, c);
    float core = exp(-r * r / (sig * sig)) * mix(0.35, 2.2, c) * (0.55 + 0.9 * n);
    float infall = c * 1.6 * pow(max(1.0 - r / 0.55, 0.0), 2.0) * (0.4 + n);
    float d = base + core + infall;
    // the innermost envelope is eaten by the disc / accreted: a hole that grows with the disc
    d *= smoothstep(uInner * 0.6, uInner * 1.6, r);
    // bipolar cavities carved by the jets
    float cosA = abs(p.y) / max(r, 1e-4);
    float cav = smoothstep(0.72 - 0.12 * uCavity, 0.96, cosA) * uCavity * smoothstep(0.015, 0.2, r);
    d *= 1.0 - 0.92 * cav;
    // dispersal after ignition: a bubble blown clear, the whole envelope thinning
    float bub = smoothstep(0.0, 0.02 + 0.45 * uDisperse, r);
    d *= mix(1.0, bub, uDisperse) * (1.0 - 0.55 * uDisperse);
    // dark dust lanes: absorb, no emission
    float dust = smoothstep(0.58, 0.8, vfbm(q * 1.7 + 40.0, 3)) * env * (1.0 - 0.7 * uDisperse);
    dens = (d * 1.5 + dust * 5.0) * 3.2 * uExt;
    // emission: scattered galactic starlight (cold blue-grey) + the young star lighting the cloud
    // scattered light of the Orion nursery next door: the side facing it glows, thin edges scatter most
    float facing = 0.5 + 0.5 * dot(p / max(r, 1e-4), uExtDir);
    vec3 ambient = vec3(0.05, 0.06, 0.095) * (0.15 + 0.85 * n) * (0.45 + 1.1 * facing);
    float illum = uStarLum / (1.0 + r * r * 260.0);
    vec3 refl = uStarColor * vec3(0.9, 0.8, 0.75);
    vec3 hii = vec3(1.0, 0.36, 0.30);
    vec3 lightCol = mix(refl, hii, uIon * smoothstep(0.0, 0.08, r));
    vec3 e = min(d, 1.3) * (ambient * 1.6 + illum * lightCol * 0.55 * (0.35 + 1.3 * n * n));
    e += smoothstep(1.8, 0.15, d) * d * 0.09 * (0.4 + 0.8 * facing) * vec3(0.55, 0.65, 0.9);
    e += cav * 0.6 * vec3(0.6, 0.75, 1.0) * (0.2 + illum) * (base + infall);
    for (int i = 0; i < 3; i++) {
      vec3 dp = p - uSib[i].xyz; float ds = dot(dp, dp);
      e += exp(-ds * 700.0) * uSib[i].w * vec3(1.0, 0.75, 0.5) * 1.5;
      dens += exp(-ds * 400.0) * uSib[i].w * 0.4;
    }
    e *= 1.0 - clamp(dust * 1.6, 0.0, 1.0);
    if (uSci > 0.5 && uSci < 1.5) e = cmapInferno(clamp(log(1.0 + d * 3.0) * 0.6, 0.0, 1.0)) * d * 0.9;
    else if (uSci > 1.5 && uSci < 2.5) { float tt = smoothstep(0.7, 0.0, r) * (0.12 + 0.88 * c); tt = max(tt, illum * 0.5); e = cmapTemp(tt) * d * 0.9; }
    emis = e;
  }

  void main() {
    ${LOGDEPTH_FRAG}
    vec3 rd = normalize(uCamToLocal * normalize(vViewDir));
    vec3 ro = uCamLocal;
    float tEnter = sphereEnter(ro, rd), tExit = sphereExit(ro, rd);
    if (tExit < 0.0) discard;
    float t0 = max(tEnter, 0.0);
    float len = tExit - t0;
    int steps = uSteps;
    float dt = len / float(steps);
    float jit = hash12(gl_FragCoord.xy + fract(uTime) * 100.0);
    float t = t0 + dt * jit;
    vec3 acc = vec3(0.0); float T = 1.0;
    for (int i = 0; i < 128; i++) {
      if (i >= steps) break;
      vec3 p = ro + rd * t;
      vec3 e; float d;
      sampleCloud(p, e, d);
      float a = 1.0 - exp(-d * dt * 1.3);
      acc += T * e * a;
      T *= 1.0 - a;
      t += dt;
      if (T < 0.015) break;
    }
    vec3 col = acc * uFade;
    float alpha = (1.0 - T) * uFade;
    if (uBand > 0.5) {
      float l = dot(col, vec3(0.3, 0.5, 0.2));
      if (uBand < 1.5) { col = mix(col, vec3(1.0, 0.5, 0.2) * (l * 1.2 + alpha * 0.25 * uStarLum), 0.85); }
      else if (uBand < 2.5) col = mix(col, vec3(0.45, 0.6, 1.0) * l * (0.4 + 1.4 * uIon), 0.85);
      else if (uBand < 3.5) { col = vec3(0.7, 0.55, 1.0) * l * 0.05; alpha *= 0.2; }
      else col = mix(col, vec3(0.45, 1.0, 0.6) * l * 1.2, 0.85);
    }
    if (alpha < 0.003 && max(col.r, max(col.g, col.b)) < 0.003) discard;
    gl_FragColor = vec4(col, alpha);
  }
`;

// ------------------------------------------------------------------ point sprites (shared fragment)
export const ptsFrag = /* glsl */`
  precision highp float;
  varying vec3 vColor; varying float vAlpha;
  ${LOGDEPTH_PARS_FRAG}
  void main() {
    ${LOGDEPTH_FRAG}
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float a = pow(max(1.0 - d, 0.0), 1.8) * vAlpha;
    gl_FragColor = vec4(vColor * a, a);
  }
`;

/** Cloud dust: infall, spin-up and flattening driven by uCollapse (local unit = cloud radius). */
export const dustVert = /* glsl */`
  attribute vec3 aSeed;
  varying vec3 vColor; varying float vAlpha;
  uniform float uCollapse, uRot, uTime, uPxPerUnit, uWorldScale, uPointSize, uStarLum, uSci, uDisperse, uFade, uDiskR;
  uniform vec3 uStarColor;
  ${LOGDEPTH_PARS_VERT}
  void main() {
    float r0 = length(position); vec3 dir = position / max(r0, 1e-6);
    float c = uCollapse;
    float g = smoothstep(0.0, 1.0, c * (1.45 - 1.0 * r0));
    float gs = g * g * (3.0 - 2.0 * g);
    float rT = uDiskR * (0.25 + 0.75 * r0);   // infalling material lands inside the disc
    float r = mix(r0, rT, gs);
    vec3 p = dir * r;
    p.y *= 1.0 - 0.9 * gs;
    float ang = uRot * (0.15 + 0.9 / (r * 30.0 + 0.15)) * g;
    float s = sin(ang), cs = cos(ang); p.xz = mat2(cs, -s, s, cs) * p.xz;
    p += (1.0 - gs) * 0.012 * vec3(sin(uTime * 0.13 + aSeed.x * 6.283), cos(uTime * 0.11 + aSeed.y * 6.283), sin(uTime * 0.09 + aSeed.z * 6.283));
    p *= 1.0 + uDisperse * 0.9 * (1.0 - gs);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float sizeLocal = uPointSize * (0.4 + 1.2 * aSeed.x) * (1.0 - 0.96 * gs);
    gl_PointSize = clamp(sizeLocal * uWorldScale / max(-mv.z, 1e-6) * uPxPerUnit, 1.0, 14.0);
    float illum = uStarLum / (1.0 + r * r * 300.0);
    vec3 cold = vec3(0.5, 0.47, 0.55) * (0.5 + 0.5 * aSeed.y);
    vec3 col = cold * 0.35 + uStarColor * min(illum, 1.5) * 1.3;
    float alpha = (0.10 + 0.22 * aSeed.z) * (1.0 - 0.85 * gs) * uFade * (1.0 - 0.5 * uDisperse * (1.0 - gs));
    if (uSci > 2.5) { float v = clamp(g * (1.0 - g) * 4.0 * c, 0.0, 1.0); col = mix(vec3(0.2, 0.5, 1.0), vec3(1.0, 0.4, 0.15), v) * 1.5; alpha = 0.25 * (1.0 - 0.8 * gs) * uFade; }
    vColor = col; vAlpha = alpha;
    ${LOGDEPTH_VERT}
  }
`;

/** Disc particles: position = (r, phi0, z) → Keplerian rotation (local unit = disc radius). */
export const diskPtsVert = /* glsl */`
  attribute vec3 aSeed;
  varying vec3 vColor; varying float vAlpha;
  uniform float uRot, uDisk, uGap, uClump, uPxPerUnit, uWorldScale, uPointSize, uStarLum, uSci, uFade;
  uniform vec3 uStarColor;
  ${COLOR_UTILS}
  ${CMAPS}
  ${LOGDEPTH_PARS_VERT}
  void main() {
    float r = position.x; float phi0 = position.y; float zf = position.z;
    float om = 0.35 * pow(max(r, 0.02), -1.5);
    float ph = phi0 + om * uRot;
    float h = 0.07 * r * pow(max(r, 0.02), 0.25);
    vec3 p = vec3(r * cos(ph), zf * h, r * sin(ph));
    float vis = 1.0 - smoothstep(0.85 * uDisk, 1.02 * uDisk, r);
    float gap = 1.0 - uGap * exp(-pow((r - 0.42) / 0.05, 2.0));
    float clump = 0.5 + 0.5 * sin(2.0 * phi0 - 9.0 * log(max(r, 0.02)) + aSeed.z * 0.5);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float sizeLocal = uPointSize * (0.5 + aSeed.x) * (0.4 + r);
    gl_PointSize = clamp(sizeLocal * uWorldScale / max(-mv.z, 1e-6) * uPxPerUnit, 1.0, 10.0);
    float tK = 1400.0 * pow(max(r, 0.01), -0.55);
    vec3 hot = blackbody(clamp(tK, 1000.0, 6000.0));
    vec3 cold = vec3(0.5, 0.4, 0.34);
    float hf = smoothstep(0.35, 0.02, r);
    vec3 col = mix(cold * (0.35 + min(uStarLum, 1.5) * 0.6 / (1.0 + r * r * 30.0)), hot * 0.55, hf) * (0.7 + 0.5 * aSeed.y);
    float alpha = vis * gap * (0.08 + 0.2 * aSeed.y) * (0.55 + 0.9 * uClump * clump) * uFade * uDisk;
    if (uSci > 0.5 && uSci < 1.5) col = cmapInferno(clamp(pow(max(r, 0.02), -0.6) * 0.25 * (0.6 + clump * uClump), 0.0, 1.0)) * 1.2;
    else if (uSci > 1.5 && uSci < 2.5) col = cmapTemp(clamp((log(tK) - log(20.0)) / (log(1500.0) - log(20.0)), 0.0, 1.0)) * 1.2;
    else if (uSci > 2.5) col = mix(vec3(0.2, 0.5, 1.0), vec3(1.0, 0.45, 0.15), clamp(om * 0.08, 0.0, 1.0)) * 1.3;
    vColor = col; vAlpha = alpha;
    ${LOGDEPTH_VERT}
  }
`;

// ------------------------------------------------------------------ disc surface
export const diskVert = /* glsl */`
  varying vec3 vP; varying vec3 vNv; varying vec3 vView;
  ${LOGDEPTH_PARS_VERT}
  void main() {
    vP = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNv = normalMatrix * normal; vView = -mv.xyz;
    gl_Position = projectionMatrix * mv;
    ${LOGDEPTH_VERT}
  }
`;
export const diskFrag = /* glsl */`
  precision highp float;
  varying vec3 vP; varying vec3 vNv; varying vec3 vView;
  uniform float uTime, uRot, uDisk, uGap, uClump, uStarLum, uSci, uInnerR, uFade;
  uniform vec3 uStarColor;
  ${HASH}
  ${VALUE_NOISE3D}
  ${COLOR_UTILS}
  ${CMAPS}
  ${LOGDEPTH_PARS_FRAG}
  void main() {
    ${LOGDEPTH_FRAG}
    float r = length(vP.xy);
    float ph = atan(vP.y, vP.x);
    float om = 0.35 * pow(max(r, 0.02), -1.5);
    float a1 = ph - om * uRot;
    vec3 q = vec3(cos(a1) * 3.0, sin(a1) * 3.0, r * 9.0);
    float n = vfbm(q, 4);
    float n2 = vfbm(q * 2.7 + 11.0, 3);
    float arms = 0.5 + 0.5 * sin(2.0 * a1 - 9.0 * log(max(r, 0.02)));
    float sig = (0.55 + 0.7 * n) * (1.0 + uClump * (arms * 0.9 + smoothstep(0.6, 0.85, n2) * 1.2));
    float edgeOut = 1.0 - smoothstep(0.82 * uDisk, 1.02 * uDisk, r);
    float edgeIn = smoothstep(uInnerR, uInnerR * 2.5, r);
    float prof = pow(max(r, 0.02), -0.5) * 0.16;
    float gap = 1.0 - uGap * exp(-pow((r - 0.42) / 0.045, 2.0)) * 0.9;
    float rim = exp(-pow((r - uInnerR * 2.2) / (uInnerR * 1.4), 2.0));
    float d = sig * prof * edgeOut * edgeIn * gap + rim * 0.6 * edgeIn;
    float tK = 1400.0 * pow(max(r, 0.01), -0.55);
    vec3 hot = blackbody(clamp(tK, 1000.0, 6000.0));
    vec3 cold = vec3(0.62, 0.40, 0.26);
    float hf = smoothstep(0.14, 0.01, r);
    vec3 col = mix(cold * (0.22 + min(uStarLum, 1.5) * 0.45 / (1.0 + r * r * 40.0)), hot * 0.5, hf) * (0.3 + 0.8 * n);
    col *= 0.6 + 0.4 * min(uStarLum, 1.0);
    col += rim * uStarColor * 0.35;
    float mu = abs(dot(normalize(vNv), normalize(vView)));
    float alpha = clamp(d * 1.1 * mix(1.5, 1.0, mu), 0.0, 0.7) * uDisk * uFade;
    if (uSci > 0.5 && uSci < 1.5) col = cmapInferno(clamp(d * 1.2, 0.0, 1.0)) * 1.2;
    else if (uSci > 1.5 && uSci < 2.5) col = cmapTemp(clamp((log(tK) - log(20.0)) / (log(1500.0) - log(20.0)), 0.0, 1.0)) * 1.2;
    else if (uSci > 2.5) col = mix(vec3(0.2, 0.5, 1.0), vec3(1.0, 0.45, 0.15), clamp(om * 0.08, 0.0, 1.0)) * 1.2;
    gl_FragColor = vec4(col * alpha, alpha);
  }
`;

// ------------------------------------------------------------------ jets
export const jetVert = /* glsl */`
  varying float vY; varying float vAng; varying vec3 vNv; varying vec3 vView;
  ${LOGDEPTH_PARS_VERT}
  void main() {
    vY = position.y; vAng = atan(position.z, position.x);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNv = normalMatrix * normal; vView = -mv.xyz;
    gl_Position = projectionMatrix * mv;
    ${LOGDEPTH_VERT}
  }
`;
export const jetFrag = /* glsl */`
  precision highp float;
  varying float vY; varying float vAng; varying vec3 vNv; varying vec3 vView;
  uniform float uTime, uJet, uStrength, uSci, uSpeed;
  ${HASH}
  ${VALUE_NOISE3D}
  ${LOGDEPTH_PARS_FRAG}
  void main() {
    ${LOGDEPTH_FRAG}
    float y = vY;
    float len = max(uJet, 1e-3);
    if (y > len) discard;
    float along = y / len;
    float streak = vfbm(vec3(y * 7.0 - uTime * uSpeed, sin(vAng) * 1.5, cos(vAng) * 1.5), 3);
    float k1 = exp(-pow(fract(y * 3.0 - uTime * uSpeed * 0.33) - 0.5, 2.0) * 70.0);
    float k2 = exp(-pow(fract(y * 1.7 - uTime * uSpeed * 0.27 + 0.4) - 0.5, 2.0) * 50.0);
    float knot = k1 * 0.8 + k2 * 0.9;
    float rim = pow(1.0 - abs(dot(normalize(vNv), normalize(vView))), 1.2);
    float b = (0.2 + 0.6 * streak + 2.2 * knot) * (0.12 + 0.88 * rim) * (1.0 - smoothstep(0.75, 1.0, along)) * smoothstep(0.0, 0.05, y);
    vec3 cin = vec3(0.5, 0.78, 1.0);
    vec3 cout = vec3(1.0, 0.45, 0.28);
    vec3 col = mix(cin, cout, smoothstep(0.25, 0.9, along));
    col = mix(col, vec3(0.5, 1.0, 0.6), knot * 0.35 * smoothstep(0.5, 1.0, along));
    float a = clamp(b * uStrength, 0.0, 1.0) * 0.42;
    if (uSci > 2.5) col = vec3(0.3, 0.7, 1.0) * (0.5 + knot);
    gl_FragColor = vec4(col * a, a);
  }
`;
export const jetPtsVert = /* glsl */`
  attribute vec4 aSeed;
  varying vec3 vColor; varying float vAlpha;
  uniform float uTime, uJet, uSpeed, uStrength, uPxPerUnit, uWorldScale, uPointSize, uFade;
  ${LOGDEPTH_PARS_VERT}
  void main() {
    float s = fract(aSeed.x + uTime * uSpeed * (0.05 + 0.04 * aSeed.z));
    float y = s * uJet;
    float spread = (0.02 + 0.16 * s) * aSeed.z;
    vec3 p = vec3(cos(aSeed.y * 6.283) * spread, y * aSeed.w, sin(aSeed.y * 6.283) * spread);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float sizeLocal = uPointSize * (0.3 + 1.2 * s) * (0.5 + aSeed.z);
    gl_PointSize = clamp(sizeLocal * uWorldScale / max(-mv.z, 1e-6) * uPxPerUnit, 1.0, 12.0);
    vColor = mix(vec3(0.7, 0.85, 1.0), vec3(1.0, 0.5, 0.3), smoothstep(0.3, 0.9, s)) * 1.3;
    vAlpha = (1.0 - s * 0.7) * uStrength * uFade * 0.4;
    ${LOGDEPTH_VERT}
  }
`;

// ------------------------------------------------------------------ science overlays
/** Flow arrows: vertex = base + dir·k.x·len + perp·k.y·len·0.25, pulse travelling tail→head. */
export const arrowVert = /* glsl */`
  attribute vec3 aDir; attribute vec3 aPerp; attribute vec2 aK; attribute float aLen;
  varying float vT;
  uniform float uLen;
  ${LOGDEPTH_PARS_VERT}
  void main() {
    float L = aLen * uLen;
    vec3 p = position + aDir * (aK.x * L) + aPerp * (aK.y * L * 0.25);
    vT = aK.x;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    ${LOGDEPTH_VERT}
  }
`;
export const arrowFrag = /* glsl */`
  precision highp float;
  varying float vT;
  uniform float uTime, uAlpha; uniform vec3 uColor;
  ${LOGDEPTH_PARS_FRAG}
  void main() {
    ${LOGDEPTH_FRAG}
    float pulse = smoothstep(0.55, 1.0, fract(vT * 0.85 - uTime * 0.6));
    float b = (0.35 + 0.65 * pulse) * uAlpha;
    gl_FragColor = vec4(uColor * b, b);
  }
`;

/** Expanding ring (ignition shock / wind front). */
export const ringVert = /* glsl */`
  varying vec2 vP;
  ${LOGDEPTH_PARS_VERT}
  void main() {
    vP = position.xy;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    ${LOGDEPTH_VERT}
  }
`;
export const ringFrag = /* glsl */`
  precision highp float;
  varying vec2 vP;
  uniform float uA, uW; uniform vec3 uColor;
  ${LOGDEPTH_PARS_FRAG}
  void main() {
    ${LOGDEPTH_FRAG}
    float r = length(vP);
    float a = exp(-pow((r - 0.86) / uW, 2.0)) * uA * (1.0 - smoothstep(0.9, 1.0, r));
    gl_FragColor = vec4(uColor * a, a);
  }
`;

// ------------------------------------------------------------------ planetary nebula shell (life stages)
export const pnVert = /* glsl */`
  varying vec3 vN; varying vec3 vPos; varying vec3 vView;
  ${LOGDEPTH_PARS_VERT}
  void main() {
    vN = normalMatrix * normal; vPos = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = -mv.xyz;
    gl_Position = projectionMatrix * mv;
    ${LOGDEPTH_VERT}
  }
`;
export const pnFrag = /* glsl */`
  precision highp float;
  varying vec3 vN; varying vec3 vPos; varying vec3 vView;
  uniform float uTime, uA, uAge;
  uniform vec3 uStarColor;
  ${HASH}
  ${VALUE_NOISE3D}
  ${LOGDEPTH_PARS_FRAG}
  void main() {
    ${LOGDEPTH_FRAG}
    vec3 p = normalize(vPos);
    float mu = abs(dot(normalize(vN), normalize(vView)));
    float rim = pow(1.0 - mu, 1.6);
    float n = vfbm(p * 3.5 + uTime * 0.02, 4);
    float fil = pow(max(1.0 - abs(vfbm(p * 7.0 + 11.0, 3) * 2.0 - 1.0), 0.0), 3.0);
    // bipolar waist: denser toward the equator, thinner along the axis (the disc shaped the outflow)
    float waist = 0.55 + 0.45 * (1.0 - abs(p.y));
    vec3 teal = vec3(0.35, 0.95, 0.75), red = vec3(1.0, 0.36, 0.28), blue = vec3(0.55, 0.7, 1.0);
    vec3 col = mix(teal, red, smoothstep(0.45, 0.8, n)) * (0.6 + 0.8 * fil) + blue * rim * 0.4;
    float a = (0.12 + 0.88 * rim) * (0.35 + 0.65 * n) * waist * uA;
    gl_FragColor = vec4(col * a * 1.3, a);
  }
`;
