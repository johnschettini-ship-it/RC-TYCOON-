/**
 * Makes the PNG app icons (180, 192, 512 px) from `public/icons/icon.svg` with Playwright (Phase 6 §4.10). Owner: W4-G.
 * Run once after the SVG changes and commit the PNGs: `node scripts/make-icons.ts` (Node 22.18+ runs TypeScript;
 * set PW_CHROMIUM_PATH to use a local Chromium).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ICONS = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
const SIZES = [180, 192, 512];

async function main(): Promise<void> {
  const svg = readFileSync(join(ICONS, 'icon.svg'), 'utf8');
  const executablePath = process.env.PW_CHROMIUM_PATH;
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  try {
    for (const size of SIZES) {
      const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
      const html = `<!doctype html><html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg style="display:block;width:${size}px;height:${size}px" `)}</body></html>`;
      await page.setContent(html);
      const png = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
      writeFileSync(join(ICONS, `icon-${size}.png`), png);
      await page.close();
      console.log(`icon-${size}.png`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
