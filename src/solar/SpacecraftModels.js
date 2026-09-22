import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// Real spacecraft models (NASA 3D Resources, prepared offline with Blender + glTF-Transform:
// see tools/blender/prep_model.py and tools/models.mjs). Loaded lazily, the first time a
// spacecraft gets close to the camera; the procedural stand-in stays until then.
//
// Lighting: the Sun is the scene's directional light. Metals and foil also need something to
// reflect, so each model gets an environment map: in Earth orbit a bright blue-white planet fills
// the lower hemisphere (earthshine), in deep space it is almost black with a faint Milky Way band.
// The environment is rotated every frame so "down" in the map is the real direction of the planet.

let loader = null;
const cache = new Map();
function getLoader() {
  if (!loader) { loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder); }
  return loader;
}

export function loadSpacecraftModel(file) {
  if (cache.has(file)) return cache.get(file);
  const p = new Promise((resolve) => {
    getLoader().load(`${import.meta.env.BASE_URL}models/${file}`, gltf => resolve(gltf.scene), undefined, (e) => { console.warn('[spacecraft model]', file, e && e.message); resolve(null); });
  });
  cache.set(file, p);
  return p;
}

const envs = {};
/** kind: 'earth' (low orbit: planet below) | 'space' (deep space). PMREM, built once per renderer. */
export function getEnvironment(renderer, kind) {
  if (envs[kind]) return envs[kind];
  const scene = new THREE.Scene();
  const geo = new THREE.SphereGeometry(10, 64, 32);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { uKind: { value: kind === 'earth' ? 1 : 0 } },
    vertexShader: /* glsl */`varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      precision highp float; varying vec3 vDir; uniform float uKind;
      void main() {
        vec3 d = normalize(vDir);
        // faint galactic band and black sky
        float band = exp(-pow(d.z * 3.0 + 0.4 * d.x, 2.0)) * 0.012;
        vec3 col = vec3(0.004, 0.005, 0.008) + vec3(0.9, 0.85, 0.8) * band;
        if (uKind > 0.5) {
          // Earth from ~400 km: disc of ~140° below; day-side reflectance ~0.3, bluish with cloud white, bright limb
          float below = -d.y;
          float disc = smoothstep(0.30, 0.36, below);
          vec3 earth = mix(vec3(0.10, 0.20, 0.42), vec3(0.55, 0.62, 0.72), 0.45) * 0.9;
          float limb = exp(-pow((below - 0.33) / 0.03, 2.0));
          col = mix(col, earth, disc) + vec3(0.35, 0.55, 1.0) * limb * 0.6;
        }
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  scene.add(new THREE.Mesh(geo, mat));
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(scene, 0.02);
  pmrem.dispose(); geo.dispose(); mat.dispose();
  envs[kind] = rt.texture;
  return rt.texture;
}

/** Prepare a loaded model for the app's lighting: env map, shadows off, sane PBR, per-material env rotation handle. */
export function dressModel(root, envTex, envIntensity = 1) {
  const mats = new Set();
  root.traverse(o => {
    if (!o.isMesh) return;
    o.frustumCulled = false;
    const list = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of list) {
      if (!m || mats.has(m)) continue;
      mats.add(m);
      if (m.isMeshStandardMaterial) {
        m.envMap = envTex; m.envMapIntensity = envIntensity;
        if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
        m.side = m.transparent ? THREE.DoubleSide : m.side;
      }
      m.needsUpdate = true;
    }
  });
  return [...mats];
}
