// Headless check of the realistic build (phase 8c stage 1): serve a VITE_ART=real build with the baked art under
// art/real/, open index.html?art=real at a phone viewport (390 x 844, DPR 2), start a park from the title screen,
// then load perf scene saves THROUGH THE GAME (window.__tcReal.load: deserialize + game.setWorld, never storage),
// pause, wait for look.incomplete() to reach 0 and screenshot. Prints per shot the wait, incomplete count,
// fallbacksUsed, decoded memory, the set manager's cap events, then the page console.
//   VITE_ART=real npx vite build --outDir <dir> && cp -r dist-art/real <dir>/art/real
//   node tools/art3d/realShots.mjs <dir> <out dir> <scene>:<zoom>:<rotation>[:<x>,<y>[:<name>]] ...
// scene: coaster | build2 | build1 | phone. Env: HIDE_UI=1 hides the interface (art only); ART=classic;
// PATCH='<js>' runs in the page before the shots (e.g. stub look.rail to compare with today's art).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const require = createRequire(path.join(REPO, 'package.json'));
const { chromium } = require('playwright');

const [rootArg, outDir, ...specs] = process.argv.slice(2);
const root = path.resolve(rootArg);
const SAVES = {
  coaster: ['coaster-600-guests.tcsave.json', { x: 14, y: 8 }],
  build2: ['build2-128-3000-guests.tcsave.json', { x: 64, y: 64 }],
  build1: ['build1-2000-guests.tcsave.json', { x: 40, y: 30 }],
  phone: ['phone-800-guests.tcsave.json', { x: 40, y: 30 }],
};
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let f = path.join(root, u === '/' ? 'index.html' : u);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] ?? 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(`http://localhost:${port}/index.html?art=${process.env.ART ?? 'real'}`);
await page.waitForFunction(() => window.__tc, null, { timeout: 30000 });
await page.getByTestId('title-new').click();
await page.getByTestId('title-name').fill('Real Check');
await page.getByTestId('title-size-64').click();
await page.getByTestId('title-start').click();
await page.locator('.title-screen').waitFor({ state: 'hidden' });
await page.waitForTimeout(1000);
if (process.env.HIDE_UI) await page.addStyleTag({ content: '#ui { display: none !important; }' });
const keys = await page.evaluate(() => Object.keys(localStorage));
logs.push('[keys] ' + keys.join(','));
if (process.env.PATCH) await page.evaluate(process.env.PATCH);
const results = [];
for (const spec of specs) {
  const [scene, zoom, rot, focusStr, name] = spec.split(':');
  const [file, defFocus] = SAVES[scene];
  const focus = focusStr ? { x: +focusStr.split(',')[0], y: +focusStr.split(',')[1] } : defFocus;
  const json = fs.readFileSync(path.join(REPO, 'tests/perf', file), 'utf8');
  const err = await page.evaluate(([j, f, z, r]) => {
    const e = window.__tcReal.load(j, f, z, r);
    window.__tc.setSpeed(0);
    return e;
  }, [json, focus, +zoom, +rot]);
  if (err) { results.push({ spec, err }); continue; }
  const t0 = Date.now();
  let inc = -1;
  for (;;) {
    await page.waitForTimeout(250);
    inc = await page.evaluate(() => window.__tcReal.look.incomplete());
    if (inc === 0 || Date.now() - t0 > 60000) break;
  }
  await page.waitForTimeout(500);
  const info = await page.evaluate(async () => ({ diag: await (async () => { const ix = await (await fetch('art/real/index.json')).json(); const S = window.__tcReal.sets; const st = {}; for (const e of ix.sets) { const k = S.state(e.key); if (k !== 'none') (st[k] ??= []).push(e.key); } return { st, cap: S.densityCap(), caps: S.capEvents(), dens: window.__tcReal.look.density?.(), peak: S.peakBytes() }; })(), inc: window.__tcReal.look.incomplete(), fallbacks: window.__tcReal.look.fallbacksUsed(), resident: window.__tcReal.sets.residentBytes() }));
  const out = path.join(outDir, `${name ?? `${scene}-z${zoom}-r${rot}`}.png`);
  await page.screenshot({ path: out });
  results.push({ spec, waitMs: Date.now() - t0, ...info, out });
}
console.log(JSON.stringify(results, null, 1));
console.log('--- console ---');
for (const l of logs) console.log(l);
await browser.close();
server.close();
