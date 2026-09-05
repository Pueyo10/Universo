import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SkyContrast } from '../src/solar/SkyContrast.js';
import { Rings } from '../src/solar/Rings.js';
import { Registry } from '../src/systems/Registry.js';

test('registering a prelinked moon does not duplicate eclipses or leave stale children', () => {
  const registry = new Registry(), parent = { id: 'planet', children: [] };
  registry.add(parent);
  const moon = { id: 'moon', parent }; parent.children.push(moon);
  registry.add(moon); assert.deepEqual(parent.children, [moon]);
  registry.remove('moon'); assert.deepEqual(parent.children, []);
  const site = { id: 'site', parent }; registry.add(site);
  assert.deepEqual(parent.children, [site]);
});

test('sky adaptation responds to lit framing, recovers in darkness and respects lock/manual', () => {
  const model = new SkyContrast(), camera = new THREE.PerspectiveCamera(55, 16 / 9);
  const planet = { position: new THREE.Vector3(), radius: 1, renderer: true };
  const sun = { position: new THREE.Vector3(0, 0, 1000), radius: 0.1 };
  const settings = { autoExposure: true, exposureLock: false }, pos = new THREE.Vector3(0, 0, 3);
  const advance = n => { for (let i = 0; i < n; i++) model.update(1 / 60, camera, pos, [planet, sun], sun, settings); };
  advance(180); assert.ok(model.value < 0.1);
  settings.exposureLock = true; const locked = model.value;
  camera.rotation.y = Math.PI; advance(120); assert.equal(model.value, locked);
  settings.exposureLock = false; advance(1); assert.ok(model.value > locked && model.value < 0.15);
  advance(600); assert.ok(model.value > 0.98);
  // Same disc size, now looking at its unlit hemisphere.
  pos.z = -3; advance(180); assert.ok(model.value > 0.98);
  settings.autoExposure = false; model.value = 0.05; advance(1); assert.equal(model.value, 1);
});

test('ring shadows retain intersecting small moons, reject irrelevant large ones, and cap work at four', () => {
  const body = {
    def: { rings: { inner: 1.2, outer: 2.4 }, oblateness: 0.1 },
    radius: 1, group: new THREE.Group(),
    worldToLocal(p, out) { return out.copy(p).setY(p.y / 0.9); },
  };
  const rings = new Rings(body, new THREE.Texture(), { maxRocks: 1 });
  const u = rings.material.uniforms;
  u.uSunDir.value.set(0, 1, 0); u.uSunAngular.value = 0.001;
  const moons = Array.from({ length: 6 }, (_, i) => ({ id: String(i), radius: 0.01 + i * 0.01, position: new THREE.Vector3(1.8, 1, 0) }));
  moons.unshift({ id: 'large-miss', radius: 0.2, position: new THREE.Vector3(5, 1, 0) });
  moons.push({ id: 'behind', radius: 0.5, position: new THREE.Vector3(1.8, -3, 0) });
  rings._updateMoons(moons, 600);
  assert.equal(u.uMoonCount.value, 4);
  assert.deepEqual(rings.shadowMoonIds, ['5', '4', '3', '2']);
  assert.ok(Math.abs(u.uMoons.value[0].y - 1) < 1e-10, 'flattening must not distort spherical shadow geometry');
  rings._updateMoons([moons[1]], 1); assert.equal(u.uMoonCount.value, 0);
  rings.mesh.visible = false; rings._updateMoons(moons, 600); assert.equal(u.uMoonCount.value, 0);
});
