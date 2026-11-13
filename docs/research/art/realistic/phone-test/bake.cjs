// Bake the sprites of the realistic look phone test into ./dist (git-ignored; CI bakes them for the Pages deploy).
// Serves docs/research/art/realistic/ to headless Chromium (WebGL2 on SwiftShader, the same flags as tools/render.cjs),
// calls window.bake() in bake.html and writes the WebP files plus manifest.json.
//   node docs/research/art/realistic/phone-test/bake.cjs
//   OUTFITS=6 node docs/research/art/realistic/phone-test/bake.cjs   # fewer guest outfits (default 8)
const path = require('path');
const fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(path.resolve(__dirname, '../../../../../node_modules/playwright'))); }

const ROOT = path.resolve(__dirname, '..'); // docs/research/art/realistic
const OUT = path.join(__dirname, 'dist');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };

(async () => {
  const t0 = Date.now();
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage();
  let failed = false;
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error') { console.log('[page error]', t); failed = true; } else if (m.type() === 'warning') console.log('[page warning]', t); else if (t.startsWith('[bake]')) console.log(t);
  });
  page.on('pageerror', (e) => { console.log('[pageerror]', e.message); failed = true; });
  await page.route('http://bake.local/**', (route) => {
    const rel = decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\//, '');
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: 'not found' });
    route.fulfill({ status: 200, contentType: TYPES[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
  });
  await page.goto('http://bake.local/phone-test/bake.html');
  await page.waitForFunction(() => window.bakeReady === true, null, { timeout: 120000 });
  const res = await page.evaluate((o) => window.bake(o), { outfits: process.env.OUTFITS ? +process.env.OUTFITS : 8 });
  const sizes = {};
  let total = 0;
  for (const name of res.files) {
    const url = await page.evaluate((n) => window.getFile(n), name);
    const buf = Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
    fs.writeFileSync(path.join(OUT, name), buf);
    sizes[name] = buf.length;
    total += buf.length;
  }
  const manifest = JSON.parse(await page.evaluate(() => window.getManifest()));
  manifest.files = sizes;
  manifest.bakeSecondsTotal = +((Date.now() - t0) / 1000).toFixed(1);
  manifest.generated = new Date().toISOString();
  const json = JSON.stringify(manifest);
  fs.writeFileSync(path.join(OUT, 'manifest.json'), json);
  await browser.close();
  // summary: download and decoded size per zoom (decoded = width x height x 4 of every image, an estimate)
  const dims = (n) => { const b = fs.readFileSync(path.join(OUT, n)); const i = b.indexOf('VP8X'); if (i > 0) return [1 + b.readUIntLE(i + 12, 3), 1 + b.readUIntLE(i + 15, 3)];
    const j = b.indexOf('VP8 '); return j > 0 ? [b.readUInt16LE(j + 14) & 0x3fff, b.readUInt16LE(j + 16) & 0x3fff] : null; };
  for (const z of [1, 2]) {
    const names = res.files.filter((n) => n.startsWith(`z${z}-`));
    let dl = 0, dec = 0;
    for (const n of names) { dl += sizes[n]; const d = dims(n); if (d) dec += d[0] * d[1] * 4; }
    console.log(`zoom ${z}: ${names.length} files, download ${(dl / 1e6).toFixed(2)} MB, decoded ~${(dec / 1e6).toFixed(1)} MB`);
  }
  console.log(`total ${res.files.length} files, ${(total / 1e6).toFixed(2)} MB + manifest ${(json.length / 1e3).toFixed(0)} KB; ${res.renders} renders`);
  console.log(`bake ${manifest.bakeSeconds} s in the page, ${manifest.bakeSecondsTotal} s total`);
  if (failed) { console.log('the page reported errors'); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
