import test from 'node:test';
import assert from 'node:assert/strict';
import { AdaptiveQuality } from '../src/core/AdaptiveQuality.js';
import { GpuProfiler } from '../src/core/GpuProfiler.js';
import { TileCache, textureBytes } from '../src/solar/TileCache.js';
import { tileGeometry } from '../src/solar/TileGlobe.js';

test('volume overload reduces the volume first and recovery has hysteresis', () => {
  const q = new AdaptiveQuality();
  assert.equal(q.update({ time: 3, gpu: 22, wall: 24, cpu: 3, stages: { volume: 12 }, volumeActive: true }), true);
  assert.equal(q.scene, 1); assert.ok(q.volume < 1);
  const degraded = q.volume;
  q.update({ time: 4, gpu: 5, wall: 16.7, cpu: 2 }); assert.equal(q.volume, degraded);
  q.update({ time: 10, gpu: 5, wall: 16.7, cpu: 2 }); assert.ok(q.volume > degraded);
});

test('CPU overload alone does not sacrifice pixel quality; scene floor is respected', () => {
  const q = new AdaptiveQuality();
  q.update({ time: 3, gpu: null, wall: 40, cpu: 20 }); assert.equal(q.scene, 1);
  q.update({ time: 4, gpu: 5, wall: 40, cpu: 20 }); assert.equal(q.scene, 1);
  for (let time = 5; time < 35; time++) q.update({ time, gpu: 40, wall: 42, cpu: 3, minScene: 0.5 });
  assert.equal(q.scene, 0.5);
});

test('tile budget counts mipmaps and never evicts a visible fallback', () => {
  assert.equal(textureBytes(1, 1), 4);
  assert.equal(textureBytes(4, 2), 44);
  const cache = new TileCache(120), evicted = [];
  const entry = (id, bytes, pinned, time) => ({ bytes, pinned: () => pinned, used: () => time, dispose: () => evicted.push(id) });
  cache.admit('parent', entry('parent', 60, true, 0));
  cache.admit('old', entry('old', 40, false, 1));
  assert.equal(cache.admit('child', entry('child', 60, true, 2)), true);
  assert.deepEqual(evicted, ['old']); assert.equal(cache.bytes, 120);
  assert.equal(cache.admit('extra', entry('extra', 4, false, 3)), false);
  assert.equal(cache.bytes, 120);
  cache.remove('parent'); assert.equal(cache.bytes, 60);
});

test('adjacent spherical tiles share exact edge vertices, with inward skirts', () => {
  const left = tileGeometry(0, 8, 0, 8, 16), right = tileGeometry(8, 16, 0, 8, 16);
  const a = left.attributes.position.array, b = right.attributes.position.array;
  for (let j = 0; j <= 16; j++) {
    for (let k = 0; k < 3; k++) assert.equal(a[(j * 17 + 16) * 3 + k], b[j * 17 * 3 + k]);
  }
  for (let i = 17 * 17; i < left.attributes.position.count; i++) assert.ok(Math.hypot(...a.slice(i * 3, i * 3 + 3)) < 1);
  left.dispose(); right.dispose();
});

test('GPU profiler never blocks on pending queries and discards disjoint batches', () => {
  let available = false, disjoint = false, active = false, deleted = 0;
  const gl = {
    QUERY_RESULT_AVAILABLE: 1, QUERY_RESULT: 2,
    getExtension: () => ({ TIME_ELAPSED_EXT: 3, GPU_DISJOINT_EXT: 4 }),
    createQuery: () => ({}),
    beginQuery: () => { assert.equal(active, false); active = true; },
    endQuery: () => { assert.equal(active, true); active = false; },
    getParameter: () => disjoint,
    getQueryParameter: (_, what) => { if (what === 1) return available; assert.equal(available, true); return 2e6; },
    deleteQuery: () => deleted++,
  };
  const p = new GpuProfiler(gl);
  p.beginFrame(); p.begin('scene'); p.end(); p.begin('taa'); p.end(); p.endFrame();
  assert.deepEqual(p.poll(), []); assert.equal(deleted, 0);
  available = true; assert.deepEqual(p.poll(), [4]); assert.equal(deleted, 2);
  p.beginFrame(); p.begin('scene'); p.end(); p.endFrame(); disjoint = true;
  assert.deepEqual(p.poll(), []); assert.equal(deleted, 3); assert.deepEqual(p.stages, {});
});
