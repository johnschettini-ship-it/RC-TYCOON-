// The title cover (the owner's poster, chosen 2026-11-17): copies art-src/title/ (index.json and the poster files it
// names) into <out>/title/ and checks it (titleIndex.ts checkCoverFolder: the game's own index check, the files at
// the sizes the index says, nothing stray, 3 MB compressed, 24 MB decoded per framing). The bake runs it after the
// sets (bake.mjs); without a bake, the copy alone:
//
//   node tools/art3d/cover.mjs --out dist-art/real
//
// The poster is supplied by the owner (licence pending: docs/superpowers/specs/thrills-and-chills/asset-log.md).
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
export const COVER_SRC = join(ROOT, 'art-src/title');

function webpSize(buf) {
  const fourcc = buf.toString('ascii', 12, 16);
  if (fourcc === 'VP8X') return [1 + buf.readUIntLE(24, 3), 1 + buf.readUIntLE(27, 3)];
  if (fourcc === 'VP8 ') return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
  if (fourcc === 'VP8L') { const b = buf.readUInt32LE(21); return [1 + (b & 0x3fff), 1 + ((b >> 14) & 0x3fff)]; }
  throw new Error('not a WebP file');
}

/**
 * Copies the cover into `<outDir>/title/` (emptied first) and checks it with `check` (titleIndex.ts checkCoverFolder).
 * Returns the index written (with a `bytes` record), the files (size and bytes) and the problems.
 */
export function copyCover(outDir, check, decoded) {
  const index = JSON.parse(readFileSync(join(COVER_SRC, 'index.json'), 'utf8'));
  const tdir = join(outDir, 'title');
  rmSync(tdir, { recursive: true, force: true });
  mkdirSync(tdir, { recursive: true });
  const files = new Map();
  for (const name of new Set([index?.wide?.file, index?.tall?.file].filter((n) => typeof n === 'string'))) {
    const src = join(COVER_SRC, name);
    if (!existsSync(src) || name.includes('/') || name.includes('..')) continue; // reported by the check as missing
    copyFileSync(src, join(tdir, name));
    const buf = readFileSync(src);
    let wh = [0, 0];
    try { wh = webpSize(buf); } catch { /* not a WebP: the size check reports it */ }
    files.set(name, { w: wh[0], h: wh[1], bytes: buf.length });
  }
  const problems = check(index, files);
  if (problems.length === 0) index.bytes = { compressed: [...files.values()].reduce((a, f) => a + f.bytes, 0), decoded: decoded(index) };
  writeFileSync(join(tdir, 'index.json'), JSON.stringify(index, null, 1));
  return { index, files, problems };
}

const mb = (n) => (n / 1e6).toFixed(2);
export function report({ index, files, problems }) {
  for (const [n, f] of files) console.log(`  ${n.padEnd(22)} ${String(f.w).padStart(5)} x ${String(f.h).padEnd(5)} ${(f.bytes / 1e3).toFixed(0).padStart(6)} KB`);
  if (index.bytes) console.log(`title cover: ${files.size} file(s), ${mb(index.bytes.compressed)} MB compressed; decoded ${mb(index.bytes.decoded.wide)} MB wide, ${mb(index.bytes.decoded.tall)} MB tall`);
  for (const p of problems) console.log(`[cover] ${p}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const a = process.argv.slice(2);
  const i = a.indexOf('--out');
  const out = resolve(ROOT, i >= 0 ? a[i + 1] : 'dist-art/real');
  // The check is TypeScript (it shares the game's index check): bundled as the bake does.
  const { rolldown } = await import('rolldown');
  const build = join(ROOT, 'dist-art/.build');
  mkdirSync(build, { recursive: true });
  const b = await rolldown({ input: join(HERE, 'titleIndex.ts'), platform: 'node', logLevel: 'warn' });
  await b.write({ file: join(build, 'coverCheck.mjs'), format: 'esm', codeSplitting: false });
  await b.close();
  const N = await import(pathToFileURL(join(build, 'coverCheck.mjs')).href + `?t=${Date.now()}`);
  mkdirSync(out, { recursive: true });
  const r = copyCover(out, N.checkCoverFolder, N.coverDecoded);
  report(r);
  console.log(r.problems.length === 0 ? `cover OK: ${join(out, 'title')}` : `${r.problems.length} cover problem(s)`);
  process.exit(r.problems.length === 0 ? 0 : 1);
}
