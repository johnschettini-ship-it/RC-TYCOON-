/** Command line for checkIndex: `npx tsx tools/art3d/checkIndexCli.ts <dir>` (or checkIndex.ts, which forwards here). */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RealIndex } from '../../src/render/real/indexFormat';
import { checkIndex, type TitleFolder } from './checkIndex';
import { webpSize, type TitleFiles } from './titleIndex';
import { FLAT_RIDES } from '../../src/data/catalog';
import { S5_LIMIT_BYTES, formatRideSizeRows, formatSizeReport, rideSizeRows, sizeReport } from './sizeReport';

const mb = (n: number): string => (n / 1e6).toFixed(2);

/** The title folder's index and files (sizes read from the WebP headers), or undefined when there is none. */
export function titleFolder(tdir: string, label = 'title'): TitleFolder | undefined {
  if (!existsSync(join(tdir, 'index.json'))) return existsSync(tdir) ? { index: null, files: new Map() } : undefined;
  const files: TitleFiles = new Map();
  for (const n of readdirSync(tdir)) {
    if (n === 'index.json') continue;
    const buf = readFileSync(join(tdir, n));
    let wh: [number, number] = [0, 0];
    try { wh = webpSize(buf); } catch { /* not a WebP: the size check reports it */ }
    files.set(n, { w: wh[0], h: wh[1], bytes: buf.length });
  }
  const index: unknown = JSON.parse(readFileSync(join(tdir, 'index.json'), 'utf8'));
  let compressed = 0;
  for (const f of files.values()) compressed += f.bytes;
  console.log(`${label}: ${files.size} files, ${mb(compressed)} MB compressed`);
  return { index, files };
}

/** Runs the checks on a baked folder and returns the exit code (0 pass, 1 problems, S5, ride size rules or missing files, 2 usage). */
export function run(dir: string | undefined): number {
  if (!dir) { console.error('usage: tsx tools/art3d/checkIndex.ts <dir>'); return 2; }
  const index = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')) as RealIndex;
  const problems = checkIndex(index, new Set(readdirSync(dir)), titleFolder(join(dir, 'title')), titleFolder(join(dir, 'title-panorama'), 'title-panorama'));
  for (const p of problems) console.error(p);
  console.log(problems.length === 0 ? 'index OK' : `${problems.length} problem(s)`);

  const names = readdirSync(dir);
  const r = sizeReport(index, new Map(names.map((n) => [n, statSync(join(dir, n)).size] as [string, number])));
  console.log('top ten items by compressed size:');
  for (const p of [...r.perItem].sort((a, b) => b.compressedBytes - a.compressedBytes).slice(0, 10)) console.log(`  ${p.id.padEnd(20)} ${mb(p.compressedBytes).padStart(8)} MB`);
  console.log(`baked ${mb(r.totalCompressed)} MB; projected full ${mb(r.projectedFull)} MB (S5 limit ${mb(S5_LIMIT_BYTES)} MB)`);
  for (const l of formatSizeReport(r)) console.log(l);
  const over = r.projectedFull > S5_LIMIT_BYTES;
  if (over) console.error(`S5 FAIL: projected full art ${mb(r.projectedFull)} MB passes ${mb(S5_LIMIT_BYTES)} MB`);
  if (r.missingFiles.length) console.error(`${r.missingFiles.length} indexed file(s) missing`);
  // per-ride size rules for the flat rides this bake holds
  const baked = new Set(index.sets.filter((s) => s.kind === 'ride').map((s) => s.item));
  const rides = rideSizeRows(r, FLAT_RIDES.map((d) => d.id).filter((id) => baked.has(id)));
  for (const l of formatRideSizeRows(rides)) console.log(l);
  const rideProblems = rides.flatMap((y) => y.problems);
  for (const x of rideProblems) console.error(`SIZE RULE FAIL: ${x}`);
  return problems.length === 0 && !over && r.missingFiles.length === 0 && rideProblems.length === 0 ? 0 : 1;
}

export function main(dir: string | undefined): void {
  process.exit(run(dir));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv[2]);
