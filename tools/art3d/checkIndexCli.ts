/** Command line for checkIndex: `npx tsx tools/art3d/checkIndexCli.ts <dir>` (or checkIndex.ts, which forwards here). */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RealIndex } from '../../src/render/real/indexFormat';
import { checkIndex } from './checkIndex';
import { FLAT_RIDES } from '../../src/data/catalog';
import { S5_LIMIT_BYTES, formatRideSizeRows, formatSizeReport, rideSizeRows, sizeReport } from './sizeReport';

const mb = (n: number): string => (n / 1e6).toFixed(2);

/** Runs the checks on a baked folder and returns the exit code (0 pass, 1 problems, S5, ride size rules or missing files, 2 usage). */
export function run(dir: string | undefined): number {
  if (!dir) { console.error('usage: tsx tools/art3d/checkIndex.ts <dir>'); return 2; }
  const index = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')) as RealIndex;
  const problems = checkIndex(index, new Set(readdirSync(dir)));
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
  for (const x of rides.flatMap((y) => y.allowed)) console.log(`size rule allowed: ${x}`);
  const rideProblems = rides.flatMap((y) => y.problems);
  for (const x of rideProblems) console.error(`SIZE RULE FAIL: ${x}`);
  return problems.length === 0 && !over && r.missingFiles.length === 0 && rideProblems.length === 0 ? 0 : 1;
}

export function main(dir: string | undefined): void {
  process.exit(run(dir));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv[2]);
