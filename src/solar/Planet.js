import * as THREE from 'three';
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
    vec3 albedo = srgb2lin(texture2D(uMap, uv).rgb) * uTint;

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
      col += vec3(1.0, 0.95, 0.85) * glint * spec * (0.25 + 0.75 * fres) * day * shadow;
      // sea colour deepening with view angle
      col += vec3(0.02, 0.05, 0.1) * spec * fres * day;
    }
    // night lights
    if (uHasNight > 0.5) {
      vec3 night = srgb2lin(texture2D(uNightMap, uv).rgb);
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
  uniform float uTime, uOffset, uOpaque, uExposure, uWarp;
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
    float a = uOpaque > 0.5 ? 1.0 : smoothstep(0.08, 0.7, dot(c, vec3(0.333)));
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
  uniform vec3 uSunDir, uCamLocal, uRayleigh, uMieColor;
  uniform float uPlanetR, uAtmoR, uHr, uHm, uDensity, uMie, uExposure, uSunIntensity, uHaze;
  uniform int uSteps, uLightSteps;
  ${LOGDEPTH_PARS_FRAG}
  vec2 raySphere(vec3 ro, vec3 rd, float R) {
    float b = dot(ro, rd); float c = dot(ro, ro) - R * R; float h = b * b - c;
    if (h < 0.0) return vec2(-1.0);
    h = sqrt(h); return vec2(-b - h, -b + h);
  }
  void main() {
    ${LOGDEPTH_FRAG}
    vec3 ro = uCamLocal;
    vec3 rd = normalize(vPos - ro);
    vec2 ta = raySphere(ro, rd, uAtmoR);
    if (ta.y < 0.0) discard;
    float t0 = max(ta.x, 0.0), t1 = ta.y;
    vec2 tp = raySphere(ro, rd, uPlanetR);
    bool hitPlanet = tp.x > 0.0;
    if (hitPlanet) t1 = min(t1, tp.x);
    float len = t1 - t0;
    if (len <= 0.0) discard;
    vec3 L = normalize(uSunDir);
    float shell = uAtmoR - uPlanetR;
    float Hr = uHr * shell, Hm = uHm * shell;
    vec3 betaR = uRayleigh * uDensity * 22.0 / shell;
    float betaM = uMie * uDensity * 6.0 / shell;
    float mu = dot(rd, L);
    float phaseR = 3.0 / (16.0 * 3.14159) * (1.0 + mu * mu);
    float g = 0.76; float g2 = g * g;
    float phaseM = 3.0 / (8.0 * 3.14159) * ((1.0 - g2) * (1.0 + mu * mu)) / ((2.0 + g2) * pow(1.0 + g2 - 2.0 * g * mu, 1.5));
    vec3 sumR = vec3(0.0), sumM = vec3(0.0);
    float odR = 0.0, odM = 0.0;
    float dt = len / float(uSteps);
    float t = t0 + dt * 0.5;
    for (int i = 0; i < 24; i++) {
      if (i >= uSteps) break;
      vec3 p = ro + rd * t;
      float h = max(length(p) - uPlanetR, 0.0);
      float dR = exp(-h / Hr) * dt, dM = exp(-h / Hm) * dt;
      odR += dR; odM += dM;
      // light optical depth
      vec2 tl = raySphere(p, L, uAtmoR);
      float lenL = tl.y;
      // planet shadow (night side): if the sun ray hits the planet → no light
      vec2 tpl = raySphere(p, L, uPlanetR);
      float lodR = 0.0, lodM = 0.0;
      bool dark = tpl.x > 0.0;
      if (!dark) {
        float dl = lenL / float(uLightSteps);
        float tl2 = dl * 0.5;
        for (int j = 0; j < 8; j++) {
          if (j >= uLightSteps) break;
          vec3 q = p + L * tl2;
          float hq = max(length(q) - uPlanetR, 0.0);
          lodR += exp(-hq / Hr) * dl; lodM += exp(-hq / Hm) * dl;
          tl2 += dl;
        }
        vec3 tau = betaR * (odR + lodR) + betaM * 1.1 * (odM + lodM);
        vec3 att = exp(-tau);
        sumR += dR * att; sumM += dM * att;
      }
      t += dt;
    }
    vec3 inscatter = uSunIntensity * (sumR * betaR * phaseR + sumM * betaM * phaseM * uMieColor);
    // extra thick haze term for Venus/Titan style atmospheres (multiple scattering approximation)
    vec3 trans = exp(-(betaR * odR + betaM * odM));
    float alpha = 1.0 - dot(trans, vec3(0.333));
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
    };
    this.surfMat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: surfVert, fragmentShader: surfFrag });
    this.surface = new THREE.Mesh(sphereGeo(96), this.surfMat);
    this.surface.renderOrder = 60;
    this.group.add(this.surface);

    if (tex.cloud) {
      this.cloudMat = new THREE.ShaderMaterial({
        uniforms: { uMap: { value: tex.cloud }, uSunDir: u.uSunDir, uCamLocal: u.uCamLocal, uTime: { value: 0 }, uOffset: { value: 0 }, uOpaque: { value: atmo?.thick ? 1 : 0 }, uExposure: { value: 1 }, uWarp: { value: atmo?.thick ? 0.004 : 0.006 }, uTint: { value: new THREE.Vector3(...(def.id === 'venus' ? [1.0, 0.92, 0.75] : [1, 1, 1])) } },
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
      this.atmoMat = new THREE.ShaderMaterial({
        uniforms: {
          uSunDir: u.uSunDir, uCamLocal: u.uCamLocal, uRayleigh: { value: new THREE.Vector3(...atmo.rayleigh) }, uMieColor: { value: new THREE.Vector3(...atmo.color) },
          uPlanetR: { value: 1.0 }, uAtmoR: { value: 1 + h }, uHr: { value: 0.25 }, uHm: { value: 0.1 }, uDensity: { value: atmo.density }, uMie: { value: atmo.mie }, uExposure: { value: 1 }, uSunIntensity: { value: 20.0 }, uHaze: { value: atmo.thick ? 0.8 : 0 },
          uSteps: { value: 12 }, uLightSteps: { value: 4 },
        },
        vertexShader: atmoVert, fragmentShader: atmoFrag, transparent: true, depthWrite: false, side: THREE.BackSide,
        blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
      });
      this.atmosphere = new THREE.Mesh(sphereGeo(64), this.atmoMat);
      this.atmosphere.scale.setScalar(1 + h);
      this.atmosphere.renderOrder = 62;
      this.group.add(this.atmosphere);
    }
    this._sunLocal = new THREE.Vector3(); this._camLocal = new THREE.Vector3();
  }

  /** moons: array of {position (world), radius} for shadows */
  update(t, camPos, sunPos, rpx, moons = [], exposure = 1) {
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
    }
    if (this.atmoMat) {
      const au = this.atmoMat.uniforms;
      au.uExposure.value = exposure;
      // LOD steps
      const q = this.body.manager.engine.q;
      au.uSteps.value = rpx > 400 ? q.atmoSteps : rpx > 60 ? Math.min(q.atmoSteps, 10) : 6;
      au.uLightSteps.value = rpx > 400 ? q.atmoLight : 3;
    }
    // geometry LOD
    const seg = rpx > 500 ? 160 : rpx > 120 ? 96 : rpx > 24 ? 48 : 20;
    const g = sphereGeo(seg);
    if (this.surface.geometry !== g) { this.surface.geometry = g; if (this.clouds) this.clouds.geometry = g; if (this.atmosphere) this.atmosphere.geometry = sphereGeo(Math.max(24, seg / 2 | 0)); }
    const vis = rpx > 0.8;
    this.surface.visible = vis;
    if (this.clouds) this.clouds.visible = vis && rpx > 3;
    if (this.atmosphere) this.atmosphere.visible = vis && rpx > 2;
  }
}
