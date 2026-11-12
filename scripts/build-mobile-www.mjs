/** Phase 8b stage 0b test (never merged): copies `dist-app` to `mobile/www` and writes `mobile/www/BUILD.txt`. */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = 'dist-app';
const OUT = join('mobile', 'www');

if (!existsSync(join(SRC, 'index.html'))) throw new Error(`${SRC}/index.html is missing: run the app build first`);
rmSync(OUT, { recursive: true, force: true });
cpSync(SRC, OUT, { recursive: true });

/** Every file under `dir` (paths relative to `dir`). */
function files(dir, rel = '') {
  const out = [];
  for (const name of readdirSync(join(dir, rel))) {
    const r = rel ? join(rel, name) : name;
    if (statSync(join(dir, r)).isDirectory()) out.push(...files(dir, r));
    else out.push(r);
  }
  return out;
}

// The art totals per pack: sheets (PNG files) and bytes (sheets and index).
const artDir = join(OUT, 'art');
const lines = [];
let total = 0;
let pngs = 0;
if (existsSync(artDir)) {
  for (const pack of readdirSync(artDir).sort()) {
    const fs = files(join(artDir, pack));
    const bytes = fs.reduce((s, f) => s + statSync(join(artDir, pack, f)).size, 0);
    const n = fs.filter((f) => f.endsWith('.png')).length;
    total += bytes;
    pngs += n;
    lines.push(`art ${pack}: ${n} sheets, ${bytes} bytes`);
  }
}
let commit = 'unknown';
try {
  commit = execFileSync('git', ['--no-optional-locks', 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
} catch {
  // Not a git checkout: keep "unknown".
}
const bench = existsSync(join(OUT, 'bench')) ? readdirSync(join(OUT, 'bench')).sort().join(', ') : 'none';
const text = [
  'Thrills & Chills stage 0b test build (never merged)',
  `base commit ${commit} (plus the uncommitted stage 0b test changes)`,
  `built ${new Date().toISOString()}`,
  `VITE_ART ${process.env.VITE_ART ?? 'unset'}, VITE_BENCH ${process.env.VITE_BENCH ?? 'unset'}`,
  `bench saves: ${bench}`,
  ...lines,
  `art total: ${pngs} sheets, ${total} bytes`,
  '',
].join('\n');
writeFileSync(join(OUT, 'BUILD.txt'), text);
process.stdout.write(text);
