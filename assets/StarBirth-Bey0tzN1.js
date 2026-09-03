import{$i as e,A as t,Ar as n,Gi as r,In as i,L as a,Lt as o,Pr as s,Qr as c,Qt as l,Rt as u,U as d,Ur as f,V as p,_a as m,co as h,ct as g,eo as _,er as ee,ft as v,gr as y,ir as b,j as x,nr as S,qt as C,rr as w,to as T,ua as E,va as D}from"./three.core-CpYT6u8q.js";import{t as O}from"./EventBus-DzLmJ1Bg.js";import{D as k,E as A,d as j,f as te,g as M,k as ne,m as re,t as ie,u as ae}from"./Units-BKhzcXK2.js";import{d as oe,f as N,g as P,h as F,i as I,m as L,n as R,p as z,r as se,v as B,y as ce}from"./index-B3A8vEkd.js";import{t as le}from"./Sun-Dy3gZgsD.js";import{c as V,d as H,i as ue,n as de,o as U,s as W,t as G,u as fe}from"./StarBirthData-BI5m0oQ3.js";var K=`
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
`,pe=`
  varying vec3 vViewDir;
  ${F}
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewDir = mv.xyz;
    gl_Position = projectionMatrix * mv;
    ${P}
  }
`,me=`
  precision highp float;
  varying vec3 vViewDir;
  uniform mat3 uCamToLocal;
  uniform vec3 uCamLocal;
  uniform float uTime, uSeed, uCollapse, uCavity, uDisperse, uStarLum, uIon, uSci, uFade, uBand, uInner, uExt;
  uniform vec3 uStarColor, uExtDir;
  uniform vec4 uSib[3];
  uniform int uSteps;
  ${N}
  ${B}
  ${K}
  ${L}
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
    ${z}
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
`,q=`
  precision highp float;
  varying vec3 vColor; varying float vAlpha;
  ${L}
  void main() {
    ${z}
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float a = pow(max(1.0 - d, 0.0), 1.8) * vAlpha;
    gl_FragColor = vec4(vColor * a, a);
  }
`,he=`
  attribute vec3 aSeed;
  varying vec3 vColor; varying float vAlpha;
  uniform float uCollapse, uRot, uTime, uPxPerUnit, uWorldScale, uPointSize, uStarLum, uSci, uDisperse, uFade, uDiskR;
  uniform vec3 uStarColor;
  ${F}
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
    ${P}
  }
`,ge=`
  attribute vec3 aSeed;
  varying vec3 vColor; varying float vAlpha;
  uniform float uRot, uDisk, uGap, uClump, uPxPerUnit, uWorldScale, uPointSize, uStarLum, uSci, uFade;
  uniform vec3 uStarColor;
  ${oe}
  ${K}
  ${F}
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
    ${P}
  }
`,_e=`
  varying vec3 vP; varying vec3 vNv; varying vec3 vView;
  ${F}
  void main() {
    vP = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNv = normalMatrix * normal; vView = -mv.xyz;
    gl_Position = projectionMatrix * mv;
    ${P}
  }
`,ve=`
  precision highp float;
  varying vec3 vP; varying vec3 vNv; varying vec3 vView;
  uniform float uTime, uRot, uDisk, uGap, uClump, uStarLum, uSci, uInnerR, uFade;
  uniform vec3 uStarColor;
  ${N}
  ${B}
  ${oe}
  ${K}
  ${L}
  void main() {
    ${z}
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
`,ye=`
  varying float vY; varying float vAng; varying vec3 vNv; varying vec3 vView;
  ${F}
  void main() {
    vY = position.y; vAng = atan(position.z, position.x);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNv = normalMatrix * normal; vView = -mv.xyz;
    gl_Position = projectionMatrix * mv;
    ${P}
  }
`,be=`
  precision highp float;
  varying float vY; varying float vAng; varying vec3 vNv; varying vec3 vView;
  uniform float uTime, uJet, uStrength, uSci, uSpeed;
  ${N}
  ${B}
  ${L}
  void main() {
    ${z}
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
`,xe=`
  attribute vec4 aSeed;
  varying vec3 vColor; varying float vAlpha;
  uniform float uTime, uJet, uSpeed, uStrength, uPxPerUnit, uWorldScale, uPointSize, uFade;
  ${F}
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
    ${P}
  }
`,Se=`
  attribute vec3 aDir; attribute vec3 aPerp; attribute vec2 aK; attribute float aLen;
  varying float vT;
  uniform float uLen;
  ${F}
  void main() {
    float L = aLen * uLen;
    vec3 p = position + aDir * (aK.x * L) + aPerp * (aK.y * L * 0.25);
    vT = aK.x;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    ${P}
  }
`,Ce=`
  precision highp float;
  varying float vT;
  uniform float uTime, uAlpha; uniform vec3 uColor;
  ${L}
  void main() {
    ${z}
    float pulse = smoothstep(0.55, 1.0, fract(vT * 0.85 - uTime * 0.6));
    float b = (0.35 + 0.65 * pulse) * uAlpha;
    gl_FragColor = vec4(uColor * b, b);
  }
`,we=`
  varying vec2 vP;
  ${F}
  void main() {
    vP = position.xy;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    ${P}
  }
`,Te=`
  precision highp float;
  varying vec2 vP;
  uniform float uA, uW; uniform vec3 uColor;
  ${L}
  void main() {
    ${z}
    float r = length(vP);
    float a = exp(-pow((r - 0.86) / uW, 2.0)) * uA * (1.0 - smoothstep(0.9, 1.0, r));
    gl_FragColor = vec4(uColor * a, a);
  }
`,Ee=`
  varying vec3 vN; varying vec3 vPos; varying vec3 vView;
  ${F}
  void main() {
    vN = normalMatrix * normal; vPos = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = -mv.xyz;
    gl_Position = projectionMatrix * mv;
    ${P}
  }
`,De=`
  precision highp float;
  varying vec3 vN; varying vec3 vPos; varying vec3 vView;
  uniform float uTime, uA, uAge;
  uniform vec3 uStarColor;
  ${N}
  ${B}
  ${L}
  void main() {
    ${z}
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
`,Oe=class{constructor(t,n,r){this.variables=[],this.currentTextureIndex=0;let i=u,a={passThruTexture:{value:null}},o=d(p(),a),s=new ce(o);this.setDataType=function(e){return i=e,this},this.addVariable=function(e,t,n){let r={name:e,initialValueTexture:n,material:this.createShaderMaterial(t),dependencies:null,renderTargets:[],wrapS:null,wrapT:null,minFilter:y,magFilter:y};return this.variables.push(r),r},this.setVariableDependencies=function(e,t){e.dependencies=t},this.init=function(){if(r.capabilities.maxVertexTextures===0)return`No support for vertex shader textures.`;for(let e=0;e<this.variables.length;e++){let r=this.variables[e];r.renderTargets[0]=this.createRenderTarget(t,n,r.wrapS,r.wrapT,r.minFilter,r.magFilter),r.renderTargets[1]=this.createRenderTarget(t,n,r.wrapS,r.wrapT,r.minFilter,r.magFilter),this.renderTexture(r.initialValueTexture,r.renderTargets[0]),this.renderTexture(r.initialValueTexture,r.renderTargets[1]);let i=r.material,a=i.uniforms;if(r.dependencies!==null)for(let e=0;e<r.dependencies.length;e++){let t=r.dependencies[e];if(t.name!==r.name){let e=!1;for(let n=0;n<this.variables.length;n++)if(t.name===this.variables[n].name){e=!0;break}if(!e)return`Variable dependency not found. Variable=`+r.name+`, dependency=`+t.name}a[t.name]={value:null},i.fragmentShader=`
uniform sampler2D `+t.name+`;
`+i.fragmentShader}}return this.currentTextureIndex=0,null},this.compute=function(){let e=this.currentTextureIndex,t=+(this.currentTextureIndex===0);for(let n=0,r=this.variables.length;n<r;n++){let r=this.variables[n];if(r.dependencies!==null){let t=r.material.uniforms;for(let n=0,i=r.dependencies.length;n<i;n++){let i=r.dependencies[n];t[i.name].value=i.renderTargets[e].texture}}this.doRenderTarget(r.material,r.renderTargets[t])}this.currentTextureIndex=t},this.getCurrentRenderTarget=function(e){return e.renderTargets[this.currentTextureIndex]},this.getAlternateRenderTarget=function(e){return e.renderTargets[+(this.currentTextureIndex===0)]},this.dispose=function(){s.dispose();let e=this.variables;for(let t=0;t<e.length;t++){let n=e[t];n.initialValueTexture&&n.initialValueTexture.dispose();let r=n.renderTargets;for(let e=0;e<r.length;e++)r[e].dispose();n.material.dispose()}};function l(e){e.defines.resolution=`vec2( `+t.toFixed(1)+`, `+n.toFixed(1)+` )`}this.addResolutionDefine=l;function d(t,n){n||={};let r=new e({name:`GPUComputationShader`,uniforms:n,vertexShader:f(),fragmentShader:t});return l(r),r}this.createShaderMaterial=d,this.createRenderTarget=function(e,r,a,o,s,l){return e||=t,r||=n,a||=1001,o||=1001,s||=1003,l||=1003,new h(e,r,{wrapS:a,wrapT:o,minFilter:s,magFilter:l,format:c,type:i,depthBuffer:!1})},this.createTexture=function(){let e=new Float32Array(t*n*4),r=new v(e,t,n,c,u);return r.needsUpdate=!0,r},this.renderTexture=function(e,t){a.passThruTexture.value=e,this.doRenderTarget(o,t),a.passThruTexture.value=null},this.doRenderTarget=function(e,t){let n=r.getRenderTarget(),i=r.xr.enabled,a=r.shadowMap.autoUpdate;r.xr.enabled=!1,r.shadowMap.autoUpdate=!1,s.material=e,r.setRenderTarget(t),s.render(r),s.material=o,r.xr.enabled=i,r.shadowMap.autoUpdate=a,r.setRenderTarget(n)};function f(){return`void main()	{

	gl_Position = vec4( position, 1.0 );

}
`}function p(){return`uniform sampler2D passThruTexture;

void main() {

	vec2 uv = gl_FragCoord.xy / resolution.xy;

	gl_FragColor = texture2D( passThruTexture, uv );

}
`}}},ke=`
vec3 respawnPos(float seed, float t) {
  vec3 h = hash33(vec3(seed * 91.7 + 1.3, floor(t * 60.0) * 0.137 + seed, seed * 3.3 + 7.1));
  float z = h.x * 2.0 - 1.0, ph = h.y * 6.2831853; float s = sqrt(max(1.0 - z * z, 0.0));
  return vec3(s * cos(ph), z * 0.85, s * sin(ph)) * (0.72 + 0.28 * h.z);
}`,Ae=`
  uniform float uDt, uG, uMstar, uMcloud, uTrigger, uDisk, uRdisk, uDrag, uWind, uAccR, uTime, uTurb, uSpin, uVmax, uOmegaMax;
  ${N}
  ${ke}
  void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 p4 = texture2D(tPos, uv); vec3 p = p4.xyz; float seed = p4.w;
    vec4 v4 = texture2D(tVel, uv); vec3 v = v4.xyz;
    float r = length(p);
    if (r < uAccR || r > 1.8) {
      vec3 np = respawnPos(seed, uTime);
      vec3 tg = cross(vec3(0.0, 1.0, 0.0), np);
      gl_FragColor = vec4(tg * uSpin * 0.9, v4.w); return;
    }
    vec3 rhat = p / max(r, 1e-5);
    float soft = 0.35 * uRdisk;
    float r2 = r * r + soft * soft;
    float Menc = uMstar + uMcloud * clamp(r, 0.0, 1.0);
    vec3 g = -rhat * uG * Menc / r2;
    // before the collapse is triggered, thermal / turbulent / magnetic support balances gravity
    vec3 a = g * uTrigger;
    vec3 tn = vec3(hash13(p * 7.0 + uTime * 0.05), hash13(p * 7.0 + 31.0 + uTime * 0.05), hash13(p * 7.0 + 71.0 + uTime * 0.05)) - 0.5;
    a += tn * uTurb;
    // disc: gas drag toward the Keplerian flow near the midplane (viscous settling)
    vec3 tg = cross(vec3(0.0, 1.0, 0.0), rhat);
    float tl = length(tg); tg = tl > 1e-4 ? tg / tl : vec3(1.0, 0.0, 0.0);
    float vk = sqrt(uG * max(uMstar, 0.02) / sqrt(r2));
    float vt = min(vk, min(uVmax, uOmegaMax * r));
    vec3 vTarget = tg * vt;
    float rc = length(p.xz);
    float h = 0.08 * max(rc, 0.002) * pow(max(rc / max(uRdisk, 1e-4), 0.02), 0.25);
    float inPlane = exp(-p.y * p.y / (h * h));
    float discW = uDisk * inPlane * smoothstep(uRdisk * 1.6, uRdisk * 0.6, r);
    v += (vTarget - v) * (1.0 - exp(-uDrag * discW * uDt));
    float settle = uDisk * smoothstep(uRdisk * 2.5, uRdisk * 0.5, r);
    v.y *= exp(-settle * 2.5 * uDt);
    a.y -= p.y * settle * 60.0;
    // winds (young star, then giant / planetary-nebula phase) push the envelope outward
    a += rhat * uWind * (1.0 - discW) * smoothstep(0.0, 0.1, r);
    v += a * uDt;
    float sp = length(v); if (sp > 6.0) v *= 6.0 / sp;
    gl_FragColor = vec4(v, v4.w);
  }
`,je=`
  uniform float uDt, uAccR, uTime;
  ${N}
  ${ke}
  void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 p4 = texture2D(tPos, uv); vec4 v4 = texture2D(tVel, uv);
    vec3 p = p4.xyz; float r = length(p);
    if (r < uAccR || r > 1.8) { gl_FragColor = vec4(respawnPos(p4.w, uTime), p4.w); return; }
    p += v4.xyz * uDt;
    gl_FragColor = vec4(p, p4.w);
  }
`,Me=`
  uniform sampler2D tPos, tVel;
  uniform float uPxPerUnit, uWorldScale, uPointSize, uStarLum, uSci, uFade, uRdisk;
  uniform vec3 uStarColor;
  varying vec3 vColor; varying float vAlpha;
  ${F}
  void main() {
    vec4 p4 = texture2D(tPos, position.xy); vec3 p = p4.xyz;
    vec4 v4 = texture2D(tVel, position.xy);
    float r = length(p); float seed = fract(p4.w * 7.31);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float near = smoothstep(uRdisk * 4.0, uRdisk * 0.5, r);
    float sizeLocal = uPointSize * (0.5 + 1.0 * seed) * (1.0 - 0.85 * near);
    gl_PointSize = clamp(sizeLocal * uWorldScale / max(-mv.z, 1e-6) * uPxPerUnit, 1.0, 12.0);
    float illum = uStarLum / (1.0 + r * r * 300.0);
    vec3 cold = vec3(0.5, 0.47, 0.55) * (0.5 + 0.5 * v4.w);
    vec3 col = cold * 0.35 + uStarColor * min(illum, 1.5) * 1.3;
    float alpha = (0.10 + 0.22 * seed) * (1.0 - 0.7 * near) * uFade;
    if (uSci > 2.5) {
      vec3 v = v4.xyz; float sp = length(v);
      float radial = -dot(v / max(sp, 1e-5), p / max(r, 1e-5));
      col = mix(vec3(1.0, 0.45, 0.15), vec3(0.25, 0.55, 1.0), clamp(radial * 0.5 + 0.5, 0.0, 1.0)) * (0.6 + 2.0 * min(sp, 1.5));
      alpha = 0.16 * uFade;
    }
    vColor = col; vAlpha = alpha;
    ${P}
  }
`,Ne=class{constructor(e,t){this.ok=!1;let n=Math.max(32,Math.round(Math.sqrt(t)/16)*16);this.W=this.H=n,this.count=n*n;try{let t=this.gpu=new Oe(n,n,e),r=t.createTexture(),i=t.createTexture();this._fill(r.image.data,i.image.data),this.pos0=r,this.vel0=i,this.posVar=t.addVariable(`tPos`,je,r),this.velVar=t.addVariable(`tVel`,Ae,i),t.setVariableDependencies(this.posVar,[this.posVar,this.velVar]),t.setVariableDependencies(this.velVar,[this.posVar,this.velVar]),(e=>{for(let t of Object.keys(e))this.posVar.material.uniforms[t]={value:e[t]},this.velVar.material.uniforms[t]={value:e[t]}})({uDt:.005,uG:1,uMstar:0,uMcloud:1,uTrigger:0,uDisk:0,uRdisk:.009,uDrag:6,uWind:0,uAccR:.001,uTime:0,uTurb:.15,uSpin:.25,uVmax:1.6,uOmegaMax:300});for(let e of[this.posVar,this.velVar])e.wrapS=e.wrapT=p,e.minFilter=e.magFilter=y;let a=t.init();if(a){console.warn(`[starbirth] GPU particle sim unavailable:`,a);return}this.ok=!0,this.uPos=this.posVar.material.uniforms,this.uVel=this.velVar.material.uniforms}catch(e){console.warn(`[starbirth] GPU particle sim unavailable:`,e)}}_fill(e,t){let n=this.count;for(let r=0;r<n;r++){let n=.12+.88*Math.random()**.55,i=Math.random()*2-1,a=Math.random()*Math.PI*2,o=Math.sqrt(1-i*i),s=o*Math.cos(a)*n,c=i*.85*n,l=o*Math.sin(a)*n;e[r*4]=s,e[r*4+1]=c,e[r*4+2]=l,e[r*4+3]=Math.random();let u=.25;t[r*4]=-l*u+(Math.random()-.5)*.03,t[r*4+1]=(Math.random()-.5)*.03,t[r*4+2]=s*u+(Math.random()-.5)*.03,t[r*4+3]=Math.random()}}reset(){if(!this.ok)return;let e=this.gpu;e.renderTexture(this.pos0,e.getCurrentRenderTarget(this.posVar)),e.renderTexture(this.pos0,e.getAlternateRenderTarget(this.posVar)),e.renderTexture(this.vel0,e.getCurrentRenderTarget(this.velVar)),e.renderTexture(this.vel0,e.getAlternateRenderTarget(this.velVar))}setParams(e){if(this.ok)for(let t of Object.keys(e))this.uPos[t]&&(this.uPos[t].value=e[t]),this.uVel[t]&&(this.uVel[t].value=e[t])}step(e,t,n=30){if(!this.ok||e<=0)return;let r=Math.min(n,Math.max(1,Math.ceil(e/.008))),i=e/r;for(let e=0;e<r;e++)this.uPos.uDt.value=i,this.uVel.uDt.value=i,this.uPos.uTime.value=t+e*i,this.uVel.uTime.value=t+e*i,this.gpu.compute()}get posTexture(){return this.gpu.getCurrentRenderTarget(this.posVar).texture}get velTexture(){return this.gpu.getCurrentRenderTarget(this.velVar).texture}makeGeometry(){let e=new Float32Array(this.count*3);for(let t=0;t<this.H;t++)for(let n=0;n<this.W;n++){let r=(t*this.W+n)*3;e[r]=(n+.5)/this.W,e[r+1]=(t+.5)/this.H,e[r+2]=0}let n=new x;return n.setAttribute(`position`,new t(e,3)),n.boundingSphere=new E(new _,2),n}},Pe={giant:1e10,supernova:1e6,dwarf:1e11,brown:1e11},J=re*ae,Y=[new _(.42,.18,-.35),new _(-.5,-.1,.22),new _(.15,-.45,.48)],X=(e,t,n)=>ne(e,t,n),Fe={low:.35,medium:.6,high:1,ultra:1.4};function Ie(e){let t=M(e,1e3,4e4)/100,n,r,i;return t<=66?(n=1,r=M((99.4708025861*Math.log(t)-161.1195681661)/255,0,1)):(n=M(329.698727446*(t-60)**-.1332047592/255,0,1),r=M(288.1221695283*(t-60)**-.0755148492/255,0,1)),i=t>=66?1:t<=19?0:M((138.5177312231*Math.log(t-10)-305.0447927307)/255,0,1),new d(n*n,r*r,i*i)}function Z(e=`rgba(255,255,255,1)`,t=`rgba(255,225,190,0.55)`,n=.2){let r=document.createElement(`canvas`);r.width=r.height=128;let i=r.getContext(`2d`),o=i.createRadialGradient(64,64,0,64,64,64);return o.addColorStop(0,e),o.addColorStop(n,t),o.addColorStop(.55,`rgba(255,200,160,0.12)`),o.addColorStop(1,`rgba(0,0,0,0)`),i.fillStyle=o,i.fillRect(0,0,128,128),new a(r)}function Q(e){let t=e.length,n=e.map(e=>e[0]),r=e.map(e=>e[1]),i=[],a=Array(t);for(let e=0;e<t-1;e++)i.push((r[e+1]-r[e])/(n[e+1]-n[e]));a[0]=i[0],a[t-1]=i[t-2];for(let e=1;e<t-1;e++){if(i[e-1]*i[e]<=0){a[e]=0;continue}let t=n[e]-n[e-1],r=n[e+1]-n[e];a[e]=3*(t+r)/((2*r+t)/i[e-1]+(r+2*t)/i[e])}return e=>{if(e<=n[0])return r[0];if(e>=n[t-1])return r[t-1];let i=0;for(;e>n[i+1];)i++;let o=n[i+1]-n[i],s=(e-n[i])/o,c=s*s,l=c*s;return(2*l-3*c+1)*r[i]+(l-2*c+s)*o*a[i]+(-2*l+3*c)*r[i+1]+(l-c)*o*a[i+1]}}var $=e=>{let t=Q(e.map(([e,t])=>[e,Math.log(t)]));return e=>Math.exp(t(e))},Le=class{constructor(e){this.ctx=e,this.engine=e.engine,this.registry=e.registry,this.cameraCtl=e.cameraCtl,this.time=e.time,this.active=!1,this.u=0,this.speed=1,this.paused=!1,this.mode=`normal`,this.layer=0,this.tour=!1,this.rot=0,this.jetClock=0,this.simT=0,this._flash=0,this._shake=0,this._ignited=!1,this._eventIdx=-1,this._phase=-1,this._ringT=99,this._snStarted=!1,this._simSyncAt=-1,this.m=ue.solar,this.massKey=`solar`;let t=k(83.82,-5.39).multiplyScalar(1344*j),n=new _().crossVectors(t.clone().normalize(),new _(0,1,0)).normalize();this.site=t.clone().addScaledVector(n,30*j).addScaledVector(new _(0,1,0),-14*j),this.axis=new _(.25,1,-.18).normalize(),this.tilt=new f().setFromUnitVectors(new _(0,1,0),this.axis),this.tiltInv=this.tilt.clone().invert(),this._orionDir=t.clone().sub(this.site).normalize().applyQuaternion(this.tiltInv),this._v=new _,this._v2=new _,this._v3=new _,this._m3=new S,this._m3b=new S,this._m4=new w,this._build(),this._registry(),this.setMass(`solar`),this._params(),O.on(`starbirth:start`,e=>this.start(e||{})),O.on(`starbirth:stop`,()=>this.stop()),O.on(`starbirth:focus`,()=>this.focus()),O.on(`escape`,()=>{this.active&&(this.tour?this.stopTour(!1):this.stop())}),O.on(`observatory:changed`,e=>{this._band=e}),this._band=`visible`,new URLSearchParams(location.search).has(`starbirth`)&&setTimeout(()=>this.start({tour:new URLSearchParams(location.search).get(`starbirth`)===`tour`}),1500)}_build(){let i=Fe[this.engine.qualityName]||.6,a={transparent:!0,depthWrite:!1,blending:5,blendSrc:201,blendDst:205,blendSrcAlpha:201,blendDstAlpha:205},o={transparent:!0,depthWrite:!1,blending:5,blendSrc:201,blendDst:201,blendSrcAlpha:201,blendDstAlpha:201};this.root=new C,this.root.position.copy(this.site),this.root.quaternion.copy(this.tilt),this.root.visible=!1,this.engine.scene.add(this.root),this.cloudRoot=new C,this.cloudRoot.position.copy(this.site),this.cloudRoot.quaternion.copy(this.tilt),this.cloudRoot.visible=!1,this.engine.volScene.add(this.cloudRoot),this.cloudMat=new e({uniforms:{uCamToLocal:{value:new S},uCamLocal:{value:new _},uTime:{value:0},uSeed:{value:3.7},uSteps:{value:32},uCollapse:{value:0},uCavity:{value:0},uDisperse:{value:0},uStarLum:{value:0},uIon:{value:0},uSci:{value:0},uFade:{value:1},uBand:{value:0},uInner:{value:.01},uExt:{value:.9},uStarColor:{value:new d(1,.8,.6)},uExtDir:{value:new _(0,0,1)},uSib:{value:[new T,new T,new T]}},vertexShader:pe,fragmentShader:me,...a,depthTest:!1,side:1}),this.cloud=new b(new l(1,3),this.cloudMat),this.cloud.renderOrder=39,this.cloud.frustumCulled=!1,this.cloudRoot.add(this.cloud),this.gDust=new C,this.gDisk=new C,this.gJet=new C,this.gStar=new C,this.gFx=new C;for(let e of[this.gDust,this.gDisk,this.gJet,this.gStar,this.gFx])this.root.add(e);let c=Math.round(3e4*i);{let n=new Float32Array(c*3),r=new Float32Array(c*3);for(let e=0;e<c;e++){let t=.06+.94*Math.random()**.5,i=Math.random()*2-1,a=Math.random()*Math.PI*2,o=Math.sqrt(1-i*i),s=o*Math.cos(a),c=i,l=o*Math.sin(a);n[e*3]=s*t,n[e*3+1]=c*t*.85,n[e*3+2]=l*t,r[e*3]=Math.random(),r[e*3+1]=Math.random(),r[e*3+2]=Math.random()}let i=new x;i.setAttribute(`position`,new t(n,3)),i.setAttribute(`aSeed`,new t(r,3)),i.boundingSphere=new E(new _,2),this.dustMat=new e({uniforms:{uCollapse:{value:0},uRot:{value:0},uTime:{value:0},uPxPerUnit:{value:800},uWorldScale:{value:1},uPointSize:{value:.007},uStarLum:{value:0},uSci:{value:0},uDisperse:{value:0},uFade:{value:1},uDiskR:{value:.009},uStarColor:{value:new d(1,.8,.6)}},vertexShader:he,fragmentShader:q,...o}),this.dust=new s(i,this.dustMat),this.dust.renderOrder=61,this.dust.frustumCulled=!1,this.gDust.add(this.dust)}this.sim=new Ne(this.engine.renderer,Math.round(65536*Math.min(i,1))),this.sim.ok&&(this.simMat=new e({uniforms:{tPos:{value:null},tVel:{value:null},uPxPerUnit:{value:800},uWorldScale:{value:1},uPointSize:{value:.0075},uStarLum:{value:0},uSci:{value:0},uFade:{value:1},uRdisk:{value:.009},uStarColor:{value:new d(1,.8,.6)}},vertexShader:Me,fragmentShader:q,...o}),this.simPts=new s(this.sim.makeGeometry(),this.simMat),this.simPts.renderOrder=61,this.simPts.frustumCulled=!1,this.gDust.add(this.simPts),this.dust.visible=!1),this.sibTex=Z(`rgba(255,245,225,1)`,`rgba(255,200,150,0.5)`,.18),this.sibs=Y.map(e=>{let t=new m(new D({map:this.sibTex,transparent:!0,blending:2,depthWrite:!1,opacity:0}));return t.position.copy(e),t.scale.setScalar(.035),t.renderOrder=70,this.gDust.add(t),t}),this.diskMat=new e({uniforms:{uTime:{value:0},uRot:{value:0},uDisk:{value:0},uGap:{value:0},uClump:{value:0},uStarLum:{value:0},uSci:{value:0},uInnerR:{value:.01},uFade:{value:1},uStarColor:{value:new d(1,.8,.6)}},vertexShader:_e,fragmentShader:ve,...a,side:2}),this.disk=new b(new r(.004,1,160,24),this.diskMat),this.disk.rotation.x=Math.PI/2,this.disk.renderOrder=60,this.disk.frustumCulled=!1,this.gDisk.add(this.disk);let u=Math.round(24e3*i);{let n=new Float32Array(u*3),r=new Float32Array(u*3);for(let e=0;e<u;e++){let t=Math.max(.012,Math.random()**.75),i=Math.sqrt(-2*Math.log(Math.max(Math.random(),1e-6)))*Math.cos(2*Math.PI*Math.random());n[e*3]=t,n[e*3+1]=Math.random()*Math.PI*2,n[e*3+2]=M(i,-2.5,2.5),r[e*3]=Math.random(),r[e*3+1]=Math.random(),r[e*3+2]=Math.random()}let i=new x;i.setAttribute(`position`,new t(n,3)),i.setAttribute(`aSeed`,new t(r,3)),i.boundingSphere=new E(new _,2),this.diskPtsMat=new e({uniforms:{uRot:{value:0},uDisk:{value:0},uGap:{value:0},uClump:{value:0},uPxPerUnit:{value:800},uWorldScale:{value:1},uPointSize:{value:.006},uStarLum:{value:0},uSci:{value:0},uFade:{value:1},uStarColor:{value:new d(1,.8,.6)}},vertexShader:ge,fragmentShader:q,...o}),this.diskPts=new s(i,this.diskPtsMat),this.diskPts.renderOrder=62,this.diskPts.frustumCulled=!1,this.gDisk.add(this.diskPts)}this.ringMat=new e({uniforms:{uA:{value:0},uW:{value:.1},uColor:{value:new d(1,.9,.7)}},vertexShader:we,fragmentShader:Te,...o,side:2}),this.ring=new b(new n(2,2),this.ringMat),this.ring.rotation.x=Math.PI/2,this.ring.renderOrder=63,this.ring.visible=!1,this.ring.frustumCulled=!1,this.gDisk.add(this.ring);let f=new g(.075,.008,1,48,24,!0);f.translate(0,.5,0),this.jetMat=new e({uniforms:{uTime:{value:0},uJet:{value:0},uStrength:{value:0},uSci:{value:0},uSpeed:{value:.5}},vertexShader:ye,fragmentShader:be,...o,side:2}),this.jetN=new b(f,this.jetMat),this.jetS=new b(f,this.jetMat),this.jetS.scale.y=-1;for(let e of[this.jetN,this.jetS])e.renderOrder=64,e.frustumCulled=!1,this.gJet.add(e);this.hhTex=Z(`rgba(255,235,210,1)`,`rgba(255,150,90,0.6)`,.25),this.hh=[1,-1].map(e=>{let t=new m(new D({map:this.hhTex,transparent:!0,blending:2,depthWrite:!1,opacity:0,color:new d(1,.75,.55)}));return t.userData.sign=e,t.scale.set(.16,.11,1),t.renderOrder=71,this.gJet.add(t),t});let p=Math.round(9e3*i);{let n=new Float32Array(p*4),r=new Float32Array(p*3);for(let e=0;e<p;e++)n[e*4]=Math.random(),n[e*4+1]=Math.random(),n[e*4+2]=Math.random(),n[e*4+3]=e%2?1:-1;let i=new x;i.setAttribute(`position`,new t(r,3)),i.setAttribute(`aSeed`,new t(n,4)),i.boundingSphere=new E(new _,2),this.jetPtsMat=new e({uniforms:{uTime:{value:0},uJet:{value:0},uSpeed:{value:.5},uStrength:{value:0},uPxPerUnit:{value:800},uWorldScale:{value:1},uPointSize:{value:.012},uFade:{value:1}},vertexShader:xe,fragmentShader:q,...o}),this.jetPts=new s(i,this.jetPtsMat),this.jetPts.renderOrder=65,this.jetPts.frustumCulled=!1,this.gJet.add(this.jetPts)}this.star=new le({radius:1,temp:3600,intensity:2.6}),this.gStar.add(this.star.group),this.pnMat=new e({uniforms:{uTime:{value:0},uA:{value:0},uAge:{value:0},uStarColor:{value:new d(1,1,1)}},vertexShader:Ee,fragmentShader:De,...a,side:2}),this.pn=new b(new l(1,4),this.pnMat),this.pn.renderOrder=66,this.pn.visible=!1,this.pn.frustumCulled=!1,this.gFx.add(this.pn),this.glowTex=Z(),this.glow=new m(new D({map:this.glowTex,transparent:!0,blending:2,depthWrite:!1,opacity:0})),this.glow.renderOrder=72,this.gFx.add(this.glow),this.glowCore=new m(new D({map:this.glowTex,transparent:!0,blending:2,depthWrite:!1,opacity:0})),this.glowCore.renderOrder=73,this.gFx.add(this.glowCore),this.arrows=this._makeArrows(Math.round(260*Math.max(i,.5)),`infall`),this.gDust.add(this.arrows),this.balance=new C,this.gStar.add(this.balance),this.gravArrows=this._makeArrows(14,`in`),this.pressArrows=this._makeArrows(14,`out`),this.balance.add(this.gravArrows),this.balance.add(this.pressArrows),this.balance.visible=!1,this.arrows.visible=!1,this._abBase=this.engine.finalPass.uniforms.uAberration?this.engine.finalPass.uniforms.uAberration.value:0}_makeArrows(t,n){let r=[],a=[],s=[],c=[],l=[],u=(e,t,n,i,o,u)=>{r.push(e.x,e.y,e.z),a.push(t.x,t.y,t.z),s.push(n.x,n.y,n.z),l.push(i),c.push(o,u)};for(let e=0;e<t;e++){let r,i,a;if(n===`infall`){let e=.14+.8*Math.random()**.7,t=Math.random()*2-1,n=Math.random()*Math.PI*2,o=Math.sqrt(1-t*t),s=new _(o*Math.cos(n),t*.85,o*Math.sin(n)).normalize();r=s.clone().multiplyScalar(e),i=s.clone().negate(),a=M(.012/(e*e),.05,.2)}else{let o=e/t*Math.PI*2,s=new _(Math.cos(o),Math.sin(o),0);n===`in`?(r=s.clone().multiplyScalar(2.2),i=s.clone().negate()):(r=s.clone().multiplyScalar(1.12),i=s.clone()),a=.6}let o=new _().crossVectors(i,Math.abs(i.y)<.9?new _(0,1,0):new _(1,0,0)).normalize();n!==`infall`&&o.set(0,0,1).cross(i).normalize(),u(r,i,o,a,0,0),u(r,i,o,a,1,0),u(r,i,o,a,1,0),u(r,i,o,a,.72,1),u(r,i,o,a,1,0),u(r,i,o,a,.72,-1)}let f=new x;f.setAttribute(`position`,new o(r,3)),f.setAttribute(`aDir`,new o(a,3)),f.setAttribute(`aPerp`,new o(s,3)),f.setAttribute(`aK`,new o(c,2)),f.setAttribute(`aLen`,new o(l,1)),f.boundingSphere=new E(new _,4);let p=n===`in`?new d(1,.45,.3):n===`out`?new d(.45,.75,1):new d(.55,.85,1),m=new e({uniforms:{uTime:{value:0},uAlpha:{value:0},uLen:{value:1},uColor:{value:p}},vertexShader:Se,fragmentShader:Ce,transparent:!0,depthWrite:!1,blending:5,blendSrc:201,blendDst:201}),h=new i(f,m);return h.renderOrder=80,h.frustumCulled=!1,h}_registry(){let e=this,t=(e,t)=>W[e][t].es;this.obj=this.registry.add({id:`starbirth`,name:`Birth of a Star (simulation)`,kind:`starbirth`,aliases:[`star formation`,`star birth`,`protostar`,`stellar nursery`,`formación estelar`,`nacimiento de una estrella`,`protoestrella`,`vivero estelar`],color:`#ffc48a`,priority:6,provenance:`simulated`,axis:this.axis,approachElevation:.3,labelRange:[0,1e30],get radius(){return e.P?Math.max(e.P.R,1):1},getPosition(t){return t.copy(e.site)},labelAlpha:t=>M((t-e.Sd*3)/(e.Sd*6),0,1),subtitle:`Interactive simulation · Orion complex, 1,350 light-years away`,description:`Watch a star being born: a cold molecular cloud collapses under its own gravity into a protostar, grows a planet-forming disc, launches bipolar jets and finally ignites hydrogen fusion. Pause, accelerate, rewind, switch to a scientific view or follow the guided sequence.`,i18n:{es:{name:`Nacimiento de una estrella (simulación)`,subtitle:`Simulación interactiva · complejo de Orión, a 1.350 años luz`,description:`Asiste al nacimiento de una estrella: una nube molecular fría colapsa por su propia gravedad hasta formar una protoestrella, desarrolla un disco donde nacen planetas, lanza chorros bipolares y finalmente enciende la fusión del hidrógeno. Pausa, acelera, retrocede, activa la vista científica o sigue la secuencia guiada.`}},data:{},action:()=>O.emit(`starbirth:start`,{}),actionLabel:()=>se(`sbStart`)});let n={core:()=>e.P&&e.u<2.05,star:()=>e.P&&e.P.starOn>.05,disk:()=>e.P&&e.P.diskF>.04,jet:()=>e.P&&e.P.jetF>.04,sib:()=>e.P&&e.P.sib>.05},r=(e,t)=>(Object.defineProperties(e,Object.getOwnPropertyDescriptors(t)),e),i=(e,n,i)=>{let a={id:e,kind:`structure`,color:`#ffd9a8`,priority:3,provenance:`simulated`,parent:this.obj,labelRange:[0,1e30],searchable:!1,i18n:{es:{}}};r(a,{get name(){return W[n].name.en},get description(){return W[n].desc.en}}),r(a.i18n.es,{get name(){return t(n,`name`)},get description(){return t(n,`desc`)}});let o=Object.getOwnPropertyDescriptors(i);return o.i18n&&(r(a.i18n.es,i.i18n.es),delete o.i18n),Object.defineProperties(a,o),a};this.subs=[],this.subs.push(i(`sb-core`,`core`,{getPosition(t){return t.copy(e.site)},get radius(){return e.Sc*.3},labelVisible:()=>n.core(),get pickable(){return n.core()},labelAlpha:t=>M((t-e.Sc*.3)/(e.Sc*.4),0,1)}));let a=()=>{let t=e.u,n=e.m.track;return n===`brown`?t>=5.85?`bd`:`star`:t<5.85?`star`:t<7.35?`starMS`:t<8?n===`supernova`?`supergiant`:n===`dwarf`?`starMS`:`giant`:n===`supernova`?`ns`:n===`dwarf`&&t<9?`starMS`:`wd`};this.subs.push(this.starObj=i(`sb-star`,`star`,{kind:`star`,procedural:!0,color:`#fff1dc`,get name(){return W[a()].name.en},get description(){return W[a()].desc.en},i18n:{es:{get name(){return W[a()].name.es},get description(){return W[a()].desc.es},data:{}}},getPosition(t){return t.copy(e.site)},get radius(){return e.P?Math.max(e.P.R,1):1},get lum(){return e.P&&e.u>=6&&e.m.lumSun>2e4?e.m.lumSun:void 0},get temp(){return e.P?e.P.T:3e3},labelVisible:t=>n.star()&&t<e.Sd*12,get pickable(){return n.star()},data:{}})),this.subs.push(i(`sb-disk`,`disk`,{getPosition(t){return t.copy(e.site)},get radius(){return e.Sd},get orbitMin(){return e.Sd*.04},labelVisible:t=>n.disk()&&t>e.Sd*.6&&t<e.Sd*60,get pickable(){return n.disk()},labelOffset:1}));for(let t of[1,-1])this.subs.push(i(t>0?`sb-jet-n`:`sb-jet-s`,t>0?`jetN`:`jetS`,{getPosition(n){return n.copy(e.site).addScaledVector(e.axis,t*.55*e.Sj*(e.P?e.P.jetF:0))},get radius(){return e.Sj*.08},get orbitMin(){return e.Sj*.03},labelVisible:t=>n.jet()&&t<e.Sc*40,get pickable(){return n.jet()}}));Y.forEach((t,r)=>this.subs.push(i(`sb-sib-`+(r+1),`sib`,{getPosition(n){return n.copy(t).applyQuaternion(e.tilt).multiplyScalar(e.Sc).add(e.site)},get radius(){return e.Sc*.02},labelVisible:t=>n.sib()&&t<e.Sc*12,get pickable(){return n.sib()}})))}setMass(e){let t=ue[e];if(!t)return;this.m=t,this.massKey=e,this.Sc=t.cloudPc*te,this.Sd=t.diskAU*ie,this.Sj=.55*this.Sc,this.cloud.scale.setScalar(this.Sc),this.gDust.scale.setScalar(this.Sc),this.cloudMat.uniforms.uExtDir.value.copy(this._orionDir),this.gDisk.scale.setScalar(this.Sd),this.gJet.scale.setScalar(this.Sj),this.dustMat.uniforms.uWorldScale.value=this.Sc,this.diskPtsMat.uniforms.uWorldScale.value=this.Sd,this.jetPtsMat.uniforms.uWorldScale.value=this.Sj,this.diskMat.uniforms.uInnerR.value=Math.max(.0015,t.radiusSun*J*3/this.Sd),this.cloudMat.uniforms.uSeed.value=e===`low`?5.3:e===`massive`?9.1:3.7,this.dustMat.uniforms.uDiskR.value=this.Sd/this.Sc,this.sim.ok&&(this.simMat.uniforms.uWorldScale.value=this.Sc,this.simMat.uniforms.uRdisk.value=this.Sd/this.Sc);let n=t.protoRadiusSun,r=t.radiusSun,i=t.track,a={R:[[1.45,.04*n],[1.9,.55*n],[2.4,n],[3.2,.92*n],[4.6,A(n,r*1.5,.6)],[5.85,r*1.45],[6.4,r],[7.1,r]],T:[[1.45,t.protoTemp*.7],[2.4,t.protoTemp*.95],[5.4,t.protoTemp*1.1],[5.85,A(t.protoTemp*1.1,t.tempMS,.35)],[6.35,t.tempMS],[7.1,t.tempMS]],L:[[1.45,t.protoLum*.08],[2.4,t.protoLum],[3.2,t.protoLum*.9],[5.5,t.protoLum*.45],[5.85,A(t.protoLum*.45,t.lumSun,.5)],[6.3,t.lumSun],[7.1,t.lumSun]],coreT:[[0,10],[1,12],[1.8,2e3],[2.2,1e5],[2.6,1e6],[5.85,1e7],[6.4,t.coreTempMS],[7.1,t.coreTempMS]],coreDens:[[0,3e-20],[1,3e-19],[1.8,1e-13],[2.2,.001],[3,.01],[5.85,20],[6.4,t.coreDens],[7.1,t.coreDens]]};i===`brown`&&(a.R=[[1.45,.04*n],[1.9,.55*n],[2.4,n],[3.2,.9*n],[4.6,.5*n],[5.85,.3],[6.4,.14],[7.1,.1]],a.T=[[1.45,t.protoTemp*.7],[2.4,t.protoTemp*.95],[5.4,t.protoTemp*1.05],[5.85,t.protoTemp],[6.4,1800],[7.1,1500]],a.L=[[1.45,t.protoLum*.08],[2.4,t.protoLum],[3.2,t.protoLum*.9],[5.5,t.protoLum*.3],[5.85,.01],[6.4,1e-4],[7.1,3e-5]],a.coreT=[[0,10],[1,12],[1.8,2e3],[2.2,1e5],[2.6,1e6],[5.85,25e5],[6.4,25e5],[7.1,2e6]],a.coreDens=[[0,3e-20],[1,3e-19],[1.8,1e-13],[2.2,.001],[3,.01],[5.85,50],[6.4,300],[7.1,400]]);let o={giant:{R:[[7.35,1.4*r],[7.6,12],[7.85,120],[7.98,170],[8.05,100],[8.2,.5],[8.35,.015],[10.1,.013]],T:[[7.35,5600],[7.6,4600],[7.85,3400],[7.98,3200],[8.08,8e3],[8.25,6e4],[8.4,1e5],[9,6e4],[10.1,2e4]],L:[[7.35,2],[7.6,200],[7.85,2500],[7.98,3500],[8.08,4e3],[8.35,200],[8.7,1],[9,.1],[10.1,.005]],coreT:[[7.6,3e7],[7.8,1e8],[8.35,1e8],[10.1,5e6]],coreDens:[[7.85,1e5],[8.35,1e6],[10.1,1e6]]},supernova:{R:[[7.4,8],[7.6,80],[7.85,550],[7.99,620],[8,620],[8.03,14e-6],[10.1,14e-6]],T:[[7.4,26e3],[7.6,9e3],[7.85,3600],[7.99,3500],[8.03,1e6],[10.1,5e5]],L:[[7.6,5e4],[7.85,7e4],[7.99,8e4],[8,8e4],[8.03,.3],[10.1,.05]],coreT:[[7.5,2e8],[7.85,1e9],[7.99,5e9],[8.03,1e11],[10.1,1e9]],coreDens:[[7.85,1e6],[7.99,1e9],[8.03,5e14],[10.1,5e14]]},dwarf:{R:[[7.9,.27],[8.4,.33],[8.9,.3],[9.1,.02],[10.1,.018]],T:[[7.9,3600],[8.4,5500],[8.9,6500],[9.1,2e4],[10.1,5e3]],L:[[7.9,.01],[8.4,.05],[8.9,.06],[9.1,.01],[10.1,1e-4]],coreT:[[8.9,8e6],[10.1,5e6]],coreDens:[[9.1,1e5],[10.1,1e5]]},brown:{R:[[10.1,.1]],T:[[8,1100],[9,500],[10.1,280]],L:[[8,5e-6],[9,3e-7],[10.1,1e-8]],coreT:[[10.1,1e6]],coreDens:[[10.1,500]]}}[i]||{},s=e=>a[e].concat(o[e]||[]);this.curves={R:$(s(`R`)),T:$(s(`T`)),L:$(s(`L`)),coreT:$(s(`coreT`)),coreDens:$(s(`coreDens`))};let c=(e,t)=>e===`cloud`?this.Sc:e===`disk`?this.Sd:e===`jet`?this.Sj:Math.max(this.curves.R(t)*J,1),l=e=>e.distBy&&e.distBy[i]?e.distBy[i]:e.dist;this.tourD=Q(V.map(e=>[e.u,Math.log(c(l(e)[0],e.u)*l(e)[1])])),this.tourPhi=Q(V.map(e=>[e.u,e.phi])),this._snStarted&&=(O.emit(`supernova:stop`),!1),this._params(),this._simSyncAt=performance.now()+50,O.emit(`starbirth:mass`,e)}setSpeed(e){e<=0?this.paused=!0:(this.speed=e,this.paused=!1),O.emit(`starbirth:speed`,this.paused?0:this.speed)}togglePause(){this.paused=!this.paused,O.emit(`starbirth:speed`,this.paused?0:this.speed)}stepSpeed(e){let t=[1,10,100,1e3],n=t.indexOf(this.speed);n=M(n+e,0,t.length-1),this.setSpeed(t[n])}setMode(e){this.mode=e,O.emit(`starbirth:mode`,e)}setLayer(e){this.layer=e|0}get phase(){return Math.min(Math.floor(this.u),9)}seek(e){this.u=M(e,0,9.999),this._ignited=this.u>=5.85,this._flash=0,this._shake=0,this._ringT=99,this.ring.visible=!1,this._snStarted&&this.u<8&&(O.emit(`supernova:stop`),this._snStarted=!1),this.u>=8&&(this._snStarted=this._snStarted||this.m.track!==`supernova`),this._simSyncAt=performance.now()+160,this._eventIdx=-1;for(let e=0;e<G.length;e++)G[e].u<=this.u&&(this._eventIdx=e);this._phase=this.phase,this._capPhase=-1,this._params(),O.emit(`starbirth:seek`,this.u)}seekPhase(e){this.seek(M(e,0,9)+.001)}start(e={}){let t=!!e.tour;if(e.mass&&this.setMass(e.mass),!this.active){this.active=!0;for(let e of this.subs)this.registry.add(e);O.emit(`starbirth:begin`)}this.tour&&this.stopTour(!1),this.seek(0),this.paused=!0,this.speed=1,this.simT=0,O.emit(`select:request`,null);let n=this.cameraCtl.position.distanceTo(this.site),r=()=>{this.active&&(t?this.startTour():this.cameraCtl.setMode(I.ORBIT,this.obj),this.paused=!1,O.emit(`starbirth:speed`,this.speed),O.emit(`starbirth:ready`))};if(!t&&n>1.2*this.Sc&&n<6*this.Sc){r();return}this.cameraCtl.travelTo(this.obj,{absDistance:3.4*this.Sc,duration:n>40*this.Sc?8:4,mode:I.ORBIT,onArrive:r})}stop(){if(this.active){this.tour&&this.stopTour(!1),this.active=!1,this.paused=!0,this._snStarted&&=(O.emit(`supernova:stop`),!1);for(let e of this.subs)this.registry.remove(e.id);this.cameraCtl.target&&this.cameraCtl.target.id&&this.cameraCtl.target.id.startsWith(`sb-`)&&this.cameraCtl.setMode(I.ORBIT,this.obj),this.engine.bloomBoost=0,this.engine.finalPass.uniforms.uAberration&&(this.engine.finalPass.uniforms.uAberration.value=this._abBase),O.emit(`select:request`,null),O.emit(`starbirth:end`)}}focus(){if(!this.active){this.start({});return}let e=this.cameraCtl.position.distanceTo(this.site);(e>8*this.Sc||e<1)&&this.cameraCtl.travelTo(this.obj,{absDistance:2.5*this.Sc,duration:5,mode:I.ORBIT})}startTour(){if(!this.active){this.start({tour:!0});return}this.tour=!0,this.cameraCtl.cancelTravel();let e=this._v.copy(this.cameraCtl.position).sub(this.site);this._theta=Math.atan2(e.x,e.z)||0,this.cameraCtl.mode=I.CINEMATIC,this.cameraCtl.inputEnabled=!1,this.cameraCtl.cinematicFov=1,O.emit(`camera:mode`,I.CINEMATIC),this.speed=1,this.paused=!1,O.emit(`starbirth:tour`,!0)}stopTour(e){this.tour&&(this.tour=!1,this.cameraCtl.inputEnabled=!0,this.cameraCtl.mode===I.CINEMATIC&&this.cameraCtl.setMode(I.ORBIT,this.obj),O.emit(`starbirth:tour`,!1),e&&O.emit(`starbirth:tourdone`))}_params(){this.P=this._paramsFor(this.u)}_paramsFor(e){let t=this.m,n=this.curves,r=t.track,i=X(.9,2.6,e),a=X(1.45,2.4,e),o=X(1.9,3.5,e)*(1-X(7,8,e)),s=X(3,4.8,e),c=X(2.5,4.3,e)*(1-X(5.8,6.7,e)),l=X(3,5.6,e),u=r===`brown`?0:X(5.55,6.15,e),d=X(7,7.6,e),f=X(7.3,7.95,e),p=(r===`giant`?1:r===`supernova`?.6:.2)*X(7.5,8.3,e),m=r===`giant`?X(8,8.15,e)*(1-X(9.5,9.98,e)):0,h=X(8,9.98,e),g=.35*X(4.4,6.9,e)+.65*X(5.7,6.9,e),_=X(6,6.9,e),ee=X(2.2,3.8,e)*(1-.5*g),v=Math.max(n.R(e),1e-4)*J,y=n.T(e),b=n.L(e)*(1+4*this._flash),x=M(.32*Math.log10(1+b*4),0,3)*a+.8*X(1.05,1.9,e)*(1-a),S=n.coreT(e),C=n.coreDens(e),w=r===`giant`?.45*X(8,8.4,e):r===`supernova`?.9*X(8,8.05,e):r===`dwarf`?.2*X(9,9.3,e):0,T=t.mass*X(1.4,4.8,e)*(1-w),E=t.years,D=0,O=Math.min(Math.floor(e),9),k=e-O;for(let e=0;e<O&&e<9;e++)D+=E[e];return D+=O<9?k*E[O]:k*Pe[r],{collapse:i,starOn:a,diskF:o,clump:s,jetF:c,cavity:l,ignite:u,disperse:g,gap:_,sib:ee,R:v,T:y,L:b,illum:x,color:Ie(y),coreT:S,coreDens:C,massAcc:T,age:D,flash:this._flash,cloudGone:d,giant:f,wind2:p,pn:m,pnR:h}}_simParams(e,t){let n=this.Sd/this.Sc,r=e.massAcc/this.m.mass;return{uTrigger:X(.9,1.5,t),uMstar:Math.max(r,.001),uMcloud:(1-r)*(1-.6*e.disperse)*(1-e.cloudGone),uDisk:e.diskF,uRdisk:n,uWind:3*X(5.85,6.6,t)*(1-X(7,7.8,t))+4*e.wind2,uAccR:Math.max(.02*n,e.R*2/this.Sc),uTurb:.15*(1-X(.9,2,t))+.02,uDrag:6,uSpin:.25}}_simSync(){if(!this.sim.ok)return;this.sim.reset();let e=this.u;if(e<=.05)return;let t=Math.ceil(e/.05),n=e/t,r=0;for(let e=0;e<t;e++){r+=n;let e=this._paramsFor(r);this.sim.setParams(this._simParams(e,r)),this.sim.step(n,r*10,2)}}get yearsPerSecond(){let e=this.phase;return(e<9?this.m.years[e]:Pe[this.m.track])/this.phaseSecondsAt(this.u)*(this.paused?0:this.speed)}_ignite(){this._ignited=!0,this._flash=.75,this._shake=.55,this._ringT=0,this.ring.visible=!0,O.emit(`starbirth:ignite`)}update(e,t,n){let r=this.engine.camera,i=n.distanceTo(this.site),a=this.active||i<60*this.Sc;if(this.root.visible=a,this.cloudRoot.visible=a,!a){this.engine.volActive=!1;return}let o=this.u;if(this.active&&!this.paused&&this._advance(e),this._simSyncAt>0&&performance.now()>=this._simSyncAt)this._simSyncAt=-1,this._simSync();else if(this.sim.ok&&this.u>o){let e=this._paramsFor(this.u);this.sim.setParams(this._simParams(e,this.u)),this.sim.step(this.u-o,this.u*10)}this._flash=Math.max(0,this._flash-e*.9),this._shake=Math.max(0,this._shake-e*.7),this._ringT<99&&(this._ringT+=e),this._params(),this._apply(e,t,n,r,i),this.tour&&this._tourCamera(e),this.active&&(this._captions(),this._data())}phaseSecondsAt(e){let t=Math.min(Math.floor(e),9),n=e-t;return n<.5?t===0?U[0]:A(U[t-1],U[t],.5+n):t===9?U[9]:A(U[t],U[t+1],n-.5)}_advance(e){this.u=Math.min(this.u+e*this.speed/this.phaseSecondsAt(this.u),9.999);let t=.22+.3*Math.log10(1+this.speed);this.rot+=e*t,this.jetClock+=e*(.5+.35*Math.log10(1+this.speed)),this.simT+=e,this.phase!==this._phase&&(this._phase=this.phase,O.emit(`starbirth:phase`,this._phase)),this.u>=5.85&&!this._ignited&&(this.m.track===`brown`?this._ignited=!0:this._ignite()),this.m.track===`supernova`&&this.u>=8&&!this._snStarted&&(this._snStarted=!0,this._shake=1,O.emit(`supernova:start`,this.starObj)),this.tour&&this.u>=9.9&&this.stopTour(!0)}_apply(e,t,n,r,i){let a=this.P,o=this.m,s=this.mode===`sci`?this.layer:0,c=window.innerHeight,l=this.engine.renderer.getPixelRatio(),u=c/(2*Math.tan(ee.degToRad(r.fov)/2))*l,f={visible:0,infrared:1,uv:2,xray:3,radio:4}[this._band]||0,p=this.Sc/Math.max(i-this.Sc,1e-6)*u/l,m=i<this.Sc,h=(m||p>1.2)&&a.cloudGone<.99;if(this.cloud.visible=h,h){let e=this.cloudMat.uniforms;this._m3.setFromMatrix4(r.matrixWorld),this._m3b.setFromMatrix4(this._m4.makeRotationFromQuaternion(this.tiltInv)),e.uCamToLocal.value.copy(this._m3b).multiply(this._m3),e.uCamLocal.value.copy(n).sub(this.site).applyQuaternion(this.tiltInv).multiplyScalar(1/this.Sc),e.uTime.value=t,e.uCollapse.value=a.collapse,e.uCavity.value=a.cavity*o.jet/1.8+a.cavity*.3,e.uDisperse.value=a.disperse,e.uStarLum.value=a.illum*(1+3*a.flash),e.uIon.value=o.ion*X(5.85,6.5,this.u),e.uSci.value=s,e.uBand.value=f,e.uStarColor.value.copy(a.color),e.uInner.value=.02+.12*a.diskF;for(let t=0;t<3;t++)e.uSib.value[t].set(Y[t].x,Y[t].y,Y[t].z,a.sib*.8);let l=Math.min(p/(c*.5),1),u={low:18,medium:28,high:40,ultra:60}[this.engine.qualityName]||28,d=m?Math.round(u*(.55+.45*M(i/this.Sc,0,1))):u;e.uSteps.value=Math.round(A(8,d,Math.sqrt(l))),e.uFade.value=M((p-1.2)/3,0,1)*(1-a.cloudGone),e.uExt.value=1-.6*a.disperse}this.engine.volActive=h;let g=this.dustMat.uniforms;g.uCollapse.value=a.collapse,g.uRot.value=this.rot,g.uTime.value=t,g.uPxPerUnit.value=u,g.uStarLum.value=a.illum,g.uSci.value=s,g.uDisperse.value=a.disperse,g.uStarColor.value.copy(a.color),g.uFade.value=M((p-.5)/4,0,1)*(m?M(i/(this.Sc*.02),.15,1):1)*(1-a.cloudGone);let _=(p>.5||m)&&a.cloudGone<.99;if(this.sim.ok){let e=this.simMat.uniforms;e.tPos.value=this.sim.posTexture,e.tVel.value=this.sim.velTexture,e.uPxPerUnit.value=u,e.uStarLum.value=a.illum,e.uSci.value=s,e.uFade.value=g.uFade.value,e.uStarColor.value.copy(a.color),this.simPts.visible=_,this.dust.visible=!1}else this.dust.visible=_;for(let e=0;e<3;e++)this.sibs[e].material.opacity=a.sib*.9,this.sibs[e].visible=a.sib>.01;let v=this.diskMat.uniforms,y=this.diskPtsMat.uniforms,b=this.Sd/Math.max(i-this.Sd,1e-6)*u/l,x=a.diskF>.01&&(b>1.5||i<this.Sd*2);if(this.disk.visible=x,this.diskPts.visible=x&&!this.sim.ok,x&&(v.uTime.value=t,v.uRot.value=this.rot,v.uDisk.value=a.diskF,v.uGap.value=a.gap,v.uClump.value=a.clump,v.uStarLum.value=a.illum*(1+2*a.flash),v.uSci.value=s,v.uStarColor.value.copy(a.color),v.uFade.value=M((b-1.5)/6,0,1),y.uRot.value=this.rot,y.uDisk.value=a.diskF,y.uGap.value=a.gap,y.uClump.value=a.clump,y.uPxPerUnit.value=u,y.uStarLum.value=a.illum,y.uSci.value=s,y.uStarColor.value.copy(a.color),y.uFade.value=v.uFade.value),a.pn>.005){let e=this.Sc*(.012+.32*a.pnR);this.pn.visible=!0,this.pn.scale.setScalar(e),this.pnMat.uniforms.uTime.value=t,this.pnMat.uniforms.uA.value=a.pn*(1-.85*M((e-i)/(e*.3),0,1)),this.pnMat.uniforms.uStarColor.value.copy(a.color)}else this.pn.visible=!1;if(this._ringT<6){let e=.02+1.6*(this._ringT/4)**.7;this.ring.scale.setScalar(e),this.ringMat.uniforms.uA.value=1.4*Math.max(0,1-this._ringT/4),this.ringMat.uniforms.uW.value=.08+.06*this._ringT,this.ring.visible=!0}else this.ring.visible=!1;let S=a.jetF>.01;if(this.jetN.visible=this.jetS.visible=this.jetPts.visible=S,S){let e=this.jetMat.uniforms,t=this.jetPtsMat.uniforms,n=a.jetF**1.5*(.7+.5*o.jet)*(1+.15*Math.sin(this.jetClock*2.3))*(1+1.5*a.flash);e.uTime.value=this.jetClock,e.uJet.value=a.jetF,e.uStrength.value=n,e.uSci.value=s,e.uSpeed.value=.55,t.uTime.value=this.jetClock,t.uJet.value=a.jetF,t.uStrength.value=n,t.uPxPerUnit.value=u,t.uSpeed.value=.55,t.uFade.value=1;for(let e of this.hh)e.position.set(0,e.userData.sign*a.jetF*.98,0),e.material.opacity=.9*a.jetF*X(.55,.9,a.jetF)*(.8+.2*Math.sin(this.jetClock*3+e.userData.sign)),e.visible=e.material.opacity>.01}else for(let e of this.hh)e.visible=!1;let C=a.starOn>.01;if(this.gStar.visible=C,this.gStar.scale.setScalar(Math.max(a.R,.001)),C){let e=1+.035*Math.sin(this.rot*4.1)*(1-a.ignite);this.star.surface.scale.setScalar(e),this.star.chromo.scale.setScalar(e),this.star.surfMat.uniforms.uTemp.value=a.T,this.star.surfMat.uniforms.uIntensity.value=2.2+1.6*a.ignite+6*a.flash,this.star.chromoMat.uniforms.uIntensity.value=.9+.6*(1-a.ignite);let n=a.R/Math.max(i-a.R,1e-6)*u/l;this.star.update(t,r,n),this.star.coronaMat.uniforms.uIntensity.value*=.6+.8*a.ignite}let w=this._extinction(n,f===1),T=M(.85+.3*Math.log10(a.L+.01),.15,2)*a.starOn*w,E=Math.max(i*.06*T*(1+3*a.flash),a.R*5);this.glow.scale.setScalar(E),this.glow.material.opacity=M(T*.85+a.flash,0,1),this.glow.material.color.copy(a.color).lerp(new d(1,1,1),.3+.5*a.flash),this.glowCore.scale.setScalar(Math.max(i*.012*(.6+T),a.R*2.5)),this.glowCore.material.opacity=M(T*1.2,0,1),this.glowCore.material.color.copy(a.color).lerp(new d(1,1,1),.6),this.glow.visible=this.glowCore.visible=C;let D=this.mode===`sci`,O=D?X(.75,1.3,this.u)*(1-X(2.5,3.2,this.u)):0;this.arrows.visible=O>.01,this.arrows.material.uniforms.uAlpha.value=O*.9,this.arrows.material.uniforms.uTime.value=t,this.arrows.material.uniforms.uLen.value=.6+.8*a.collapse;let k=D&&C?X(5.5,5.9,this.u):0;if(this.balance.visible=k>.01,this.balance.visible&&(this.balance.quaternion.copy(this.root.quaternion).invert().multiply(r.quaternion),this.gravArrows.material.uniforms.uAlpha.value=k,this.gravArrows.material.uniforms.uTime.value=t,this.gravArrows.material.uniforms.uLen.value=1,this.pressArrows.material.uniforms.uAlpha.value=k,this.pressArrows.material.uniforms.uTime.value=t,this.pressArrows.material.uniforms.uLen.value=A(.45,1,X(5.75,6.25,this.u))),this.engine.bloomBoost=this._flash*1.4,this.engine.finalPass.uniforms.uAberration&&(this.engine.finalPass.uniforms.uAberration.value=this._abBase+this._flash*.6),this._shake>.01){let e=this._shake*this._shake*i*.006;r.position.copy(this.cameraCtl.position).add(this._v.set((Math.random()-.5)*e,(Math.random()-.5)*e,(Math.random()-.5)*e)),r.updateMatrixWorld(!0)}}_extinction(e,t){let n=this.P,r=this._v2.copy(e).sub(this.site).applyQuaternion(this.tiltInv).multiplyScalar(1/this.Sc),i=r.length();if(i<1e-5)return 1;this._v3.copy(r).multiplyScalar(-1/i);let a=Math.min(i,1),o=Math.abs(r.y/i)>.75-.1*n.cavity?n.cavity:0,s=n.collapse,c=A(.3,.1,s),l=.02+.12*n.diskF,u=0,d=(a-.002)/24;for(let e=0;e<24;e++){let t=a-d*(e+.5),r=.35*(1-X(.5,1,t))*(1-.55*s*X(.25,.9,t))+Math.exp(-t*t/(c*c))*A(.35,2.2,s)+s*1.6*Math.max(1-t/.55,0)**2;r*=(1-.92*o)*(1-.55*n.disperse)*A(1,X(0,.02+.45*n.disperse,t),n.disperse)*X(l*.6,l*1.6,t),u+=r*d}let f=(t?.25:2.2)*(1-.9*n.disperse);return Math.exp(-u*f)}_tourCamera(e){let t=this.u,n=Math.max(Math.exp(this.tourD(t)),this.P.R*3),r=this.tourPhi(t);this._theta+=e*.055*(1+.4*Math.sin(t*1.7));let i=this._v.set(Math.cos(r)*Math.sin(this._theta),Math.sin(r),Math.cos(r)*Math.cos(this._theta)),a=this.cameraCtl;a.position.copy(this.site).addScaledVector(i,n),a.quaternion.setFromRotationMatrix(this._m4.lookAt(a.position,this.site,a.up))}_captions(){if(!(this.tour||this.mode===`explain`))return;let e=R.lang;if(this._capPhase!==this.phase){this._capPhase=this.phase;let t=H(this.phase,this.m);O.emit(`starbirth:caption`,{title:t.title[e],sub:t.name[e],ms:6500}),this._capT=0}let t=this._eventIdx+1;if(t<G.length&&G[t].u<=this.u){this._eventIdx=t;let n=G[t],r=de[this.m.track]&&de[this.m.track][n.u],i=r?r[e]||r.en:n[e]||n.en;O.emit(`starbirth:caption`,{title:i[1],sub:i[0],ms:7500})}}_data(){let e=this.P;R.lang;let t=e=>`${Math.round(e).toLocaleString(`en-US`)} K`,n=e.coreDens>=1?`${e.coreDens.toPrecision(2)} g/cm³`:e.coreDens.toExponential(1)+` g/cm³`,r=H(this.phase,this.m),i={phase:r.name.en,age:fe(e.age,`en`),surfaceTemp:t(e.T),coreTemp:e.coreT<1e4?t(e.coreT):`${(e.coreT/1e6).toPrecision(2)} million K`,coreDensity:n,radius:`${(e.R/J).toPrecision(2)} R☉ (${Math.round(e.R*1e3).toLocaleString(`en-US`)} km)`,luminosity:`${e.L<.01?e.L.toExponential(1):e.L.toPrecision(2)} L☉`,massAccreted:`${e.massAcc.toPrecision(2)} M☉`},a={phase:r.name.es,age:fe(e.age,`es`),surfaceTemp:i.surfaceTemp,coreTemp:e.coreT<1e4?t(e.coreT):`${(e.coreT/1e6).toPrecision(2)} millones K`,coreDensity:n,radius:i.radius,luminosity:i.luminosity,massAccreted:i.massAccreted};this.starObj.data=i,this.starObj.i18n.es.data=a,this.obj.data={phase:i.phase,age:i.age,starMass:`${this.m.mass} M☉ (${this.m.name.en})`,coreSize:`${this.m.cloudPc} pc ≈ ${(this.m.cloudPc*3.26).toPrecision(2)} light-years`,discRadius:`${this.m.diskAU} AU`},this.obj.i18n.es.data={phase:a.phase,age:a.age,starMass:`${this.m.mass} M☉ (${this.m.name.es})`,coreSize:`${this.m.cloudPc} pc ≈ ${(this.m.cloudPc*3.26).toPrecision(2)} años luz`,discRadius:`${this.m.diskAU} UA`}}};export{Le as StarBirth};