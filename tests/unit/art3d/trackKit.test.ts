// The track kit's frame plan (batch 5 Task 3): what tools/art3d/items/trackKit.js shoots for a type, from the bake
// input bakeNode.ts trackGeometry gives it, counted with the same plan (items/trackKeys.js) the kit loops over.
import { describe, expect, it } from 'vitest';
import { TRACK_RIDES } from '../../../src/data/catalog';
import { getTrackPieceDef, getTrackTypeDef } from '../../../src/data/track';
import { TRACK_CLASSES, pieceClass, poseClassOf, poseCode } from '../../../src/render/real/trackClasses';
import type { RealFrame, RealIndex, RealSetEntry } from '../../../src/render/real/indexFormat';
import { cardInput, clipRects, trackGeometry } from '../../../tools/art3d/bakeNode';
import { UNTINTED_GROUPS, trackComplete } from '../../../tools/art3d/checkIndex';
import { carFramesOf, railTileRanges, typePieces } from '../../../tools/art3d/sizeReport';

const dir = new URL('../../../tools/art3d/', import.meta.url);
const load = (rel: string): Promise<any> => import(/* @vite-ignore */ new URL(rel, dir).href); // eslint-disable-line @typescript-eslint/no-explicit-any

interface RailFrame { cls: string; heading: number; piece: string; ti: number; sub: number | null; subs: number; key: string; alpha: boolean }
interface CarFrame { cls: string; pose: { yaw: number; pitch: number; roll: number }; full: boolean; front: boolean; key: string }

describe('track kit frame plan', () => {
  it('every piece the steel coaster builds is in its bake input, at every heading, all 34', () => {
    const t = trackGeometry('steel_coaster');
    expect(Object.keys(t.pieces).sort()).toEqual(typePieces('steel_coaster').sort());
    expect(Object.keys(t.pieces)).toHaveLength(34);
    for (const [id, pc] of Object.entries(t.pieces)) {
      expect(pc.dirs, id).toHaveLength(4);
      expect(pc.cls, id).toBe(pieceClass(id));
    }
    expect(t.classes.map((c) => c.cls)).toEqual(['base', 'turn', 'bank', 'loop', 'cork', 'helix']);
    expect(t.classes.reduce((a, c) => a + c.poses.length, 0)).toBe(472);
    expect([t.spins, t.front]).toEqual([false, false]);
  });

  it('per type: rail frames = rail tiles × 4 headings (+ sub-frames), car frames = poses × 2 (× 32 spin yaws, + front)', async () => {
    const { railFrames, carFrames, subFrameCount } = await load('items/trackKeys.js');
    for (const r of TRACK_RIDES) {
      const t = trackGeometry(r.id);
      const pieces = typePieces(r.id);
      let tiles = 0;
      for (const pc of pieces) for (const h of [0, 1, 2, 3] as const) for (const range of railTileRanges(pc, h)) tiles += subFrameCount(range);
      const rails: RailFrame[] = railFrames(t);
      expect(rails.length, r.id).toBe(tiles);
      expect(new Set(rails.map((f) => `${f.cls}|${f.heading}|${f.key}`)).size, `${r.id}: one picture per key and set`).toBe(rails.length);
      const cars: CarFrame[] = carFrames(t);
      expect(cars.length, r.id).toBe(carFramesOf(r.id, pieces).frames);
      const type = getTrackTypeDef(r.id)!;
      if (type.vehicle.spins) {
        const tilts = new Set(cars.map((f) => `${f.pose.pitch}:${f.pose.roll}`));
        for (const tilt of tilts) expect(cars.filter((f) => f.full && !f.front && `${f.pose.pitch}:${f.pose.roll}` === tilt).length, `${r.id} ${tilt}`).toBe(32);
      }
      if (t.front) expect(cars.filter((f) => f.front).length, r.id).toBe(cars.length / 2);
    }
  });

  it('the frames the kit shoots are exactly what TRACK_COMPLETE wants, for every track type', async () => {
    const { railFrames, carFrames, classItem } = await load('items/trackKeys.js');
    const fr: RealFrame = { sheet: 'a.webp', sx: 0, sy: 0, w: 1, h: 1, ox: 0, oy: 0 };
    for (const r of TRACK_RIDES) {
      const t = trackGeometry(r.id);
      const sets = new Map<string, RealSetEntry>();
      const add = (kind: 'rail' | 'car', item: string, d: 2 | 4, rot: 0 | 1 | 2 | 3 | 'all', key: string): void => {
        const k = `${kind}:${item}:d${d}:r${rot}`;
        if (!sets.has(k)) sets.set(k, { key: k as RealSetEntry['key'], kind, item, density: d, rot, sheets: [{ file: 'a.webp', w: 1, h: 1 }], frames: {} });
        sets.get(k)!.frames[key] = fr;
      };
      for (const d of [2, 4] as const) {
        for (const f of railFrames(t) as RailFrame[]) add('rail', classItem(r.id, f.cls), d, f.heading as 0, f.key);
        for (const f of carFrames(t) as CarFrame[]) add('car', classItem(r.id, f.cls), d, 'all', f.key);
      }
      const index: RealIndex = { format: 'real/1', pxPerMetreZoom1: 11.31, stepPxPerMetre: 9.8, densities: [2, 4], sets: [...sets.values()], bytes: { compressed: 0, decodedByDensity: { 2: 0, 4: 0 } } };
      expect(trackComplete(index), r.id).toEqual([]);
    }
  });

  it('rail frames go on alpha sheets except pieces with untinted parts (station, brakes, block brake, water)', async () => {
    const { railFrames } = await load('items/trackKeys.js');
    for (const id of ['steel_coaster', 'log_flume', 'water_coaster']) {
      for (const f of railFrames(trackGeometry(id)) as RailFrame[]) {
        expect(f.alpha, `${id} ${f.key}`).toBe(!UNTINTED_GROUPS.includes(getTrackPieceDef(f.piece)!.group));
      }
    }
    const steel = (railFrames(trackGeometry('steel_coaster')) as RailFrame[]).filter((f) => !f.alpha).map((f) => f.piece);
    expect([...new Set(steel)].sort()).toEqual(['block_brake', 'brakes', 'station']);
  });

  it('car poses are filed in the class the game looks them up in; rail frames in their piece class, classes in order', async () => {
    const { railFrames, carFrames } = await load('items/trackKeys.js');
    for (const id of ['steel_coaster', 'spinning_mouse', 'rapids_raft']) {
      const t = trackGeometry(id);
      for (const f of carFrames(t) as CarFrame[]) expect(f.cls).toBe(poseClassOf(id, poseCode(f.pose.yaw, f.pose.pitch, f.pose.roll)));
      for (const f of railFrames(t) as RailFrame[]) expect(f.cls).toBe(pieceClass(f.piece));
      const order = t.classes.map((c) => TRACK_CLASSES.indexOf(c.cls));
      expect(order).toEqual([...order].sort((a, b) => a - b));
    }
  });

  it('a tile taller than TALL_M is cut into stacked sub-frames u0.., bottom first', async () => {
    const { railFrames, subFrameCount, TALL_M, SUB_M } = await load('items/trackKeys.js');
    expect(subFrameCount(TALL_M)).toBe(1);
    expect(subFrameCount(TALL_M + 0.1)).toBe(Math.ceil((TALL_M + 0.1) / SUB_M));
    const t = trackGeometry('steel_coaster');
    const tall = structuredClone(t);
    tall.classes = [{ cls: 'base', pieces: ['straight'], poses: [] }];
    tall.pieces.straight!.dirs[0]!.tiles = [{ x: 0, y: 0, railMin: 0, railMax: 41, rail: true }];
    const f = (railFrames(tall) as RailFrame[]).filter((x) => x.heading === 0);
    expect(f.map((x) => x.key)).toEqual(['straight:t0:u0', 'straight:t0:u1', 'straight:t0:u2']);
    // no steel tile is that tall (the loop is 16 m): the steel coaster has no sub-frames
    expect((railFrames(t) as RailFrame[]).some((x) => x.sub !== null)).toBe(false);
  });
});

describe('tile clips', () => {
  it('a vertical loop\'s rail-less clearance tiles join the picture of their tallest rail neighbour (the spine leans 0.57 m into them)', () => {
    const t = trackGeometry('steel_coaster');
    const tiles = t.pieces.vertical_loop_left!.dirs[0]!.tiles;
    expect(tiles.filter((q) => !q.rail).map((q) => `${q.x},${q.y}`)).toEqual(['0,-1', '3,0']);
    expect(tiles.find((q) => q.x === 2 && q.y === 0)!.clip).toEqual([-2, 6, -2, 2]);
    expect(tiles.find((q) => q.x === 1 && q.y === -1)!.clip).toEqual([-6, 2, -2, 2]);
    expect(tiles.filter((q) => q.clip).length).toBe(2);
  });
  it('no other steel piece changes its clip, only loops and the empty middle of a helix (the stage 1 pictures keep theirs)', () => {
    const t = trackGeometry('steel_coaster');
    for (const [id, pc] of Object.entries(t.pieces)) {
      if (id.startsWith('vertical_loop') || id.startsWith('helix')) continue;
      for (const d of pc.dirs) expect(d.tiles.some((q) => q.clip), id).toBe(false);
    }
  });
  it('rail-less tiles that would need a non-rectangular clip fail loudly', () => {
    const tile = (x: number, y: number, rail: boolean, railMax = 1) => ({ x, y, railMin: 0, railMax, rail });
    expect(clipRects([tile(0, 0, true, 9), tile(1, 0, false, 0)])[0]!.clip).toBeUndefined(); // flat clearance: no rail
    expect(() => clipRects([tile(0, 0, true, 9), tile(1, 0, false), tile(0, 1, false)])).toThrow(/not a rectangle/);
  });
});

describe('track cards', () => {
  it('the card input has a preview scene with the default colours for each TRACK_RIDES id', () => {
    const { tracks } = cardInput([]);
    expect(Object.keys(tracks).sort()).toEqual(TRACK_RIDES.map((r) => r.id).sort());
    for (const [id, sc] of Object.entries(tracks)) {
      expect(sc.pieces.length, id).toBeGreaterThan(1);
      for (const pc of sc.pieces) expect(pc.samples.n, `${id} ${pc.id}`).toBeGreaterThan(1);
      expect(Object.values(sc.colours).every((c) => /^#[0-9a-f]{6}$/i.test(c)), id).toBe(true);
    }
  });

  it('every baked track type has a card and its module is a style spec on the kit', async () => {
    const { TRACK_TYPES, CARD_ITEMS, ITEM_LIST } = await load('items/registry.js');
    for (const t of TRACK_TYPES) {
      expect(CARD_ITEMS.some((c: { id: string; kind: string }) => c.id === t.type && c.kind === 'track'), t.type).toBe(true);
      const it = ITEM_LIST.find((x: { id: string }) => x.id === t.type);
      expect(it.track).toEqual({ type: t.type });
      expect(it.deps).toEqual(expect.arrayContaining(['items/trackKit.js', 'items/trackKeys.js']));
    }
  });
});

describe('bake input', () => {
  it('trackGeometry: a spinning type bakes every reached tilt at all 32 yaws, unreached yaws under base', () => {
    const t = trackGeometry('spinning_mouse');
    expect(t.spins).toBe(true);
    const all = t.classes.flatMap((c) => c.poses.map((p) => ({ ...p, cls: c.cls })));
    const tilts = new Set(all.map((p) => `${p.pitch}:${p.roll}`));
    expect(all.length).toBe(tilts.size * 32);
    expect(all.filter((p) => p.pitch !== 0).every((p) => p.cls === 'base')).toBe(true);
  });
  it('trackGeometry: front car types', () => {
    expect(trackGeometry('mini_railway').front).toBe(true);
    expect(trackGeometry('monorail').front).toBe(true);
    expect(trackGeometry('junior_coaster').front).toBe(false);
  });
});
