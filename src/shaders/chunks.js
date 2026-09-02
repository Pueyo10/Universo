// Shared GLSL chunks. Every custom material includes the log-depth chunks so it
// coexists with Three's logarithmic depth buffer.

export const LOGDEPTH_PARS_VERT = /* glsl */`#include <common>
#include <logdepthbuf_pars_vertex>`;
export const LOGDEPTH_VERT = /* glsl */`#include <logdepthbuf_vertex>`;
export const LOGDEPTH_PARS_FRAG = /* glsl */`#include <logdepthbuf_pars_fragment>`;
export const LOGDEPTH_FRAG = /* glsl */`#include <logdepthbuf_fragment>`;

export const HASH = /* glsl */`
float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p3) { p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
vec3 hash33(vec3 p3) { p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yxz + 33.33); return fract((p3.xxy + p3.yxx) * p3.zyx); }
`;

// Ashima / Ian McEwan simplex noise (MIT)
export const SIMPLEX3D = /* glsl */`
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
float fbm(vec3 p, int oct) {
  float a = 0.5, s = 0.0, n = 0.0;
  for (int i = 0; i < 8; i++) { if (i >= oct) break; s += a * snoise(p); n += a; p = p * 2.02 + vec3(17.3, 9.1, 3.7); a *= 0.5; }
  return s / n;
}
float ridged(vec3 p, int oct) {
  float a = 0.5, s = 0.0, n = 0.0;
  for (int i = 0; i < 8; i++) { if (i >= oct) break; float v = 1.0 - abs(snoise(p)); s += a * v * v; n += a; p = p * 2.1 + vec3(5.2, 1.3, 8.7); a *= 0.5; }
  return s / n;
}
`;

// Cheap value noise (for high step-count raymarching)
export const VALUE_NOISE3D = /* glsl */`
float vnoise(vec3 x) {
  vec3 p = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  float n = p.x + p.y * 157.0 + 113.0 * p.z;
  return mix(mix(mix(hash11(n + 0.0), hash11(n + 1.0), f.x), mix(hash11(n + 157.0), hash11(n + 158.0), f.x), f.y),
             mix(mix(hash11(n + 113.0), hash11(n + 114.0), f.x), mix(hash11(n + 270.0), hash11(n + 271.0), f.x), f.y), f.z);
}
float vfbm(vec3 p, int oct) {
  float a = 0.5, s = 0.0, n = 0.0;
  for (int i = 0; i < 6; i++) { if (i >= oct) break; s += a * vnoise(p); n += a; p = p * 2.03 + 11.7; a *= 0.5; }
  return s / n;
}
`;

export const COLOR_UTILS = /* glsl */`
vec3 blackbody(float t) {
  // Approximate blackbody colour (t in Kelvin, 1000..40000), linear RGB
  t = clamp(t, 1000.0, 40000.0) / 100.0;
  float r, g, b;
  if (t <= 66.0) { r = 1.0; g = clamp((99.4708025861 * log(t) - 161.1195681661) / 255.0, 0.0, 1.0); }
  else { r = clamp(329.698727446 * pow(t - 60.0, -0.1332047592) / 255.0, 0.0, 1.0); g = clamp(288.1221695283 * pow(t - 60.0, -0.0755148492) / 255.0, 0.0, 1.0); }
  if (t >= 66.0) b = 1.0; else if (t <= 19.0) b = 0.0; else b = clamp((138.5177312231 * log(t - 10.0) - 305.0447927307) / 255.0, 0.0, 1.0);
  vec3 c = vec3(r, g, b);
  return c * c; // to roughly linear
}
float lum3(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
`;

export const ROTATE = /* glsl */`
mat2 rot2(float a) { float s = sin(a), c = cos(a); return mat2(c, -s, s, c); }
`;
