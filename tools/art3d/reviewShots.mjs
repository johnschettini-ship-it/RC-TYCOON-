// Batch review shots (phase 8c, spec §7 item 1 / D9): for each item a one-item park built through the game's own
// placement commands (game.dispatch: placeRide / placeStall / placeScenery / buildPath + buildPathItem), shot at
// zoom 2, render ratio 2 (phone viewport 390 x 844, DPR 2), view turns 0 and 1, in both looks (?art=classic = today's
// look, ?art=real). Writes <out>/<id>-<look>-t<turn>.png and <out>/index.html (reviewPage.ts), the page the owner
// reads on the phone.
//
// Run (the real build must be the VITE_ART=real build with the baked art under art/real):
//   node tools/art3d/bake.mjs --out dist-art/real
//   VITE_ART=real npx vite build --outDir <dir> && mkdir -p <dir>/art && cp -r dist-art/real <dir>/art/real
//   node tools/art3d/reviewShots.mjs --root <dir> --items carousel,bench,... --out <dir>/review
// --looks classic,real (default) limits the looks shot.
// --items defaults to the stage 1 list: every ITEM_LIST entry with a `catalog`, plus bench and bin.
// The park is a flat 64 x 64 sandbox (everything unlocked, free); items are placed one at a time and demolished again.
import fs from 'node:fs';
import path from 'node:path';
import { rolldown } from 'rolldown';
import { REPO, chromium, serve, phonePage } from './shotKit.mjs';
import { ITEM_LIST } from './items/registry.js';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const root = path.resolve(arg('--root', ''));
const out = path.resolve(arg('--out', path.join(root, 'review')));
const defaultItems = [...ITEM_LIST.filter((i) => i.catalog).map((i) => i.id), 'bench', 'bin'];
const ids = (arg('--items', '') || defaultItems.join(',')).split(',').filter(Boolean);
const TURNS = [0, 1];
const LOOKS = (arg('--looks', '') || 'classic,real').split(',');
const ZOOM = 2;
const SITE = { x: 30, y: 30 };
const SHOT = { w: 390, h: 520 }; // css px, centred on the item

fs.mkdirSync(out, { recursive: true });

// reviewPage.ts and catalog.ts (footprints, heights) are TypeScript: bundle them for Node, as bake.mjs does.
const tmp = fs.mkdtempSync(path.join(out, '.bundle-'));
async function bundle(entry, name) {
  const b = await rolldown({ input: path.join(REPO, entry), platform: 'node', logLevel: 'warn' });
  await b.write({ file: path.join(tmp, name), format: 'esm', codeSplitting: false });
  await b.close();
  return import(path.join(tmp, name));
}
const { reviewPage } = await bundle('tools/art3d/reviewPage.ts', 'reviewPage.mjs');
const { itemSpec } = await bundle('tools/art3d/catalog.ts', 'catalog.mjs');
const known = new Map(ITEM_LIST.map((i) => [i.id, i]));

/** What to place for an item id: kind, footprint and height. */
function plan(id) {
  const it = known.get(id);
  if (!it) throw new Error(`unknown item '${id}'`);
  if (id === 'bench' || id === 'bin') return { kind: 'pathitem', id, w: 2, d: 1, heightM: 1 };
  if (!it.catalog) throw new Error(`item '${id}' has no catalog entry (no one-item park for it)`);
  const [kind, cid] = it.catalog;
  const spec = itemSpec(kind, cid);
  return { kind, id: cid, w: spec.footprintTiles[0], d: spec.footprintTiles[1], heightM: spec.heightM };
}

/** Place one item through the game. Returns a cleanup description or throws with the game's own refusal text. */
const PLACE = ({ kind, id, w, d }, site) => {
  const g = window.__tc;
  const must = (r, what) => { if (!r.ok) throw new Error(`${what}: ${r.error ?? r.reason ?? JSON.stringify(r)}`); return r; };
  if (kind === 'ride') { must(g.dispatch({ type: 'placeRide', defId: id, x: site.x, y: site.y, rotation: 0 }), 'placeRide'); return { undo: [{ type: 'demolish', x: site.x, y: site.y }] }; }
  if (kind === 'stall') { must(g.dispatch({ type: 'placeStall', defId: id, x: site.x, y: site.y, rotation: 0 }), 'placeStall'); return { undo: [{ type: 'demolish', x: site.x, y: site.y }] }; }
  if (kind === 'scenery') {
    let r = g.dispatch({ type: 'placeScenery', defId: id, x: site.x, y: site.y, rotation: 0, edge: -1 });
    if (!r.ok) r = g.dispatch({ type: 'placeScenery', defId: id, x: site.x, y: site.y, rotation: 0, edge: 0 });
    must(r, 'placeScenery');
    return { undo: [{ type: 'removeScenery', id: r.id }] };
  }
  // path item: a two-tile footpath, the item on its first tile
  must(g.dispatch({ type: 'buildPathLine', x0: site.x, y0: site.y, x1: site.x + 1, y1: site.y, kind: 'footpath' }), 'buildPathLine');
  must(g.dispatch({ type: 'buildPathItem', x: site.x, y: site.y, itemType: id }), 'buildPathItem');
  return { undo: [{ type: 'removePathItem', x: site.x, y: site.y }, { type: 'demolish', x: site.x, y: site.y }, { type: 'demolish', x: site.x + 1, y: site.y }] };
};

const { port, server } = await serve(root);
const browser = await chromium.launch();
const files = {}; // id -> shots
const notes = [];
for (const look of LOOKS) {
  const { page, logs } = await phonePage(browser);
  await page.goto(`http://localhost:${port}/index.html?art=${look}`);
  await page.waitForFunction(() => window.__tc && window.__tcView, null, { timeout: 30000 });
  // A flat 64 x 64 sandbox park, started through the title screen.
  await page.getByTestId('title-new').click();
  await page.getByTestId('title-sandbox').click();
  await page.getByTestId('sandbox-setup').getByRole('radio', { name: 'Flat', exact: true }).click();
  await page.getByTestId('sandbox-size-64').click();
  await page.getByTestId('sandbox-start').click();
  await page.locator('.title-screen').waitFor({ state: 'hidden' });
  await page.evaluate(() => window.__tc.setSpeed(0));
  await page.addStyleTag({ content: '#ui { display: none !important; }' });
  await page.waitForTimeout(1000);
  for (const id of ids) {
    const p = plan(id);
    const placed = await page.evaluate(`(${PLACE.toString()})(${JSON.stringify(p)}, ${JSON.stringify(SITE)})`).then((r) => ({ ok: true, ...r }), (e) => ({ ok: false, error: String(e.message ?? e) }));
    if (!placed.ok) { notes.push(`${look} ${id}: ${placed.error}`); continue; }
    for (const turn of TURNS) {
      await page.evaluate(([cx, cy, z, t, lift]) => { window.__tcView.frame(cx, cy, z, t, lift); window.__tc.setSpeed(0); }, [SITE.x + p.w / 2, SITE.y + p.d / 2, ZOOM, turn, p.heightM * 9.8 * 0.4]);
      const t0 = Date.now();
      if (look === 'real') {
        for (;;) {
          await page.waitForTimeout(250);
          const done = await page.evaluate(() => window.__tcReal.look.incomplete() === 0 && (window.__tcReal.ground?.complete ?? true));
          if (done || Date.now() - t0 > 30000) break;
        }
      }
      await page.waitForTimeout(800);
      const file = `${id}-${look}-t${turn}.png`;
      await page.screenshot({ path: path.join(out, file), clip: { x: 0, y: Math.round((844 - SHOT.h) / 2), width: SHOT.w, height: SHOT.h } });
      (files[id] ??= []).push({ look, turn, file });
    }
    for (const c of placed.undo) await page.evaluate((cmd) => window.__tc.dispatch(cmd), c);
  }
  for (const l of logs.filter((x) => /error|warn/.test(x))) notes.push(`${look} console: ${l}`);
  await page.close();
}
const pretty = (id) => id.split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
fs.writeFileSync(path.join(out, 'index.html'), reviewPage(ids.filter((id) => files[id]).map((id) => ({ id, name: pretty(id), shots: files[id] }))));
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`wrote ${Object.values(files).flat().length} pictures and ${path.join(out, 'index.html')}`);
for (const n of notes) console.log('note: ' + n);
await browser.close();
server.close();
