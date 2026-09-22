// Spacecraft asset pipeline: NASA source models -> Blender (prep_model.py) -> glTF-Transform -> public/models/*.glb
//   node tools/models.mjs <sourceDir> [name ...]
// Sources: NASA Science 3D resources (science.nasa.gov) and github.com/nasa/NASA-3D-Resources (not covered by US copyright;
// credit NASA, no NASA insignia / endorsement). Sizes are the real longest dimensions in metres.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const BLENDER = process.env.BLENDER || 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe';
const ROOT = resolve(import.meta.dirname, '..');
const OUT = join(ROOT, 'public', 'models');

// JWST: the sunshield's sun-facing layer is aluminium + doped silicon on Kapton (silvery with a violet sheen),
// the primary mirror is gold-coated beryllium; the old Maya export leaves everything dark and non-metallic.
const JWST_RULES = [
  ['omnimirror', [0.95, 0.95, 0.96], 1.0, 0.05], ['mirror_blinn', [1.0, 0.78, 0.34], 1.0, 0.05],
  ['shld_pink', [0.78, 0.66, 0.74], 1.0, 0.32], ['pinkmli', [0.78, 0.66, 0.74], 1.0, 0.34], ['pmli', [0.78, 0.66, 0.74], 1.0, 0.34],
  ['shld_silv', [0.88, 0.88, 0.9], 1.0, 0.22], ['silvermli', [0.86, 0.86, 0.88], 1.0, 0.3], ['silver_mli', [0.86, 0.86, 0.88], 1.0, 0.3], ['smli', [0.86, 0.86, 0.88], 1.0, 0.3],
  ['sacells', [0.02, 0.035, 0.09], 0.5, 0.18], ['sa_edge_gold', [0.9, 0.7, 0.3], 1.0, 0.3], ['sc_ring_ssm', [0.85, 0.87, 0.9], 1.0, 0.15],
  ['lambert1', [0.6, 0.6, 0.62], 0.6, 0.4],
];
const ISS_RULES = [
  ['solar', [0.55, 0.42, 0.2], 0.6, 0.3], ['array', [0.55, 0.42, 0.2], 0.6, 0.3],
];
export const MODELS = {
  voyager:     { src: 'voyager.glb', size: 0, tris: 60000 },
  newhorizons: { src: 'newhorizons.glb', size: 0, tris: 40000 },
  hubble:      { src: 'hubble.glb', size: 0, tris: 60000 },
  pioneer:     { src: 'pioneer.glb', size: 0, tris: 40000 },
  jwst:        { src: 'jwst.glb', size: 0, tris: 160000, rules: JWST_RULES, minSize: 0.004 },
  iss:         { src: 'iss.glb', size: 109, tris: 260000, rules: ISS_RULES, drop: 'Handrail|Details_Misc|Bolt|Cable|GITAI|Bishop|STP|Payload_|ELP|SHP|_ROT$|NICER_Details', minSize: 0.012, outliers: 1.6 },
};

const srcDir = resolve(process.argv[2] || '.');
const only = process.argv.slice(3);
mkdirSync(OUT, { recursive: true });
for (const [name, m] of Object.entries(MODELS)) {
  if (only.length && !only.includes(name)) continue;
  const input = join(srcDir, m.src);
  if (!existsSync(input)) { console.log(`skip ${name}: ${input} missing`); continue; }
  const tmp = join(tmpdir(), `prep_${name}.glb`);
  const args = ['-b', '-P', join(ROOT, 'tools', 'blender', 'prep_model.py'), '--', input, tmp, String(m.size), '--tris', String(m.tris)];
  if (m.drop) args.push('--drop', m.drop);
  if (m.minSize) args.push('--min-size', String(m.minSize));
  if (m.outliers) args.push('--outliers', String(m.outliers));
  if (m.rules) { const rf = join(tmpdir(), `rules_${name}.json`); writeFileSync(rf, JSON.stringify(m.rules)); args.push('--rules', rf); }
  const log = execFileSync(BLENDER, args, { encoding: 'utf8', maxBuffer: 64 << 20 });
  console.log((log.match(/PREP OK.*/) || ['PREP ?'])[0]);
  const out = join(OUT, `${name}.glb`);
  execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['gltf-transform', 'optimize', tmp, out, '--compress', 'meshopt', '--texture-compress', 'webp', '--texture-size', '1024', '--simplify', 'false'], { stdio: 'pipe', shell: process.platform === 'win32' });
  rmSync(tmp, { force: true });
  console.log(`  -> public/models/${name}.glb  ${(statSync(out).size / 1e6).toFixed(2)} MB`);
}
