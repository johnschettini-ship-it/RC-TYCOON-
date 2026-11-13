// Headless check of the phone test page (needs ./dist from bake.cjs). Serves this folder over a small static server,
// runs the 30 s benchmark in two emulated phones, writes results-headless.json and three screenshots into
// docs/screenshots (real-test-1x/2x/turn.png). Headless Chromium draws on the CPU: these numbers are NOT a phone's.
//   node docs/research/art/realistic/phone-test/headless-check.cjs
const path = require('path');
const fs = require('fs');
const http = require('http');
let pw;
try { pw = require('playwright'); } catch { pw = require(path.resolve(__dirname, '../../../../../node_modules/playwright')); }
const { chromium, devices } = pw;

const DIR = __dirname;
const SHOT = path.resolve(__dirname, '../../../../screenshots');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png' };

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\//, '') || 'index.html';
  const file = path.join(DIR, rel);
  if (!file.startsWith(DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

async function openPage(browser, ctxOpts, url, log) {
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') log.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => log.push('pageerror: ' + e.message));
  page.on('requestfailed', (r) => log.push('requestfailed: ' + r.url()));
  await page.goto(url);
  await page.waitForFunction(() => window.__test && window.__test.ready, null, { timeout: 120000 });
  return { ctx, page };
}

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/index.html`;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const log = [];
  const runs = [];
  const phones = [
    { name: 'iPhone 13 emulation (390x664 CSS, DPR 3)', opts: { ...devices['iPhone 13'] } },
    { name: 'Android-like 360x800 CSS, DPR 2', opts: { viewport: { width: 360, height: 800 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
  ];
  for (const ph of phones) {
    const { ctx, page } = await openPage(browser, ph.opts, url, log);
    await page.waitForTimeout(1000);
    await page.click('#bench');
    await page.waitForFunction(() => !!window.__results, null, { timeout: 120000 });
    const r = await page.evaluate(() => window.__results);
    runs.push({ phone: ph.name, ...r });
    console.log(`${ph.name}: ${r.verdict}  p95@300z1 ${r.checks.frame.value} ms, decoded ${r.load.decodedMB} MB, download ${r.load.downloadMB} MB, load ${r.load.ms} ms, turns ${r.turnMs.join('/')} ms`);
    for (const f of r.frames) console.log(`   ${f.bucket.padEnd(22)} n=${String(f.frames).padStart(4)} p50 ${f.p50} p95 ${f.p95} p99 ${f.p99} >33ms ${f.dropped}`);
    if (process.env.CARD_SHOT) await page.screenshot({ path: process.env.CARD_SHOT.replace('.png', `-${runs.length}.png`) }); // the results card, for checking
    await ctx.close();
  }
  // screenshots at DPR 2 (phone portrait), 300 guests, centred near the plaza and the carousel
  {
    const { ctx, page } = await openPage(browser, { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, url, log);
    const set = async (o) => { await page.evaluate((o) => { const t = window.__test; t.setCrowd(300); t.setZoom(o.zoom); t.view.cx = o.cx; t.view.cy = o.cy; }, o); await page.waitForTimeout(1500); };
    await set({ zoom: 1, cx: 120, cy: 0 });
    await page.screenshot({ path: path.join(SHOT, 'real-test-1x.png') });
    await set({ zoom: 2, cx: 130, cy: -40 });
    await page.screenshot({ path: path.join(SHOT, 'real-test-2x.png') });
    await page.evaluate(() => { const t = window.__test; t.setZoom(1); t.turn(); });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SHOT, 'real-test-turn.png') });
    await ctx.close();
  }
  await browser.close();
  server.close();
  const out = {
    warning: 'Headless Chromium in a container draws Canvas 2D on the CPU (WebGL via SwiftShader). These numbers do NOT represent a real phone; run the page on the phone itself.',
    console: log.length ? log : 'clean (no errors, warnings or failed requests)',
    runs,
  };
  fs.writeFileSync(path.join(DIR, 'results-headless.json'), JSON.stringify(out, null, 2) + '\n');
  console.log('console:', log.length ? log : 'clean');
})().catch((e) => { console.error(e); server.close(); process.exit(1); });
