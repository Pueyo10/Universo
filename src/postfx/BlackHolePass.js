import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { HASH, VALUE_NOISE3D, COLOR_UTILS } from '../shaders/chunks.js';

// Screen-space black hole: null geodesics are integrated in a Schwarzschild
// metric (exact spatial equation d²x/dλ² = -3/2 h² x / r⁵ in units of Rs),
// producing gravitational lensing of the rendered scene, the photon ring, the
// event-horizon shadow and a relativistic accretion disc with Doppler beaming.
const BlackHoleShader = {
  uniforms: {
    tDiffuse: { value: null },
    uBH: { value: new THREE.Vector3(0, 0, -100) },   // view-space position (scene units)
    uRs: { value: 1.0 },                                 // Schwarzschild radius (scene units)
    uAxis: { value: new THREE.Vector3(0, 1, 0) },     // disc normal, view space
    uTanHalfFov: { value: 0.5 },
    uAspect: { value: 1.77 },
    uCamToWorld: { value: new THREE.Matrix3() },
    uTime: { value: 0 },
    uSteps: { value: 160 },
    uDiskInner: { value: 3.0 },
    uDiskOuter: { value: 12.0 },
    uDiskBrightness: { value: 2.2 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uActive: { value: 0.0 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */`
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform vec3 uBH, uAxis;
    uniform float uRs, uTanHalfFov, uAspect, uTime, uDiskInner, uDiskOuter, uDiskBrightness, uActive;
    uniform int uSteps;
    uniform mat3 uCamToWorld;
    uniform vec2 uResolution;
    varying vec2 vUv;
    ${HASH}
    ${VALUE_NOISE3D}
    ${COLOR_UTILS}

    vec3 dirFromUv(vec2 uv) {
      vec2 p = (uv * 2.0 - 1.0) * vec2(uTanHalfFov * uAspect, uTanHalfFov);
      return normalize(vec3(p, -1.0));
    }
    // inverse: view-space direction -> uv (returns z<0 validity)
    vec2 uvFromDir(vec3 d) {
      vec2 p = d.xy / (-d.z);
      return p / vec2(uTanHalfFov * uAspect, uTanHalfFov) * 0.5 + 0.5;
    }

    // procedural fallback sky for rays escaping off-screen (matches BackgroundSky style)
    vec3 fallbackSky(vec3 wd) {
      vec3 a = abs(wd);
      vec2 f; float face;
      if (a.x >= a.y && a.x >= a.z) { f = wd.yz / a.x; face = wd.x > 0.0 ? 0.0 : 1.0; }
      else if (a.y >= a.z) { f = wd.xz / a.y; face = wd.y > 0.0 ? 2.0 : 3.0; }
      else { f = wd.xy / a.z; face = wd.z > 0.0 ? 4.0 : 5.0; }
      f = f * 0.5 + 0.5;
      vec3 col = vec3(0.0);
      float N = 180.0;
      vec2 c = f * N; vec2 ci = floor(c); vec2 cf = c - ci;
      for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
        vec2 cc = ci + vec2(x, y);
        vec3 h = hash33(vec3(cc, face * 17.0 + 3.0));
        vec2 sp = vec2(x, y) + h.xy - cf;
        float d = length(sp);
        float b = pow(h.z, 12.0) * 2.0;
        col += vec3(0.8 + 0.2 * h.x, 0.85, 1.0) * b * exp(-d * d * 18.0);
      }
      return col * 0.6;
    }

    vec4 disk(vec3 p, vec3 rayDir, float r) {
      // p in Rs units, on the disc plane. Build in-plane coords.
      vec3 n = uAxis;
      vec3 t1 = normalize(cross(n, abs(n.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
      vec3 t2 = cross(n, t1);
      float phi = atan(dot(p, t2), dot(p, t1));
      // Keplerian angular velocity (differential rotation), scaled for visuals
      float omega = 0.35 / pow(r, 1.5);
      float ang = phi - omega * uTime * 6.0;
      float rn = (r - uDiskInner) / (uDiskOuter - uDiskInner);
      // density: radial profile × turbulent noise in rotating frame
      float prof = smoothstep(0.0, 0.08, rn) * (1.0 - smoothstep(0.55, 1.0, rn));
      vec3 np = vec3(cos(ang) * r * 0.9, sin(ang) * r * 0.9, r * 0.25);
      float nz = vfbm(np * 0.9 + vec3(0.0, 0.0, uTime * 0.05), 4);
      float streaks = vfbm(vec3(ang * 3.0, r * 1.8, uTime * 0.1), 3);
      float dens = prof * (0.35 + 0.65 * smoothstep(0.2, 0.8, nz)) * (0.7 + 0.5 * streaks);
      // temperature profile
      float T = 9500.0 * pow(max(r, uDiskInner) / uDiskInner, -0.62);
      // Doppler: orbital velocity direction = n × p̂ (prograde), speed
      vec3 vdir = normalize(cross(n, p));
      float v = 1.0 / sqrt(2.0 * max(r - 1.0, 0.6));
      v = min(v, 0.72);
      float gamma = 1.0 / sqrt(1.0 - v * v);
      // photon travels along rayDir; matter moving toward camera when dot(vdir, -rayDir) > 0
      float dop = 1.0 / (gamma * (1.0 - v * dot(vdir, -rayDir)));
      // gravitational redshift
      float grav = sqrt(max(1.0 - 1.0 / r, 0.05));
      float shift = dop * grav;
      vec3 col = blackbody(T * shift);
      float bright = min(dens * pow(shift, 3.0) * uDiskBrightness * (1.0 + 2.5 * exp(-(r - uDiskInner) * 0.8)), 4.0);
      float alpha = clamp(dens * 1.6, 0.0, 0.92);
      return vec4(col * bright, alpha);
    }

    vec3 scrub(vec3 c) {
      // kill NaN/Inf before they reach the bloom blur (one bad pixel would blacken the frame)
      c = mix(c, vec3(0.0), vec3(isnan(c.r) || isinf(c.r), isnan(c.g) || isinf(c.g), isnan(c.b) || isinf(c.b)));
      return clamp(c, 0.0, 12.0);
    }
    void main() {
      vec3 sceneCol = scrub(texture2D(tDiffuse, vUv).rgb);
      if (uActive < 0.5) { gl_FragColor = vec4(sceneCol, 1.0); return; }

      vec3 d = dirFromUv(vUv);
      vec3 bh = uBH / uRs;                 // in Rs units
      vec3 x = -bh;                        // camera position relative to BH
      float camDist = length(x);
      // impact parameter
      vec3 hvec = cross(x, d);
      float b = length(hvec);
      float effectR = 42.0;
      if (camDist > effectR && b > effectR) { gl_FragColor = vec4(sceneCol, 1.0); return; }

      // weak-field region: analytic deflection, sample scene
      if (b > 14.0 && camDist > 30.0) {
        float alpha = 2.0 / b; // radians
        // bend toward the BH: rotate d toward the projection of (bh) perpendicular to d
        vec3 toBH = bh - dot(bh, d) * d;
        vec3 nd = normalize(d + normalize(toBH) * alpha);
        vec2 suv = uvFromDir(nd);
        vec3 c;
        if (nd.z < 0.0 && suv.x > 0.0 && suv.x < 1.0 && suv.y > 0.0 && suv.y < 1.0) c = texture2D(tDiffuse, suv).rgb;
        else c = fallbackSky(uCamToWorld * nd);
        gl_FragColor = vec4(c, 1.0); return;
      }

      // strong field: integrate geodesic
      float h2 = dot(hvec, hvec);
      vec3 v = d;
      vec3 acc = vec3(0.0);
      float T = 1.0;
      bool captured = false;
      float sPrev = dot(x, uAxis);
      float rPrev = length(x);
      for (int i = 0; i < 400; i++) {
        if (i >= uSteps) break;
        float r = length(x);
        if (r < 1.0) { captured = true; break; }
        float dt = clamp(r * 0.11, 0.02, 1.6);
        if (r < 6.0) dt *= 0.55;
        // leapfrog
        vec3 a = -1.5 * h2 * x / pow(r, 5.0);
        vec3 vh = v + a * dt * 0.5;
        x += vh * dt;
        float r2 = length(x);
        vec3 a2 = -1.5 * h2 * x / pow(r2, 5.0);
        v = vh + a2 * dt * 0.5;
        // disc crossing test
        float s = dot(x, uAxis);
        if (s * sPrev < 0.0) {
          float tcross = sPrev / (sPrev - s);
          vec3 xc = mix(x - vh * dt, x, tcross);
          float rc = length(xc);
          if (rc > uDiskInner && rc < uDiskOuter) {
            vec4 dk = disk(xc, normalize(v), rc);
            acc += T * dk.rgb * dk.a;
            T *= (1.0 - dk.a);
            if (T < 0.02) break;
          }
        }
        sPrev = s;
        if (r2 > effectR * 1.6 && dot(x, v) > 0.0) break;
        rPrev = r2;
      }
      vec3 bg = vec3(0.0);
      if (!captured) {
        vec3 nd = normalize(v);
        vec2 suv = uvFromDir(nd);
        if (nd.z < 0.0 && suv.x > 0.0 && suv.x < 1.0 && suv.y > 0.0 && suv.y < 1.0) bg = texture2D(tDiffuse, suv).rgb;
        else bg = fallbackSky(uCamToWorld * nd);
      }
      vec3 col = scrub(acc + T * bg);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export class BlackHolePass extends ShaderPass {
  constructor(camera) {
    super(BlackHoleShader);
    this.camera = camera;
    this._v = new THREE.Vector3();
    this._m3 = new THREE.Matrix3();
  }
  setSize(w, h) { this.uniforms.uResolution.value.set(w, h); this.uniforms.uAspect.value = w / h; }
  /** worldPos: float64 THREE.Vector3; rs: scene units; axisWorld: disc normal (unit) */
  update(worldPos, rs, axisWorld, time, steps = 160) {
    const cam = this.camera;
    const u = this.uniforms;
    this._v.copy(worldPos).applyMatrix4(cam.matrixWorldInverse);
    u.uBH.value.copy(this._v);
    u.uRs.value = rs;
    this._m3.setFromMatrix4(cam.matrixWorldInverse);
    u.uAxis.value.copy(axisWorld).applyMatrix3(this._m3).normalize();
    u.uTanHalfFov.value = Math.tan(THREE.MathUtils.degToRad(cam.fov) * 0.5);
    u.uCamToWorld.value.setFromMatrix4(cam.matrixWorld);
    u.uTime.value = time;
    u.uSteps.value = steps;
    u.uActive.value = 1.0;
  }
}
