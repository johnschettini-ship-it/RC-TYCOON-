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
// round 7: arguments are space-separated tokens: t u v w x y z aa compare compare2 turns guests (default: all)
const ALL = ['t', 'u', 'v', 'w', 'x', 'y', 'z', 'aa'];
const toks = process.argv.slice(2).length && process.argv[2] !== 'dbg' ? process.argv.slice(2) : ['t', 'u', 'v', 'w', 'x', 'y', 'z', 'aa', 'compare', 'compare2', 'turns', 'guests'];
const arg = toks.join(' ');
const variants = ALL.filter((k) => toks.includes(k));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };

// framing (world metres): sheet is the whole island; phone is centred on the carousel entry, a path and guests
const SHEET = { w: 1600, h: 1000, dpr: 1, zoom: 0.95, cx: -0.5, cy: 3.6, cz: -0.5 };
const PHONE = { w: 390, h: 520, dpr: 2, zoom: 1.4, cx: 10.6, cy: 1.2, cz: -5.6 };
// round 7 settings: 18 x 18 tile plots (54 m), so the sheet zooms out; phone crops sit on a ride, a path and guests
const FRAMES = {
  x: { sheet: { zoom: 0.76, cx: 0.5, cy: -1.4, cz: 0.5 }, phone: { cx: 9.2, cy: 4.6, cz: 3.4 } },
  y: { sheet: { zoom: 0.74, cx: 0.5, cy: 0.6, cz: 0.5 }, phone: { cx: -15.4, cy: 2.6, cz: 3.6 } },
  z: { sheet: { zoom: 0.68, cx: 1.5, cy: 10.0, cz: 1.5 }, phone: { cx: 6.2, cy: 4.2, cz: 6.4 } },
  aa: { sheet: { zoom: 0.76, cx: 0.5, cy: 0.4, cz: 0.5 }, phone: { cx: 11.6, cy: 2.2, cz: 6.6 } },
};
const sheetOf = (k) => FRAMES[k] ? { ...SHEET, ...FRAMES[k].sheet } : SHEET;
const phoneOf = (k) => FRAMES[k] ? { ...PHONE, ...FRAMES[k].phone } : PHONE;

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
  console.log(path.basename(file), `${r.ms} ms total (scene build ${r.build} ms)`);
  if (r.big && r.big.length) console.log('BIG:', r.big.slice(0, 400).join('\n'));
  return r;
}

(async () => {
  if (process.argv[2] === 'dbg') {
    // close-up for checking: node render.cjs dbg <variant> <x> <y> <z> <zoom> [yaw]
    const [, , , k, x, y, z, zoom, yaw = 0] = process.argv;
    const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    const page = await open(b);
    await shot(page, { variant: k, yaw: +yaw, view: { w: 800, h: 600, dpr: 1, zoom: +zoom, cx: +x, cy: +y, cz: +z }, label: false, debug: process.env.BIG ? +process.env.BIG : 0 }, process.env.OUT || '/tmp/dbg.png');
    await b.close(); return;
  }
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const k of variants) {
    const page = await open(browser);
    await shot(page, { variant: k, view: sheetOf(k) }, `${SHOT}/concept-real-${k}.png`);
    await shot(page, { variant: k, view: phoneOf(k), tilt: { focusY: 0.5, band: 0.12, soft: 0.25 } }, `${SHOT}/concept-real-${k}-phone.png`);
    await page.close();
  }
  if (toks.includes('turns')) {
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
  const compare = async (keys, names, file) => {
    const b64 = (p) => 'data:image/png;base64,' + fs.readFileSync(p).toString('base64');
    const cols = keys.map((k) => `
      <div class="col"><div class="lab"><b>${k.toUpperCase()}</b> ${names[k]}</div>
      <img class="full" src="${b64(`${SHOT}/concept-real-${k}.png`)}">
      <img class="ph" src="${b64(`${SHOT}/concept-real-${k}-phone.png`)}"></div>`).join('');
    const html = `<html><head><style>
      body{margin:0;background:#f2f3f8;font-family:system-ui,Inter,sans-serif;color:#1f2340}
      .wrap{display:flex;gap:24px;padding:24px}
      .col{width:800px;display:flex;flex-direction:column;align-items:center;gap:14px}
      .lab{align-self:stretch;font-size:28px;font-weight:600;padding:10px 16px;background:#fff;border-radius:14px;border:2px solid #d9dcea}
      .lab b{display:inline-block;min-width:40px;padding:0 4px;box-sizing:border-box;height:40px;line-height:40px;text-align:center;background:#1f2340;color:#fff;border-radius:10px;margin-right:10px}
      .full{width:800px;height:500px;border-radius:14px;box-shadow:0 2px 10px rgba(0,0,0,.12)}
      .ph{width:390px;height:520px;border-radius:22px;border:6px solid #1f2340}
    </style></head><body><div class="wrap">${cols}</div></body></html>`;
    const page = await browser.newPage({ viewport: { width: 24 + 4 * 824, height: 1150 } });
    await page.setContent(html);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOT}/${file}`, fullPage: true });
    await page.close();
    console.log(file);
  };
  if (toks.includes('compare')) await compare(['t', 'u', 'v', 'w'], { t: 'Daylight real', u: 'Miniature photo', v: 'Evening lights', w: 'Clean architectural' }, 'concept-real-compare.png');
  if (toks.includes('compare2')) await compare(['x', 'y', 'z', 'aa'], { x: 'Seaside pier', y: 'Lakeside forest', z: 'City plaza', aa: 'Winter festival' }, 'concept-real-compare-2.png');
  if (toks.includes('guests')) {
    // close-up line-up: two rows of six guests and a carousel horse with its rider
    const page = await open(browser);
    await shot(page, { variant: 'g', view: { w: 1600, h: 1000, dpr: 1, zoom: 8.4, cx: -1.13, cy: 0.95, cz: -0.85 }, label: 'Guests and a carousel horse, close-up (game zoom 8.4)' }, `${SHOT}/concept-real-guests.png`);
    await page.close();
  }
  await browser.close();
})();
