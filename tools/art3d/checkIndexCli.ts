/** Command line for checkIndex: `npx tsx tools/art3d/checkIndexCli.ts <dir>` (or checkIndex.ts, which forwards here). */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RealIndex } from '../../src/render/real/indexFormat';
import { checkIndex } from './checkIndex';

export function main(dir: string | undefined): void {
  if (!dir) { console.error('usage: tsx tools/art3d/checkIndex.ts <dir>'); process.exit(2); }
  const index = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')) as RealIndex;
  const problems = checkIndex(index, new Set(readdirSync(dir)));
  for (const p of problems) console.error(p);
  console.log(problems.length === 0 ? 'index OK' : `${problems.length} problem(s)`);
  process.exit(problems.length === 0 ? 0 : 1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv[2]);
