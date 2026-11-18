/**
 * Task 9b: the track layer's realistic rails and supports follow the bake's contract (tools/art3d/items/steel_coaster.js):
 * rails keyed by the piece's heading in the view and anchored at the piece's entry height; supports stacked from
 * `foot`, 1 m `seg`s and a `top` whose saddle meets the rail spine.
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { install } from '../fakeCanvas';
import { buildRideSlices, realRailPlacement, realSupportPlacement } from '../../../../src/render/track/layer';
import { supportStack, SUPPORT_TOP_BELOW_RAIL, SUPPORT_TOP_HEIGHT } from '../../../../src/render/real/supportStack';
import { projectX, projectY, viewFrame, type ViewFrame } from '../../../../src/render/track/project';
import { TILE_M } from '../../../../src/data/tuning/track';
import { buildPerfScene } from '../../../perf/scenes';
import type { ViewRotation } from '../../../../src/render/view';
import { createRealLook, type RealSets } from '../../../../src/render/real/look';
import { setKey, type RealIndex, type RealKind, type RealSetEntry, type SetKey } from '../../../../src/render/real/indexFormat';
import type { ReadySet, SetState } from '../../../../src/render/real/setManager';
import type { CanvasLike } from '../../../../src/render/real/tint';
import { TINT_PAGE_PX } from '../../../../src/render/real/tintAtlas';
import { carQuadrant, carSetsOf, pieceClass, poseClasses, poseClassesReady, poseClassOf, poseCode } from '../../../../src/render/real/trackClasses';
import { createWorld } from '../../../../src/sim/world';
import type { Ride } from '../../../../src/sim/rides/types';
import type { World } from '../../../../src/sim/types';
import { railTileRanges, setDecodedBytes, typePieces } from '../../../../tools/art3d/sizeReport';
import { trackBudget } from '../../../../tools/art3d/trackBudget';

beforeAll(() => {
  install();
  vi.stubEnv('VITE_ART', 'real');
});
afterAll(() => vi.unstubAllEnvs());

/** Spine of the baked steel rail (items/trackKit.js RAIL_STYLES.steel: box centred 0.42 m under the rail line, 0.3 m tall). */
const SPINE_BOTTOM_BELOW_RAIL = 0.42 + 0.15;
const SPINE_TOP_BELOW_RAIL = 0.42 - 0.15;

function frameFor(world: ReturnType<typeof buildPerfScene>, rot: ViewRotation): ViewFrame {
  const m = world.state.map;
  return viewFrame(rot, m.width, m.height);
}

describe('realistic rails (Task 9b)', () => {
  it('heading = (piece.dir + view turn) mod 4, anchored at the tile centre at the piece\'s entry height', () => {
    const world = buildPerfScene('coaster');
    const rideId = world.state.rides.find((r) => r.kind === 'track')!.id;
    const data = world.state.track.rides[String(rideId)]!;
    let raised = 0;
    const headings = new Set<number>();
    for (const rot of [0, 1, 2, 3] as ViewRotation[]) {
      const f = frameFor(world, rot);
      const slices = buildRideSlices(world, rideId, f);
      expect(slices.length).toBeGreaterThan(20);
      for (const sl of slices) {
        const piece = data.pieces[sl.pieceIndex]!;
        const p = realRailPlacement(sl, f);
        expect(p.heading).toBe((piece.dir + rot) % 4);
        headings.add(p.heading);
        const cx = (sl.x + 0.5) * TILE_M;
        const cy = (sl.y + 0.5) * TILE_M;
        expect(p.ax).toBeCloseTo(projectX(cx, cy, f), 9);
        expect(p.ay).toBeCloseTo(projectY(cx, cy, piece.z, f), 9);
        if (piece.z > 0) raised++;
      }
    }
    // The scene's coaster runs every way and above the ground: the old anchor (height 0, view turn) was wrong for it.
    expect(headings.size).toBe(4);
    expect(raised).toBeGreaterThan(0);
  });
});

describe('support stacking (Task 9b)', () => {
  it('the top piece\'s saddle meets the rail spine', () => {
    const postTop = -SUPPORT_TOP_BELOW_RAIL + SUPPORT_TOP_HEIGHT;
    expect(postTop).toBeGreaterThanOrEqual(-SPINE_BOTTOM_BELOW_RAIL);
    expect(postTop).toBeLessThanOrEqual(-SPINE_BOTTOM_BELOW_RAIL + 0.1);
    expect(postTop).toBeLessThan(-SPINE_TOP_BELOW_RAIL);
  });

  it('foot on the ground, 1 m segments without gaps or overshoot, top under the rail', () => {
    const ground = 8;
    const rail = 14.3;
    const st = supportStack(rail, ground);
    expect(st[0]).toEqual({ part: 'foot', z: ground });
    expect(st[st.length - 1]).toEqual({ part: 'top', z: rail - SUPPORT_TOP_BELOW_RAIL });
    const segs = st.filter((p) => p.part === 'seg').map((p) => p.z);
    const top = rail - SUPPORT_TOP_BELOW_RAIL;
    // Segment i at i m above the ground; the last one ends (1.1 m drawn) just under the top plate (0.22 m).
    expect(segs[0]).toBe(ground);
    for (let i = 1; i < segs.length; i++) expect(segs[i]! - segs[i - 1]!).toBeLessThanOrEqual(1);
    for (let i = 0; i < segs.length - 1; i++) expect(segs[i]).toBe(ground + i);
    expect(segs[segs.length - 1]! + 1).toBeCloseTo(top, 9);
    expect(segs.length).toBe(Math.ceil(top - ground));
    // Drawn bottom-up: foot, segments, top.
    expect(st.map((p) => p.part)).toEqual(['foot', ...segs.map(() => 'seg'), 'top']);
  });

  it('a whole number of metres stacks exactly, and a short column keeps foot and top', () => {
    const exact = supportStack(8 + 3 + SUPPORT_TOP_BELOW_RAIL, 8).filter((p) => p.part === 'seg').map((p) => p.z);
    expect(exact).toEqual([8, 9, 10]);
    const short = supportStack(8 + 0.6 + SUPPORT_TOP_BELOW_RAIL, 8);
    expect(short.map((p) => p.part)).toEqual(['foot', 'seg', 'top']);
    expect(short[1]!.z).toBe(8);
    // Rail too low for a column: the saddle sits on the ground.
    expect(supportStack(8.5, 8)).toEqual([{ part: 'top', z: 8 }]);
  });

  it('the saddle heading follows the track in the view, and the stack stands at the support point', () => {
    const world = buildPerfScene('coaster');
    const rideId = world.state.rides.find((r) => r.kind === 'track')!.id;
    let n = 0;
    for (const rot of [0, 1] as ViewRotation[]) {
      const f = frameFor(world, rot);
      for (const sl of buildRideSlices(world, rideId, f)) {
        if (!sl.support) continue;
        const p = realSupportPlacement(sl, f)!;
        const yaw = sl.support.yaw + (rot * Math.PI) / 2;
        expect(p.heading).toBe((((Math.round(yaw / (Math.PI / 2)) % 4) + 4) % 4));
        expect(p.ax).toBeCloseTo(projectX(sl.support.wx, sl.support.wy, f), 9);
        // Each piece's anchor y: the support point at the piece's height.
        for (const piece of p.pieces) expect(piece.ay).toBeCloseTo(projectY(sl.support.wx, sl.support.wy, piece.z, f), 9);
        expect(p.pieces[0]!.z).toBe(sl.ground);
        n++;
      }
    }
    expect(n).toBeGreaterThan(5);
  });
});

describe('bake and reader agree on the support and spine sizes', () => {
  it('the track kit\'s steel rail and round supports (steel_coaster.js) build the spine, plate and post the reader assumes, and name the reader\'s constant', () => {
    const src = readFileSync(new URL('../../../../tools/art3d/items/trackKit.js', import.meta.url), 'utf8');
    expect(readFileSync(new URL('../../../../tools/art3d/items/steel_coaster.js', import.meta.url), 'utf8')).toMatch(/rail: 'steel',\s+supports: 'round'/);
    expect(src).toContain('boxProfile(0, -0.42, 0.26, 0.3)'); // spine: 0.27-0.57 m under the rail line
    expect(src).toContain('new THREE.BoxGeometry(0.3, 0.22, 1.3)'); // plate 0.22 m
    expect(src).toContain('new THREE.CylinderGeometry(0.12, 0.12, 0.45, 12)'); // post 0.45 m
    expect(0.22 + 0.45).toBeCloseTo(SUPPORT_TOP_HEIGHT, 9);
    expect(src).toContain(`SUPPORT_TOP_BELOW_RAIL = ${SUPPORT_TOP_BELOW_RAIL} m`);
  });
});

// ------------------------------------------------------------------ batch 5 Task 2: class sets, alpha tint, scope

describe('track class sets (batch 5 Task 2)', () => {
  /** A pixel canvas: enough for the tint atlas in node. */
  class Pix {
    data: Uint8ClampedArray;
    constructor(public width: number, public height: number, fill: number[] = [128, 128, 128, 255]) {
      this.data = new Uint8ClampedArray(width * height * 4);
      for (let i = 0; i < this.data.length; i += 4) this.data.set(fill, i);
    }
    getContext(): unknown {
      const self = this;
      return {
        drawImage(src: Pix, sx = 0, sy = 0, sw = 0, sh = 0, dx = 0, dy = 0) {
          for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) self.data.set(src.data.subarray(((sy + y) * src.width + sx + x) * 4, ((sy + y) * src.width + sx + x) * 4 + 4), ((dy + y) * self.width + dx + x) * 4);
        },
        getImageData(x: number, y: number, w: number, h: number) {
          const data = new Uint8ClampedArray(w * h * 4);
          for (let r = 0; r < h; r++) data.set(self.data.subarray(((y + r) * self.width + x) * 4, ((y + r) * self.width + x + w) * 4), r * w * 4);
          return { width: w, height: h, data };
        },
        putImageData(img: { width: number; height: number; data: Uint8ClampedArray }, x = 0, y = 0) {
          for (let r = 0; r < img.height; r++) self.data.set(img.data.subarray(r * img.width * 4, (r + 1) * img.width * 4), ((y + r) * self.width + x) * 4);
        },
        clearRect() {},
      };
    }
  }
  const FR = { sheet: 's', sx: 0, sy: 0, w: 2, h: 2, ox: -1, oy: -1 };

  class Sets implements RealSets {
    wants: { keys: SetKey[]; priority: 'now' | 'ahead' }[] = [];
    used: SetKey[] = [];
    held = new Map<string, number>();
    private ready = new Map<SetKey, ReadySet>();
    constructor(private readonly index: RealIndex, private readonly fill: Record<string, number[]> = {}) {}
    setReady(key: SetKey): void {
      const e = this.index.sets.find((x) => x.key === key);
      if (!e) throw new Error(`no ${key}`);
      this.ready.set(key, { ...e, images: e.sheets.map((s) => new Pix(s.w, s.h, this.fill[s.file]) as unknown as CanvasImageSource) });
    }
    want(keys: SetKey[], priority: 'now' | 'ahead'): void { this.wants.push({ keys: [...keys], priority }); }
    use(key: SetKey): ReadySet | null { this.used.push(key); return this.ready.get(key) ?? null; }
    state(key: SetKey): SetState { return this.ready.has(key) ? 'ready' : 'none'; }
    densityCap(): 2 | 4 { return 4; }
    isDemoted(): boolean { return false; }
    hold(id: string, bytes: number): void { if (bytes > 0) this.held.set(id, bytes); else this.held.delete(id); }
    admit(id: string, bytes: number): boolean { this.hold(id, bytes); return true; }
    wanted(p: 'now' | 'ahead'): SetKey[] { return [...new Set(this.wants.filter((w) => w.priority === p).flatMap((w) => w.keys))].sort(); }
  }
  const idx = (sets: RealSetEntry[]): RealIndex => ({ format: 'real/1', pxPerMetreZoom1: 11.31, stepPxPerMetre: 9.8, densities: [2, 4], sets, bytes: { compressed: 0, decodedByDensity: { 2: 0, 4: 0 } } });
  /** A set with one sheet `s` (8 x 8), masked (`m`) or alpha-tinted. */
  const entry = (kind: RealKind, item: string, d: 2 | 4, rot: RealSetEntry['rot'], frames: string[], tint: 'mask' | 'alpha'): RealSetEntry => ({
    key: setKey(kind, item, d, rot), kind, item, density: d, rot,
    sheets: tint === 'alpha' ? [{ file: 's', w: 8, h: 8, tint: 'alpha' }] : [{ file: 's', w: 8, h: 8, mask: 'm' }, { file: 'm', w: 8, h: 8 }],
    frames: Object.fromEntries(frames.map((f) => [f, FR])),
  });
  /** Class layout: rails base, turn and loop at every heading (alpha), cars base, turn and loop (masked). */
  const classIndex = (): RealIndex => {
    const sets: RealSetEntry[] = [];
    for (const d of [2, 4] as const) {
      for (const r of [0, 1, 2, 3] as const) {
        sets.push(entry('rail', 'steel_coaster~base', d, r, ['station:t0', 'straight:t0'], 'alpha'));
        sets.push(entry('rail', 'steel_coaster~turn', d, r, ['turn_medium_left:t0'], 'alpha'));
        sets.push(entry('rail', 'steel_coaster~loop', d, r, ['vertical_loop_left:t0'], 'alpha'));
        sets.push(entry('support', 'steel_coaster', d, r, ['foot', 'seg', 'top'], 'mask'));
      }
      sets.push(entry('car', 'steel_coaster~base', d, 'all', ['y0:p0:r0:full'], 'mask'));
      sets.push(entry('car', 'steel_coaster~turn', d, 'all', ['y1:p0:r0:full'], 'mask'));
      sets.push(entry('car', 'steel_coaster~loop', d, 'all', [], 'mask'));
    }
    return idx(sets);
  };
  const VIEW = { x0: -2000, y0: -2000, x1: 2000, y1: 2000 };
  const worldWith = (pieces: { defId: string; dir: number }[]) => {
    const world = createWorld({ seed: 1, parkName: 'Class Park', mapSize: 16 });
    world.state.rides.push({ id: 1, kind: 'track', defId: 'steel_coaster', x: 6, y: 6 } as Ride);
    world.state.track.rides['1'] = { pieces: pieces.map((p, i) => ({ ...p, x: 4 + i, y: 6, z: 8 })) } as unknown as World['state']['track']['rides'][string];
    return world;
  };
  const make = (w: number, h: number) => new Pix(w, h) as unknown as CanvasLike;

  it('pose classes of the baked track types are made when the look is created, not on first sight (review P2)', () => {
    expect(poseClassesReady('bobsled_run')).toBe(false);
    const index = idx([entry('car', 'bobsled_run~base', 2, 'all', [], 'mask'), entry('car', 'bobsled_run~base', 4, 'all', [], 'mask')]);
    createRealLook(index, new Sets(index), { makeCanvas: make });
    expect(poseClassesReady('bobsled_run')).toBe(true);
  });

  it('a circuit without loops never wants a loop set', () => {
    const index = classIndex();
    const sets = new Sets(index);
    const look = createRealLook(index, sets, { makeCanvas: make });
    look.prepare(worldWith([{ defId: 'station', dir: 0 }, { defId: 'straight', dir: 0 }, { defId: 'turn_medium_left', dir: 0 }]), 0, VIEW, 2, 2);
    const all = [...sets.wanted('now'), ...sets.wanted('ahead')];
    expect(all.filter((k) => k.includes('~loop'))).toEqual([]);
    expect(all.some((k) => k.startsWith('rail:steel_coaster~base'))).toBe(true);
    expect(all.some((k) => k.startsWith('rail:steel_coaster~turn'))).toBe(true);
    expect(all).toContain('car:steel_coaster~base:d4:rall');
    expect(all).toContain('car:steel_coaster~turn:d4:rall');
    // with a loop built, the loop rail and car classes are wanted
    const sets2 = new Sets(index);
    createRealLook(index, sets2, { makeCanvas: make }).prepare(worldWith([{ defId: 'station', dir: 0 }, { defId: 'vertical_loop_left', dir: 0 }]), 0, VIEW, 2, 2);
    expect(sets2.wanted('now')).toEqual(expect.arrayContaining(['rail:steel_coaster~loop:d4:r0', 'car:steel_coaster~loop:d4:rall']));
  });

  it('wants only the headings its pieces face, shifted by the view turn', () => {
    const index = classIndex();
    const world = worldWith([{ defId: 'station', dir: 0 }, { defId: 'straight', dir: 1 }, { defId: 'turn_medium_left', dir: 1 }]);
    for (const rot of [0, 2] as const) {
      const sets = new Sets(index);
      createRealLook(index, sets, { makeCanvas: make }).prepare(world, rot, VIEW, 2, 2);
      // (while a density-4 set is not ready its density-2 twin is wanted now too: that is the ladder, not the scope)
      const rails = (p: 'now' | 'ahead') => sets.wanted(p).filter((k) => k.startsWith('rail:') && (p === 'ahead' || k.includes(':d4:')));
      const h = (d: number) => (d + rot) % 4;
      expect(rails('now')).toEqual([
        `rail:steel_coaster~base:d4:r${h(0)}`, `rail:steel_coaster~base:d4:r${h(1)}`, `rail:steel_coaster~turn:d4:r${h(1)}`,
      ].sort());
      // the next turn's headings, ahead at density 2 (a turn shows at once), unless that heading's set is wanted now
      expect(rails('ahead')).toEqual([
        `rail:steel_coaster~base:d2:r${h(1)}`, `rail:steel_coaster~base:d2:r${h(2)}`, `rail:steel_coaster~turn:d2:r${h(2)}`,
      ].filter((k) => !rails('now').includes(k.replace(':d2:', ':d4:'))).sort());
    }
  });

  it('a heading wanted now is not wanted again ahead at density 2 once its density-4 set is ready (bench: +3.7 MiB)', () => {
    const index = classIndex();
    const world = worldWith([{ defId: 'station', dir: 0 }, { defId: 'straight', dir: 1 }, { defId: 'straight', dir: 2 }, { defId: 'straight', dir: 3 }]);
    const sets = new Sets(index);
    const look = createRealLook(index, sets, { makeCanvas: make });
    for (const r of [0, 1, 2, 3]) sets.setReady(`rail:steel_coaster~base:d4:r${r}`);
    look.prepare(world, 0, VIEW, 2, 2);
    expect(sets.wanted('now').filter((k) => k.startsWith('rail:'))).toEqual([0, 1, 2, 3].map((r) => `rail:steel_coaster~base:d4:r${r}`));
    expect(sets.wanted('ahead').filter((k) => k.startsWith('rail:'))).toEqual([]);
  });

  it('a car on a base pose draws from the base class; a turn pose from the turn class', () => {
    const index = classIndex();
    const sets = new Sets(index);
    const look = createRealLook(index, sets, { makeCanvas: make });
    look.prepare(worldWith([{ defId: 'station', dir: 0 }]), 0, VIEW, 1, 1);
    sets.setReady('car:steel_coaster~base:d2:rall');
    sets.setReady('car:steel_coaster~turn:d2:rall');
    expect(look.car('steel_coaster', 0, 0, 0, true, 1)).toBeTruthy();
    expect(sets.used.at(-1)).toBe('car:steel_coaster~base:d2:rall');
    expect(look.car('steel_coaster', 1, 0, 0, true, 1)).toBeTruthy();
    expect(sets.used.at(-1)).toBe('car:steel_coaster~turn:d2:rall');
    expect(look.fallbacksUsed()).toEqual([]);
  });

  it('a rail resolves its piece\'s class set, alpha-tinted (no mask) as a full-white mask would tint it', () => {
    // the same picture on an alpha sheet and on a masked sheet with a full-white mask
    const alphaIdx = classIndex();
    const maskIdx = idx(alphaIdx.sets.map((e) => (e.kind === 'rail' ? { ...e, sheets: [{ file: 's', w: 8, h: 8, mask: 'm' }, { file: 'm', w: 8, h: 8 }] } : e)));
    const fill = { s: [200, 120, 40, 140], m: [255, 255, 255, 255] };
    const pixels = (index: RealIndex): number[] => {
      const sets = new Sets(index, fill);
      const look = createRealLook(index, sets, { makeCanvas: make });
      look.prepare(worldWith([{ defId: 'turn_medium_left', dir: 0 }]), 0, VIEW, 1, 1);
      sets.setReady('rail:steel_coaster~turn:d2:r1');
      let sp = look.rail('steel_coaster', 'turn_medium_left', 0, 1, 3);
      for (let i = 0; i < 3 && sp && sp.image === undefined; i++) sp = look.rail('steel_coaster', 'turn_medium_left', 0, 1, 3);
      expect(sets.used.at(-1)).toBe('rail:steel_coaster~turn:d2:r1');
      expect(sp).toBeTruthy();
      const page = sp!.image as unknown as Pix;
      expect(page.width).toBe(TINT_PAGE_PX); // tinted into the atlas, not the sheet
      return Array.from((page.getContext() as { getImageData(x: number, y: number, w: number, h: number): { data: Uint8ClampedArray } }).getImageData(sp!.sx!, sp!.sy!, sp!.w, sp!.h).data);
    };
    const a = pixels(alphaIdx);
    expect(a).toEqual(pixels(maskIdx));
    expect(a[3]).toBe(140); // alpha kept
    expect(a.slice(0, 3)).not.toEqual([200, 120, 40]); // and tinted
  });

  it('stage 1 keys still resolve as base: one set per heading serves every class, no fallback', () => {
    const sets0: RealSetEntry[] = [];
    for (const d of [2, 4] as const) {
      for (const r of [0, 1, 2, 3] as const) sets0.push(entry('rail', 'steel_coaster', d, r, ['station:t0', 'turn_medium_left:t0'], 'mask'));
      sets0.push(entry('car', 'steel_coaster', d, 'all', ['y0:p0:r0:full', 'y1:p0:r0:full'], 'mask'));
    }
    const index = idx(sets0);
    const sets = new Sets(index);
    const look = createRealLook(index, sets, { makeCanvas: make });
    look.prepare(worldWith([{ defId: 'station', dir: 0 }, { defId: 'turn_medium_left', dir: 2 }]), 1, VIEW, 2, 2);
    // the stage 1 sets at the headings the pieces face (dir 0 and 2 at turn 1)
    expect(sets.wanted('now').filter((k) => !k.startsWith('support') && k.includes(':d4:'))).toEqual(['car:steel_coaster:d4:rall', 'rail:steel_coaster:d4:r1', 'rail:steel_coaster:d4:r3']);
    sets.setReady('rail:steel_coaster:d4:r3');
    sets.setReady('car:steel_coaster:d4:rall');
    expect(look.rail('steel_coaster', 'turn_medium_left', 0, 3, 3)).toBeTruthy();
    expect(sets.used.at(-1)).toBe('rail:steel_coaster:d4:r3');
    expect(look.car('steel_coaster', 1, 0, 0, false, 1)).toBeUndefined(); // no empty frame: missing frame, today's art
    expect(look.car('steel_coaster', 1, 0, 0, true, 1)).toBeTruthy();
    expect(sets.used.at(-1)).toBe('car:steel_coaster:d4:rall');
    expect(look.fallbacksUsed()).toEqual(['car:steel_coaster:d4:rall/y1:p0:r0:empty']);
  });

  it('a type with any class set never falls back to its stage 1 sets (mixed index, review P2)', () => {
    const sets0: RealSetEntry[] = [];
    for (const d of [2, 4] as const) for (const r of [0, 1, 2, 3] as const) {
      sets0.push(entry('rail', 'steel_coaster', d, r, ['station:t0', 'vertical_loop_left:t0'], 'mask'));
      sets0.push(entry('rail', 'steel_coaster~base', d, r, ['station:t0'], 'alpha'));
    }
    const index = idx(sets0);
    const sets = new Sets(index);
    const look = createRealLook(index, sets, { makeCanvas: make });
    look.prepare(worldWith([{ defId: 'station', dir: 0 }, { defId: 'vertical_loop_left', dir: 0 }]), 0, VIEW, 1, 1);
    expect([...sets.wanted('now'), ...sets.wanted('ahead')].filter((k) => k.startsWith('rail:steel_coaster:'))).toEqual([]);
    for (const r of [0, 1, 2, 3]) sets.setReady(`rail:steel_coaster:d2:r${r}`);
    expect(look.rail('steel_coaster', 'vertical_loop_left', 0, 0, 3)).toBeUndefined();
    expect(look.fallbacksUsed()).toEqual(['rail:steel_coaster~loop']);
  });

  it('a piece replaced in one tick (undo, then place: same count) changes the classes wanted (review P2)', () => {
    const index = classIndex();
    const sets = new Sets(index);
    const look = createRealLook(index, sets, { makeCanvas: make });
    const world = worldWith([{ defId: 'station', dir: 0 }, { defId: 'straight', dir: 0 }]);
    look.prepare(world, 0, VIEW, 2, 2);
    expect(sets.wanted('now').some((k) => k.includes('~turn'))).toBe(false);
    const pieces = world.state.track.rides['1']!.pieces;
    const last = pieces.pop()!;
    pieces.push({ ...last, defId: 'turn_medium_left' });
    sets.wants = [];
    look.prepare(world, 0, VIEW, 2, 2);
    expect(sets.wanted('now')).toContain('rail:steel_coaster~turn:d4:r0');
  });

  /** Class layout with car sets per yaw quadrant (fix wave): `car:steel_coaster~<class>:d*:r<q>`. */
  const quadrantIndex = (): RealIndex => {
    const sets = classIndex().sets.filter((e) => e.kind !== 'car');
    for (const d of [2, 4] as const) for (const q of [0, 1, 2, 3] as const) {
      sets.push(entry('car', 'steel_coaster~base', d, q, [`y${q * 8}:p0:r0:full`], 'mask'));
      sets.push(entry('car', 'steel_coaster~turn', d, q, [`y${(q * 8 + 1) % 32}:p0:r0:full`, `y${(q * 8 + 3) % 32}:p0:r0:full`, `y${(q * 8 + 29) % 32}:p0:r0:full`], 'mask'));
      sets.push(entry('car', 'steel_coaster~loop', d, q, [], 'mask'));
    }
    return idx(sets);
  };

  it('car class sets by yaw quadrant: a car draws from the set of its view yaw\'s quadrant (fix wave)', () => {
    const index = quadrantIndex();
    const sets = new Sets(index);
    const look = createRealLook(index, sets, { makeCanvas: make });
    look.prepare(worldWith([{ defId: 'station', dir: 0 }]), 0, VIEW, 1, 1);
    for (const q of [0, 1, 2, 3]) { sets.setReady(`car:steel_coaster~base:d2:r${q}`); sets.setReady(`car:steel_coaster~turn:d2:r${q}`); }
    expect(look.car('steel_coaster', 0, 0, 0, true, 1)).toBeTruthy();
    expect(sets.used.at(-1)).toBe('car:steel_coaster~base:d2:r0');
    expect(look.car('steel_coaster', 8, 0, 0, true, 1)).toBeTruthy();
    expect(sets.used.at(-1)).toBe('car:steel_coaster~base:d2:r1');
    expect(look.car('steel_coaster', 3, 0, 0, true, 1)).toBeTruthy(); // 3 steps past +x: still quadrant 0
    expect(sets.used.at(-1)).toBe('car:steel_coaster~turn:d2:r0');
    expect(look.car('steel_coaster', 29, 0, 0, true, 1)).toBeTruthy(); // 3 steps before +x: quadrant 0
    expect(sets.used.at(-1)).toBe('car:steel_coaster~turn:d2:r0');
    expect(look.car('steel_coaster', 25, 0, 0, true, 1)).toBeTruthy();
    expect(sets.used.at(-1)).toBe('car:steel_coaster~turn:d2:r3');
    expect(look.fallbacksUsed()).toEqual([]);
  });

  it('the scope wants only the car quadrants a circuit\'s cars face, turned with the view (fix wave)', () => {
    const index = quadrantIndex();
    const world = worldWith([{ defId: 'station', dir: 0 }, { defId: 'straight', dir: 0 }, { defId: 'turn_medium_right', dir: 0 }]);
    for (const rot of [0, 1, 3] as const) {
      const sets = new Sets(index);
      createRealLook(index, sets, { makeCanvas: make }).prepare(world, rot, VIEW, 2, 2);
      const cars = sets.wanted('now').filter((k) => k.startsWith('car:') && k.includes(':d4:'));
      // straights along +x face quadrant 0; the right turn sweeps from +x to +y: base and turn at quadrants 0 and 1.
      // Never quadrants 2 or 3, and turned with the view.
      expect(cars).toEqual([0, 1].flatMap((q) => ['base', 'turn'].map((c) => `car:steel_coaster~${c}:d4:r${(q + rot) % 4}`)).sort());
    }
  });

  it('shadows (Task 4) resolve untinted from the rail\'s class set and the support set, on their plain sheets', () => {
    const plainSet = (kind: RealKind, item: string, d: 2 | 4, rot: RealSetEntry['rot'], tinted: string[], plain: string[]): RealSetEntry => ({
      key: setKey(kind, item, d, rot), kind, item, density: d, rot,
      sheets: kind === 'rail' ? [{ file: 'a', w: 8, h: 8, tint: 'alpha' }, { file: 'p', w: 8, h: 8 }] : [{ file: 's', w: 8, h: 8, mask: 'm' }, { file: 'm', w: 8, h: 8 }, { file: 'p', w: 8, h: 8 }],
      frames: { ...Object.fromEntries(tinted.map((f) => [f, { ...FR, sheet: kind === 'rail' ? 'a' : 's' }])), ...Object.fromEntries(plain.map((f) => [f, { ...FR, sheet: 'p' }])) },
    });
    const sets0: RealSetEntry[] = [];
    for (const d of [2, 4] as const) for (const r of [0, 1, 2, 3] as const) {
      sets0.push(plainSet('rail', 'steel_coaster~turn', d, r, ['turn_medium_left:t0'], ['turn_medium_left:t0:sh']));
      sets0.push(plainSet('support', 'steel_coaster', d, r, ['foot', 'seg', 'top'], ['foot:sh', 'seg:sh', 'top:sh']));
    }
    const index = idx(sets0);
    const sets = new Sets(index);
    const look = createRealLook(index, sets, { makeCanvas: make });
    look.prepare(worldWith([{ defId: 'turn_medium_left', dir: 0 }]), 0, VIEW, 1, 1);
    sets.setReady('rail:steel_coaster~turn:d2:r1');
    sets.setReady('support:steel_coaster:d2:r1');
    const sh = look.railPart!('steel_coaster', 'turn_medium_left', 0, 1, 'sh');
    expect(sets.used.at(-1)).toBe('rail:steel_coaster~turn:d2:r1');
    const railSheet = sets.use('rail:steel_coaster~turn:d2:r1')!;
    expect(sh!.image).toBe(railSheet.images[1]); // the plain sheet itself: never tinted
    for (const part of ['foot', 'seg', 'top'] as const) {
      const s = look.supportShadow!('steel_coaster', part, 1);
      expect(s!.image, part).toBe(sets.use('support:steel_coaster:d2:r1')!.images[2]);
    }
    // a shadow kept at density 2 in a density-4 set (Task 4) is drawn at its own density, scaled up
    const d4 = index.sets.find((e) => e.key === 'rail:steel_coaster~turn:d4:r1')!;
    d4.frames['turn_medium_left:t0:sh'] = { ...d4.frames['turn_medium_left:t0:sh']!, density: 2 };
    sets.setReady('rail:steel_coaster~turn:d4:r1');
    look.prepare(worldWith([{ defId: 'turn_medium_left', dir: 0 }]), 0, VIEW, 2, 2);
    const big = look.railPart!('steel_coaster', 'turn_medium_left', 0, 1, 'sh');
    expect(sets.used.at(-1)).toBe('rail:steel_coaster~turn:d4:r1');
    expect(big!.scale).toBe(2);
    expect(look.railPart!('steel_coaster', 'turn_medium_left', 0, 1, 'sh')).toBe(big);
    // the rail itself still tints, and nothing fell back
    expect((look.rail('steel_coaster', 'turn_medium_left', 0, 1, 3)!.image as unknown as Pix).width).not.toBe(8);
    expect(look.fallbacksUsed()).toEqual([]);
  });

  it('spinning types: a spun yaw no piece reaches resolves to base (Task 3 files spin frames in ~base)', () => {
    // spinning_mouse reaches pitch 2 (gentle slopes) only along the 4 headings; a spun car on a slope is at any yaw
    const m = poseClasses('spinning_mouse');
    const spun = poseCode(5, 2, 0);
    expect(m.has(spun)).toBe(false);
    expect(poseClassOf('spinning_mouse', spun)).toBe('base');
    const index = idx([2, 4].map((d) => entry('car', 'spinning_mouse~base', d as 2 | 4, 'all', ['y5:p2:r0:full'], 'mask')));
    const sets = new Sets(index);
    const look = createRealLook(index, sets, { makeCanvas: make });
    look.setItemMap!({ spinning_mouse: 'spinning_mouse' }); // not baked yet: map it to its own (fake) sets
    look.prepare(createWorld({ seed: 1, parkName: 'Spin', mapSize: 16 }), 0, VIEW, 1, 1);
    sets.setReady('car:spinning_mouse~base:d2:rall');
    expect(look.car('spinning_mouse', 5, 2, 0, true, 1)).toBeTruthy();
    expect(sets.used.at(-1)).toBe('car:spinning_mouse~base:d2:rall');
  });

  it('memory: the coaster bench circuit at d4 wants at most 60 % of today\'s track bytes, within the 32 MiB bench budget', () => {
    // Fake indexes of a COMPLETE steel coaster (all 34 pieces, 472 poses), sized from Task 1's measure of the stage 1
    // bake (merge-b art, 2026-11-17): rail frame w x (h0 + 39.2 px/m x rail range) at d4 (155.75 x (70.36 + ...)),
    // 77.6% of the d4 size at d2 (78.21 x (35.63 + 19.6/m)), car frame 8781 px at d4 and 2240 at d2, sheets 1.20 x the
    // frame area. Today's layout: one masked rail sheet per heading holding every piece, one masked car sheet.
    // Batch 5: class sets, rails on alpha sheets (station and brakes on a small masked sheet), cars masked per class.
    const MODEL = { 2: { w: 78.21, h0: 35.63, pxm: 19.6, car: 2240 }, 4: { w: 155.75, h0: 70.36, pxm: 39.2, car: 8781 } } as const;
    const PACK = 1.2;
    const masked = new Set(['station', 'brakes', 'block_brake']);
    const sheetOf = (px: number, mask: boolean, file: string): RealSetEntry['sheets'] => {
      const h = Math.max(1, Math.ceil((px * PACK) / 1024));
      return mask ? [{ file, w: 1024, h, mask: `${file}-m` }, { file: `${file}-m`, w: 1024, h }] : [{ file, w: 1024, h, tint: 'alpha' }];
    };
    const steelPieces = typePieces('steel_coaster');
    const today: RealSetEntry[] = [];
    const batch5: RealSetEntry[] = [];
    for (const d of [2, 4] as const) {
      const m = MODEL[d];
      for (const h of [0, 1, 2, 3] as const) {
        const byClass = new Map<string, { alpha: number; mask: number; frames: string[] }>();
        let all = 0;
        const allFrames: string[] = [];
        for (const pc of steelPieces) railTileRanges(pc, h).forEach((dz, ti) => {
          const px = m.w * (m.h0 + dz * m.pxm);
          all += px;
          allFrames.push(`${pc}:t${ti}`);
          const c = byClass.get(pieceClass(pc)) ?? { alpha: 0, mask: 0, frames: [] };
          if (masked.has(pc)) c.mask += px; else c.alpha += px;
          c.frames.push(`${pc}:t${ti}`);
          byClass.set(pieceClass(pc), c);
        });
        const fr = (keys: string[]) => Object.fromEntries(keys.map((k) => [k, FR]));
        today.push({ key: setKey('rail', 'steel_coaster', d, h), kind: 'rail', item: 'steel_coaster', density: d, rot: h, sheets: sheetOf(all, true, `r${d}${h}`), frames: fr(allFrames) });
        for (const [cls, c] of byClass) {
          const sheets = [...(c.alpha ? sheetOf(c.alpha, false, `r${cls}${d}${h}a`) : []), ...(c.mask ? sheetOf(c.mask, true, `r${cls}${d}${h}m`) : [])];
          batch5.push({ key: setKey('rail', `steel_coaster~${cls}`, d, h), kind: 'rail', item: `steel_coaster~${cls}`, density: d, rot: h, sheets, frames: fr(c.frames) });
        }
        const sup = entry('support', 'steel_coaster', d, h, ['foot', 'seg', 'top'], 'mask');
        today.push(sup);
        batch5.push(sup);
      }
      const poses = poseClasses('steel_coaster');
      today.push({ key: setKey('car', 'steel_coaster', d, 'all'), kind: 'car', item: 'steel_coaster', density: d, rot: 'all', sheets: sheetOf(poses.size * 2 * m.car, true, `c${d}`), frames: {} });
      // cars by class and yaw quadrant (fix wave)
      for (const cls of new Set(poses.values())) for (const q of [0, 1, 2, 3] as const) {
        const n = [...poses].filter(([code, c]) => c === cls && carQuadrant(Math.floor(code / 576)) === q).length;
        batch5.push({ key: setKey('car', `steel_coaster~${cls}`, d, q), kind: 'car', item: `steel_coaster~${cls}`, density: d, rot: q, sheets: sheetOf(n * 2 * m.car, true, `c${cls}${d}${q}`), frames: {} });
      }
    }
    const world = buildPerfScene('coaster');
    const wantedTrackBytes = (sets: RealSetEntry[]): number => {
      const index = idx(sets);
      const fake = new Sets(index);
      const look = createRealLook(index, fake, { makeCanvas: make });
      // the whole 64 x 64 map in view at d4, at every view turn: the most the circuit can want at once
      let most = 0;
      for (const rot of [0, 1, 2, 3] as const) {
        fake.wants = [];
        look.prepare(world, rot, { x0: -3000, y0: -3000, x1: 3000, y1: 3000 }, 2, 2);
        // the density-4 sets (their density-2 twins are wanted too until they are ready: transient)
        const keys = fake.wanted('now').filter((k) => /^(rail|car|support):/.test(k) && k.includes(':d4:'));
        most = Math.max(most, keys.reduce((n, k) => n + setDecodedBytes(index.sets.find((e) => e.key === k)!).all, 0));
      }
      return most;
    };
    const before = wantedTrackBytes(today);
    const after = wantedTrackBytes(batch5);
    const MiB = 1024 * 1024;
    // today: every heading's whole-type rail sheet and mask, and the whole car sheet and mask (~150 MiB)
    expect(before / MiB).toBeGreaterThan(120);
    expect(after).toBeLessThanOrEqual(0.6 * before);
    expect(after).toBeLessThanOrEqual(trackBudget('steel_coaster').benchMaxD4);
    // no set of the complete steel coaster is over the 8 MiB per-set rule at d4 (cork's 164 poses were 20.9 MiB in one set)
    const over = batch5.filter((e) => e.density === 4 && setDecodedBytes(e).all > trackBudget('steel_coaster').setMaxD4).map((e) => e.key);
    expect(over).toEqual([]);
    console.log(`coaster bench circuit, d4 track bytes wanted: today's layout ${(before / MiB).toFixed(1)} MiB, class sets ${(after / MiB).toFixed(1)} MiB (${((100 * after) / before).toFixed(0)} %)`);
  }, 120000);
});
