import * as THREE from 'three';
import { TileGlobe, TILE_SOURCES, HIRES, loadHiRes } from './TileGlobe.js';
import { LOGDEPTH_PARS_VERT, LOGDEPTH_VERT, LOGDEPTH_PARS_FRAG, LOGDEPTH_FRAG, SIMPLEX3D, HASH } from '../shaders/chunks.js';

// Planet rendering: layered surface / clouds / atmosphere with physically
// motivated lighting: day–night terminator, night lights, ocean specular,
// normal-mapped relief, cloud shadows, ring shadows, moon eclipse shadows,
// animated gas-giant flow, and a ray-marched single-scattering atmosphere.

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
  uniform sampler2D uMap, uNightMap, uSpecMap, uNormalMap, uCloudMap, uRingTex, uEmissiveMap;
  uniform float uHasNight, uHasSpec, uHasNormal, uHasCloud, uHasRing, uHasEmissive, uNormalScale;
  uniform vec3 uSunDir;          // local space
  uniform vec3 uCamLocal;        // local space
  uniform mat3 uLocalToView;     // for view-space normal (unused)
  uniform vec3 uAtmoColor; uniform float uAtmoStrength;
  uniform float uTime, uCloudOffset, uSunAngular, uGas, uBands, uSpotStrength;
  uniform vec2 uSpot;
  uniform float uRingInner, uRingOuter; uniform vec3 uRingNormal;
  uniform vec4 uMoons[4]; uniform int uMoonCount;
  uniform float uHexagon, uDarkSpot, uPolarBright, uExposure, uNoTerminator;
  uniform vec3 uTint;
  uniform vec4 uTileUV, uNightTileUV;   // (u0, v0, 1/du, 1/dv): streamed tiles sample their own texture with a sub-rectangle of the global uv
  ${HASH}
  ${SIMPLEX3D}
  ${LOGDEPTH_PARS_FRAG}

  vec3 srgb2lin(vec3 c) { return pow(c, vec3(2.2)); }

  vec2 gasUv(vec2 uv, vec3 n) {
    // differential rotation: bands slide at different rates, plus gentle turbulence and a vortex at uSpot
    float lat = n.y;
    float speed = 0.0012 * (sin(lat * 15.0) * 0.6 + sin(lat * 7.0 + 1.3) * 0.4) * uBands;
    vec2 q = uv;
    q.x += uTime * speed;
    float w1 = snoise(vec3(uv * vec2(14.0, 7.0), uTime * 0.02)) * 0.0025;
    float w2 = snoise(vec3(uv * vec2(30.0, 15.0) + 5.0, uTime * 0.03)) * 0.0012;
    q += vec2(w1, w2);
    if (uSpotStrength > 0.0) {
      vec2 d = (q - uSpot) * vec2(2.0, 1.0);
      float r = length(d) / 0.055;
      float sw = exp(-r * r) * uSpotStrength;
      float ang = sw * (uTime * 0.12 + 0.0);
      float c = cos(ang), s = sin(ang);
      vec2 rd = vec2(d.x * c - d.y * s, d.x * s + d.y * c);
      q = uSpot + rd / vec2(2.0, 1.0);
    }
    return q;
  }

  void main() {
    ${LOGDEPTH_FRAG}
    #ifdef TILE_BIAS
    gl_FragDepth -= float(TILE_BIAS);   // streamed tiles win over the base sphere, finer levels over coarser ones
    #endif
    vec3 N = normalize(vN);
    vec3 P = vPos;
    vec3 V = normalize(uCamLocal - P);
    vec2 uv = vUv;
    if (uGas > 0.5) uv = gasUv(uv, N);
    // tangent frame
    vec3 T = normalize(cross(vec3(0.0, 1.0, 0.0), N));
    vec3 B = cross(N, T);
    vec3 Nn = N;
    if (uHasNormal > 0.5) {
      vec3 nm = texture2D(uNormalMap, uv).xyz * 2.0 - 1.0;
      Nn = normalize(T * nm.x * uNormalScale + B * nm.y * uNormalScale + N * nm.z);
    }
    vec3 L = normalize(uSunDir);
    float ndlRaw = dot(N, L);
    float ndl = max(dot(Nn, L), 0.0);
    // soft terminator (atmospheric twilight widens it)
    float day = uNoTerminator > 0.5 ? 1.0 : smoothstep(-0.03 - uAtmoStrength * 0.08, 0.10, ndlRaw);
    vec3 albedo = srgb2lin(texture2D(uMap, (uv - uTileUV.xy) * uTileUV.zw).rgb) * uTint;

    // ---- shadows
    float shadow = 1.0;
    // moon eclipse shadows: line from P toward the Sun, closest approach to each moon
    for (int i = 0; i < 4; i++) {
      if (i >= uMoonCount) break;
      vec3 m = uMoons[i].xyz; float mr = uMoons[i].w;
      vec3 pm = m - P;
      float along = dot(pm, L);
      if (along > 0.0) {
        float dist = length(pm - L * along);
        float pen = uSunAngular * along + 0.002;   // penumbra width
        float s = smoothstep(mr - pen, mr + pen, dist);
        shadow *= mix(0.08, 1.0, s);
      }
    }
    // ring shadow: intersect sun ray with ring plane
    if (uHasRing > 0.5) {
      float dn = dot(L, uRingNormal);
      if (abs(dn) > 1e-4) {
        float tt = -dot(P, uRingNormal) / dn;
        if (tt > 0.0) {
          vec3 hit = P + L * tt;
          float rr = length(hit);
          if (rr > uRingInner && rr < uRingOuter) {
            float ra = texture2D(uRingTex, vec2((rr - uRingInner) / (uRingOuter - uRingInner), 0.5)).a;
            shadow *= 1.0 - ra * 0.92;
          }
        }
      }
    }
    // cloud shadows (offset toward the sun in tangent space)
    if (uHasCloud > 0.5) {
      vec2 off = vec2(dot(L, T), dot(L, B)) * 0.004;
      float c = texture2D(uCloudMap, vec2(uv.x + uCloudOffset, uv.y) - off).r;
      shadow *= 1.0 - c * 0.45 * day;
    }

    vec3 col = albedo * ndl * shadow;
    // faint starlight / earthshine so night sides are never pure black
    col += albedo * 0.012;
    // gas giants: no self-shadowing relief but subtle limb softening
    // ocean specular
    if (uHasSpec > 0.5) {
      float spec = texture2D(uSpecMap, uv).r;
      vec3 H = normalize(L + V);
      float ndh = max(dot(Nn, H), 0.0);
      float fres = pow(1.0 - max(dot(Nn, V), 0.0), 3.0);
      float glint = pow(ndh, 90.0) * 1.6 + pow(ndh, 12.0) * 0.12;
      glint *= mix(1.0, 0.22, 1.0 - smoothstep(0.02, 0.35, length(uCamLocal) - 1.0));   // from low orbit the glint spans hundreds of km: keep it from whiting out the view
      col += vec3(1.0, 0.95, 0.85) * glint * spec * (0.25 + 0.75 * fres) * day * shadow;
      // sea colour deepening with view angle
      col += vec3(0.02, 0.05, 0.1) * spec * fres * day;
    }
    // night lights
    if (uHasNight > 0.5) {
      vec3 night = srgb2lin(texture2D(uNightMap, (uv - uNightTileUV.xy) * uNightTileUV.zw).rgb);
      float nightMask = 1.0 - smoothstep(-0.12, 0.05, ndlRaw);
      col += night * vec3(1.0, 0.85, 0.6) * nightMask * 1.4;
    }
    if (uHasEmissive > 0.5) { col += srgb2lin(texture2D(uEmissiveMap, uv).rgb) * 1.5; }
    // Saturn polar hexagon
    if (uHexagon > 0.5) {
      float colat = acos(clamp(N.y, -1.0, 1.0));
      if (colat < 0.35) {
        float ang = atan(N.z, N.x) + uTime * 0.01;
        float hexR = 0.2 / max(cos(mod(ang + 3.14159 / 6.0, 3.14159 / 3.0) - 3.14159 / 6.0), 0.2);
        float he0 = (colat - hexR) / 0.012; float edge = exp(-he0 * he0);
        float inside = 1.0 - smoothstep(hexR - 0.02, hexR, colat);
        col *= 1.0 - edge * 0.35 - inside * 0.12;
        col += vec3(0.2, 0.15, 0.1) * inside * ndl * 0.3;
      }
    }
    if (uDarkSpot > 0.5) {
      // Neptune: Great Dark Spot + bright companion clouds, drifting
      vec2 sp = vec2(0.32 + uTime * 0.0006, 0.62);
      vec2 d = (uv - sp) * vec2(2.0, 1.0);
      float spot = exp(-dot(d, d) / 0.004);
      col *= 1.0 - spot * 0.45 * ndl;
      float streak = smoothstep(0.55, 0.8, snoise(vec3(uv.x * 20.0 + uTime * 0.01, uv.y * 40.0, 1.0)) * 0.5 + 0.5) * smoothstep(0.35, 0.75, uv.y) * (1.0 - smoothstep(0.75, 0.9, uv.y));
      col += vec3(0.9, 0.95, 1.0) * streak * 0.35 * ndl;
    }
    if (uPolarBright > 0.5) {
      float pol = smoothstep(0.6, 0.95, abs(N.y));
      col += albedo * pol * 0.25 * ndl;
    }
    // atmospheric rim tint seen from the surface side
    float rim = pow(1.0 - max(dot(N, V), 0.0), 3.5);
    col += uAtmoColor * rim * uAtmoStrength * 0.45 * (day * 0.9 + 0.1) * (0.5 + 0.5 * ndl);
    col *= uExposure;
    gl_FragColor = vec4(col, 1.0);
  }
`;

const cloudVert = surfVert;
const cloudFrag = /* glsl */`
  precision highp float;
  varying vec3 vN; varying vec3 vPos; varying vec2 vUv; varying vec3 vView;
  uniform sampler2D uMap; uniform vec3 uSunDir; uniform vec3 uCamLocal;
  uniform float uTime, uOffset, uOpaque, uExposure, uWarp, uAlpha;
  uniform vec3 uTint;
  ${HASH}
  ${SIMPLEX3D}
  ${LOGDEPTH_PARS_FRAG}
  void main() {
    ${LOGDEPTH_FRAG}
    vec3 N = normalize(vN);
    vec3 V = normalize(uCamLocal - vPos);
    vec3 L = normalize(uSunDir);
    vec2 uv = vUv; uv.x += uOffset;
    // slow evolution of cloud shapes: domain warp that changes with time
    vec2 w = vec2(snoise(vec3(uv * vec2(8.0, 4.0), uTime * 0.01)), snoise(vec3(uv * vec2(8.0, 4.0) + 3.0, uTime * 0.011))) * uWarp;
    vec3 c = texture2D(uMap, uv + w).rgb;
    float a = (uOpaque > 0.5 ? 1.0 : smoothstep(0.08, 0.7, dot(c, vec3(0.333)))) * uAlpha;
    float ndl = dot(N, L);
    float day = smoothstep(-0.12, 0.15, ndl);
    float lit = max(ndl, 0.0);
    // cloud shading: bright tops, soft wrap lighting, slightly blue-grey shadows
    vec3 col = (uOpaque > 0.5 ? pow(c, vec3(2.2)) * uTint : vec3(1.0)) * (0.06 + 0.94 * lit) * (0.35 + 0.65 * day);
    // forward scattering rim
    float rim = pow(1.0 - max(dot(N, V), 0.0), 2.0);
    col += vec3(1.0, 0.95, 0.9) * rim * 0.15 * lit;
    gl_FragColor = vec4(col * a * uExposure, a);
  }
`;

const atmoVert = /* glsl */`
  varying vec3 vPos; varying vec3 vView;
  ${LOGDEPTH_PARS_VERT}
  void main() {
    vPos = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = -mv.xyz;
    gl_Position = projectionMatrix * mv;
    ${LOGDEPTH_VERT}
  }
`;
const atmoFrag = /* glsl */`
  precision highp float;
  varying vec3 vPos; varying vec3 vView;
  uniform vec3 uSunDir, uCamLocal, uTauR, uTauO, uMieColor;
  uniform float uPlanetR, uAtmoR, uHr, uHm, uTauM, uExposure, uSunIntensity, uHaze;
  uniform int uSteps;
  uniform float uOutside;   // 1: camera outside the shell mesh (front faces), 0: inside (back faces)
  ${LOGDEPTH_PARS_FRAG}
  vec2 raySphere(vec3 ro, vec3 rd, float R) {
    float b = dot(ro, rd); float c = dot(ro, ro) - R * R; float h = b * b - c;
    if (h < 0.0) return vec2(-1.0);
    h = sqrt(h); return vec2(-b - h, -b + h);
  }
  // Chapman grazing-incidence function (Schüler, GPU Pro 3): optical depth from altitude h (in scale heights) to space along a
  // direction with zenith cosine c, in units of beta * H. X = planet radius in scale heights.
  float chapman(float X, float h, float c) {
    float k = sqrt(X + h);
    if (c >= 0.0) return k / (k * c + 1.0) * exp(-h);
    float x0 = sqrt(1.0 - c * c) * (X + h);
    return 2.0 * sqrt(x0) * exp(min(X - x0, 0.0)) - k / (1.0 - k * c) * exp(-h);
  }
  void main() {
    if (uOutside > 0.5 ? !gl_FrontFacing : gl_FrontFacing) discard;
    ${LOGDEPTH_FRAG}
    vec3 ro = uCamLocal;
    vec3 rd = normalize(vPos - ro);
    vec2 ta = raySphere(ro, rd, uAtmoR);
    if (ta.y < 0.0) discard;
    float t0 = max(ta.x, 0.0), t1 = ta.y;
    vec2 tp = raySphere(ro, rd, uPlanetR);
    if (tp.x > 0.0) t1 = min(t1, tp.x);
    float len = t1 - t0;
    if (len <= 0.0) discard;
    vec3 L = normalize(uSunDir);
    float shell = uAtmoR - uPlanetR;
    float Hr = uHr * shell, Hm = uHm * shell;          // scale heights (planet radii)
    float XR = uPlanetR / Hr, XM = uPlanetR / Hm;
    vec3 betaR = uTauR / Hr;                           // vertical optical depth = beta * H
    vec3 betaE = (uTauR + uTauO) / Hr;                 // extinction: scattering + ozone absorption (same profile, simplification)
    float betaM = uTauM / Hm;
    float mu = dot(rd, L);
    float phaseR = 3.0 / (16.0 * 3.14159) * (1.0 + mu * mu);
    float g = 0.76; float g2 = g * g;
    float phaseM = 3.0 / (8.0 * 3.14159) * ((1.0 - g2) * (1.0 + mu * mu)) / ((2.0 + g2) * pow(1.0 + g2 - 2.0 * g * mu, 1.5));
    // samples concentrated around the lowest point of the ray (where the density peaks): cubic warp on each side of it
    float tc = clamp(-dot(ro, rd), t0, t1);
    float a = clamp((tc - t0) / len, 0.001, 0.999);
    float lA = tc - t0, lB = t1 - tc;
    vec3 sumR = vec3(0.0), sumM = vec3(0.0);
    float odR = 0.0, odM = 0.0;
    float N = float(uSteps);
    float tPrev = t0;
    for (int i = 0; i < 24; i++) {
      if (i >= uSteps) break;
      float s1 = (float(i) + 1.0) / N, sm = (float(i) + 0.5) / N;
      float u1 = s1 < a ? (s1 - a) / a : (s1 - a) / (1.0 - a);
      float um = sm < a ? (sm - a) / a : (sm - a) / (1.0 - a);
      float tEnd = tc + u1 * u1 * u1 * (u1 < 0.0 ? lA : lB);
      float tm = tc + um * um * um * (um < 0.0 ? lA : lB);
      float dt = max(tEnd - tPrev, 0.0); tPrev = tEnd;
      vec3 p = ro + rd * tm;
      float r = length(p);
      float h = max(r - uPlanetR, 0.0);
      float dR = exp(-h / Hr) * dt, dM = exp(-h / Hm) * dt;
      float vR = odR + 0.5 * dR, vM = odM + 0.5 * dM;   // view optical depth up to the sample
      odR += dR; odM += dM;
      // sunlight: none where the ray to the Sun hits the planet; otherwise the Chapman optical depth to space
      vec2 tpl = raySphere(p, L, uPlanetR);
      if (tpl.x > 0.0) continue;
      float c = dot(p, L) / r;
      float lR = Hr * chapman(XR, h / Hr, c), lM = Hm * chapman(XM, h / Hm, c);
      vec3 att = exp(-(betaE * (vR + lR) + betaM * 1.1 * (vM + lM)));
      sumR += dR * att; sumM += dM * att;
    }
    vec3 inscatter = uSunIntensity * (sumR * betaR * phaseR + sumM * betaM * phaseM * uMieColor);
    // single scattering leaves a green band where blue is gone but red is weakly scattered; real twilights are whitened by
    // multiple scattering, so pull green-dominant in-scatter toward grey
    float lum = dot(inscatter, vec3(0.3, 0.59, 0.11));
    float greenish = clamp((inscatter.g - max(inscatter.r, inscatter.b)) / (lum + 1e-4) * 3.0, 0.0, 1.0);
    inscatter = mix(inscatter, vec3(lum), greenish * 0.85);
    vec3 trans = exp(-(betaE * odR + betaM * odM));
    float alpha = 1.0 - dot(trans, vec3(0.333));
    // extra thick haze term for Venus/Titan style atmospheres (multiple scattering approximation)
    if (uHaze > 0.0) {
      float sunlit = smoothstep(-0.25, 0.35, dot(normalize(ro + rd * (t0 + len * 0.5)), L));
      inscatter += uMieColor * uHaze * alpha * sunlit * 0.6;
    }
    gl_FragColor = vec4(inscatter * uExposure, clamp(alpha, 0.0, 1.0));
  }
`;


let _geoCache = {};
function sphereGeo(seg) {
  const k = 'g' + seg;
  if (!_geoCache[k]) _geoCache[k] = new THREE.SphereGeometry(1, seg, Math.round(seg * 0.75));
  return _geoCache[k];
}

/**
 * Physically based atmosphere parameters: scale height H (km), vertical optical depth of the Rayleigh part (at the blue
 * reference of `rayleigh`) and of the Mie/aerosol part, Mie scale height as a fraction of H, and the in-scatter strength.
 * Earth: tau_R ~ 0.30 at 440 nm, aerosol tau ~ 0.1 (clear day), H = 8.5 km, aerosols ~1.2 km.
 */
const ATMO_PHYS = {
  earth:   { H: 8.5,  tauR: 0.30, tauM: 0.18, hm: 0.4, tauO: [0.03, 0.035, 0.004] },   // ozone (Chappuis band): 300 DU
  venus:   { H: 15.9, tauR: 4.0,  tauM: 25.0, hm: 0.6 },
  mars:    { H: 11.1, tauR: 0.05, tauM: 0.45, hm: 0.6 },
  jupiter: { H: 27,   tauR: 0.5,  tauM: 0.5,  hm: 0.6 },
  saturn:  { H: 59.5, tauR: 0.5,  tauM: 0.6,  hm: 0.6 },
  uranus:  { H: 27.7, tauR: 1.5,  tauM: 0.3,  hm: 0.6 },
  neptune: { H: 19.7, tauR: 1.5,  tauM: 0.3,  hm: 0.6 },
  pluto:   { H: 50,   tauR: 0.008, tauM: 0.012, hm: 0.8 },
  titan:   { H: 40,   tauR: 2.5,  tauM: 8.0,  hm: 0.7 },
  triton:  { H: 14,   tauR: 0.01, tauM: 0.02, hm: 0.8 },
};
function atmoPhysics(def, atmo) {
  const Rkm = def.radiusKm || def.r || 6371;
  const ph = ATMO_PHYS[def.id] || { H: 0.25 * Rkm * atmo.height, tauR: 0.3 * (atmo.density || 1), tauM: 0.1 * (atmo.mie || 0.5) * (atmo.density || 1), hm: 0.5 };
  return { hr: THREE.MathUtils.clamp(ph.H / (Rkm * atmo.height), 0.02, 0.9), hm: ph.hm, tauR: ph.tauR, tauM: ph.tauM, tauO: ph.tauO, sun: 3.5 };
}

export class PlanetRenderer {
  /**
   * body: Body; textures: {map, night, spec, normal, cloud, emissive}; ringTex optional
   */
  constructor(body, tex, opts = {}) {
    this.body = body;
    const def = body.def;
    this.group = body.group;
    const atmo = def.atmosphere;
    this.tex = tex;
    const u = {
      uMap: { value: tex.map }, uNightMap: { value: tex.night || tex.map }, uSpecMap: { value: tex.spec || tex.map }, uNormalMap: { value: tex.normal || tex.map }, uCloudMap: { value: tex.cloud || tex.map }, uRingTex: { value: opts.ringTex || tex.map }, uEmissiveMap: { value: tex.emissive || tex.map },
      uHasNight: { value: tex.night ? 1 : 0 }, uHasSpec: { value: tex.spec ? 1 : 0 }, uHasNormal: { value: tex.normal ? 1 : 0 }, uHasCloud: { value: tex.cloud && !atmo?.thick ? 1 : 0 }, uHasRing: { value: opts.ringTex ? 1 : 0 }, uHasEmissive: { value: tex.emissive ? 1 : 0 },
      uNormalScale: { value: opts.normalScale ?? 1.0 },
      uSunDir: { value: new THREE.Vector3(1, 0, 0) }, uCamLocal: { value: new THREE.Vector3(0, 0, 5) }, uLocalToView: { value: new THREE.Matrix3() },
      uAtmoColor: { value: new THREE.Vector3(...(atmo?.color || [0.5, 0.6, 1.0])) }, uAtmoStrength: { value: atmo ? Math.min(atmo.density, 1.2) : 0 },
      uTime: { value: 0 }, uCloudOffset: { value: 0 }, uSunAngular: { value: 0.0046 }, uGas: { value: def.type === 'gas' || def.type === 'ice' ? 1 : 0 }, uBands: { value: def.id === 'jupiter' ? 1.0 : def.id === 'saturn' ? 0.6 : 0.3 }, uSpotStrength: { value: def.id === 'jupiter' ? 1.0 : 0 },
      uSpot: { value: new THREE.Vector2(0.64, 0.62) },
      uRingInner: { value: def.rings?.inner || 0 }, uRingOuter: { value: def.rings?.outer || 0 }, uRingNormal: { value: new THREE.Vector3(0, 1, 0) },
      uMoons: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] }, uMoonCount: { value: 0 },
      uHexagon: { value: def.id === 'saturn' ? 1 : 0 }, uDarkSpot: { value: def.id === 'neptune' ? 1 : 0 }, uPolarBright: { value: def.id === 'uranus' ? 1 : 0 }, uExposure: { value: 1 }, uNoTerminator: { value: 0 },
      uTint: { value: new THREE.Vector3(1, 1, 1) },
      uTileUV: { value: new THREE.Vector4(0, 0, 1, 1) }, uNightTileUV: { value: new THREE.Vector4(0, 0, 1, 1) },
    };
    this.surfMat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: surfVert, fragmentShader: surfFrag });
    this.surface = new THREE.Mesh(sphereGeo(96), this.surfMat);
    this.surface.renderOrder = 60;
    this.group.add(this.surface);

    if (tex.cloud) {
      this.cloudMat = new THREE.ShaderMaterial({
        uniforms: { uMap: { value: tex.cloud }, uSunDir: u.uSunDir, uCamLocal: u.uCamLocal, uTime: { value: 0 }, uOffset: { value: 0 }, uOpaque: { value: atmo?.thick ? 1 : 0 }, uAlpha: { value: 1 }, uExposure: { value: 1 }, uWarp: { value: atmo?.thick ? 0.004 : 0.006 }, uTint: { value: new THREE.Vector3(...(def.id === 'venus' ? [1.0, 0.92, 0.75] : [1, 1, 1])) } },
        vertexShader: cloudVert, fragmentShader: cloudFrag, transparent: !atmo?.thick, depthWrite: !!atmo?.thick,
        blending: atmo?.thick ? THREE.NormalBlending : THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      });
      this.clouds = new THREE.Mesh(sphereGeo(96), this.cloudMat);
      this.clouds.scale.setScalar(atmo?.thick ? 1.012 : 1.006);
      this.clouds.renderOrder = 61;
      this.group.add(this.clouds);
    }

    if (atmo) {
      const h = atmo.height;
      const ph = atmoPhysics(def, atmo);
      this.atmoMat = new THREE.ShaderMaterial({
        uniforms: {
          uSunDir: u.uSunDir, uCamLocal: u.uCamLocal, uTauR: { value: new THREE.Vector3(...atmo.rayleigh).multiplyScalar(ph.tauR) }, uTauO: { value: new THREE.Vector3(...(ph.tauO || [0, 0, 0])) }, uMieColor: { value: new THREE.Vector3(...atmo.color) },
          uPlanetR: { value: 1.0 }, uAtmoR: { value: 1 + h }, uHr: { value: ph.hr }, uHm: { value: ph.hr * ph.hm }, uTauM: { value: ph.tauM }, uExposure: { value: 1 }, uSunIntensity: { value: ph.sun }, uHaze: { value: atmo.thick ? 0.8 : 0 },
          uSteps: { value: 12 }, uOutside: { value: 1 },
        },
        vertexShader: atmoVert, fragmentShader: atmoFrag, transparent: true, depthWrite: false, side: THREE.DoubleSide,
        blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
      });
      this.atmosphere = new THREE.Mesh(sphereGeo(64), this.atmoMat);
      this.atmosphere.scale.setScalar((1 + h) * 1.012);   // slightly outside the analytic shell (polygon sag; camera sitting exactly on the shell)
      this.atmosphere.renderOrder = 62;
      this.group.add(this.atmosphere);
    }
    this._sunLocal = new THREE.Vector3(); this._camLocal = new THREE.Vector3();
    this.tiles = undefined; this._hi = null; this._hiOn = false; this._hiFarSince = 0;
  }

  /** Swap the 2K maps for the local 8K ones while the planet is large on screen (high / ultra presets). */
  _hiRes(rpx, eng) {
    const id = this.body.def.id, spec = HIRES[id];
    if (!spec || !eng.q.hiRes) return;
    const u = this.surfMat.uniforms;
    if (rpx > 260) {
      this._hiFarSince = 0;
      if (!this._hi) { this._hi = {}; for (const k of Object.keys(spec)) loadHiRes(spec[k], eng.renderer).then(tex => { if (this._hi) this._hi[k] = tex; }); }
      if (!this._hiOn && this._hi.map) {
        this._hiOn = true;
        u.uMap.value = this._hi.map;
        if (this._hi.night) u.uNightMap.value = this._hi.night;
        if (this._hi.cloud) { u.uCloudMap.value = this._hi.cloud; if (this.cloudMat) this.cloudMat.uniforms.uMap.value = this._hi.cloud; }
      }
    } else if (this._hiOn && rpx < 120) {
      this._hiOn = false;
      u.uMap.value = this.tex.map; u.uNightMap.value = this.tex.night || this.tex.map;
      if (this._hi.cloud) { u.uCloudMap.value = this.tex.cloud || this.tex.map; if (this.cloudMat) this.cloudMat.uniforms.uMap.value = this.tex.cloud; }
      this._hiFarSince = performance.now();
    } else if (!this._hiOn && this._hi && this._hiFarSince && performance.now() - this._hiFarSince > 90000) {
      // long gone: free the GPU memory
      for (const k of Object.keys(this._hi)) if (this._hi[k]) this._hi[k].dispose();
      for (const k of Object.keys(spec)) loadHiRes.release(spec[k]);
      this._hi = null; this._hiFarSince = 0;
    }
  }

  /** moons: array of {position (world), radius} for shadows */
  update(t, camPos, sunPos, rpx, moons = [], exposure = 1, camera = null) {
    const b = this.body;
    const u = this.surfMat.uniforms;
    // sun direction & camera in local unit-sphere space
    const sunDirWorld = this._sunLocal.copy(sunPos).sub(b.position).normalize();
    b.worldDirToLocal(sunDirWorld, u.uSunDir.value);
    b.worldToLocal(camPos, u.uCamLocal.value);
    u.uTime.value = t;
    u.uExposure.value = exposure;
    u.uSunAngular.value = 695700 / (b.position.length() * 1000 + 1) * 1.2;
    // moons
    let mc = 0;
    for (const m of moons) {
      if (mc >= 4) break;
      const lp = b.worldToLocal(m.position, this._camLocal);
      u.uMoons.value[mc].set(lp.x, lp.y, lp.z, m.radius / b.radius);
      mc++;
    }
    u.uMoonCount.value = mc;
    if (this.cloudMat) {
      const cu = this.cloudMat.uniforms;
      cu.uTime.value = t; cu.uExposure.value = exposure;
      const rotD = b.def.atmosphere?.cloudRotationD || 20;
      cu.uOffset.value = (this.body.manager.time.daysSinceJ2000 / rotD) % 1;
      u.uCloudOffset.value = cu.uOffset.value;
      // thin (Earth-like) cloud decks fade out below ~0.25 radii so the surface tiles can be explored; thick decks (Venus) stay
      const altR = u.uCamLocal.value.length() - 1;
      const cf = b.def.atmosphere?.thick ? 1 : THREE.MathUtils.smoothstep(altR, 0.06, 0.3);
      cu.uAlpha.value = cf; this._cloudOn = cf > 0.01;
    }
    if (this.atmoMat) {
      const au = this.atmoMat.uniforms;
      au.uExposure.value = exposure;
      // LOD steps
      const q = this.body.manager.engine.q;
      au.uSteps.value = rpx > 400 ? Math.max(q.atmoSteps, 10) : rpx > 60 ? Math.max(Math.min(q.atmoSteps, 10), 8) : 6;
      const outside = u.uCamLocal.value.length() > this.atmosphere.scale.x;
      au.uOutside.value = outside ? 1 : 0; this.atmoMat.depthTest = outside;
    }
    // close-up detail: local 8K textures, then streamed NASA tiles (Earth, Moon, Mars, Mercury)
    const eng = b.manager && b.manager.engine;
    if (eng) {
      if (this.tiles === undefined) this.tiles = (TILE_SOURCES[b.def.id] && eng.q.tiles > 0) ? new TileGlobe(this, TILE_SOURCES[b.def.id], eng.renderer, eng.q.tiles, eng.q.hiRes ? TILE_SOURCES[b.def.id].minHi : TILE_SOURCES[b.def.id].minLo) : null;
      if (this.tiles && camera) { const focal = window.innerHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)); this.tiles.update(camera, u.uCamLocal.value, rpx, focal, eng.dt || 0.016); }
      this._hiRes(rpx, eng);
    }
    // geometry LOD
    const seg = rpx > 500 ? 160 : rpx > 120 ? 96 : rpx > 24 ? 48 : 20;
    const g = sphereGeo(seg);
    if (this.surface.geometry !== g) { this.surface.geometry = g; if (this.clouds) this.clouds.geometry = g; if (this.atmosphere) this.atmosphere.geometry = sphereGeo(Math.max(24, seg / 2 | 0)); }
    const vis = rpx > 0.8;
    this.surface.visible = vis;
    if (this.clouds) this.clouds.visible = vis && rpx > 3 && this._cloudOn !== false;
    if (this.atmosphere) this.atmosphere.visible = vis && rpx > 2;
  }
}
