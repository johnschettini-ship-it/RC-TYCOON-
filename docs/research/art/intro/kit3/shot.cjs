// Renders the intro.html of a design folder with Chromium and measures it. Mock-up tool, not game code.
// Usage: NODE_PATH=/home/user/RC-TYCOON-/node_modules node shot.cjs <design folder>
// Writes desktop.png (1280 x 800) and phone.png (390 x 844) into the folder and prints one JSON object:
//   { "desktop": { width, height, fontLoaded, baseCss, menu: [{ text, x, y, width, height }], hiddenMenu, images: [...],
//                  backgrounds: [...], resources: [...], content: { width, height }, errors: [...] }, "phone": { ... } }
// fontLoaded: a loaded font face is named Fredoka. menu: every visible element with the attribute data-menu.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { pathToFileURL, fileURLToPath } = require('url');

const SCREENS = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'phone', width: 390, height: 844 },
];

(async () => {
  const folder = path.resolve(process.argv[2] || '.');
  const html = path.join(folder, 'intro.html');
  if (!fs.existsSync(html)) {
    console.error('shot.cjs: no intro.html in ' + folder);
    process.exit(2);
  }
  const url = pathToFileURL(html).href;
  const browser = await chromium.launch();
  const out = {};
  try {
    for (const screen of SCREENS) {
      const context = await browser.newContext({ viewport: { width: screen.width, height: screen.height }, deviceScaleFactor: 1 });
      const page = await context.newPage();
      const errors = [];
      const resources = [];
      page.on('pageerror', (e) => errors.push('page error: ' + e.message));
      page.on('requestfailed', (r) => errors.push('not loaded: ' + r.url()));
      page.on('requestfinished', (r) => {
        if (!r.url().startsWith('file:')) return;
        try { resources.push(fileURLToPath(r.url())); } catch (e) { /* not a file path */ }
      });
      await page.goto(url, { waitUntil: 'load' });
      // Wait for the fonts and for every picture, then for two frames so that the layout is final.
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all(Array.from(document.images).map((img) => (img.complete ? null : new Promise((done) => { img.onload = img.onerror = done; }))));
        await Promise.all(Array.from(document.images).map((img) => (img.decode ? img.decode().catch(() => null) : null)));
        await document.fonts.ready;
        await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
      });
      const data = await page.evaluate(() => {
        const round = (n) => Math.round(n * 100) / 100;
        const box = (el) => { const r = el.getBoundingClientRect(); return { x: round(r.x), y: round(r.y), width: round(r.width), height: round(r.height) }; };
        const shown = (el) => {
          const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
          return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
        };
        const all = Array.from(document.querySelectorAll('[data-menu]'));
        const menu = all.filter(shown).map((el) => Object.assign({ text: (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim() }, box(el)));
        const images = Array.from(document.querySelectorAll('img')).map((img) => {
          const cs = getComputedStyle(img);
          return Object.assign({ src: img.getAttribute('src') || '', px: img.classList.contains('px'), loaded: img.naturalWidth > 0, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight,
            objectFit: cs.objectFit, rendering: cs.imageRendering, shown: shown(img) }, box(img));
        });
        // Pictures used as CSS backgrounds (also on ::before and ::after), one entry for each layer.
        const backgrounds = [];
        const layers = (v) => v.split(/,(?![^(]*\))/).map((p) => p.trim());
        for (const el of Array.from(document.querySelectorAll('*'))) {
          if (!shown(el)) continue;
          for (const pseudo of [null, '::before', '::after']) {
            const cs = getComputedStyle(el, pseudo);
            if (pseudo && (cs.content === 'none' || cs.content === 'normal' || cs.display === 'none')) continue;
            if (!cs.backgroundImage || cs.backgroundImage.indexOf('url(') < 0) continue;
            const sizes = layers(cs.backgroundSize);
            layers(cs.backgroundImage).forEach((layer, n) => {
              const m = /^url\(["']?(.*?)["']?\)$/.exec(layer);
              if (!m || !/^file:/.test(m[1])) return;
              backgrounds.push({ url: m[1], size: sizes[n % sizes.length], rendering: cs.imageRendering, tag: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.classList.length ? '.' + Array.from(el.classList).join('.') : '') + (pseudo || '') });
            });
          }
        }
        const sheets = Array.from(document.styleSheets).map((s) => s.href || '');
        return {
          fontLoaded: Array.from(document.fonts).some((f) => f.status === 'loaded' && /fredoka/i.test(f.family)),
          fontFaces: Array.from(document.fonts).map((f) => f.family.replace(/["']/g, '') + ' ' + f.status),
          baseCss: sheets.some((h) => /\/base\.css$/.test(h)) && getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() !== '',
          menu,
          hiddenMenu: all.length - menu.length,
          images,
          backgrounds,
          content: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
        };
      });
      await page.screenshot({ path: path.join(folder, screen.name + '.png') });
      for (const bg of data.backgrounds) {
        try { bg.file = fileURLToPath(bg.url); } catch (e) { bg.file = bg.url; }
        delete bg.url;
      }
      out[screen.name] = Object.assign({ width: screen.width, height: screen.height }, data, { resources: Array.from(new Set(resources)), errors });
      await context.close();
    }
  } finally {
    await browser.close();
  }
  console.log(JSON.stringify(out, null, 2));
})().catch((e) => {
  console.error('shot.cjs failed: ' + (e && e.stack ? e.stack : e));
  process.exit(2);
});
