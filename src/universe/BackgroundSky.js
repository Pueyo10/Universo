import * as THREE from 'three';
import { HASH, SIMPLEX3D } from '../shaders/chunks.js';
import { GALAXY_MATRIX_INV } from '../core/Units.js';
import { bus } from '../core/EventBus.js';

// Procedural deep-sky background: three/four magnitude tiers of hashed stars
// (sub-pixel accurate gaussians), faint cosmic dust / nebulosity, and a
// sprinkle of tiny distant galaxies. Density varies with galactic latitude.
// The smooth, low-frequency part (nebulosity + dust, 12 simplex octaves per
// pixel) is baked once into a small cubemap; only the crisp stars stay
// procedural per frame.
const CUBE_FACE = /* glsl */`
  void cubeFace(vec3 d, out vec2 f, out float face) {
    vec3 a = abs(d);
    if (a.x >= a.y && a.x >= a.z) { f = d.yz / a.x; face = d.x > 0.0 ? 0.0 : 1.0; }
    else if (a.y >= a.z) { f = d.xz / a.y; face = d.y > 0.0 ? 2.0 : 3.0; }
    else { f = d.xy / a.z; face = d.z > 0.0 ? 4.0 : 5.0; }
    f = f * 0.5 + 0.5;
  }
`;

export class BackgroundSky {
  constructor(engine) {
    this.engine = engine;
    const geo = new THREE.BoxGeometry(2, 2, 2);
    this.smoothMap = this._bakeSmooth(engine.renderer);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPixelAngle: { value: 0.001 },
        uGalInv: { value: new THREE.Matrix3().setFromMatrix4(GALAXY_MATRIX_INV) },
        uIntensity: { value: 1.0 },
        uDensity: { value: 1.0 },
        uGalaxyFade: { value: 1.0 },
        uTiers: { value: engine.q.skyTiers },
        uGalaxyTiers: { value: engine.q.skyGalaxies },
        uSmooth: { value: this.smoothMap },
        uBand: { value: 0 },
      },
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main() {
          vDir = position;
          vec4 mv = modelViewMatrix * vec4(position * 1.0e15, 1.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */`
        precision highp float;
        uniform float uTime, uPixelAngle, uIntensity, uDensity, uGalaxyFade, uTiers, uGalaxyTiers, uBand;
        uniform mat3 uGalInv;
        uniform samplerCube uSmooth;
        varying vec3 vDir;
        ${HASH}
        ${CUBE_FACE}

        vec3 starTier(vec2 f, float face, float N, float prob, float bright, float sizeMul, float seed) {
          vec3 col = vec3(0.0);
          vec2 c = f * N; vec2 ci = floor(c); vec2 cf = c - ci;
          float cellAng = 2.0 / N;
          float sigma = max(uPixelAngle * 0.9 * sizeMul, cellAng * 0.02) / cellAng;
          for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
            vec2 cc = ci + vec2(x, y);
            vec3 h = hash33(vec3(cc, face * 31.7 + seed));
            if (h.z > prob) continue;
            vec3 h2 = hash33(vec3(cc + 91.0, face * 13.1 + seed * 2.0));
            vec2 sp = vec2(x, y) + h.xy - cf;
            float d2 = dot(sp, sp);
            float b = bright * (0.25 + 2.2 * pow(h2.x, 6.0));
            float s = sigma * (0.8 + 0.7 * pow(h2.x, 3.0));
            float t = h2.y;
            vec3 sc = mix(vec3(1.0, 0.72, 0.5), vec3(1.0, 0.97, 0.9), smoothstep(0.0, 0.5, t));
            sc = mix(sc, vec3(0.72, 0.82, 1.0), smoothstep(0.5, 1.0, t));
            col += sc * b * exp(-d2 / (2.0 * s * s));
          }
          return col;
        }

        vec3 galaxyTier(vec2 f, float face, float N, float prob, float seed) {
          vec3 col = vec3(0.0);
          vec2 c = f * N; vec2 ci = floor(c); vec2 cf = c - ci;
          for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
            vec2 cc = ci + vec2(x, y);
            vec3 h = hash33(vec3(cc, face * 7.3 + seed));
            if (h.z > prob) continue;
            vec3 h2 = hash33(vec3(cc + 37.0, face * 5.9 + seed));
            vec2 sp = vec2(x, y) + h.xy - cf;
            float ang = h2.x * 6.2831;
            vec2 e = vec2(cos(ang), sin(ang));
            vec2 q = vec2(dot(sp, e), dot(sp, vec2(-e.y, e.x)));
            q.y /= (0.25 + 0.75 * h2.y);
            float d2 = dot(q, q);
            float s = 0.06 + 0.12 * h2.z;
            vec3 gc = mix(vec3(1.0, 0.85, 0.7), vec3(0.75, 0.8, 1.0), h.x);
            col += gc * 0.35 * exp(-d2 / (2.0 * s * s)) * (0.5 + 0.5 * h2.y);
            col += gc * 0.5 * exp(-d2 / (2.0 * s * s * 0.15));
          }
          return col;
        }

        void main() {
          vec3 d = normalize(vDir);
          vec3 g = uGalInv * d;
          float glat = abs(g.z);
          float plane = exp(-glat * glat * 22.0) * uGalaxyFade;
          vec2 f; float face; cubeFace(d, f, face);

          vec3 col = vec3(0.0);
          float dens = uDensity * 0.7;
          float inside = 0.25 + 0.75 * uGalaxyFade;
          col += starTier(f, face, 64.0, 0.16 * dens * inside, 1.6, 1.15, 1.0);
          col += starTier(f, face, 180.0, 0.28 * dens * (0.5 + 0.9 * plane) * inside, 0.55, 1.0, 2.0);
          col += starTier(f, face, 520.0, 0.42 * dens * (0.25 + 1.4 * plane) * inside, 0.16, 0.85, 3.0);
          if (uTiers > 3.5) col += starTier(f, face, 1400.0, 0.5 * dens * (0.1 + 1.8 * plane) * inside, 0.045, 0.7, 4.0);
          col += galaxyTier(f, face, 90.0, 0.045 * (1.0 - 0.85 * plane), 5.0);
          if (uGalaxyTiers > 1.5) col += galaxyTier(f, face, 260.0, 0.06 * (1.0 - 0.9 * plane), 6.0) * 0.5;

          // baked smooth part: r = nebulosity, g = colour noise, b = dust
          vec3 sm = textureCube(uSmooth, d).rgb;
          float neb = sm.r * 1.5, n2 = sm.g * 2.0 - 1.0, dust = sm.b;
          vec3 nebCol = mix(vec3(0.35, 0.3, 0.6), vec3(0.25, 0.45, 0.8), n2 * 0.5 + 0.5);
          nebCol = mix(nebCol, vec3(0.55, 0.35, 0.25), plane * 0.7);
          col += nebCol * neb * 0.025 * (0.5 + plane);
          col *= 1.0 - 0.5 * plane * dust;
          if (uBand > 0.5) {
            float l = dot(col, vec3(0.3, 0.5, 0.2));
            if (uBand < 1.5) col = vec3(1.0, 0.5, 0.22) * l * 0.8 + vec3(1.0, 0.45, 0.15) * dust * plane * 0.12;   // infrared: dust glows
            else if (uBand < 2.5) col = vec3(0.5, 0.6, 1.0) * l * 0.6;
            else if (uBand < 3.5) col = vec3(0.7, 0.55, 1.0) * l * 0.15;
            else col = vec3(0.45, 1.0, 0.6) * l * 0.4 + vec3(0.3, 0.9, 0.5) * plane * 0.05;                       // radio: the plane glows
          }

          gl_FragColor = vec4(col * uIntensity, 1.0);
        }
      `,
      depthTest: false, depthWrite: false, side: THREE.BackSide, fog: false,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    this.mesh.matrixAutoUpdate = false;
    engine.scene.add(this.mesh);
    bus.on('quality', () => { this.material.uniforms.uTiers.value = engine.q.skyTiers; this.material.uniforms.uGalaxyTiers.value = engine.q.skyGalaxies; });
  }

  /** Render the low-frequency nebulosity / dust fields once into a small cubemap. */
  _bakeSmooth(renderer) {
    const size = 128;
    const rt = new THREE.WebGLCubeRenderTarget(size, { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    const scene = new THREE.Scene();
    const mat = new THREE.ShaderMaterial({
      vertexShader: /* glsl */`varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`
        precision highp float;
        varying vec3 vDir;
        ${HASH}
        ${SIMPLEX3D}
        void main() {
          vec3 d = normalize(vDir);
          float n1 = fbm(d * 3.0 + vec3(1.3, 4.1, 2.2), 4);
          float n2 = fbm(d * 9.0 + vec3(7.7, 1.9, 5.3), 4);
          float neb = pow(max(n1 * 0.5 + 0.5, 0.0), 3.5) * max(0.6 + 0.4 * n2, 0.0);
          float dust = pow(max(fbm(d * 6.5 + vec3(3.3, 8.1, 0.2), 4) * 0.5 + 0.5, 0.0), 2.0);
          gl_FragColor = vec4(clamp(neb / 1.5, 0.0, 1.0), n2 * 0.5 + 0.5, clamp(dust, 0.0, 1.0), 1.0);
        }
      `,
      side: THREE.BackSide, depthTest: false, depthWrite: false,
    });
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), mat));
    const cam = new THREE.CubeCamera(0.1, 10, rt);
    const prevTarget = renderer.getRenderTarget();
    cam.update(renderer, scene);
    renderer.setRenderTarget(prevTarget);
    mat.dispose();
    return rt.texture;
  }

  update(dt, t) {
    const cam = this.engine.camera;
    this.mesh.position.copy(cam.position);
    this.mesh.updateMatrix();
    const u = this.material.uniforms;
    u.uTime.value = t;
    const h = this.engine.renderer.getDrawingBufferSize(this._size || (this._size = new THREE.Vector2())).y;
    u.uPixelAngle.value = THREE.MathUtils.degToRad(cam.fov) / h;
  }
}
