import{d as e}from"./Units-B-K3UxBs.js";import{g as t,h as n,m as r,p as i,u as a}from"./index-B3wEKzzH.js";var o=`
  attribute float lum;
  attribute vec3 color;
  attribute float seed;
  varying vec3 vColor;
  varying float vAlpha, vSize, vSeed;
  uniform float uExposure, uPixelRatio, uMaxSize, uFade, uTime, uMinLum, uBand;
  ${n}
  ${a}
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float dLy = length(mv.xyz) / ${e.toExponential(6)};
    float flux = lum / max(dLy * dLy, 1e-8) * uExposure * bandStarWeight(color, uBand);
    float b = log2(1.0 + flux * 40.0);
    float size = clamp(1.2 + b * 2.4, 0.0, uMaxSize);
    float alpha = clamp(flux * 6.0, 0.0, 1.0);
    alpha *= 0.94 + 0.06 * sin(uTime * 2.1 + seed * 40.0);
    vColor = bandStarTint(color, uBand);
    vAlpha = alpha * uFade * step(uMinLum, lum);
    vSize = size;
    vSeed = seed;
    gl_PointSize = max(size, 1.0) * uPixelRatio;
    if (vAlpha < 0.004 || dLy < 0.001) gl_PointSize = 0.0;
    gl_Position = projectionMatrix * mv;
    ${t}
  }
`,s=`
  precision highp float;
  varying vec3 vColor;
  varying float vAlpha, vSize, vSeed;
  ${r}
  void main() {
    ${i}
    vec2 c = gl_PointCoord - 0.5;
    float r2 = dot(c, c) * 4.0;
    if (r2 > 1.0) discard;
    float core = exp(-r2 * 9.0);
    float halo = exp(-r2 * 2.0) * 0.28;
    float spikes = 0.0;
    if (vSize > 14.0) {
      float ang = atan(c.y, c.x);
      float sp = pow(abs(cos(ang * 2.0)), 30.0) + pow(abs(sin(ang * 2.0)), 30.0) * 0.5;
      spikes = sp * exp(-sqrt(r2) * 4.0) * 0.35;
    }
    float a = (core + halo + spikes) * vAlpha;
    if (a < 0.003) discard;
    vec3 col = vColor * a * 1.25 + vec3(a * a * 0.25);
    gl_FragColor = vec4(col, a);
  }
`;export{o as n,s as t};