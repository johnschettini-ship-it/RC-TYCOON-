// Stage 1 bake driver (phase 8c): renders the realistic-look pictures in headless Chromium and writes WebP sheets,
// tint masks and index.json (src/render/real/indexFormat.ts) for the game.
//
//   node tools/art3d/bake.mjs --out dist-art/real [--only <item>[,<item>...]] [--density 2|4] [--no-cache]
// index.json lists the densities this run baked (`densities`), and checkIndex requires every item at each of them.
//
// Bundling: rolldown (Vite's bundler, already a dependency) builds two bundles into dist-art/.build/:
//   bakePage.js  the in-browser bake (tools/art3d/bakePage.ts + the kit + items), `three` aliased to the vendored build
//   bakeNode.mjs catalogue specs, content hashes, track geometry, car poses and checkIndex for this driver
// Cache: every item's sets and files go to dist-art/cache/<item>-<hash>/, keyed by cacheKey.ts: a content hash of the
// files it is built from (items/registry.js SHARED + its module + its code deps) and the full computed input (spec,
// track geometry, poses) with the densities. An unchanged item is copied, not re-baked.
// --only bakes just those items; the output folder and index still hold every other item whose cache entry is valid
// for the current code and input (so a partial bake never deletes the rest of a full bake).
// Chromium runs WebGL2 on SwiftShader (the flags of the phone-test bake); `playwright install` is not needed.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const require = createRequire(import.meta.url);

function args() {
  const a = process.argv.slice(2);
  const o = { out: 'dist-art/real', only: null, densities: [2, 4], cache: true };
  for (let i = 0; i < a.length; i++) {
    const k = a[i];
    if (k === '--out') o.out = a[++i];
    else if (k === '--only') o.only = a[++i].split(',');
    else if (k === '--density') o.densities = [Number(a[++i])];
    else if (k === '--no-cache') o.cache = false;
    else throw new Error(`unknown argument ${k}`);
  }
  if (!o.densities.every((d) => d === 2 || d === 4)) throw new Error('--density must be 2 or 4');
  return o;
}

async function bundle(buildDir) {
  const { rolldown } = await import('rolldown');
  const vendor = join(HERE, 'vendor/three-0.160.0.module.min.js');
  const page = await rolldown({ input: join(HERE, 'bakePage.ts'), platform: 'browser', resolve: { alias: { three: vendor } }, logLevel: 'warn' });
  await page.write({ file: join(buildDir, 'bakePage.js'), format: 'esm', codeSplitting: false });
  await page.close();
  const node = await rolldown({ input: join(HERE, 'bakeNode.ts'), platform: 'node', logLevel: 'warn' });
  await node.write({ file: join(buildDir, 'bakeNode.mjs'), format: 'esm', codeSplitting: false });
  await node.close();
  cpSync(join(HERE, 'bake.html'), join(buildDir, 'bake.html'));
  return import(pathToFileURL(join(buildDir, 'bakeNode.mjs')).href + `?t=${Date.now()}`);
}

/** Width and height of a WebP file (VP8X, VP8 or VP8L header). */
function webpSize(buf) {
  const fourcc = buf.toString('ascii', 12, 16);
  if (fourcc === 'VP8X') return [1 + buf.readUIntLE(24, 3), 1 + buf.readUIntLE(27, 3)];
  if (fourcc === 'VP8 ') return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
  if (fourcc === 'VP8L') { const b = buf.readUInt32LE(21); return [1 + (b & 0x3fff), 1 + ((b >> 14) & 0x3fff)]; }
  throw new Error('not a WebP file');
}

const mb = (n) => (n / 1e6).toFixed(2);

(async () => {
  const t0 = Date.now();
  const o = args();
  const outDir = resolve(ROOT, o.out);
  const artDir = resolve(outDir, '..');
  const buildDir = join(artDir, '.build');
  const cacheDir = join(artDir, 'cache');
  mkdirSync(buildDir, { recursive: true });
  mkdirSync(cacheDir, { recursive: true });
  const N = await bundle(buildDir);
  const { ITEM_LIST, SHARED } = await import(pathToFileURL(join(HERE, 'items/registry.js')).href);
  const list = ITEM_LIST;
  const chosen = (id) => !o.only || o.only.includes(id);
  if (o.only) for (const id of o.only) if (!ITEM_LIST.some((it) => it.id === id)) throw new Error(`unknown item ${id}`);

  // inputs and cache keys
  const jobs = list.map((it) => {
    const input = {};
    if (it.catalog) input.spec = N.itemSpec(it.catalog[0], it.catalog[1]);
    if (it.cards) {
      // The card pictures read every item's own catalogue spec (footprint and height), as that item's bake does.
      input.cards = N.cardInput(it.cards.map((c) => {
        const src = ITEM_LIST.find((x) => x.id === c.id);
        return src && src.catalog ? { ...c, spec: N.itemSpec(src.catalog[0], src.catalog[1]) } : { ...c };
      }));
    }
    if (it.track) {
      input.track = { type: it.track.type, pieces: N.trackGeometry(it.track.pieces) };
      input.poses = N.reachedPoses(it.track.type, it.track.pieces);
    }
    const files = [...SHARED, it.file, ...(it.deps ?? [])].map((f) => join(HERE, f));
    for (const f of files) if (!existsSync(f)) throw new Error(`${it.id}: missing file ${f}`);
    const hash = N.cacheKey(files, input, o.densities);
    return { it, input, hash, dir: join(cacheDir, `${it.id}-${hash.slice(0, 16)}`) };
  });

  let browser = null;
  let page = null;
  let pageErrors = 0;
  async function openPage() {
    const { chromium } = require('playwright');
    browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
    page = await browser.newPage();
    page.on('console', (m) => {
      const t = m.text();
      if (m.type() === 'error') { console.log('[page error]', t); pageErrors++; } else if (t.startsWith('[bake]')) console.log(t);
    });
    page.on('pageerror', (e) => { console.log('[pageerror]', e.message); pageErrors++; });
    const TYPES = { '.html': 'text/html', '.js': 'text/javascript' };
    await page.route('http://bake.local/**', (route) => {
      const rel = decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\//, '');
      const file = join(buildDir, rel);
      if (!file.startsWith(buildDir) || !existsSync(file)) return route.fulfill({ status: 404, body: 'not found' });
      return route.fulfill({ status: 200, contentType: TYPES[extname(file)] || 'application/octet-stream', body: readFileSync(file) });
    });
    await page.goto('http://bake.local/bake.html');
    await page.waitForFunction(() => window.bakeReady === true, null, { timeout: 120000 });
  }

  const report = [];
  for (const job of jobs) {
    const ti = Date.now();
    const meta = join(job.dir, 'sets.json');
    const valid = existsSync(meta);
    let cached = valid && (o.cache || !chosen(job.it.id));
    if (!cached && !chosen(job.it.id)) continue; // --only: other items join the index only from a valid cache entry
    if (!cached) {
      if (!page) await openPage();
      rmSync(job.dir, { recursive: true, force: true });
      mkdirSync(job.dir, { recursive: true });
      const res = await page.evaluate(([id, opts]) => window.bakeItem(id, opts), [job.it.id, { densities: o.densities, hash: job.hash.slice(0, 8), input: job.input }]);
      for (const name of res.files) {
        const url = await page.evaluate((n) => window.takeFile(n), name);
        writeFileSync(join(job.dir, name), Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
      }
      writeFileSync(meta, JSON.stringify({ id: job.it.id, hash: job.hash, renders: res.renders, renderSeconds: res.renderSeconds, bakeSeconds: (Date.now() - ti) / 1000, sets: res.sets }));
    }
    const m = JSON.parse(readFileSync(meta, 'utf8'));
    report.push({ id: job.it.id, cached, seconds: (Date.now() - ti) / 1000, bakeSeconds: m.bakeSeconds, renders: m.renders, sets: m.sets, dir: job.dir });
    console.log(`${job.it.id}: ${cached ? 'cache' : 'baked'} in ${((Date.now() - ti) / 1000).toFixed(1)} s (${m.renders} renders, ${m.sets.length} sets)`);
  }
  if (browser) await browser.close();

  // assemble the output folder and the index
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const index = { format: 'real/1', pxPerMetreZoom1: 11.31, stepPxPerMetre: 9.8, densities: o.densities, sets: [], bytes: { compressed: 0, decodedByDensity: { 2: 0, 4: 0 } } };
  const counts = {};
  for (const r of report) {
    for (const s of r.sets) {
      const key = `${s.kind}:${s.item}:d${s.density}:r${s.rot}`;
      for (const sh of s.sheets) {
        const src = join(r.dir, sh.file);
        cpSync(src, join(outDir, sh.file));
        const buf = readFileSync(src);
        const [w, h] = webpSize(buf);
        if (w !== sh.w || h !== sh.h) throw new Error(`${sh.file}: file is ${w}x${h}, index says ${sh.w}x${sh.h}`);
        index.bytes.compressed += buf.length;
        index.bytes.decodedByDensity[s.density] += w * h * 4;
      }
      index.sets.push({ key, kind: s.kind, item: s.item, density: s.density, rot: s.rot, sheets: s.sheets, frames: s.frames });
      const c = (counts[s.kind] ??= { sets: 0, pictures: 0, keys: 0, sheets: 0, bytes: 0, decoded: { 2: 0, 4: 0 } });
      c.sets++; c.pictures += s.pictures; c.keys += Object.keys(s.frames).length; c.sheets += s.sheets.length;
      for (const sh of s.sheets) { c.bytes += statSync(join(outDir, sh.file)).size; c.decoded[s.density] += sh.w * sh.h * 4; }
    }
  }
  const json = JSON.stringify(index);
  writeFileSync(join(outDir, 'index.json'), json);
  const problems = N.checkIndex(index, new Set(readdirSync(outDir)));
  for (const p of problems) console.log(`[index] ${p}`);

  console.log('\nkind      sets  pictures  frame keys  sheets  compressed MB  decoded MB d2  decoded MB d4');
  for (const [k, c] of Object.entries(counts)) {
    console.log(`${k.padEnd(9)} ${String(c.sets).padStart(4)}  ${String(c.pictures).padStart(8)}  ${String(c.keys).padStart(10)}  ${String(c.sheets).padStart(6)}  ${mb(c.bytes).padStart(13)}  ${mb(c.decoded[2]).padStart(13)}  ${mb(c.decoded[4]).padStart(13)}`);
  }
  console.log(`total: ${index.sets.length} sets, ${readdirSync(outDir).length - 1} files, ${mb(index.bytes.compressed)} MB compressed + index ${(json.length / 1e3).toFixed(0)} KB; decoded ${mb(index.bytes.decodedByDensity[2])} MB at density 2, ${mb(index.bytes.decodedByDensity[4])} MB at density 4`);
  const baked = report.filter((r) => !r.cached).length;
  console.log(`items: ${report.length} (${baked} baked, ${report.length - baked} from cache); ${((Date.now() - t0) / 1000).toFixed(1)} s total`);
  console.log(problems.length === 0 ? 'index OK' : `${problems.length} index problem(s)`);
  if (pageErrors || problems.length) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
