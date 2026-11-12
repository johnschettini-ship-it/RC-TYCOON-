/** Phase 8b stage 0b test (never merged): checks an app output folder (art files against their indexes, no worker). */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

// Node runs this file with type stripping, which needs the `.ts` extension; tsc and Vitest take the same path through
// a variable specifier (tsc does not resolve it, so no extension rule applies).
const FORMAT = '../src/render/pixel/app/format.ts';
const { decodeIndex } = (await import(FORMAT)) as typeof import('../src/render/pixel/app/format');

/** 1 MB = 1 048 576 bytes, as in the projection. */
const MB = 1024 * 1024;
const WARN_MB = 150;

function listFiles(d: string): string[] {
  return readdirSync(d).flatMap((name) => {
    const p = join(d, name);
    return statSync(p).isDirectory() ? listFiles(p) : [p];
  });
}

/**
 * Every file under `<dir>/art/` is named in an index and every index entry's sheet exists; no `sw.js`, no
 * `sw-manifest.json`; art bytes per pack and in total (a warning above 150 MB, not a failure).
 */
export function checkApp(dir: string): { ok: boolean; lines: string[] } {
  const lines: string[] = [];
  let ok = true;
  const bad = (line: string): void => {
    ok = false;
    lines.push(`FAIL ${line}`);
  };
  for (const f of ['sw.js', 'sw-manifest.json']) if (existsSync(join(dir, f))) bad(`${f} is in the app output`);
  const artDir = join(dir, 'art');
  if (!existsSync(artDir)) {
    bad('no art folder');
    return { ok, lines };
  }
  const rel = (p: string): string => relative(dir, p).split(sep).join('/');
  const named = new Set<string>();
  let total = 0;
  for (const pack of readdirSync(artDir).sort()) {
    const packDir = join(artDir, pack);
    if (!statSync(packDir).isDirectory()) continue;
    const indexes = readdirSync(packDir).filter((n) => /^index-[0-9a-f]+\.bin$/.test(n));
    if (indexes.length !== 1) {
      bad(`art/${pack}: ${indexes.length} index files`);
      continue;
    }
    const indexPath = join(packDir, indexes[0] as string);
    named.add(rel(indexPath));
    const ix = decodeIndex(new Uint8Array(readFileSync(indexPath)));
    let bytes = statSync(indexPath).size;
    ix.sheets.forEach((s) => {
      const p = join(packDir, s.file);
      named.add(rel(p));
      if (!existsSync(p)) bad(`missing sheet ${rel(p)}`);
      else bytes += statSync(p).size;
    });
    for (let e = 0; e < ix.sheet.length; e++) {
      if ((ix.sheet[e] as number) >= ix.sheets.length) bad(`art/${pack}: entry ${e} names sheet ${ix.sheet[e]} of ${ix.sheets.length}`);
    }
    total += bytes;
    lines.push(`art/${pack}: ${ix.kind.length} entries, ${ix.sheets.length} sheets, ${(bytes / MB).toFixed(2)} MB`);
  }
  for (const p of listFiles(artDir)) if (!named.has(rel(p))) bad(`extra file ${rel(p)}`);
  lines.push(`art total: ${(total / MB).toFixed(2)} MB (${total} bytes)`);
  if (total > WARN_MB * MB) lines.push(`WARN art total above ${WARN_MB} MB`);
  lines.push(ok ? 'check-app: ok' : 'check-app: FAILED');
  return { ok, lines };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = process.argv[2] ?? 'dist-app';
  const r = checkApp(dir);
  for (const l of r.lines) console.log(l);
  process.exit(r.ok ? 0 : 1);
}
