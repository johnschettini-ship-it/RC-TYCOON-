// Round 6 (realistic) render driver. Serves this folder to headless Chromium (WebGL2 via SwiftShader is enough),
// calls window.renderShot() and writes the PNGs into docs/screenshots.
// usage: node render.cjs            -> all four sheets + phone crops + compare + T turns
//        node render.cjs tv         -> only those variants (compare/turns only when asked: add "compare" / "turns")
//        node render.cjs turns      -> only the 2x2 rotation sheet
const path = require('path');
const fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(path.resolve(__dirname, '../../../../../node_modules/playwright'))); }
const DIR = __dirname;
const SHOT = path.resolve(__dirname, '../../../../screenshots');
const arg = process.argv.slice(2).join(' ') || 'tuvw compare turns';
const variants = [...'tuvw'].filter((k) => arg.replace(/compare|turns/g, '').includes(k));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };

// framing (world metres): sheet is the whole island; phone is centred on the carousel entry, a path and guests
const SHEET = { w: 1600, h: 1000, dpr: 1, zoom: 0.95, cx: -0.5, cy: 3.6, cz: -0.5 };
const PHONE = { w: 390, h: 520, dpr: 2, zoom: 1.4, cx: 10.6, cy: 1.2, cz: -5.6 };

async function open(browser) {
  const page = await browser.newPage();
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.text()); });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.route('http://r6.local/**', (route) => {
    const rel = decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\//, '');
    const file = path.join(DIR, rel);
    if (!file.startsWith(DIR) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: 'nf' });
    route.fulfill({ status: 200, contentType: TYPES[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
  });
  await page.goto('http://r6.local/index.html');
  await page.waitForFunction(() => window.ready === true, null, { timeout: 60000 });
  return page;
}
async function shot(page, opts, file) {
  const r = await page.evaluate((o) => window.renderShot(o), opts);
  fs.writeFileSync(file, Buffer.from(r.png.split(',')[1], 'base64'));
  console.log(path.basename(file), `${r.ms} ms total (scene build ${r.build} ms)`, `${r.calls} draw calls`, `${r.tris} tris`);
  return r;
}

(async () => {
  if (process.argv[2] === 'dbg') {
    // close-up for checking: node render.cjs dbg <variant> <x> <y> <z> <zoom> [yaw]
    const [, , , k, x, y, z, zoom, yaw = 0] = process.argv;
    const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    const page = await open(b);
    await shot(page, { variant: k, yaw: +yaw, view: { w: 800, h: 600, dpr: 1, zoom: +zoom, cx: +x, cy: +y, cz: +z }, label: false }, process.env.OUT || '/tmp/dbg.png');
    await b.close(); return;
  }
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const k of variants) {
    const page = await open(browser);
    await shot(page, { variant: k, view: SHEET }, `${SHOT}/concept-real-${k}.png`);
    await shot(page, { variant: k, view: PHONE, tilt: { focusY: 0.5, band: 0.12, soft: 0.25 } }, `${SHOT}/concept-real-${k}-phone.png`);
    await page.close();
  }
  if (arg.includes('turns')) {
    const page = await open(browser);
    const names = ['0 deg (default)', '90 deg', '180 deg', '270 deg'];
    for (let q = 0; q < 4; q++) await shot(page, { variant: 't', yaw: q, view: { ...SHEET, w: 1600, h: 1000 }, label: `T  Daylight real, turn ${names[q]}` }, `${SHOT}/.turn-${q}.png`);
    await page.close();
    const b64 = (p) => 'data:image/png;base64,' + fs.readFileSync(p).toString('base64');
    const grid = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    await grid.setContent(`<html><body style="margin:0;background:#1f2340;display:grid;grid-template-columns:796px 796px;gap:8px;padding:0">
      ${[0, 1, 2, 3].map((q) => `<img src="${b64(`${SHOT}/.turn-${q}.png`)}" style="width:796px;height:496px;display:block">`).join('')}</body></html>`);
    await grid.waitForTimeout(300);
    await grid.screenshot({ path: `${SHOT}/concept-real-t-turns.png`, clip: { x: 0, y: 0, width: 1600, height: 1000 } });
    for (let q = 0; q < 4; q++) fs.unlinkSync(`${SHOT}/.turn-${q}.png`);
    await grid.close();
    console.log('concept-real-t-turns.png');
  }
  if (arg.includes('compare')) {
    const b64 = (p) => 'data:image/png;base64,' + fs.readFileSync(p).toString('base64');
    const names = { t: 'Daylight real', u: 'Miniature photo', v: 'Evening lights', w: 'Clean architectural' };
    const cols = [...'tuvw'].map((k) => `
      <div class="col"><div class="lab"><b>${k.toUpperCase()}</b> ${names[k]}</div>
      <img class="full" src="${b64(`${SHOT}/concept-real-${k}.png`)}">
      <img class="ph" src="${b64(`${SHOT}/concept-real-${k}-phone.png`)}"></div>`).join('');
    const html = `<html><head><style>
      body{margin:0;background:#f2f3f8;font-family:system-ui,Inter,sans-serif;color:#1f2340}
      .wrap{display:flex;gap:24px;padding:24px}
      .col{width:800px;display:flex;flex-direction:column;align-items:center;gap:14px}
      .lab{align-self:stretch;font-size:28px;font-weight:600;padding:10px 16px;background:#fff;border-radius:14px;border:2px solid #d9dcea}
      .lab b{display:inline-block;width:40px;height:40px;line-height:40px;text-align:center;background:#1f2340;color:#fff;border-radius:10px;margin-right:10px}
      .full{width:800px;height:500px;border-radius:14px;box-shadow:0 2px 10px rgba(0,0,0,.12)}
      .ph{width:390px;height:520px;border-radius:22px;border:6px solid #1f2340}
    </style></head><body><div class="wrap">${cols}</div></body></html>`;
    const page = await browser.newPage({ viewport: { width: 24 + 4 * 824, height: 1150 } });
    await page.setContent(html);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOT}/concept-real-compare.png`, fullPage: true });
    console.log('concept-real-compare.png');
  }
  await browser.close();
})();
