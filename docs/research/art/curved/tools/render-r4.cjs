// Renders the round-4 sheets (L, M, N, O): full sheet 1600x1000, phone crop 390x520 CSS px at DPR 2,
// and concept-curved-compare-4.png in the same layout as compare-3.
// usage: node tools/render-r4.cjs        -> all + compare
//        node tools/render-r4.cjs ln     -> only those sheets (compare only when all four are included)
const { chromium } = require('/home/user/RC-TYCOON-/node_modules/playwright');
const fs = require('fs');
const ART = '/home/user/RC-TYCOON-/docs/research/art/curved';
const SHOT = '/home/user/RC-TYCOON-/docs/screenshots';
const sheets = [['l', 'l-sky', 'Sky islands'], ['m', 'm-felt', 'Felt and stitch'], ['n', 'n-glass', 'Stained glass'], ['o', 'o-retro', 'Retro-future chrome']];
// phone crop windows (CSS px, top-left), each framed on a ride, a path and guests
const CROP = { l: { x: 470, y: 205 }, m: { x: 615, y: 235 }, n: { x: 600, y: 165 }, o: { x: 610, y: 230 } };
const only = process.argv[2] || 'lmno';
(async () => {
  const browser = await chromium.launch();
  for (const [k, file] of sheets) {
    if (!only.includes(k)) continue;
    const svg = fs.readFileSync(`${ART}/${file}.svg`, 'utf8');
    const full = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    await full.setContent(`<html><body style="margin:0">${svg}</body></html>`);
    await full.waitForTimeout(200);
    await full.screenshot({ path: `${SHOT}/concept-curved-${k}.png` });
    await full.close();
    const phone = await browser.newPage({ viewport: { width: 390, height: 520 }, deviceScaleFactor: 2 });
    await phone.setContent(`<html><body style="margin:0;overflow:hidden"><div style="position:absolute;left:${-CROP[k].x}px;top:${-CROP[k].y}px">${svg}</div></body></html>`);
    await phone.waitForTimeout(200);
    await phone.screenshot({ path: `${SHOT}/concept-curved-${k}-phone.png` });
    await phone.close();
  }
  if ([...'lmno'].every((k) => only.includes(k))) {
    const b64 = (p) => 'data:image/png;base64,' + fs.readFileSync(p).toString('base64');
    const cols = sheets.map(([k, , name]) => `
      <div class="col"><div class="lab"><b>${k.toUpperCase()}</b> ${name}</div>
      <img class="full" src="${b64(`${SHOT}/concept-curved-${k}.png`)}">
      <img class="ph" src="${b64(`${SHOT}/concept-curved-${k}-phone.png`)}"></div>`).join('');
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
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SHOT}/concept-curved-compare-4.png`, fullPage: true });
  }
  await browser.close();
  console.log('rendered');
})();
