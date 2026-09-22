import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PLANETS } from '../src/data/SolarSystemData.js';

// The Cassini UVIS profile (tools/rings_profile.py) must cover the radii the
// ring mesh and the planet's ring shadow map it onto, and show the named structure.
test('Saturn ring profile matches its definition and real ring structure', () => {
  const saturn = PLANETS.find(p => p.id === 'saturn');
  const buf = readFileSync(new URL('../public/' + saturn.rings.profile, import.meta.url));
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  assert.equal(buf.toString('latin1', 0, 4), 'SRNG');
  const n = dv.getUint32(8, true), r0 = dv.getFloat32(12, true), r1 = dv.getFloat32(16, true);
  assert.ok(Math.abs(r0 / saturn.radiusKm - saturn.rings.inner) < 1e-4 && Math.abs(r1 / saturn.radiusKm - saturn.rings.outer) < 1e-4);
  assert.equal(buf.length, 32 + n * 6);
  const tau = (km) => { const i = Math.floor((km - r0) / (r1 - r0) * n); return -Math.log(Math.max(1 - dv.getUint16(32 + i * 2, true) / 65535, 1e-6)); };
  const dust = (km) => buf[32 + n * 2 + Math.floor((km - r0) / (r1 - r0) * n) * 4 + 3] / 255;
  const mean = (a, b) => { let s = 0, k = 0; for (let r = a; r < b; r += 10) { s += tau(r); k++; } return s / k; };
  assert.ok(mean(78000, 84000) > 0.03 && mean(78000, 84000) < 0.2, 'C ring');
  assert.ok(mean(104000, 110000) > 2.5, 'opaque B ring core');
  assert.ok(mean(118500, 119500) < 0.2, 'Cassini Division');
  assert.ok(mean(126000, 132000) > 0.4 && mean(126000, 132000) < 1.0, 'A ring');
  assert.ok(mean(133450, 133700) < 0.02, 'Encke gap');
  assert.ok(tau(136505) < 0.1 && tau(136400) > 0.4, 'Keeler gap');
  assert.ok(tau(140221) > 0.02 && mean(138000, 139500) < 0.005, 'F ring and the empty Roche division');
  assert.ok(dust(140400) > 0.8 && dust(108000) < 0.05, 'dusty F ring, dust-free B ring');
});
