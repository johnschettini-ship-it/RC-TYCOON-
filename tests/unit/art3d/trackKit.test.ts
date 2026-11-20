// The track kit's frame plan (batch 5 Task 3): what tools/art3d/items/trackKit.js shoots for a type, from the bake
// input bakeNode.ts trackGeometry gives it, counted with the same plan (items/trackKeys.js) the kit loops over.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TRACK_RIDES } from '../../../src/data/catalog';
import { getTrackPieceDef, getTrackTypeDef } from '../../../src/data/track';
import { TRACK_CLASSES, carQuadrant, pieceClass, poseClassOf, poseCode } from '../../../src/render/real/trackClasses';
import type { RealFrame, RealIndex, RealSetEntry } from '../../../src/render/real/indexFormat';
import { cardInput, clipRects, trackGeometry } from '../../../tools/art3d/bakeNode';
import { UNTINTED_GROUPS, trackComplete } from '../../../tools/art3d/checkIndex';
import { carFramesOf, railTileRanges, typePieces } from '../../../tools/art3d/sizeReport';
import { TRACK_SET_MAX_D4 } from '../../../tools/art3d/trackBudget';

const dir = new URL('../../../tools/art3d/', import.meta.url);
const load = (rel: string): Promise<any> => import(/* @vite-ignore */ new URL(rel, dir).href); // eslint-disable-line @typescript-eslint/no-explicit-any

interface RailFrame { cls: string; set: string; heading: number; piece: string; ti: number; key: string; shadow: string; chain: string | null; alpha: boolean }
interface CarFrame { cls: string; set: string; q: number; pose: { yaw: number; pitch: number; roll: number }; full: boolean; front: boolean; key: string }

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

  it('per type: rail frames = rail tiles × 4 headings, car frames = poses × 2 (× 32 spin yaws, + front)', async () => {
    const { railFrames, carFrames } = await load('items/trackKeys.js');
    for (const r of TRACK_RIDES) {
      const t = trackGeometry(r.id);
      const pieces = typePieces(r.id);
      let tiles = 0;
      for (const pc of pieces) for (const h of [0, 1, 2, 3] as const) tiles += railTileRanges(pc, h).length;
      const rails: RailFrame[] = railFrames(t);
      expect(rails.length, r.id).toBe(tiles);
      expect(new Set(rails.map((f) => `${f.cls}|${f.heading}|${f.key}`)).size, `${r.id}: one picture per key and set`).toBe(rails.length);
      for (const f of rails) expect(f.shadow, r.id).toBe(`${f.key}:sh`); // and its shadow (Task 4)
      // and, for a chainable piece on a type that chains, its chain trough (Task 5)
      for (const f of rails) expect(f.chain, `${r.id} ${f.key}`).toBe(getTrackTypeDef(r.id)!.chain && getTrackPieceDef(f.piece)!.chainable ? `${f.key}:chain` : null);
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
        for (const f of railFrames(t) as RailFrame[]) {
          for (const k of [f.key, f.shadow, ...(f.chain ? [f.chain] : [])]) add('rail', classItem(r.id, f.set), d, f.heading as 0, k); // its set: the class, or the class's half
        }
        for (const f of carFrames(t) as CarFrame[]) add('car', classItem(r.id, f.set), d, f.q as 0, f.key); // its class, or the class's yaw half
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
      for (const f of carFrames(t) as CarFrame[]) {
        expect(f.cls).toBe(poseClassOf(id, poseCode(f.pose.yaw, f.pose.pitch, f.pose.roll)));
        expect(f.q).toBe(carQuadrant(f.pose.yaw));
      }
      for (const f of railFrames(t) as RailFrame[]) expect(f.cls).toBe(pieceClass(f.piece));
      const order = t.classes.map((c) => TRACK_CLASSES.indexOf(c.cls));
      expect(order).toEqual([...order].sort((a, b) => a - b));
    }
  });

  it('no sub-frames (Task 3 review P2): a tile taller than TALL_M fails the frame plan, and no piece of the 17 types has one', async () => {
    const { railFrames, TALL_M } = await load('items/trackKeys.js');
    const t = trackGeometry('steel_coaster');
    const tall = structuredClone(t);
    tall.classes = [{ cls: 'base', pieces: ['straight'], poses: [] }];
    tall.pieces.straight!.dirs[0]!.tiles = [{ x: 0, y: 0, railMin: 0, railMax: TALL_M + 0.1, rail: true }];
    expect(() => railFrames(tall)).toThrow(/straight.*taller than/);
    // the tallest tile of any piece of any type is the vertical loop's (13 m): the plan never cuts a tile
    let max = 0;
    for (const r of TRACK_RIDES) for (const pc of typePieces(r.id)) for (const h of [0, 1, 2, 3] as const) for (const range of railTileRanges(pc, h)) max = Math.max(max, range);
    expect(max).toBeLessThanOrEqual(TALL_M);
    for (const r of TRACK_RIDES) expect((railFrames(trackGeometry(r.id)) as RailFrame[]).every((f) => !/:u\d+$/.test(f.key)), r.id).toBe(true);
  });
});

describe('car sets by yaw quadrant (fix wave)', () => {
  it('no car set of the steel coaster is over 8 MiB at d4 (car frames as measured, masks decoded, packing 1.2)', async () => {
    const { carFrames, classItem } = await load('items/trackKeys.js');
    // the Task 3 bake's mean car frame at d4 was 8,088 px; the stage 1 one 8,781 (taken here, the larger)
    const CAR_PX_D4 = 8781, PACK = 1.2;
    const perSet = new Map<string, number>();
    for (const f of carFrames(trackGeometry('steel_coaster')) as CarFrame[]) {
      const k = `car:${classItem('steel_coaster', f.cls)}:d4:r${f.q}`;
      perSet.set(k, (perSet.get(k) ?? 0) + CAR_PX_D4 * PACK * 4 * 2); // sheet and mask, RGBA
    }
    expect(perSet.size).toBe(6 * 4);
    const over = [...perSet].filter(([, b]) => b > TRACK_SET_MAX_D4).map(([k, b]) => `${k} ${(b / 1048576).toFixed(1)} MiB`);
    expect(over).toEqual([]);
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

describe('track runs (fix wave: loop seams)', () => {
  it('only the vertical loops are cut by runs of samples; their runs cover every segment once, each rail tile some', () => {
    for (const r of TRACK_RIDES) {
      const t = trackGeometry(r.id);
      for (const [id, pc] of Object.entries(t.pieces)) {
        pc.dirs.forEach((d, h) => {
          const cut = d.tiles.some((q) => q.runs);
          expect(cut, `${r.id} ${id} r${h}`).toBe(id.startsWith('vertical_loop'));
          if (!cut) return;
          const segs = new Array(d.n - 1).fill(0);
          for (const q of d.tiles) for (const [a, b] of q.runs ?? []) for (let k = a; k < b; k++) segs[k]++;
          expect(segs.every((x) => x === 1), `${r.id} ${id} r${h}: each segment drawn once`).toBe(true);
          for (const q of d.tiles.filter((x) => x.rail)) expect(q.runs?.length ?? 0, `${id} r${h} tile ${q.x},${q.y}`).toBeGreaterThan(0);
        });
      }
    }
  });
  it('the loop\'s top, running along y = 0, belongs to one tile per side of its corner crossing, not split lengthwise', () => {
    const d = trackGeometry('steel_coaster').pieces.vertical_loop_left!.dirs[0]!;
    const own = (k: number) => d.tiles.findIndex((q) => (q.runs ?? []).some(([a, b]) => a <= k && k < b));
    // samples 36..100 (the climb and the top to x = 8) in tile (2, 0); 101..166 in (1, -1)
    expect(d.tiles[own(60)]).toMatchObject({ x: 2, y: 0 });
    expect(d.tiles[own(99)]).toMatchObject({ x: 2, y: 0 });
    expect(d.tiles[own(102)]).toMatchObject({ x: 1, y: -1 });
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

describe('track frames: the loop fix changes nothing while the track points forward (Task 3 review P2)', () => {
  /** The stage 1 frame (before the loop fix): lateral = world up × tangent, up = tangent × lateral, both banked. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const oldFrame = (T: any, yaw: number, pitch: number, roll: number) => {
    const cp = Math.cos(pitch);
    const t = new T.Vector3(cp * Math.cos(yaw), Math.sin(pitch), cp * Math.sin(yaw)).normalize();
    const lat = new T.Vector3(0, 1, 0).cross(t).normalize();
    const up = t.clone().cross(lat).normalize();
    const q = new T.Quaternion().setFromAxisAngle(t, -roll);
    return { lat: lat.applyQuaternion(q), up: up.applyQuaternion(q) };
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const near = (a: any, b: any): boolean => Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9 && Math.abs(a.z - b.z) < 1e-9;

  it('framesOf: every sample of every piece of the 17 types with cos(pitch) > 0 keeps the cross-product frame', async () => {
    const T = await load('vendor/three-0.160.0.module.min.js');
    const { framesOf } = await load('items/trackKit.js');
    let checked = 0, past = 0;
    for (const r of TRACK_RIDES) {
      const t = trackGeometry(r.id);
      for (const [id, pc] of Object.entries(t.pieces)) {
        for (const d of pc.dirs) {
          const F = framesOf(d);
          for (let k = 0; k < d.n; k++) {
            if (!(Math.cos(d.pitch[k]!) > 0)) { past++; continue; }
            const o = oldFrame(T, d.yaw[k]!, d.pitch[k]!, Math.atan2(d.bankSin[k]!, d.bankCos[k]!));
            expect(near(F.Lt[k], o.lat) && near(F.Up[k], o.up), `${r.id} ${id} sample ${k}`).toBe(true);
            checked++;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(10000);
    expect(past).toBeGreaterThan(0); // the loops' top halves exist, and are the only samples the fix may change
  });

  it('poseCar: every quantised pose with cos(pitch) > 0 turns the car as the cross-product frame did', async () => {
    const T = await load('vendor/three-0.160.0.module.min.js');
    const { poseCar } = await load('items/trackKit.js');
    const car = new T.Object3D();
    for (let yaw = 0; yaw < 32; yaw++) for (let pitch = 0; pitch < 24; pitch++) for (const roll of [0, 3, 7, 12, 18]) {
      const p = (pitch / 24) * Math.PI * 2;
      if (!(Math.cos(p) > 1e-9)) continue;
      poseCar(car, { yaw, pitch, roll });
      const o = oldFrame(T, (yaw / 32) * Math.PI * 2, p, (roll / 24) * Math.PI * 2);
      const want = new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(o.lat, o.up, o.lat.clone().cross(o.up)));
      expect(Math.abs(car.quaternion.dot(want)), `y${yaw} p${pitch} r${roll}`).toBeGreaterThan(1 - 1e-9);
    }
  });
});

describe('style constants live in the type\'s spec (Task 3 review P2)', () => {
  it('the steel spec carries its straddle half-width and support offset; the support offset is the one the game stacks with', async () => {
    const { SPEC } = await load('items/steel_coaster.js');
    const { SUPPORT_TOP_BELOW_RAIL } = await import('../../../src/render/real/supportStack');
    expect(SPEC.straddleHalfM).toBe(0.6);
    expect(SPEC.supportTopBelowRail).toBe(SUPPORT_TOP_BELOW_RAIL);
    const { TRACK_SPECS, trackSpecOf } = await load('items/trackSpecs.js');
    expect(TRACK_SPECS.steel_coaster).toBe(SPEC);
    // a type with no module yet is measured with the steel spec until its module sets its own
    expect(trackSpecOf('junior_coaster')).toBe(SPEC);
  });

  it('trackGeometry reads the straddle half-width from the spec it is given (the steel one by default)', async () => {
    const { SPEC } = await load('items/steel_coaster.js');
    const cut = (t: ReturnType<typeof trackGeometry>) => Object.entries(t.pieces).filter(([, pc]) => pc.dirs.some((d) => d.tiles.some((q) => q.runs))).map(([id]) => id).sort();
    expect(trackGeometry('steel_coaster')).toEqual(trackGeometry('steel_coaster', SPEC));
    expect(cut(trackGeometry('steel_coaster'))).toEqual(['vertical_loop_left', 'vertical_loop_right']);
    // a wide track runs along tile edges for longer: more pieces are cut by runs
    expect(cut(trackGeometry('steel_coaster', { ...SPEC, straddleHalfM: 1.9 })).length).toBeGreaterThan(2);
  });

  it('the kit reads no steel number outside the spec: the card support offset is the spec\'s, the car pose steps the reader\'s', () => {
    const cards = readFileSync(new URL('items/cards.js', dir), 'utf8');
    expect(cards).toContain('spec.supportTopBelowRail');
    expect(cards).not.toMatch(/z - 1\.2/);
    const kitSrc = readFileSync(new URL('items/trackKit.js', dir), 'utf8');
    expect(kitSrc).toMatch(/p\.yaw \/ CAR_YAW_STEPS/);
    expect(kitSrc).not.toMatch(/\/ (32|24)\)/);
    expect(readFileSync(new URL('bakeNode.ts', dir), 'utf8')).not.toContain('STRADDLE_HALF_M = ');
  });
});
