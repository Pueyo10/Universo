import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { RING_OPTICS, RING_ECLIPSE } from '../src/shaders/ringOptics.js';
import { Rings } from '../src/solar/Rings.js';

export function checkRingGraphics(renderer, check) {
  const rt = new THREE.WebGLRenderTarget(64, 64, { type: THREE.FloatType });
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(50, 1, 0.01, 100);
  const u = { opacity: { value: 0.5 }, light: { value: 0.4 }, view: { value: 0.4 }, same: { value: true }, moon: { value: new THREE.Vector4(0, 2, 0, 0.1) } };
  const quad = new FullScreenQuad(new THREE.ShaderMaterial({
    uniforms: u, depthTest: false, depthWrite: false,
    vertexShader: `void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: `precision highp float;
      uniform float opacity, light, view; uniform bool same; uniform vec4 moon;
      ${RING_OPTICS} ${RING_ECLIPSE}
      void main() { float tau = ringOpticalDepth(opacity);
        gl_FragColor = vec4(ringTransmission(tau, view), ringScatter(tau, light, view, same), ringMoonVisibility(vec3(0.0), vec3(0,1,0), moon, 0.01), 1.0);
      }`,
  }));
  const pixel = new Float32Array(4);
  const sample = () => { renderer.setRenderTarget(rt); quad.render(renderer); renderer.readRenderTargetPixels(rt, 32, 32, 1, 1, pixel); return Array.from(pixel); };
  u.view.value = 1; const normal = sample()[0];
  u.view.value = 0.1; const grazing = sample()[0];
  check('Ring opacity matches its profile face-on and increases at grazing angles', Math.abs(normal - 0.5) < 1e-5 && grazing < 0.002);
  let error = 0;
  // Independent midpoint quadrature of attenuation before/after each scattering
  // point; validates both slab faces and the nearly equal path-length limit.
  for (const opacity of [0.001, 0.2, 0.95]) for (const [light, view] of [[0.5,0.5], [0.5,0.50001], [0.02,0.8], [0.8,0.1]]) for (const same of [true, false]) {
    u.opacity.value = opacity; u.light.value = light; u.view.value = view; u.same.value = same;
    const measured = sample()[1], tau = -Math.log(1 - opacity), n = 4096;
    let expected = 0;
    for (let i = 0; i < n; i++) { const t = (i + 0.5) * tau / n; expected += Math.exp(-t / light - (same ? t : tau - t) / view) / view * tau / n; }
    error = Math.max(error, Math.abs(measured - expected));
  }
  check('GPU ring scattering matches numerical integration on both faces', error < 0.0001, String(error));
  u.opacity.value = 0.98; u.light.value = u.view.value = 0.4; u.same.value = false;
  const thickBack = sample()[1]; u.opacity.value = 0.15; const thinBack = sample()[1];
  check('Backlit thin bands scatter more than opaque dense bands', thinBack > thickBack * 20);
  u.moon.value.set(0, 2, 0, 0.1); const total = sample()[2];
  u.moon.value.set(0, 2, 0, 0.01); const annular = sample()[2];
  u.moon.value.set(0.1, 2, 0, 0.1); const partial = sample()[2];
  u.moon.value.set(0, -2, 0, 0.1); const behind = sample()[2];
  check('Moon eclipses cover total, partial, annular and behind-light cases', total === 0 && Math.abs(annular - 0.75) < 0.001 && partial > 0.3 && partial < 0.7 && behind === 1);
  quad.material.dispose(); quad.dispose();

  // Draw the actual production material, then cast a synthetic moon shadow onto
  // it. This verifies blending/visibility, not just a copy of a shader formula.
  const tex = new THREE.DataTexture(new Uint8Array([220, 200, 170, 180]), 1, 1); tex.needsUpdate = true;
  const body = { def: { rings: { inner: 1.2, outer: 2.4 } }, radius: 1, group: new THREE.Group() };
  const rings = new Rings(body, tex, { maxRocks: 1 }); scene.add(body.group);
  camera.position.set(0, 6, 0); camera.up.set(0, 0, -1); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  const ru = rings.material.uniforms;
  ru.uCamLocal.value.copy(camera.position); ru.uSunDir.value.set(0, 1, 0); ru.uSunAngular.value = 0.01;
  const pixels = new Float32Array(64 * 64 * 4);
  const draw = () => {
    renderer.setRenderTarget(rt); renderer.setClearColor(0, 0); renderer.clear(); renderer.render(scene, camera);
    renderer.readRenderTargetPixels(rt, 0, 0, 64, 64, pixels); return Float32Array.from(pixels);
  };
  const lit = draw(); ru.uMoonCount.value = 1; ru.uMoons.value[0].set(1.8, 1, 0, 0.25);
  const eclipsed = draw(); let affected = 0, alphaError = 0;
  for (let i = 0; i < lit.length; i += 4) { if (lit[i] - eclipsed[i] > 0.1) affected++; alphaError = Math.max(alphaError, Math.abs(lit[i+3] - eclipsed[i+3])); }
  check('Production ring shader draws moon shadows without changing transparency', affected > 5 && alphaError < 1e-5, String(affected));
  ru.uCamLocal.value.set(0, -6, 0); camera.position.y = -6; camera.lookAt(0,0,0); camera.updateMatrixWorld();
  const unlit = draw(); check('Production ring back face renders finite colours', unlit.every(Number.isFinite) && unlit.some(v => v > 0.01));
  rings.mesh.geometry.dispose(); rings.material.dispose(); rings.rocks.geometry.dispose(); rings.rockMat.dispose(); tex.dispose(); rt.dispose();
}
