import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import fixture from '../../fixtures/real-index.json';
import type { RealIndex } from '../../../src/render/real/indexFormat';
import { checkIndex } from '../../../tools/art3d/checkIndex';
import {
  TITLE_CAPS, TITLE_COMPRESSED_MAX, TITLE_DECODED_MAX, checkTitleIndex, titleDecoded, webpSize,
  type TitleFiles, type TitleIndex,
} from '../../../tools/art3d/titleIndex';

// Plain JS build tools without types: import by a computed path so they load as `any`.
const dir = new URL('../../../tools/art3d/', import.meta.url);
const load = (rel: string): Promise<any> => import(/* @vite-ignore */ new URL(rel, dir).href); // eslint-disable-line @typescript-eslint/no-explicit-any

/** A valid title index and the files it names (sizes as the bake writes them). */
function fixtureTitle(): { index: TitleIndex; files: TitleFiles } {
  const framing = (tag: string, w: number, h: number) => ({
    w, h,
    layers: { sky: `${tag}-sky.webp`, park: `${tag}-park.webp`, front: `${tag}-front.webp` },
    wheel: { file: `${tag}-wheel.webp`, frames: 8 as const, fw: 200, fh: 220, x: w - 400, y: h - 500 },
    nameRow: h - 560,
    menuAnchorX: w - 390,
  });
  const index: TitleIndex = {
    wide: framing('wide', 1920, 800),
    tall: framing('tall', 900, 1300),
    sign: { line: { file: 'sign-line.webp', w: 1000, h: 220 }, stack: { file: 'sign-stack.webp', w: 560, h: 460 } },
  };
  const files: TitleFiles = new Map();
  for (const f of [index.wide, index.tall]) {
    for (const l of Object.values(f.layers)) files.set(l, { w: f.w, h: f.h, bytes: 200_000 });
    files.set(f.wheel.file, { w: f.wheel.fw * 8, h: f.wheel.fh, bytes: 100_000 });
  }
  for (const s of Object.values(index.sign)) files.set(s.file, { w: s.w, h: s.h, bytes: 50_000 });
  return { index, files };
}

describe('title bake item', () => {
  it('the registry has `title`, written to its own folder, built from the batch 1 ride modules and the Fredoka font', async () => {
    const { ITEM_LIST } = await load('items/registry.js');
    const it = ITEM_LIST.find((x: { id: string }) => x.id === 'title');
    expect(it).toBeTruthy();
    expect(it.file).toBe('items/title.js');
    expect(it.out).toBe('title');
    for (const f of ['items/big_wheel.js', 'items/swing_tower.js', 'items/steel_coaster.js']) expect(it.deps).toContain(f);
    expect(it.deps.some((f: string) => /fredoka.*\.woff2$/.test(f))).toBe(true);
    const index = readFileSync(new URL('items/index.js', dir), 'utf8');
    expect(index).toMatch(/import title from '\.\/title\.js'/);
    expect(index).toMatch(/ITEMS = \{[^}]*\btitle\b/);
  });
});

describe('checkTitleIndex', () => {
  it('a valid index is clean', () => {
    const { index, files } = fixtureTitle();
    expect(checkTitleIndex(index, files)).toEqual([]);
  });
  it('both framings are required', () => {
    const { index, files } = fixtureTitle();
    const bad = { ...index } as Partial<TitleIndex>;
    delete bad.tall;
    expect(checkTitleIndex(bad, files).some((p) => p.includes('tall'))).toBe(true);
  });
  it('layers within the caps', () => {
    const { index, files } = fixtureTitle();
    index.wide.w = TITLE_CAPS.wide.w + 2;
    for (const l of Object.values(index.wide.layers)) files.set(l, { w: index.wide.w, h: index.wide.h, bytes: 1 });
    expect(checkTitleIndex(index, files).some((p) => p.includes('over the cap'))).toBe(true);
    const t = fixtureTitle();
    t.index.tall.h = TITLE_CAPS.tall.h + 1;
    for (const l of Object.values(t.index.tall.layers)) t.files.set(l, { w: t.index.tall.w, h: t.index.tall.h, bytes: 1 });
    expect(checkTitleIndex(t.index, t.files).some((p) => p.includes('over the cap'))).toBe(true);
  });
  it('the wide framing is wide and the tall one tall', () => {
    const { index, files } = fixtureTitle();
    index.tall.w = 900; index.tall.h = 800;
    for (const l of Object.values(index.tall.layers)) files.set(l, { w: 900, h: 800, bytes: 1 });
    expect(checkTitleIndex(index, files).some((p) => p.includes('tall: not taller than wide'))).toBe(true);
  });
  it('a layer file must exist at the framing size', () => {
    const { index, files } = fixtureTitle();
    files.delete(index.wide.layers.park);
    expect(checkTitleIndex(index, files).some((p) => p.includes('missing file wide-park.webp'))).toBe(true);
    const t = fixtureTitle();
    t.files.set(t.index.tall.layers.sky, { w: 900, h: 1200, bytes: 1 });
    expect(checkTitleIndex(t.index, t.files).some((p) => p.includes('tall-sky.webp is 900x1200'))).toBe(true);
  });
  it('the wheel is an 8-frame strip on the layer', () => {
    const { index, files } = fixtureTitle();
    index.wide.wheel.frames = 7 as 8;
    expect(checkTitleIndex(index, files).some((p) => p.includes('8 frames'))).toBe(true);
    const t = fixtureTitle();
    t.files.set(t.index.wide.wheel.file, { w: 200 * 7, h: 220, bytes: 1 });
    expect(checkTitleIndex(t.index, t.files).some((p) => p.includes('wide-wheel.webp is 1400x220'))).toBe(true);
    const u = fixtureTitle();
    u.index.tall.wheel.x = 800;
    expect(checkTitleIndex(u.index, u.files).some((p) => p.includes('tall: wheel outside the layer'))).toBe(true);
  });
  it('nameRow and menuAnchorX lie on the layer: the name row at or above the wheel, the anchor at or left of its sprite', () => {
    const { index, files } = fixtureTitle();
    index.wide.nameRow = -1;
    expect(checkTitleIndex(index, files).some((p) => p.includes('nameRow'))).toBe(true);
    const t = fixtureTitle();
    t.index.wide.nameRow = t.index.wide.wheel.y + 40;
    expect(checkTitleIndex(t.index, t.files).some((p) => p.includes('nameRow'))).toBe(true);
    const u = fixtureTitle();
    u.index.tall.menuAnchorX = u.index.tall.wheel.x + 40;
    expect(checkTitleIndex(u.index, u.files).some((p) => p.includes('menuAnchorX'))).toBe(true);
    const v = fixtureTitle();
    v.index.tall.menuAnchorX = v.index.tall.wheel.x - 30; // the static legs reach left of the turning part
    expect(checkTitleIndex(v.index, v.files)).toEqual([]);
  });
  it('both signs: a one-line sign wider than high and a stacked one', () => {
    const { index, files } = fixtureTitle();
    const bad = structuredClone(index) as Partial<TitleIndex['sign']> & TitleIndex;
    delete (bad.sign as Partial<TitleIndex['sign']>).stack;
    expect(checkTitleIndex(bad, files).some((p) => p.includes('sign.stack'))).toBe(true);
    const t = fixtureTitle();
    t.index.sign.line = { file: 'sign-line.webp', w: 300, h: 400 };
    t.files.set('sign-line.webp', { w: 300, h: 400, bytes: 1 });
    expect(checkTitleIndex(t.index, t.files).some((p) => p.includes('sign.line'))).toBe(true);
  });
  it('no stray files in the folder', () => {
    const { index, files } = fixtureTitle();
    files.set('stray.webp', { w: 1, h: 1, bytes: 1 });
    expect(checkTitleIndex(index, files).some((p) => p.includes('file not in the title index: stray.webp'))).toBe(true);
  });
  it('compressed total within 3 MB and decoded within 24 MB per framing', () => {
    const { index, files } = fixtureTitle();
    const big = new Map([...files].map(([k, v]) => [k, { ...v, bytes: 400_000 }]));
    expect(checkTitleIndex(index, big).some((p) => p.includes('compressed'))).toBe(true);
    const d = titleDecoded(index);
    expect(d.wide).toBe(3 * 1920 * 800 * 4 + 1600 * 220 * 4 + 1000 * 220 * 4 + 560 * 460 * 4);
    expect(d.wide).toBeLessThanOrEqual(TITLE_DECODED_MAX);
    const t = fixtureTitle();
    t.index.wide.wheel.fw = 400; t.index.wide.wheel.fh = 600; t.index.wide.wheel.y = 100; t.index.wide.nameRow = 50;
    t.files.set(t.index.wide.wheel.file, { w: 3200, h: 600, bytes: 1 });
    expect(checkTitleIndex(t.index, t.files).some((p) => p.includes('decoded'))).toBe(true);
    expect(TITLE_COMPRESSED_MAX).toBe(3_000_000);
  });
  it('webpSize reads the size of a lossy and a lossless WebP header', () => {
    const vp8 = new Uint8Array(30);
    vp8.set([...'RIFF'].map((c) => c.charCodeAt(0)), 0); vp8.set([...'WEBPVP8 '].map((c) => c.charCodeAt(0)), 8);
    new DataView(vp8.buffer).setUint16(26, 1920, true); new DataView(vp8.buffer).setUint16(28, 800, true);
    expect(webpSize(vp8)).toEqual([1920, 800]);
    const vp8x = new Uint8Array(30);
    vp8x.set([...'RIFF'].map((c) => c.charCodeAt(0)), 0); vp8x.set([...'WEBPVP8X'].map((c) => c.charCodeAt(0)), 8);
    vp8x.set([899 & 255, 899 >> 8, 0], 24); vp8x.set([1299 & 255, 1299 >> 8, 0], 27);
    expect(webpSize(vp8x)).toEqual([900, 1300]);
  });
});

describe('checkIndex and the title folder', () => {
  const base = fixture as unknown as RealIndex;
  const filesOf = (i: RealIndex): Set<string> => new Set(i.sets.flatMap((s) => s.sheets.map((x) => x.file)));
  it('accepts a `title` folder with a valid title index', () => {
    const f = filesOf(base); f.add('title');
    expect(checkIndex(base, f, fixtureTitle())).toEqual([]);
  });
  it('reports a title folder it was not given to check', () => {
    const f = filesOf(base); f.add('title');
    expect(checkIndex(base, f).some((p) => p.includes('title'))).toBe(true);
  });
  it('reports the title index problems', () => {
    const f = filesOf(base); f.add('title');
    const t = fixtureTitle(); t.index.wide.wheel.frames = 4 as 8;
    expect(checkIndex(base, f, t).some((p) => p.startsWith('title:') && p.includes('8 frames'))).toBe(true);
  });
});

// The baked folder, when a bake has run here (dist-art is not in the repository).
const baked = new URL('../../../dist-art/real/title/', import.meta.url);
describe.skipIf(!existsSync(new URL('index.json', baked)))('the baked title (dist-art/real/title)', () => {
  it('passes checkTitleIndex with the real file sizes', () => {
    const index = JSON.parse(readFileSync(new URL('index.json', baked), 'utf8')) as TitleIndex;
    const files: TitleFiles = new Map();
    for (const n of readdirSync(baked)) {
      if (n === 'index.json') continue;
      const buf = readFileSync(new URL(n, baked));
      const [w, h] = webpSize(buf);
      files.set(n, { w, h, bytes: statSync(new URL(n, baked)).size });
    }
    expect(checkTitleIndex(index, files)).toEqual([]);
  });
});
