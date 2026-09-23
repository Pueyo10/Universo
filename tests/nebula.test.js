import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { radecToVector } from '../src/core/Units.js';
import { skyFrame, ORION_STARS } from '../src/universe/NebulaVolume.js';

test('baked Orion volume matches its metadata layout', () => {
  const meta = JSON.parse(readFileSync(new URL('../public/volumes/orion_m42.json', import.meta.url)));
  const raw = gunzipSync(readFileSync(new URL('../public/volumes/orion_m42.vol', import.meta.url)));
  const [nx, ny, nz] = meta.dims;
  assert.equal(meta.layout[0].bytes, nx * ny * nz * 4);
  assert.equal(meta.layout[1].bytes, nx * ny * nz);
  assert.equal(raw.length, meta.layout.reduce((s, l) => s + l.bytes, 0));
  for (const k of ['ha', 'o3', 'low', 'scat', 'dust']) assert.ok(meta.scales[k] > 0, k);
  // the ionising star sits in the brightest part of the cube: emission there is well above the floor
  const ix = Math.floor(nx / 2), iy = Math.floor(ny / 2);
  let peak = 0;
  for (let z = 0; z < nz; z++) peak = Math.max(peak, raw[((z * ny + iy) * nx + ix) * 4]);
  assert.ok(peak > 200, `core H-alpha ${peak}`);
});

test('sky frame is right-handed: East x North = line of sight, East toward increasing RA', () => {
  const { E, N, L } = skyFrame(83.82, -5.39);
  assert.ok(Math.abs(E.dot(N)) < 1e-9 && Math.abs(E.dot(L)) < 1e-9 && Math.abs(N.dot(L)) < 1e-9);
  assert.ok(E.clone().cross(N).distanceTo(L) < 1e-9);
  assert.ok(L.distanceTo(radecToVector(83.82, -5.39).normalize()) < 1e-12);
  const east = radecToVector(83.9, -5.39).normalize().sub(L), north = radecToVector(83.82, -5.3).normalize().sub(L);
  assert.ok(east.dot(E) > 0 && north.dot(N) > 0);
  assert.equal(ORION_STARS[0].p.join(), '0,0,0');
});
