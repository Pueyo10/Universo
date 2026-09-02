import * as THREE from 'three';
import { LOGDEPTH_PARS_VERT, LOGDEPTH_VERT, LOGDEPTH_PARS_FRAG, LOGDEPTH_FRAG, HASH, VALUE_NOISE3D } from '../shaders/chunks.js';

// Auroral ovals: curtains of light around the magnetic poles of Earth, Jupiter
// and Saturn, rendered on a thin shell ~100 km above the surface, brightest on
// the night side and rippling with time. Earth's oval sits at ~70° magnetic
// latitude (the magnetic pole is offset ~11° from the spin axis).
const vert = /* glsl */`
  varying vec3 vN; varying vec3 vPos;
  ${LOGDEPTH_PARS_VERT}
  void main() {
    vN = normal; vPos = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    ${LOGDEPTH_VERT}
  }
`;
const frag = /* glsl */`
  precision highp float;
  varying vec3 vN; varying vec3 vPos;
  uniform vec3 uSunDir, uCamLocal, uMagAxis, uColorLow, uColorHigh;
  uniform float uTime, uLat, uWidth, uStrength;
  ${HASH}
  ${VALUE_NOISE3D}
  ${LOGDEPTH_PARS_FRAG}
  void main() {
    ${LOGDEPTH_FRAG}
    vec3 p = normalize(vPos);
    float mlat = abs(dot(p, uMagAxis));                    // sin(magnetic latitude)
    float ring = exp(-pow((mlat - uLat) / uWidth, 2.0));
    // curtains: azimuthal noise that drifts, plus fine vertical rays
    vec3 az = p - uMagAxis * dot(p, uMagAxis);
    float ang = atan(az.z, az.x);
    float curt = vfbm(vec3(ang * 3.0, uTime * 0.15, dot(p, uMagAxis) * 6.0), 4);
    float rays = 0.6 + 0.4 * vfbm(vec3(ang * 40.0, uTime * 0.6, 0.0), 2);
    float night = smoothstep(0.35, -0.25, dot(p, normalize(uSunDir)));   // brighter on the night side
    float limb = pow(1.0 - abs(dot(p, normalize(uCamLocal - p))), 0.6);   // stronger when seen edge-on (curtains)
    float a = ring * (0.35 + 0.65 * curt) * rays * (0.25 + 0.75 * night) * uStrength * (0.6 + 0.6 * limb);
    vec3 col = mix(uColorLow, uColorHigh, smoothstep(0.3, 0.9, curt));
    gl_FragColor = vec4(col * a, a);
  }
`;

const CONFIG = {
  earth:   { lat: Math.sin(70 * Math.PI / 180), width: 0.06, height: 1.016, tilt: 11 * Math.PI / 180, low: [0.2, 1.0, 0.45], high: [0.7, 0.3, 0.9], strength: 1.0 },
  jupiter: { lat: Math.sin(78 * Math.PI / 180), width: 0.04, height: 1.01, tilt: 10 * Math.PI / 180, low: [0.5, 0.6, 1.0], high: [0.9, 0.7, 1.0], strength: 1.4 },
  saturn:  { lat: Math.sin(76 * Math.PI / 180), width: 0.045, height: 1.01, tilt: 0.0, low: [0.5, 0.7, 1.0], high: [0.9, 0.6, 1.0], strength: 1.0 },
};

export class Auroras {
  constructor(ctx, solar) {
    this.ctx = ctx; this.engine = ctx.engine;
    this.items = [];
    const geo = new THREE.SphereGeometry(1, 96, 64);
    for (const [id, c] of Object.entries(CONFIG)) {
      const body = solar.byId[id]; if (!body) continue;
      const magAxis = new THREE.Vector3(Math.sin(c.tilt), Math.cos(c.tilt), 0).normalize();
      const mat = new THREE.ShaderMaterial({
        uniforms: { uSunDir: { value: new THREE.Vector3(1, 0, 0) }, uCamLocal: { value: new THREE.Vector3(0, 0, 5) }, uMagAxis: { value: magAxis }, uColorLow: { value: new THREE.Vector3(...c.low) }, uColorHigh: { value: new THREE.Vector3(...c.high) }, uTime: { value: 0 }, uLat: { value: c.lat }, uWidth: { value: c.width }, uStrength: { value: c.strength } },
        vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.scale.setScalar(c.height); mesh.renderOrder = 61.5;
      body.group.add(mesh);
      this.items.push({ body, mesh, mat });
    }
    this._v = new THREE.Vector3();
  }

  update(dt, t, camPos, sunPos) {
    for (const it of this.items) {
      const b = it.body;
      const vis = b.group.visible && (b.rpx || 0) > 12;
      it.mesh.visible = vis;
      if (!vis) continue;
      const u = it.mat.uniforms;
      b.worldDirToLocal(this._v.copy(sunPos).sub(b.position).normalize(), u.uSunDir.value);
      b.worldToLocal(camPos, u.uCamLocal.value);
      u.uTime.value = t;
    }
  }
}
