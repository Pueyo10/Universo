import * as THREE from 'three';
import { LY, radecToVector } from '../core/Units.js';
import { LOGDEPTH_PARS_VERT, LOGDEPTH_VERT, LOGDEPTH_PARS_FRAG, LOGDEPTH_FRAG } from '../shaders/chunks.js';

// Baked volumetric nebulae. A flagship nebula (the Orion Nebula) is not procedural: its
// emission and dust were computed offline (tools/nebula/bake_orion.py — blister geometry +
// photon-conserving ionising radiative transfer from the Trapezium) and stored as 3D textures:
//   tEmis  RGBA8: H-alpha, [OIII], [NII]+[SII], dust-scattered starlight (log-encoded)
//   tDust  R8   : visual extinction per light-year (sqrt-encoded)
//   tDetail RG8 : tiling fBm + ridged turbulence, adds structure below the voxel size
// The grid is warped (sinh per axis) so the bright core gets most of the voxels.
// Volume frame: x = sky East, y = sky North, z = away from Earth, light-years, origin at the
// ionising star (theta-1 Ori C). The mesh is the catalogue proxy sphere; the shader clips the
// ray to the baked ellipsoid and marches it in light-years.

const vert = /* glsl */`
  varying vec3 vViewDir;
  ${LOGDEPTH_PARS_VERT}
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewDir = mv.xyz;
    gl_Position = projectionMatrix * mv;
    ${LOGDEPTH_VERT}
  }
`;

const frag = /* glsl */`
  precision highp float;
  precision highp sampler3D;
  varying vec3 vViewDir;
  uniform mat3 uCamToWorld, uWorldToVol;
  uniform vec3 uCamVol;                     // camera in the volume frame (ly)
  uniform sampler3D tEmis, tDust, tDetail;
  uniform vec3 uWarpC, uWarpH, uWarpA, uWarpS;   // warp centre, half size, a, sinh(a)
  uniform vec3 uEllC, uEllR;                // content ellipsoid (ly)
  uniform vec4 uChan;                       // per-channel scale (relative to H-alpha), already ^gamma
  uniform float uDec, uGamma, uGain, uDustScale, uFade, uFrame, uBand, uDetail, uDetailFreq;
  uniform int uSteps;
  ${LOGDEPTH_PARS_FRAG}

  // line colours (sRGB-ish linear): H-alpha + H-beta pink-red, [OIII] teal, [NII]/[SII] deep red, blue reflection
  const vec3 C_HA = vec3(1.0, 0.13, 0.24);
  const vec3 C_O3 = vec3(0.05, 1.0, 0.78);
  const vec3 C_LOW = vec3(1.0, 0.06, 0.03);
  const vec3 C_SC = vec3(0.50, 0.66, 1.0);
  const vec3 EXT_RGB = vec3(0.74, 1.0, 1.30);   // reddening: blue is absorbed more

  vec3 volUV(vec3 p) { return (asinh((p - uWarpC) / uWarpH * uWarpS) / uWarpA) * 0.5 + 0.5; }

  void main() {
    ${LOGDEPTH_FRAG}
    vec3 rd = normalize(uWorldToVol * (uCamToWorld * normalize(vViewDir)));
    vec3 ro = uCamVol;
    // ray / ellipsoid
    vec3 o = (ro - uEllC) / uEllR, d = rd / uEllR;
    float a = dot(d, d), b = dot(o, d), c = dot(o, o) - 1.0;
    float h = b * b - a * c;
    if (h <= 0.0) discard;
    h = sqrt(h);
    float t0 = max((-b - h) / a, 0.0), t1 = (-b + h) / a;
    if (t1 <= t0) discard;
    float len = t1 - t0;
    float dt = len / float(uSteps);
    // interleaved gradient noise, rotated every frame (the TAA pass integrates it)
    float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    float t = t0 + dt * fract(ign + uFrame * 0.61803399);
    vec3 acc = vec3(0.0), T = vec3(1.0);
    float k10 = uDec * uGamma * 3.32192809;   // log2(10)
    bool ir = uBand > 0.5 && uBand < 1.5, radio = uBand > 3.5;
    for (int i = 0; i < 256; i++) {
      if (i >= uSteps) break;
      vec3 p = ro + rd * t;
      vec3 uvw = volUV(p);
      vec4 E = texture(tEmis, uvw);
      float D = texture(tDust, uvw).r;
      if (max(max(E.r, E.g), max(E.b, E.a)) + D > 0.004) {
        // sub-voxel turbulence: two octaves of the tiling detail texture, the second domain-warped by the first
        vec2 n = texture(tDetail, p * uDetailFreq).rg;
        vec2 n2 = texture(tDetail, p * uDetailFreq * 3.7 + vec3(n.x - 0.5, n.y - 0.5, n.x - n.y) * 0.45).rg;
        float m = mix(1.0, (0.3 + 1.4 * n.r) * (0.35 + 1.3 * n2.g) * (0.55 + 0.9 * n2.r), uDetail);
        // dust: ridged filaments (dark wisps and threads across the bright core)
        float md = mix(1.0, (0.15 + 1.7 * n2.g) * (0.4 + 1.2 * n.r), uDetail);
        vec4 e = uChan * exp2((E - 1.0) * k10) * step(0.003, E);
        // scattering phase (Henyey-Greenstein, g = 0.45) around the Trapezium
        float ct = dot(rd, p) / max(length(p), 1e-3);
        float ph = 0.7975 / pow(1.2025 - 0.9 * ct, 1.5);
        vec3 em;
        if (uBand < 0.5) em = e.r * C_HA + e.g * C_O3 + e.b * C_LOW + e.a * ph * C_SC;
        else if (ir) em = vec3(1.0, 0.5, 0.22) * (e.a * 2.5 + 0.02 * D * D) + vec3(0.9, 0.35, 0.3) * e.b * 0.3;   // warm dust
        else if (uBand < 2.5) em = vec3(0.45, 0.6, 1.0) * (e.g * 1.6 + e.r * 0.5);                                // UV: ionised gas
        else if (uBand < 3.5) em = vec3(0.7, 0.55, 1.0) * e.g * 0.12;                                               // X-ray: hot cavity gas
        else em = vec3(0.45, 1.0, 0.6) * (e.r + e.b * 0.5);                                                        // radio free-free
        em *= m * uGain;
        float sig = uDustScale * D * D * md * (ir || radio ? 0.03 : uBand > 2.5 ? 0.3 : 1.0);
        vec3 tau = sig * EXT_RGB * dt;
        vec3 tr = exp(-tau);
        acc += T * em * dt * mix(vec3(1.0), (1.0 - tr) / max(tau, vec3(1e-5)), step(1e-4, tau));
        T *= tr;
        if (max(T.r, max(T.g, T.b)) < 0.01) break;
      }
      t += dt;
    }
    vec3 col = acc * uFade;
    float alpha = (1.0 - dot(T, vec3(0.3333))) * uFade;
    if (alpha < 0.002 && max(col.r, max(col.g, col.b)) < 0.0005) discard;
    gl_FragColor = vec4(col, alpha);
  }
`;

// Named stars of the Orion Nebula in the volume frame (ly). Offsets of the Trapezium from theta-1 C
// come from their J2000 positions (1" = 0.0065 ly at 1,344 ly); depths are not measured (0).
export const ORION_STARS = [
  { name: 'θ¹ Ori C', p: [0, 0, 0], lum: 90000, col: [0.62, 0.74, 1.0] },
  { name: 'θ¹ Ori A', p: [-0.061, 0.055, 0.02], lum: 18000, col: [0.66, 0.77, 1.0] },
  { name: 'θ¹ Ori B', p: [-0.032, 0.104, -0.03], lum: 4000, col: [0.7, 0.8, 1.0] },
  { name: 'θ¹ Ori D', p: [0.078, 0.040, 0.01], lum: 14000, col: [0.66, 0.77, 1.0] },
  { name: 'θ² Ori A', p: [0.63, -0.62, -1.3], lum: 40000, col: [0.64, 0.76, 1.0] },
  { name: 'NU Ori', p: [1.45, 2.87, -0.1], lum: 20000, col: [0.66, 0.78, 1.0] },
  { name: '42 Ori', p: [-0.4, 12.6, -1.6], lum: 9000, col: [0.68, 0.79, 1.0] },
  { name: 'ι Ori', p: [0.6, -14.0, -2.6], lum: 60000, col: [0.63, 0.75, 1.0] },
];

/** Orthonormal sky frame at (ra, dec): East, North, and the line of sight (away from Earth), in scene axes. */
export function skyFrame(ra, dec) {
  const p = radecToVector(ra, dec);
  const L = p.clone().normalize();
  const E = radecToVector(ra + 0.01, dec).sub(p).normalize();
  const N = new THREE.Vector3().crossVectors(L, E).normalize();
  E.crossVectors(N, L).normalize();
  return { E, N, L };
}

async function gunzip(buf) {
  const u8 = new Uint8Array(buf);
  if (!(u8[0] === 0x1f && u8[1] === 0x8b)) return u8;      // already decoded by the server (Content-Encoding)
  if (typeof DecompressionStream !== 'undefined') {
    const ds = new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('gzip')));
    return new Uint8Array(await ds.arrayBuffer());
  }
  const { gunzipSync } = await import('three/examples/jsm/libs/fflate.module.js');
  return gunzipSync(u8);
}

function tex3D(data, w, h, d, format, wrap = THREE.ClampToEdgeWrapping) {
  const t = new THREE.Data3DTexture(data, w, h, d);
  t.format = format; t.type = THREE.UnsignedByteType;
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = t.wrapR = wrap;
  t.unpackAlignment = 1; t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

/** Load a baked volume (json + gzip'd blob) and build its ray-march material. */
export async function loadNebulaVolume(name) {
  const base = `${import.meta.env.BASE_URL}volumes/${name}`;
  const meta = await (await fetch(`${base}.json`)).json();
  const res = await fetch(`${base}.vol`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const raw = await gunzip(await res.arrayBuffer());
  const [NX, NY, NZ] = meta.dims;
  const nE = NX * NY * NZ * 4, nD = NX * NY * NZ, [DX, DY, DZ] = meta.layout[2].dims;
  if (raw.byteLength < nE + nD + DX * DY * DZ * 2) throw new Error('truncated volume');
  const tEmis = tex3D(raw.subarray(0, nE), NX, NY, NZ, THREE.RGBAFormat);
  const tDust = tex3D(raw.subarray(nE, nE + nD), NX, NY, NZ, THREE.RedFormat);
  const tDetail = tex3D(raw.subarray(nE + nD, nE + nD + DX * DY * DZ * 2), DX, DY, DZ, THREE.RGFormat, THREE.RepeatWrapping);
  const w = meta.warp, s = meta.scales, e = meta.envelope || 0.97;
  // display grading (from the bake's json): emissivity^gamma compresses the ~10^4 dynamic range
  // like an astrophoto stretch; per-line gains set the palette (H-alpha, [OIII], [NII]+[SII], scattered)
  const r = meta.render || {};
  const gamma = r.gamma ?? 0.6, cg = r.chanGain || [1, 1, 1, 1];
  const chan = new THREE.Vector4(1, s.o3 / s.ha, s.low / s.ha, s.scat / s.ha);
  ['x', 'y', 'z', 'w'].forEach((k, i) => { chan[k] = Math.pow(chan[k], gamma) * cg[i]; });
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uCamToWorld: { value: new THREE.Matrix3() }, uWorldToVol: { value: new THREE.Matrix3() }, uCamVol: { value: new THREE.Vector3() },
      tEmis: { value: tEmis }, tDust: { value: tDust }, tDetail: { value: tDetail },
      uWarpC: { value: new THREE.Vector3(w.x[0], w.y[0], w.z[0]) }, uWarpH: { value: new THREE.Vector3(w.x[1], w.y[1], w.z[1]) },
      uWarpA: { value: new THREE.Vector3(w.x[2], w.y[2], w.z[2]) }, uWarpS: { value: new THREE.Vector3(Math.sinh(w.x[2]), Math.sinh(w.y[2]), Math.sinh(w.z[2])) },
      uEllC: { value: new THREE.Vector3(w.x[0], w.y[0], w.z[0]) }, uEllR: { value: new THREE.Vector3(w.x[1] * e, w.y[1] * e, w.z[1] * e) },
      uChan: { value: chan }, uDec: { value: meta.dec }, uGamma: { value: gamma }, uGain: { value: r.gain ?? 0.1 },
      uDustScale: { value: s.dust }, uFade: { value: 1 }, uFrame: { value: 0 }, uBand: { value: 0 },
      uDetail: { value: r.detail ?? 0.9 }, uDetailFreq: { value: 1 / (r.detailTile ?? 1.4) }, uSteps: { value: 64 },
    },
    vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false, depthTest: false, side: THREE.BackSide,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
  return { meta, mat, textures: [tEmis, tDust, tDetail], bytes: raw.byteLength };
}

/** Per-frame uniforms for a baked nebula item (camera-relative, all in light-years). */
export function updateVolumeUniforms(it, camPos, camRot, steps, fade, frame) {
  const u = it.mat.uniforms;
  u.uCamToWorld.value.copy(camRot);
  u.uWorldToVol.value.copy(it.worldToVol);
  u.uCamVol.value.copy(camPos).sub(it.pos).multiplyScalar(1 / LY).applyMatrix3(it.worldToVol);
  u.uSteps.value = steps; u.uFade.value = fade; u.uFrame.value = frame % 4096;
}
