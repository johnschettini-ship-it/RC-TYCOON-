import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import fixture from '../../fixtures/real-index.json';
import type { RealIndex } from '../../../src/render/real/indexFormat';
import { checkIndex } from '../../../tools/art3d/checkIndex';
import COVER from '../../../art-src/title/index.json';
import type { CoverIndex } from '../../../src/ui/titleScreen/real/layout';
import {
  TITLE_CAPS, TITLE_COMPRESSED_MAX, TITLE_DECODED_MAX, checkCoverFolder, checkTitleIndex, titleDecoded, webpSize,
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
  it('the registry keeps the earlier panorama `title`, out of the default bake, written to title-panorama/ (the game shows the poster cover in title/)', async () => {
    const { ITEM_LIST } = await load('items/registry.js');
    const it = ITEM_LIST.find((x: { id: string }) => x.id === 'title');
    expect(it).toBeTruthy();
    expect(it.file).toBe('items/title.js');
    expect(it.out).toBe('title-panorama');
    expect(it.explicit).toBe(true);
    const bake = readFileSync(new URL('bake.mjs', dir), 'utf8');
    expect(bake).toMatch(/ITEM_LIST\.filter\(\(it\) => !it\.explicit \|\| \(o\.only && o\.only\.includes\(it\.id\)\)\)/);
    for (const f of ['items/big_wheel.js', 'items/swing_tower.js', 'items/steel_coaster.js']) expect(it.deps).toContain(f);
    expect(it.deps.some((f: string) => /fredoka.*\.woff2$/.test(f))).toBe(true);
    const index = readFileSync(new URL('items/index.js', dir), 'utf8');
    expect(index).toMatch(/import title from '\.\/title\.js'/);
    expect(index).toMatch(/ITEMS = \{[^}]*\btitle\b/);
  });
});

describe('the lake reflection (items/titleMirror.js)', () => {
  // A park as title.js builds it: the wheel ride's static frame tagged `park`, its turning part (rim, gondolas) `wheel`.
  async function park() {
    const THREE = await load('vendor/three-0.160.0.module.min.js');
    const { mirrorWorld, shown } = await load('items/titleMirror.js');
    const mesh = (name: string) => Object.assign(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()), { name, castShadow: true });
    const parkG = new THREE.Group(); parkG.userData.layer = 'park';
    const ferris = new THREE.Group(); parkG.add(ferris);
    const legs = mesh('legs'); legs.userData.layer = 'park'; ferris.add(legs);
    for (const n of ['rim', 'gondola']) { const g = new THREE.Group(); g.userData.layer = 'wheel'; g.add(mesh(n)); ferris.add(g); }
    parkG.add(mesh('tree'));
    const sky = new THREE.Group(); sky.userData.layer = 'sky'; sky.add(mesh('hill'));
    return { THREE, mirror: mirrorWorld(THREE, [sky, parkG], -0.35), shown, parkG };
  }
  it('the mirror shows no part of the turning wheel (its reflection is baked still under a turning wheel)', async () => {
    const { mirror, shown } = await park();
    const byName = (n: string) => { const out: unknown[] = []; mirror.traverse((o: { name: string }) => { if (o.name === n) out.push(o); }); return out; };
    for (const n of ['rim', 'gondola']) {
      expect(byName(n).length, n).toBe(1);
      expect(shown(byName(n)[0], mirror), `${n} shown in the mirror`).toBe(false);
    }
    for (const n of ['legs', 'tree', 'hill']) expect(shown(byName(n)[0], mirror), `${n} shown in the mirror`).toBe(true);
  });
  it('the copies take the mirror layer, cast no shadows, and leave the originals as they were', async () => {
    const { mirror, parkG } = await park();
    expect(mirror.scale.y).toBe(-1);
    expect(mirror.position.y).toBeCloseTo(-0.7);
    mirror.traverse((o: { userData: { layer?: string }; castShadow: boolean }) => {
      if (o !== mirror) expect(o.userData.layer).toBeUndefined();
      expect(o.castShadow).toBe(false);
    });
    let turning = 0;
    parkG.traverse((o: { userData: { layer?: string }; visible: boolean }) => { if (o.userData.layer === 'wheel') { turning++; expect(o.visible).toBe(true); } });
    expect(turning).toBe(2);
  });
  it('title.js mirrors through mirrorWorld and tags the wheel\'s turning groups `wheel`', () => {
    const src = readFileSync(new URL('items/title.js', dir), 'utf8');
    expect(src).toMatch(/mirrorWorld\(THREE, \[sky, P\.park\], WATER_Y\)/);
    expect(src).toMatch(/c\.userData\.layer = c\.isGroup \? 'wheel' : 'park'/);
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

/** The cover folder as the copy step writes it: the real cover index and its poster's size. */
function fixtureCover(): { index: CoverIndex; files: TitleFiles } {
  const index = structuredClone(COVER) as unknown as CoverIndex;
  const files: TitleFiles = new Map([['poster-wide.webp', { w: 1376, h: 768, bytes: 359_692 }]]);
  return { index, files };
}

describe('checkCoverFolder (title/: the poster cover)', () => {
  it('the real cover index with its poster is clean', () => {
    const { index, files } = fixtureCover();
    expect(checkCoverFolder(index, files)).toEqual([]);
  });
  it('the poster must be there at the size the index says, with nothing stray', () => {
    const t = fixtureCover();
    t.files.clear();
    expect(checkCoverFolder(t.index, t.files).some((p) => p.includes('missing file poster-wide.webp'))).toBe(true);
    const u = fixtureCover();
    u.files.set('poster-wide.webp', { w: 1376, h: 760, bytes: 1 });
    expect(checkCoverFolder(u.index, u.files).some((p) => p.includes('is 1376x760'))).toBe(true);
    const v = fixtureCover();
    v.files.set('old.webp', { w: 1, h: 1, bytes: 1 });
    expect(checkCoverFolder(v.index, v.files)).toEqual(['file not in the cover index: old.webp']);
  });
  it('compressed within 3 MB, and the game\'s own index check (decoded within 24 MB per framing)', () => {
    const t = fixtureCover();
    t.files.set('poster-wide.webp', { w: 1376, h: 768, bytes: 3_000_001 });
    expect(checkCoverFolder(t.index, t.files).some((p) => p.includes('over 3000000'))).toBe(true);
    const u = fixtureCover();
    Object.assign(u.index.tall, { file: 'poster-tall.webp', w: 2560, h: 2400 });
    u.files.set('poster-tall.webp', { w: 2560, h: 2400, bytes: 1 });
    expect(checkCoverFolder(u.index, u.files).some((p) => /tall/.test(p))).toBe(true);
    expect(checkCoverFolder({ ...u.index, format: 'x' }, u.files)[0]).toMatch(/format/);
  });
  it('the copy step\'s source (art-src/title/) passes with the real file', () => {
    const src = new URL('../../../art-src/title/', import.meta.url);
    const files: TitleFiles = new Map();
    for (const n of readdirSync(src)) {
      if (n === 'index.json') continue;
      const buf = readFileSync(new URL(n, src));
      const [w, h] = webpSize(buf);
      files.set(n, { w, h, bytes: buf.length });
    }
    expect(checkCoverFolder(COVER, files)).toEqual([]);
  });
});

describe('checkIndex and the title folders', () => {
  const base = fixture as unknown as RealIndex;
  const filesOf = (i: RealIndex): Set<string> => new Set(i.sets.flatMap((s) => s.sheets.map((x) => x.file)));
  it('accepts a `title` cover folder and a `title-panorama` folder', () => {
    const f = filesOf(base); f.add('title'); f.add('title-panorama');
    expect(checkIndex(base, f, fixtureCover(), fixtureTitle())).toEqual([]);
  });
  it('reports a folder it was not given to check', () => {
    const f = filesOf(base); f.add('title');
    expect(checkIndex(base, f).some((p) => p.startsWith('title:'))).toBe(true);
    const g = filesOf(base); g.add('title-panorama');
    expect(checkIndex(base, g, fixtureCover()).some((p) => p.startsWith('title-panorama:'))).toBe(true);
  });
  it('reports the problems of each folder under its name', () => {
    const f = filesOf(base); f.add('title'); f.add('title-panorama');
    const c = fixtureCover(); c.files.clear();
    const t = fixtureTitle(); t.index.wide.wheel.frames = 4 as 8;
    const p = checkIndex(base, f, c, t);
    expect(p.some((x) => x.startsWith('title:') && x.includes('missing file'))).toBe(true);
    expect(p.some((x) => x.startsWith('title-panorama:') && x.includes('8 frames'))).toBe(true);
  });
});

// The baked folders, when a bake has run here (dist-art is not in the repository).
const cover = new URL('../../../dist-art/real/title/', import.meta.url);
describe.skipIf(!existsSync(new URL('index.json', cover)))('the copied cover (dist-art/real/title)', () => {
  it('passes checkCoverFolder with the real file sizes', () => {
    const index = JSON.parse(readFileSync(new URL('index.json', cover), 'utf8')) as unknown;
    const files: TitleFiles = new Map();
    for (const n of readdirSync(cover)) {
      if (n === 'index.json') continue;
      const buf = readFileSync(new URL(n, cover));
      const [w, h] = webpSize(buf);
      files.set(n, { w, h, bytes: statSync(new URL(n, cover)).size });
    }
    expect(checkCoverFolder(index, files)).toEqual([]);
  });
});
const baked = new URL('../../../dist-art/real/title-panorama/', import.meta.url);
describe.skipIf(!existsSync(new URL('index.json', baked)))('the baked panorama (dist-art/real/title-panorama, only with --only title)', () => {
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
