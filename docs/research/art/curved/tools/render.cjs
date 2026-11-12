const { chromium } = require('/home/user/RC-TYCOON-/node_modules/playwright');
const fs = require('fs');
const ART = '/home/user/RC-TYCOON-/docs/research/art/curved';
const SHOT = '/home/user/RC-TYCOON-/docs/screenshots';
const sheets = [['a', 'a-soft-flat', 'Soft rounded flat'], ['b', 'b-clay', 'Clay / toy 3D'], ['c', 'c-cartoon', 'Bold cartoon'],
  ['d', 'd-storybook', 'Storybook painted'], ['e', 'e-paper', 'Paper craft'], ['f', 'f-poster', 'Retro poster'], ['g', 'g-golden', 'Golden hour lights']];
// compare sheets: the first round (A-C) and the second round (D-G)
const compares = [['concept-curved-compare.png', 'abc'], ['concept-curved-compare-2.png', 'defg']];
const CROP = { x: 572, y: 128 }; // 390 x 520 window over carousel + queue + path + guests
// usage: node render.cjs            -> every sheet + both compares
//        node render.cjs defg       -> only those sheets, then the compares whose sheets are all included
const only = process.argv[2];

(async () => {
  const browser = await chromium.launch();
  for (const [k, file] of sheets) {
    if (only && !only.includes(k)) continue;
    const svg = fs.readFileSync(`${ART}/${file}.svg`, 'utf8');
    const full = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    await full.setContent(`<html><body style="margin:0">${svg}</body></html>`);
    await full.screenshot({ path: `${SHOT}/concept-curved-${k}.png` });
    await full.close();
    const phone = await browser.newPage({ viewport: { width: 390, height: 520 }, deviceScaleFactor: 2 });
    await phone.setContent(`<html><body style="margin:0;overflow:hidden"><div style="position:absolute;left:${-CROP.x}px;top:${-CROP.y}px">${svg}</div></body></html>`);
    await phone.screenshot({ path: `${SHOT}/concept-curved-${k}-phone.png` });
    await phone.close();
  }
  for (const [out, keys] of compares) {
    if (only && ![...keys].every((k) => only.includes(k))) continue;
    const b64 = (p) => 'data:image/png;base64,' + fs.readFileSync(p).toString('base64');
    const cols = sheets.filter(([k]) => keys.includes(k)).map(([k, , name]) => `
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
    const page = await browser.newPage({ viewport: { width: 24 + keys.length * 824, height: 1150 } });
    await page.setContent(html);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SHOT}/${out}`, fullPage: true });
  }
  await browser.close();
  console.log('rendered');
})();
