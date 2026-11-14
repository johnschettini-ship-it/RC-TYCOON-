import { describe, expect, it } from 'vitest';
import { setKey, type RealIndex, type RealKind, type RealSetEntry, type SetKey } from '../../../../src/render/real/indexFormat';
import { createRealLook, pickDensity, quantisePose, type RealSets } from '../../../../src/render/real/look';
import { REAL_FALLBACK, realItem } from '../../../../src/render/real/fallbacks';
import type { ReadySet, SetState } from '../../../../src/render/real/setManager';
import { createWorld } from '../../../../src/sim/world';
import type { Ride } from '../../../../src/sim/rides/types';
import type { Stall } from '../../../../src/sim/stalls/types';
import type { World } from '../../../../src/sim/types';
import { PathItem } from '../../../../src/sim/map';
import { SHIRT_COLOURS } from '../../../../src/render/palette';

/** A canvas that holds pixels, enough for crop + tint in node. */
class PixCanvas {
  data: Uint8ClampedArray;
  closed = false;
  constructor(public width: number, public height: number, fill?: number[]) {
    this.data = new Uint8ClampedArray(width * height * 4);
    if (fill) for (let i = 0; i < this.data.length; i += 4) this.data.set(fill, i);
  }
  getContext(): unknown {
    const self = this;
    return {
      drawImage(src: PixCanvas, ...a: number[]) {
        if (a.length === 2) { self.data.set(src.data.subarray(0, self.data.length)); return; }
        const [sx = 0, sy = 0, sw = 0, sh = 0, dx = 0, dy = 0] = a;
        for (let y = 0; y < sh; y++) {
          for (let x = 0; x < sw; x++) {
            const si = ((sy + y) * src.width + sx + x) * 4;
            const di = ((dy + y) * self.width + dx + x) * 4;
            self.data.set(src.data.subarray(si, si + 4), di);
          }
        }
      },
      getImageData(_x: number, _y: number, w: number, h: number) {
        return { width: w, height: h, data: self.data.slice(0, w * h * 4) };
      },
      putImageData(img: { data: Uint8ClampedArray }) {
        self.data.set(img.data);
      },
    };
  }
}

/** ox/oy: offset from the game anchor to the frame's top-left (index format), so the top-left is up-left of the anchor. */
const FRAME = { sheet: 's0', sx: 2, sy: 1, w: 3, h: 4, ox: -10, oy: -30 };

function entry(kind: RealKind, item: string, density: 2 | 4, rot: 0 | 1 | 2 | 3 | 'all', frames: Record<string, typeof FRAME>, mask = false): RealSetEntry {
  const sheets: RealSetEntry['sheets'] = [{ file: 's0', w: 8, h: 8, ...(mask ? { mask: 'm0' } : {}) }];
  if (mask) sheets.push({ file: 'm0', w: 8, h: 8 });
  return { key: setKey(kind, item, density, rot), kind, item, density, rot, sheets, frames };
}

const ROTS = [0, 1, 2, 3] as const;

function makeIndex(): RealIndex {
  const sets: RealSetEntry[] = [];
  for (const d of [2, 4] as const) {
    sets.push(entry('ride', 'carousel', d, 'all', { 'carousel:f0:occ0': FRAME, 'carousel:f3:occ1': FRAME }));
    sets.push(entry('shadow', 'carousel', d, 'all', { carousel: FRAME }));
    for (const r of ROTS) {
      sets.push(entry('ride', 'big_wheel', d, r, { 'big_wheel:f0:occ0': FRAME }));
      sets.push(entry('stall', 'snack_shack', d, r, { snack_shack: FRAME }));
      sets.push(entry('shadow', 'snack_shack', d, r, { snack_shack: FRAME }));
      sets.push(entry('scenery', 'oak_round', d, r, { 'oak_round:f0': FRAME }));
      sets.push(entry('scenery', 'bench', d, r, { 'bench:f0': FRAME }));
      sets.push(entry('rail', 'steel_coaster', d, r, { 'flat:t0': FRAME }, true));
      sets.push(entry('ground', 'grass', d, r, { 's0:v1': FRAME }));
      sets.push(entry('support', 'steel_coaster', d, r, { foot: FRAME, seg: FRAME, top: FRAME }, true));
      sets.push(entry('shadow', 'bench', d, r, { bench: FRAME }));
    }
    sets.push(entry('car', 'steel_coaster', d, 'all', { 'y31:p23:r1:full': FRAME }, true));
    for (let b = 0; b < 2; b++) for (let o = 0; o < 4; o++) sets.push(entry('guest', `b${b}o${o}`, d, 'all', { 'f2:w1': FRAME, 'f0:sit': FRAME }, true));
  }
  return {
    format: 'real/1', pxPerMetreZoom1: 11.31, stepPxPerMetre: 9.8, densities: [2, 4], sets,
    bytes: { compressed: 0, decodedByDensity: { '2': 0, '4': 0 } },
  };
}

/** Fake set manager: every set's state is set by the test; ready sets get pixel sheets. */
class FakeSets implements RealSets {
  states = new Map<SetKey, SetState>();
  wants: { keys: SetKey[]; priority: 'now' | 'ahead' }[] = [];
  used: SetKey[] = [];
  cap: 2 | 4 = 4;
  demoted = new Set<SetKey>();
  held = new Map<string, number>();
  private readonly ready = new Map<SetKey, ReadySet>();
  constructor(private readonly index: RealIndex, private readonly fill: Record<string, number[]> = {}) {}

  setState(key: SetKey, s: SetState): void {
    this.states.set(key, s);
    if (s === 'ready') {
      const e = this.index.sets.find((x) => x.key === key);
      if (!e) throw new Error(`no ${key}`);
      this.ready.set(key, { ...e, images: e.sheets.map((sh) => new PixCanvas(sh.w, sh.h, this.fill[sh.file] ?? [128, 128, 128, 255]) as unknown as CanvasImageSource) });
    } else this.ready.delete(key);
  }
  want(keys: SetKey[], priority: 'now' | 'ahead'): void { this.wants.push({ keys: [...keys], priority }); }
  use(key: SetKey): ReadySet | null { this.used.push(key); return this.ready.get(key) ?? null; }
  state(key: SetKey): SetState { return this.states.get(key) ?? 'none'; }
  densityCap(): 2 | 4 { return this.cap; }
  isDemoted(key: SetKey): boolean { return this.demoted.has(key); }
  /** Room for held bytes (tinted sheets) in total; Infinity by default. */
  room = Number.POSITIVE_INFINITY;
  refused: string[] = [];
  hold(id: string, bytes: number): void { if (bytes > 0) this.held.set(id, bytes); else this.held.delete(id); }
  admit(id: string, bytes: number): boolean {
    let total = bytes;
    for (const [k, v] of this.held) if (k !== id) total += v;
    if (total > this.room) { this.refused.push(id); return false; }
    this.hold(id, bytes);
    return true;
  }

  images(key: SetKey): CanvasImageSource[] { return this.ready.get(key)!.images; }

  wanted(priority: 'now' | 'ahead'): SetKey[] {
    return this.wants.filter((w) => w.priority === priority).flatMap((w) => w.keys).sort();
  }
}

const make = (w: number, h: number) => new PixCanvas(w, h);

function setup(fill?: Record<string, number[]>) {
  const index = makeIndex();
  const sets = new FakeSets(index, fill);
  const look = createRealLook(index, sets, { makeCanvas: make });
  return { index, sets, look };
}

function emptyWorld() {
  return createWorld({ seed: 1, parkName: 'Look Park', mapSize: 16 });
}

const VIEW = { x0: 0, y0: 0, x1: 100, y1: 100 };

describe('fallbacks', () => {
  it('maps baked, mapped and classic ids', () => {
    expect(realItem('carousel')).toBe('carousel');
    expect(realItem('teacup_twirl')).toBe('carousel');
    expect(realItem('fizz_stand')).toBe('snack_shack');
    expect(realItem('restrooms')).toBe('snack_shack');
    expect(realItem('balloon_stand')).toBe('snack_shack');
    expect(realItem('mini_railway')).toBe('steel_coaster');
    expect(realItem('bench')).toBe('bench');
    expect(realItem('bin')).toBe('bin');
    expect(REAL_FALLBACK['drop_tower']).toBe('classic');
    expect(realItem('no_such_thing')).toBe('classic');
  });
});

describe('RealLook', () => {
  it('returns a sprite with scale = density and anchor offsets from the frame', () => {
    const { sets, look } = setup();
    look.prepare(emptyWorld(), 0, VIEW, 2, 2); // zoom x dpr = 4 -> density 4
    sets.setState(setKey('stall', 'snack_shack', 4, 0), 'ready');
    const sp = look.stall('snack_shack', 0);
    expect(sp).toBeTruthy();
    expect(sp!.scale).toBe(4);
    // Frame ox/oy -10/-30 (anchor to top-left) -> sprite ox/oy 10/30 (anchor inside the image), as blit wants.
    expect(sp!.ox).toBe(10);
    expect(sp!.oy).toBe(30);
    expect(sp!.w).toBe(FRAME.w);
    expect(sp!.h).toBe(FRAME.h);
    // An atlas sprite: the sheet itself, with the frame's source rectangle; nothing copied or held.
    expect(sp!.image).toBe(sets.images(setKey('stall', 'snack_shack', 4, 0))[0]);
    expect([sp!.sx, sp!.sy]).toEqual([FRAME.sx, FRAME.sy]);
    expect(sets.held.size).toBe(0);
  });

  it('returns null and counts incomplete while the set loads', () => {
    const { sets, look } = setup();
    look.prepare(emptyWorld(), 1, VIEW, 1, 1);
    sets.setState(setKey('ride', 'big_wheel', 2, 1), 'loading');
    expect(look.ride('big_wheel', 1, 0, 0)).toBeNull();
    expect(look.scenery('oak_round', 1, 0)).toBeNull();
    expect(look.incomplete()).toBe(2);
    look.prepare(emptyWorld(), 1, VIEW, 1, 1);
    expect(look.incomplete()).toBe(0);
  });

  it('falls back for unbaked items', () => {
    const { sets, look } = setup();
    look.prepare(emptyWorld(), 0, VIEW, 1, 1);
    expect(look.ride('drop_tower', 0, 0, 0)).toBeUndefined();
    expect(look.fallbacksUsed()).toContain('drop_tower');
    sets.setState(setKey('ride', 'carousel', 2, 'all'), 'ready');
    const sp = look.ride('teacup_twirl', 2, 3, 5);
    expect(sp).toBeTruthy();
    expect(sp!.scale).toBe(2);
    expect(sets.used).toContain(setKey('ride', 'carousel', 2, 'all'));
    expect(look.incomplete()).toBe(0);
  });

  it('failed set uses classic art', () => {
    const { sets, look } = setup();
    look.prepare(emptyWorld(), 0, VIEW, 1, 1);
    sets.setState(setKey('stall', 'snack_shack', 2, 0), 'failed');
    expect(look.stall('fizz_stand', 0)).toBeUndefined();
    expect(look.incomplete()).toBe(0);
    expect(look.fallbacksUsed()).toContain(setKey('stall', 'snack_shack', 2, 0));
  });

  it('prepare wants only built kinds, the current turn and the ahead turn', () => {
    const { sets, look } = setup();
    const world = emptyWorld();
    world.state.rides.push({ id: 1, kind: 'flat', defId: 'teacup_twirl' } as Ride);
    world.state.rides.push({ id: 2, kind: 'flat', defId: 'drop_tower' } as Ride);
    world.state.rides.push({ id: 3, kind: 'track', defId: 'mini_railway' } as Ride);
    world.state.stalls.push({ id: 4, defId: 'restrooms' } as Stall);
    world.state.map.pathItem[5] = PathItem.Bench;
    look.prepare(world, 3, VIEW, 1, 1);
    const k = (kind: RealKind, item: string, rot: 0 | 1 | 2 | 3 | 'all') => setKey(kind, item, 2, rot);
    const guests = Array.from({ length: 8 }, (_, i) => k('guest', `b${i >> 2}o${i & 3}`, 'all'));
    // Rails, supports and path-item shadows are keyed by a heading in the view (the piece's, the saddle's, the
    // item's side), not the view turn, so every heading is wanted now.
    const every = (kind: RealKind, item: string) => ROTS.map((r) => k(kind, item, r));
    expect(sets.wanted('now')).toEqual([
      k('car', 'steel_coaster', 'all'),
      k('ground', 'grass', 3),
      ...guests,
      ...every('rail', 'steel_coaster'),
      ...every('support', 'steel_coaster'),
      k('ride', 'carousel', 'all'),
      k('scenery', 'bench', 3),
      k('shadow', 'carousel', 'all'),
      ...every('shadow', 'bench'),
      k('shadow', 'snack_shack', 3),
      k('stall', 'snack_shack', 3),
    ].sort());
    expect(sets.wanted('ahead')).toEqual([
      k('ground', 'grass', 0),
      k('scenery', 'bench', 0),
      k('shadow', 'snack_shack', 0),
      k('stall', 'snack_shack', 0),
    ].sort());
    // Nothing for unbuilt kinds (big_wheel, oak_round) nor for classic ones (drop_tower).
    const all = sets.wants.flatMap((w) => w.keys).join(' ');
    expect(all).not.toMatch(/big_wheel|oak_round|drop_tower/);
  });

  it('prepare wants each turned object\'s own sprite turn, not the view turn (Task 9b)', () => {
    const { sets, look } = setup();
    const world = emptyWorld();
    // Stall facing map 2, big wheel at map 1, tree at map 3; view turn 3 → sprite turns 1, 0 and 2.
    world.state.stalls.push({ id: 4, defId: 'snack_shack', rotation: 2 } as Stall);
    world.state.rides.push({ id: 5, kind: 'flat', defId: 'big_wheel', rotation: 1 } as Ride);
    world.state.scenery.push({ id: 6, defId: 'oak_round', rotation: 3, edge: -1 } as World['state']['scenery'][number]);
    look.prepare(world, 3, VIEW, 1, 1);
    const k = (kind: RealKind, item: string, rot: 0 | 1 | 2 | 3) => setKey(kind, item, 2, rot);
    const now = sets.wanted('now');
    const ahead = sets.wanted('ahead');
    for (const key of [k('stall', 'snack_shack', 1), k('shadow', 'snack_shack', 1), k('ride', 'big_wheel', 0), k('scenery', 'oak_round', 2)]) expect(now).toContain(key);
    for (const key of [k('stall', 'snack_shack', 2), k('shadow', 'snack_shack', 2), k('ride', 'big_wheel', 1), k('scenery', 'oak_round', 3)]) expect(ahead).toContain(key);
    expect(now).not.toContain(k('stall', 'snack_shack', 3));
    // And the getters resolve those sets once ready.
    sets.setState(k('stall', 'snack_shack', 1), 'ready');
    expect(look.stall('snack_shack', 1)).toBeTruthy();
  });

  it('prepare wants the density-2 set for a demoted density-4 set', () => {
    const { sets, look } = setup();
    const world = emptyWorld();
    world.state.stalls.push({ id: 4, defId: 'snack_shack' } as Stall);
    sets.demoted.add(setKey('stall', 'snack_shack', 4, 0));
    look.prepare(world, 0, VIEW, 2, 2);
    expect(sets.wanted('now')).toContain(setKey('stall', 'snack_shack', 2, 0));
    expect(sets.wanted('now')).not.toContain(setKey('stall', 'snack_shack', 4, 0));
    expect(sets.wanted('ahead')).toContain(setKey('stall', 'snack_shack', 4, 1));
    sets.setState(setKey('stall', 'snack_shack', 2, 0), 'ready');
    expect(look.stall('snack_shack', 0)!.scale).toBe(2);
  });

  it('density rule', () => {
    expect(pickDensity(1, 2, 4)).toBe(2);
    expect(pickDensity(2, 2.625, 4)).toBe(4);
    expect(pickDensity(2, 2.625, 2)).toBe(2);
    expect(pickDensity(0.5, 1, 4)).toBe(2);
    expect(pickDensity(1.5, 2, 4)).toBe(4);
    const { sets, look } = setup();
    expect(look.density(1, 2)).toBe(2);
    expect(look.density(2, 2.625)).toBe(4);
    sets.cap = 2;
    expect(look.density(2, 2.625)).toBe(2);
  });

  it('tints guest shirts by the game shirt index and caches per colour', () => {
    // Base mid-grey everywhere, mask full strength: tinted = 0.5 x shirt rgb.
    const { sets, look } = setup({ s0: [128, 128, 128, 255], m0: [255, 0, 0, 255] });
    look.prepare(emptyWorld(), 0, VIEW, 1, 1);
    // guestId 5: body 5 % 2 = 1, outfit (5 >> 1) % 4 = 2.
    sets.setState(setKey('guest', 'b1o2', 2, 'all'), 'ready');
    const a = look.guest(5, 3, 1, 2, false)!;
    expect(a).toBeTruthy();
    const hex = SHIRT_COLOURS[3]!;
    const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    // The whole sheet is tinted once: the sprite points into the tinted 8x8 sheet at the frame's rectangle.
    const sheet = a.image as unknown as PixCanvas;
    expect([sheet.width, sheet.height]).toEqual([8, 8]);
    expect([a.sx, a.sy, a.ox, a.oy]).toEqual([FRAME.sx, FRAME.sy, 10, 30]);
    const at = (FRAME.sy * 8 + FRAME.sx) * 4;
    for (let c = 0; c < 3; c++) expect(Math.abs(sheet.data[at + c]! - rgb[c]! * 128 / 255)).toBeLessThanOrEqual(1);
    const key = setKey('guest', 'b1o2', 2, 'all');
    expect([...sets.held.entries()]).toEqual([[`${key}#${hex}`, 8 * 8 * 4]]);
    // Same colour, other frame: same tinted sheet, no new hold.
    expect(look.guest(5, 3, 0, 0, true)!.image).toBe(a.image);
    expect(sets.held.size).toBe(1);
    const b = look.guest(5, 4, 1, 2, false)!;
    expect(b.image).not.toBe(a.image);
    expect(sets.held.has(`${key}#${SHIRT_COLOURS[4]!}`)).toBe(true);
  });

  it('frees tinted sheets when their set is no longer ready', () => {
    const { sets, look } = setup();
    look.prepare(emptyWorld(), 0, VIEW, 1, 1);
    sets.setState(setKey('guest', 'b0o0', 2, 'all'), 'ready');
    const img = look.guest(0, 1, 1, 2, false)!.image as unknown as PixCanvas;
    expect(sets.held.size).toBe(1);
    sets.setState(setKey('guest', 'b0o0', 2, 'all'), 'none');
    look.prepare(emptyWorld(), 0, VIEW, 1, 1);
    expect(sets.held.size).toBe(0);
    expect(img.width).toBe(0);
  });

  it('rails, cars and ground use their frame keys', () => {
    const { sets, look } = setup();
    look.prepare(emptyWorld(), 2, VIEW, 1, 1);
    sets.setState(setKey('rail', 'steel_coaster', 2, 2), 'ready');
    sets.setState(setKey('car', 'steel_coaster', 2, 'all'), 'ready');
    sets.setState(setKey('ground', 'grass', 2, 2), 'ready');
    sets.setState(setKey('support', 'steel_coaster', 2, 2), 'ready');
    expect(look.support('mini_railway', 'seg', 2, 3)).toBeTruthy();
    expect(look.support('steel_coaster', 'top', 2, 3)).toBeTruthy();
    expect(look.support('steel_coaster', 'foot', 2, 3)).toBeTruthy();
    expect(look.support('go_karts', 'seg', 2, 3)).toBeUndefined();
    expect(look.rail('mini_railway', 'flat', 0, 2, 3)).toBeTruthy();
    expect(look.car('steel_coaster', -1, -1, 25, true, 1)).toBeTruthy(); // wraps to y31 p23 r1
    expect(look.groundPiece('grass', 0, 1, 2)).toBeTruthy();
    expect(look.groundPiece('lava', 0, 1, 2)).toBeUndefined();
    expect(look.staff('handyman', 0, 0)).toBeUndefined();
  });

  it('supports: one set per saddle heading, tinted with the support colour by their mask', () => {
    const { sets, look } = setup({ s0: [128, 128, 128, 255], m0: [255, 0, 0, 255] });
    look.prepare(emptyWorld(), 0, VIEW, 1, 1);
    // The heading is the set's turn, whatever the view turn.
    sets.setState(setKey('support', 'steel_coaster', 2, 3), 'ready');
    const sp = look.support('steel_coaster', 'seg', 3, 5)!;
    expect(sp).toBeTruthy();
    expect(sets.used).toContain(setKey('support', 'steel_coaster', 2, 3));
    // Tinted: a whole tinted copy of the sheet, not the sheet itself.
    expect(sp.image).not.toBe(sets.images(setKey('support', 'steel_coaster', 2, 3))[0]);
    expect([...sets.held.keys()][0]).toMatch(/^support:steel_coaster:d2:r3#/);
  });

  it('path-item shadows resolve by the item\'s side', () => {
    const { sets, look } = setup();
    look.prepare(emptyWorld(), 0, VIEW, 1, 1);
    sets.setState(setKey('shadow', 'bench', 2, 2), 'ready');
    expect(look.shadow('scenery', 'bench', 2)).toBeTruthy();
    expect(sets.used).toContain(setKey('shadow', 'bench', 2, 2));
  });

  it('quantises car poses like the bake', () => {
    expect(quantisePose(0, 0, 0)).toEqual({ yaw: 0, pitch: 0, roll: 0 });
    expect(quantisePose(Math.PI, Math.PI / 12, -Math.PI / 12)).toEqual({ yaw: 16, pitch: 1, roll: 23 });
    expect(quantisePose(2 * Math.PI - 0.01, 0, 0).yaw).toBe(0);
  });
  it('a bad mask falls back to classic art, reported once, with nothing held', () => {
    const index = makeIndex();
    const key = setKey('car', 'steel_coaster', 2, 'all');
    const car = index.sets.find((e) => e.key === key)!;
    car.sheets[1] = { file: 'm0', w: 4, h: 4 }; // mask smaller than its 8x8 sheet
    const sets = new FakeSets(index);
    const errors: [string, unknown][] = [];
    const look = createRealLook(index, sets, { makeCanvas: make, onError: (k, e) => errors.push([k, e]) });
    look.prepare(emptyWorld(), 0, VIEW, 1, 1);
    sets.setState(key, 'ready');
    expect(look.car('steel_coaster', 31, 23, 1, true, 1)).toBeUndefined();
    expect(look.car('steel_coaster', 31, 23, 1, true, 1)).toBeUndefined();
    expect(errors).toHaveLength(1);
    expect(errors[0]![0]).toMatch(new RegExp(`^${key}#`));
    expect(look.fallbacksUsed()).toContain(errors[0]![0]);
    expect(sets.held.size).toBe(0);
    expect(look.incomplete()).toBe(0);
  });

  it('dispose frees every tinted sheet', () => {
    const { sets, look } = setup();
    look.prepare(emptyWorld(), 0, VIEW, 1, 1);
    sets.setState(setKey('guest', 'b0o0', 2, 'all'), 'ready');
    const a = look.guest(0, 1, 1, 2, false)!.image as unknown as PixCanvas;
    const b = look.guest(0, 2, 1, 2, false)!.image as unknown as PixCanvas;
    expect(sets.held.size).toBe(2);
    look.dispose();
    expect(sets.held.size).toBe(0);
    expect([a.width, b.width]).toEqual([0, 0]);
  });
});

describe('RealLook: memory (final review C1, M1)', () => {
  it('a tinted sheet is admitted before it is made: no room gives null (incomplete) and makes nothing', () => {
    const { sets, look } = setup({ s0: [128, 128, 128, 255], m0: [255, 0, 0, 255] });
    look.prepare(emptyWorld(), 0, VIEW, 1, 1);
    sets.setState(setKey('guest', 'b0o0', 2, 'all'), 'ready');
    sets.room = 8 * 8 * 4 - 1;
    let made = 0;
    const counting = createRealLook(makeIndex(), sets, { makeCanvas: (w, h) => { made++; return new PixCanvas(w, h); } });
    counting.prepare(emptyWorld(), 0, VIEW, 1, 1);
    expect(counting.guest(0, 1, 1, 2, false)).toBeNull();
    expect(counting.incomplete()).toBe(1);
    expect(made).toBe(0);
    expect(sets.held.size).toBe(0);
    expect(sets.refused).toEqual([`${setKey('guest', 'b0o0', 2, 'all')}#${SHIRT_COLOURS[1]!}`]);
    // Room again: made and held.
    sets.room = Number.POSITIVE_INFINITY;
    expect(counting.guest(0, 1, 1, 2, false)).toBeTruthy();
    expect(sets.held.size).toBe(1);
    void look;
  });

  it('reclaim frees tinted sheets not drawn since the last prepare, least recently used first', () => {
    const { sets, look } = setup();
    sets.setState(setKey('guest', 'b0o0', 2, 'all'), 'ready');
    const key = setKey('guest', 'b0o0', 2, 'all');
    look.prepare(emptyWorld(), 0, VIEW, 1, 1);
    look.guest(0, 1, 1, 2, false); // colour 1, frame 1
    look.prepare(emptyWorld(), 0, VIEW, 1, 1);
    look.guest(0, 2, 1, 2, false); // colour 2, frame 2
    look.prepare(emptyWorld(), 0, VIEW, 1, 1);
    look.guest(0, 3, 1, 2, false); // colour 3, drawn this frame: kept
    expect(sets.held.size).toBe(3);
    expect(look.reclaim(1)).toBe(8 * 8 * 4);
    expect([...sets.held.keys()].sort()).toEqual([`${key}#${SHIRT_COLOURS[2]!}`, `${key}#${SHIRT_COLOURS[3]!}`].sort());
    expect(look.reclaim(1e9)).toBe(8 * 8 * 4);
    expect([...sets.held.keys()]).toEqual([`${key}#${SHIRT_COLOURS[3]!}`]);
  });

  it('tinted sheets of a density-2 set are held at 4 times their size for the cap-lift estimate', () => {
    const index = makeIndex();
    const holds: [string, number, number | undefined][] = [];
    const sets = new FakeSets(index);
    sets.hold = (id: string, bytes: number, up?: number) => { holds.push([id, bytes, up]); };
    const look = createRealLook(index, sets, { makeCanvas: make });
    look.prepare(emptyWorld(), 0, VIEW, 1, 1);
    sets.setState(setKey('guest', 'b0o0', 2, 'all'), 'ready');
    look.guest(0, 1, 1, 2, false);
    expect(holds.at(-1)).toEqual([`${setKey('guest', 'b0o0', 2, 'all')}#${SHIRT_COLOURS[1]!}`, 256, 1024]);
  });

  it('path and queue pieces are read by their join mask (kerbs), other ground by slope and variant', () => {
    const sets0: RealSetEntry[] = [
      entry('ground', 'path', 2, 'all', { j5: FRAME, 's0:v0': FRAME }),
      entry('ground', 'grass', 2, 'all', { 's3:v1': FRAME }),
    ];
    const index: RealIndex = { ...makeIndex(), sets: sets0 };
    const sets = new FakeSets(index);
    const look = createRealLook(index, sets, { makeCanvas: make });
    look.prepare(emptyWorld(), 0, VIEW, 1, 1);
    sets.setState(setKey('ground', 'path', 2, 'all'), 'ready');
    sets.setState(setKey('ground', 'grass', 2, 'all'), 'ready');
    expect(look.groundPiece('path', 0, 2, 0, 5)).toBeTruthy();
    expect(look.groundPiece('path', 0, 0, 0, 6)).toBeUndefined();
    expect(look.fallbacksUsed()).toEqual([`${setKey('ground', 'path', 2, 'all')}/j6`]);
    expect(look.groundPiece('grass', 3, 1, 0, 5)).toBeTruthy();
    expect(look.groundPiece('path', 0, 0, 0)).toBeTruthy(); // no join given: s0:v0 as before
  });

  it('currentDensity is the density the last prepare chose', () => {
    const { sets, look } = setup();
    look.prepare(emptyWorld(), 0, VIEW, 2, 2);
    expect(look.currentDensity()).toBe(4);
    sets.cap = 2;
    look.prepare(emptyWorld(), 0, VIEW, 2, 2);
    expect(look.currentDensity()).toBe(2);
  });
});
