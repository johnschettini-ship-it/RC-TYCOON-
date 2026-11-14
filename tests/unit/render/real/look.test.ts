import { describe, expect, it } from 'vitest';
import { setKey, type RealIndex, type RealKind, type RealSetEntry, type SetKey } from '../../../../src/render/real/indexFormat';
import { createRealLook, DEGRADE_FRAMES, pickDensity, quantisePose, TINT_FRAME_MS, type RealSets } from '../../../../src/render/real/look';
import { REAL_FALLBACK, realItem } from '../../../../src/render/real/fallbacks';
import { SetManager, type Decoded, type ReadySet, type SetState } from '../../../../src/render/real/setManager';
import type { Sprite } from '../../../../src/render/spriteCache';
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
      getImageData(x: number, y: number, w: number, h: number) {
        const data = new Uint8ClampedArray(w * h * 4);
        for (let r = 0; r < h; r++) data.set(self.data.subarray(((y + r) * self.width + x) * 4, ((y + r) * self.width + x + w) * 4), r * w * 4);
        return { width: w, height: h, data };
      },
      putImageData(img: { width: number; height: number; data: Uint8ClampedArray }, x = 0, y = 0) {
        for (let r = 0; r < img.height; r++) self.data.set(img.data.subarray(r * img.width * 4, (r + 1) * img.width * 4), ((y + r) * self.width + x) * 4);
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
  peek(key: SetKey): ReadySet | null { return this.ready.get(key) ?? null; }
  state(key: SetKey): SetState { return this.states.get(key) ?? 'none'; }
  densityCap(): 2 | 4 { return this.cap; }
  isDemoted(key: SetKey): boolean { return this.demoted.has(key); }
  /** Sets the test says cannot fit (round 3 item 2). */
  starvedKeys = new Set<SetKey>();
  starved(key: SetKey): boolean { return this.starvedKeys.has(key); }
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

/** A view over the whole 16 × 16 test map at any turn (round 3: prepare wants only objects in the view plus a screen). */
const VIEW = { x0: -560, y0: -100, x1: 560, y1: 560 };
/** Map position for a test object (inside VIEW at every turn). */
const AT = { x: 6, y: 6 };

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
    world.state.rides.push({ id: 1, kind: 'flat', defId: 'teacup_twirl', ...AT } as Ride);
    world.state.rides.push({ id: 2, kind: 'flat', defId: 'drop_tower', ...AT } as Ride);
    world.state.rides.push({ id: 3, kind: 'track', defId: 'mini_railway', ...AT } as Ride);
    world.state.track.rides['3'] = { pieces: [{ defId: 'station', x: 6, y: 6, z: 8, dir: 1 }] } as unknown as World['state']['track']['rides'][string];
    world.state.stalls.push({ id: 4, defId: 'restrooms', ...AT } as Stall);
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
    world.state.stalls.push({ id: 4, defId: 'snack_shack', rotation: 2, ...AT } as Stall);
    world.state.rides.push({ id: 5, kind: 'flat', defId: 'big_wheel', rotation: 1, ...AT } as Ride);
    world.state.scenery.push({ id: 6, defId: 'oak_round', rotation: 3, edge: -1, ...AT } as World['state']['scenery'][number]);
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
    world.state.stalls.push({ id: 4, defId: 'snack_shack', ...AT } as Stall);
    sets.demoted.add(setKey('stall', 'snack_shack', 4, 0));
    look.prepare(world, 0, VIEW, 2, 2);
    expect(sets.wanted('now')).toContain(setKey('stall', 'snack_shack', 2, 0));
    expect(sets.wanted('now')).not.toContain(setKey('stall', 'snack_shack', 4, 0));
    // The ahead turn is wanted at density 2 only (round 2).
    expect(sets.wanted('ahead')).toContain(setKey('stall', 'snack_shack', 2, 1));
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

describe('RealLook: a density-4 set that failed (re-review 3)', () => {
  it('draws its density-2 set instead of today\'s art', () => {
    const { sets, look } = setup();
    sets.setState(setKey('stall', 'snack_shack', 4, 0), 'failed');
    sets.setState(setKey('stall', 'snack_shack', 2, 0), 'ready');
    look.prepare(emptyWorld(), 0, VIEW, 2, 2);
    expect(look.currentDensity()).toBe(4);
    const sp = look.stall('snack_shack', 0);
    expect(sp).toBeTruthy();
    expect(sp!.scale).toBe(2);
    expect(look.fallbacksUsed()).toEqual([]);
  });
});

describe('RealLook: fast turns at density 4 (round 2, change 2)', () => {
  it('a density-4 set not ready with its density-2 twin ready draws the density-2 frame (scale 2): not null, not incomplete', () => {
    const { sets, look } = setup();
    look.prepare(emptyWorld(), 1, VIEW, 2, 2.625);
    expect(look.currentDensity()).toBe(4);
    sets.setState(setKey('stall', 'snack_shack', 4, 1), 'loading');
    sets.setState(setKey('stall', 'snack_shack', 2, 1), 'ready');
    const sp = look.stall('snack_shack', 1);
    expect(sp).toBeTruthy();
    expect(sp!.scale).toBe(2);
    expect(sp!.image).toBe(sets.images(setKey('stall', 'snack_shack', 2, 1))[0]);
    expect(look.incomplete()).toBe(0);
    expect(look.soft()).toBe(1);
    expect(look.fallbacksUsed()).toEqual([]);
    // Tinted kinds too (guests, 'all' sets).
    sets.setState(setKey('guest', 'b0o0', 2, 'all'), 'ready');
    const g = look.guest(0, 0, 1, 2, false);
    expect(g!.scale).toBe(2);
    expect(look.soft()).toBe(2);
    // Once the density-4 set lands the object draws sharp, and the count starts again at the next prepare.
    sets.setState(setKey('stall', 'snack_shack', 4, 1), 'ready');
    look.prepare(emptyWorld(), 1, VIEW, 2, 2.625);
    expect(look.stall('snack_shack', 1)!.scale).toBe(4);
    expect(look.soft()).toBe(0);
  });

  it('while a density-4 set is not ready its density-2 twin is wanted now, first; not once the density-4 set is ready', () => {
    const { sets, look } = setup();
    const world = emptyWorld();
    world.state.stalls.push({ id: 4, defId: 'snack_shack', ...AT } as Stall);
    look.prepare(world, 1, VIEW, 2, 2.625);
    const nowWants = sets.wants.filter((w) => w.priority === 'now');
    expect(nowWants[0]!.keys).toContain(setKey('stall', 'snack_shack', 2, 1));
    expect(nowWants[0]!.keys.every((k) => k.includes(':d2:'))).toBe(true);
    expect(nowWants[0]!.keys.some((k) => k.startsWith('ground:'))).toBe(false);
    expect(sets.wanted('now')).toContain(setKey('stall', 'snack_shack', 4, 1));
    sets.wants = [];
    sets.setState(setKey('stall', 'snack_shack', 4, 1), 'ready');
    look.prepare(world, 1, VIEW, 2, 2.625);
    expect(sets.wanted('now')).not.toContain(setKey('stall', 'snack_shack', 2, 1));
    expect(sets.wanted('ahead')).not.toContain(setKey('stall', 'snack_shack', 2, 1));
  });

  it('the soft path tints the density-2 twin once and keeps it: no re-tint per frame, never incomplete (review 1)', () => {
    const index = makeIndex();
    const sets = new FakeSets(index);
    let canvases = 0;
    const look = createRealLook(index, sets, { makeCanvas: (w, h) => { canvases++; return make(w, h); } });
    let admits = 0;
    const admit = sets.admit.bind(sets);
    sets.admit = (id, bytes) => { admits++; return admit(id, bytes); };
    sets.setState(setKey('guest', 'b0o0', 4, 'all'), 'loading');
    sets.setState(setKey('guest', 'b0o0', 2, 'all'), 'ready');
    const world = emptyWorld();
    look.prepare(world, 0, VIEW, 2, 2.625);
    expect(look.guest(0, 0, 1, 2, false)!.scale).toBe(2);
    expect(look.incomplete()).toBe(0);
    const made = canvases;
    expect(made).toBeGreaterThan(0);
    look.prepare(world, 0, VIEW, 2, 2.625);
    expect(look.guest(0, 0, 1, 2, false)!.scale).toBe(2);
    expect(look.incomplete()).toBe(0);
    expect(canvases).toBe(made);
    expect(admits).toBe(1);
    // Held under the twin's key, which the sweep sees as ready.
    expect([...sets.held.keys()].every((k) => k.startsWith('guest:b0o0:d2:rall#'))).toBe(true);
  });

  it('with neither ready it is null and incomplete; ground pieces never step down', () => {
    const { sets, look } = setup();
    look.prepare(emptyWorld(), 0, VIEW, 2, 2.625);
    expect(look.stall('snack_shack', 0)).toBeNull();
    expect(look.incomplete()).toBe(1);
    sets.setState(setKey('ground', 'grass', 2, 0), 'ready');
    expect(look.groundPiece('grass', 0, 1, 0)).toBeNull();
    expect(look.incomplete()).toBe(2);
    expect(look.soft()).toBe(0);
  });

  it('prepare at density 4 wants the current turn at density 4 (now) and the ahead turn at density 2 only', () => {
    const { sets, look } = setup();
    const world = emptyWorld();
    world.state.stalls.push({ id: 4, defId: 'snack_shack', ...AT } as Stall);
    world.state.rides.push({ id: 5, kind: 'flat', defId: 'carousel', ...AT } as Ride);
    look.prepare(world, 2, VIEW, 2, 2.625);
    const now = sets.wanted('now');
    const ahead = sets.wanted('ahead');
    expect(now).toContain(setKey('stall', 'snack_shack', 4, 2));
    expect(now).toContain(setKey('ride', 'carousel', 4, 'all'));
    expect(ahead).toContain(setKey('stall', 'snack_shack', 2, 3));
    expect(ahead).toContain(setKey('shadow', 'snack_shack', 2, 3));
    expect(ahead.some((k) => k.includes(':d4:'))).toBe(false);
    // A set for every turn is wanted once (now), never again ahead at density 2.
    expect(ahead).not.toContain(setKey('ride', 'carousel', 2, 'all'));
    // At density 2 the ahead turn is density 2 as before.
    const s2 = setup();
    s2.look.prepare(world, 2, VIEW, 1, 2);
    expect(s2.sets.wanted('ahead')).toContain(setKey('stall', 'snack_shack', 2, 3));
  });
});

describe('RealLook: per-draw cost (round 3 item 5)', () => {
  it('a frame is looked up in its set once; every later draw reuses the same sprite (no key or frame string per draw)', () => {
    const { sets, look } = setup({ s0: [128, 128, 128, 255], m0: [255, 0, 0, 255] });
    look.prepare(emptyWorld(), 0, VIEW, 1, 1);
    for (const k of [setKey('guest', 'b1o2', 2, 'all'), setKey('scenery', 'oak_round', 2, 0)]) sets.setState(k, 'ready');
    // Count reads of each ready set's frame table and of its sheet list (the old path did `findIndex` per draw).
    let frameReads = 0;
    let sheetSearches = 0;
    for (const k of [setKey('guest', 'b1o2', 2, 'all'), setKey('scenery', 'oak_round', 2, 0)]) {
      const rs = sets.use(k)!;
      const frames = rs.frames;
      rs.frames = new Proxy(frames, { get: (t, p) => { frameReads++; return Reflect.get(t, p); } });
      const sheets = rs.sheets;
      const find = sheets.findIndex.bind(sheets);
      sheets.findIndex = ((...a: Parameters<typeof find>) => { sheetSearches++; return find(...a); }) as typeof sheets.findIndex;
    }
    const g1 = look.guest(5, 3, 1, 2, false);
    const s1 = look.scenery('oak_round', 0, 0);
    expect(g1 && s1).toBeTruthy();
    const reads = frameReads;
    const searches = sheetSearches;
    for (let n = 0; n < 50; n++) {
      expect(look.guest(5, 3, 1, 2, false)).toBe(g1);
      expect(look.scenery('oak_round', 0, 0)).toBe(s1);
    }
    expect(frameReads).toBe(reads);
    expect(sheetSearches).toBe(searches);
    // A new prepare keeps the lookups (same ready set); another frame of the set is looked up once.
    look.prepare(emptyWorld(), 0, VIEW, 1, 1);
    expect(look.guest(5, 3, 1, 2, false)).toBe(g1);
    expect(look.guest(5, 3, 0, 0, true)).not.toBe(g1);
    expect(frameReads).toBe(reads + 1);
  });

  it('a reloaded set (new images) is looked up again, and its tinted sheet is made again', () => {
    const { sets, look } = setup({ s0: [128, 128, 128, 255], m0: [255, 0, 0, 255] });
    const key = setKey('guest', 'b0o0', 2, 'all');
    look.prepare(emptyWorld(), 0, VIEW, 1, 1);
    sets.setState(key, 'ready');
    const a = look.guest(0, 1, 1, 2, false)!;
    sets.setState(key, 'ready'); // freed and decoded again: new images
    look.prepare(emptyWorld(), 0, VIEW, 1, 1);
    const b = look.guest(0, 1, 1, 2, false)!;
    expect(b).not.toBe(a);
    expect(b.image).not.toBe(a.image);
    expect(sets.held.size).toBe(1);
  });
});

describe('RealLook: view-scoped loading (round 3 item 1, spec §5.4.2(d))', () => {
  /** A 64 × 64 park: a snack shack near (4, 4), a big wheel near (4, 56) and an oak near (56, 4), far apart on screen. */
  function farWorld() {
    const world = createWorld({ seed: 1, parkName: 'Scope Park', mapSize: 64 });
    world.state.stalls.push({ id: 4, defId: 'snack_shack', rotation: 0, x: 4, y: 4 } as Stall);
    world.state.rides.push({ id: 5, kind: 'flat', defId: 'big_wheel', rotation: 0, x: 4, y: 56 } as Ride);
    world.state.scenery.push({ id: 6, defId: 'oak_round', rotation: 0, edge: -1, x: 56, y: 4, z: 0 } as World['state']['scenery'][number]);
    return world;
  }
  /** A 390 × 844 phone view at zoom 1 centred on map tile (x, y) at turn 0. */
  const viewAt = (x: number, y: number) => {
    const cx = (x - y) * 32;
    const cy = (x + y) * 16;
    return { x0: cx - 195, x1: cx + 195, y0: cy - 422, y1: cy + 422 };
  };
  const k2 = (kind: RealKind, item: string, rot: 0 | 1 | 2 | 3) => setKey(kind, item, 2, rot);

  it('wants the sets of objects inside the view plus one screen only; ground and guests always', () => {
    const { sets, look } = setup();
    look.prepare(farWorld(), 0, viewAt(4, 4), 1, 1);
    const now = sets.wanted('now');
    expect(now).toContain(k2('stall', 'snack_shack', 0));
    expect(now).toContain(k2('shadow', 'snack_shack', 0));
    expect(sets.wanted('ahead')).toContain(k2('stall', 'snack_shack', 1));
    for (const far of [k2('ride', 'big_wheel', 0), k2('scenery', 'oak_round', 0), k2('ride', 'big_wheel', 1)]) {
      expect(now).not.toContain(far);
      expect(sets.wanted('ahead')).not.toContain(far);
    }
    expect(now).toContain(k2('ground', 'grass', 0));
    expect(now).toContain(setKey('guest', 'b0o0', 2, 'all'));
    expect(look.scope!()).toMatchObject({ objects: 3, inScope: 1 });
    // The view moves to the big wheel: now its sets are wanted, the shack's are not.
    sets.wants = [];
    look.prepare(farWorld(), 0, viewAt(4, 56), 1, 1);
    expect(sets.wanted('now')).toContain(k2('ride', 'big_wheel', 0));
    expect(sets.wanted('now')).not.toContain(k2('stall', 'snack_shack', 0));
  });

  it('one screen of margin: an object just past the view edge is wanted, one two screens away is not', () => {
    const { sets, look } = setup();
    const world = farWorld();
    // The shack's screen point is (0, 128 + 16) at turn 0; a view one screen width to its right still wants it.
    const v = viewAt(4, 4);
    look.prepare(world, 0, { ...v, x0: v.x0 + 390 + 100, x1: v.x1 + 390 + 100 }, 1, 1);
    expect(sets.wanted('now')).toContain(k2('stall', 'snack_shack', 0));
    sets.wants = [];
    const { sets: s2, look: l2 } = setup();
    l2.prepare(world, 0, { ...v, x0: v.x0 + 3 * 390, x1: v.x1 + 3 * 390 }, 1, 1);
    expect(s2.wanted('now')).not.toContain(k2('stall', 'snack_shack', 0));
    void sets;
  });

  it('does not walk the objects each frame: only when the park\'s objects change or the view leaves the scoped rectangle', () => {
    const { look } = setup();
    const world = farWorld();
    look.prepare(world, 0, viewAt(4, 4), 1, 1);
    const walks = look.scope!().walks;
    for (let n = 0; n < 30; n++) look.prepare(world, 0, viewAt(4, 4), 1, 1);
    // A small pan stays in the rectangle (found with a quarter screen of slack).
    const v = viewAt(4, 4);
    look.prepare(world, 0, { ...v, x0: v.x0 + 40, x1: v.x1 + 40 }, 1, 1);
    expect(look.scope!().walks).toBe(walks);
    // A placement: walked again once.
    world.state.scenery.push({ id: 7, defId: 'pine_tall', rotation: 0, edge: -1, x: 5, y: 4, z: 0 } as World['state']['scenery'][number]);
    look.prepare(world, 0, viewAt(4, 4), 1, 1);
    look.prepare(world, 0, viewAt(4, 4), 1, 1);
    expect(look.scope!().walks).toBe(walks + 2); // the index, then the scope
    expect(look.scope!()).toMatchObject({ objects: 4, inScope: 2 });
    // A turn or a zoom (the view's size) finds the scope again.
    look.prepare(world, 1, viewAt(4, 4), 1, 1);
    expect(look.scope!().walks).toBe(walks + 3);
    const z = viewAt(4, 4);
    look.prepare(world, 1, { x0: z.x0 / 2, x1: z.x1 / 2, y0: z.y0 / 2, y1: z.y1 / 2 }, 2, 1);
    expect(look.scope!().walks).toBe(walks + 4);
  });

  it('a set a getter asks for that nobody wanted (outside the scope, a ghost) is wanted every frame it is drawn and not ready, with its density-2 twin', () => {
    const { sets, look } = setup();
    look.prepare(farWorld(), 0, viewAt(4, 4), 2, 2);
    sets.wants = [];
    expect(look.ride('big_wheel', 0, 0, 0)).toBeNull();
    expect(look.ride('big_wheel', 0, 0, 0)).toBeNull(); // once per set a frame
    expect(sets.wanted('now')).toEqual([setKey('ride', 'big_wheel', 2, 0), setKey('ride', 'big_wheel', 4, 0)].sort());
    // Loading: wanted again the next frame (round 3 fix 1), or endFrame would drop it.
    sets.setState(setKey('ride', 'big_wheel', 4, 0), 'loading');
    sets.setState(setKey('ride', 'big_wheel', 2, 0), 'loading');
    look.prepare(farWorld(), 0, viewAt(4, 4), 2, 2);
    sets.wants = [];
    look.ride('big_wheel', 0, 0, 0);
    expect(sets.wanted('now')).toEqual([setKey('ride', 'big_wheel', 2, 0), setKey('ride', 'big_wheel', 4, 0)].sort());
  });

  /** A real SetManager whose decodes land only when the test says (each decode can span many frames). */
  function realSets(budget: number) {
    const index = makeIndex();
    const pending: Array<() => void> = [];
    const io = {
      read: async (f: string) => new Blob([f]),
      decode: (b: Blob) => new Promise<Decoded>((res) => pending.push(() => { void b; res({ image: new PixCanvas(8, 8) as unknown as CanvasImageSource, bytes: 256, close() {} }); })),
    };
    const sets = new SetManager(index, io, budget, () => undefined);
    const look = createRealLook(index, sets, { makeCanvas: make });
    const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
    let n = 0;
    /** One renderer frame: prepare for a view far from the big wheel, ask for it (a ghost), end the frame. */
    const frame = (): Sprite | null | undefined => {
      sets.beginFrame(++n);
      look.prepare(farWorld(), 0, viewAt(4, 4), 1, 1);
      const sp = look.ride('big_wheel', 0, 0, 0);
      sets.endFrame();
      return sp;
    };
    return { sets, look, pending, flush, frame };
  }

  it('with the real set manager: a decode spanning frames for an object outside the scope lands and the object draws', async () => {
    const { pending, flush, frame } = realSets(1e9);
    const got: (Sprite | null | undefined)[] = [];
    for (let f = 0; f < 6; f++) { got.push(frame()); await flush(); }
    expect(got.every((x) => x === null)).toBe(true);
    // The decodes land after 6 frames: the set was kept wanted all along (not dropped and restarted).
    while (pending.length) { pending.shift()!(); await flush(); }
    expect(frame()).toBeTruthy();
  });

  it('with the real set manager: a set that can never fit beside what is drawn degrades to today\'s art, counted', async () => {
    // 256 B budget: the ground and guest sets take it first, so the big wheel's set (256 B) never fits.
    const { look, pending, flush, frame } = realSets(256);
    let last: Sprite | null | undefined = null;
    for (let f = 0; f < DEGRADE_FRAMES + 5; f++) {
      last = frame();
      while (pending.length) pending.shift()!();
      await flush();
    }
    expect(last).toBeUndefined();
    expect(look.degraded!()).toBe(1);
    expect(look.incomplete()).toBe(0);
  });
});

describe('RealLook: the ladder\'s last step, never nothing (round 3 item 2, spec §5.4.4)', () => {
  it('an object whose density-2 set has had no room for DEGRADE_FRAMES prepares draws today\'s art and counts as degraded', () => {
    const { sets, look } = setup();
    const key = setKey('ride', 'big_wheel', 2, 0);
    sets.setState(key, 'loading');
    sets.starvedKeys.add(key);
    for (let n = 0; n < DEGRADE_FRAMES; n++) {
      look.prepare(emptyWorld(), 0, VIEW, 1, 1);
      expect(look.ride('big_wheel', 0, 0, 0)).toBeNull();
      expect(look.incomplete()).toBe(1);
    }
    look.prepare(emptyWorld(), 0, VIEW, 1, 1);
    expect(look.ride('big_wheel', 0, 0, 0)).toBeUndefined();
    expect(look.degraded!()).toBe(1);
    expect(look.incomplete()).toBe(0);
    // Not in fallbacksUsed: the ride is baked, it only has no room now.
    expect(look.fallbacksUsed()).not.toContain('big_wheel');
    // Room again (decoding): back to not ready, then the real picture.
    sets.starvedKeys.delete(key);
    look.prepare(emptyWorld(), 0, VIEW, 1, 1);
    expect(look.ride('big_wheel', 0, 0, 0)).toBeNull();
    expect(look.degraded!()).toBe(0);
    sets.setState(key, 'ready');
    expect(look.ride('big_wheel', 0, 0, 0)).toBeTruthy();
  });

  it('at density 4 the floor is the density-2 twin: degraded only when that one cannot fit', () => {
    const { sets, look } = setup();
    const k4 = setKey('stall', 'snack_shack', 4, 0);
    const k2 = setKey('stall', 'snack_shack', 2, 0);
    sets.setState(k4, 'loading');
    sets.setState(k2, 'loading');
    sets.starvedKeys.add(k4);
    for (let n = 0; n <= DEGRADE_FRAMES; n++) look.prepare(emptyWorld(), 0, VIEW, 2, 2);
    expect(look.stall('snack_shack', 0)).toBeNull();
    sets.starvedKeys.add(k2);
    for (let n = 0; n <= DEGRADE_FRAMES; n++) { look.prepare(emptyWorld(), 0, VIEW, 2, 2); look.stall('snack_shack', 0); }
    expect(look.stall('snack_shack', 0)).toBeUndefined();
    expect(look.degraded!()).toBeGreaterThan(0);
  });

  it('a set merely waiting in the queue never degrades; ground pieces never do', () => {
    const { sets, look } = setup();
    sets.setState(setKey('ride', 'big_wheel', 2, 0), 'loading');
    sets.setState(setKey('ground', 'grass', 2, 0), 'loading');
    sets.starvedKeys.add(setKey('ground', 'grass', 2, 0));
    for (let n = 0; n < DEGRADE_FRAMES * 3; n++) {
      look.prepare(emptyWorld(), 0, VIEW, 1, 1);
      expect(look.ride('big_wheel', 0, 0, 0)).toBeNull();
      expect(look.groundPiece('grass', 0, 1, 0)).toBeNull();
    }
    expect(look.degraded!()).toBe(0);
  });

  it('a tinted sheet refused room for DEGRADE_FRAMES prepares draws the untinted picture (degraded), never nothing', () => {
    const { sets, look } = setup({ s0: [128, 128, 128, 255], m0: [255, 0, 0, 255] });
    const key = setKey('guest', 'b0o0', 2, 'all');
    sets.setState(key, 'ready');
    sets.room = 0;
    for (let n = 0; n < DEGRADE_FRAMES; n++) {
      look.prepare(emptyWorld(), 0, VIEW, 1, 1);
      expect(look.guest(0, 1, 1, 2, false)).toBeNull();
    }
    look.prepare(emptyWorld(), 0, VIEW, 1, 1);
    const sp = look.guest(0, 1, 1, 2, false)!;
    expect(sp.image).toBe(sets.images(key)[0]);
    expect(look.degraded!()).toBe(1);
    expect(look.incomplete()).toBe(0);
    // Room again: tinted.
    sets.room = Number.POSITIVE_INFINITY;
    look.prepare(emptyWorld(), 0, VIEW, 1, 1);
    expect(look.guest(0, 1, 1, 2, false)!.image).not.toBe(sets.images(key)[0]);
    expect(look.degraded!()).toBe(0);
  });
});

describe('RealLook: tinting under a per-frame budget (round 3 item 4)', () => {
  it('makes tinted sheets while the frame has budget left (at least one band), the rest draw untinted (soft) until a later frame', () => {
    const index = makeIndex();
    const sets = new FakeSets(index, { s0: [128, 128, 128, 255], m0: [255, 0, 0, 255] });
    // Every clock read moves 2 ms on, so each band measures 2 ms: a 3 ms budget takes two bands a frame.
    let t = 0;
    const look = createRealLook(index, sets, { makeCanvas: make, now: () => (t += 2) });
    expect(TINT_FRAME_MS).toBe(3);
    const key = setKey('guest', 'b0o0', 2, 'all');
    sets.setState(key, 'ready');
    const base = sets.images(key)[0];
    look.prepare(emptyWorld(), 0, VIEW, 1, 1);
    const first = [1, 2, 3, 4].map((c) => look.guest(0, c, 1, 2, false)!);
    expect(first.map((sp) => sp.image !== base)).toEqual([true, true, false, false]);
    expect(look.soft()).toBe(2);
    expect(look.incomplete()).toBe(0);
    // The two after the budget ran out are not even started (round 3 fix 3): nothing held for them yet.
    expect(sets.held.size).toBe(2);
    look.prepare(emptyWorld(), 0, VIEW, 1, 1);
    const second = [1, 2, 3, 4].map((c) => look.guest(0, c, 1, 2, false)!);
    expect(second.every((sp) => sp.image !== base)).toBe(true);
    expect(look.soft()).toBe(0);
    expect(sets.held.size).toBe(4);
  });

  it('a sheet bigger than a band is tinted over several frames; a frame draws tinted once its rows are done', () => {
    // One 512 × 512 guest sheet (4 bands of 128 rows at 64K px a band), frame at the bottom rows.
    const FRAME_LOW = { sheet: 's0', sx: 0, sy: 500, w: 8, h: 8, ox: 0, oy: 0 };
    const sheets: RealSetEntry['sheets'] = [{ file: 's0', w: 512, h: 512, mask: 'm0' }, { file: 'm0', w: 512, h: 512 }];
    const e: RealSetEntry = { key: setKey('guest', 'b0o0', 2, 'all'), kind: 'guest', item: 'b0o0', density: 2, rot: 'all', sheets, frames: { 'f2:w1': FRAME_LOW } };
    const index: RealIndex = { ...makeIndex(), sets: [e] };
    const sets = new FakeSets(index, { s0: [128, 128, 128, 255], m0: [255, 0, 0, 255] });
    let t = 0;
    // Each band measures 5 ms: over the budget at once, so one band a frame.
    const look = createRealLook(index, sets, { makeCanvas: make, now: () => (t += 5) });
    sets.setState(e.key, 'ready');
    const base = sets.images(e.key)[0];
    const images: CanvasImageSource[] = [];
    for (let f = 0; f < 5; f++) {
      look.prepare(emptyWorld(), 0, VIEW, 1, 1);
      images.push(look.guest(0, 1, 1, 2, false)!.image);
    }
    expect(images.map((im) => im === base)).toEqual([true, true, true, false, false]);
  });
});

describe('RealLook.groundReady (fix round 2, 3)', () => {
  it('says whether a ground piece would draw, with no want, no use, no count and no fallback', () => {
    const { sets, look } = setup();
    look.prepare(emptyWorld(), 0, VIEW, 1, 1);
    sets.wants = [];
    expect(look.groundReady!('grass', 0, 1, 0)).toBe(false);
    sets.setState(setKey('ground', 'grass', 2, 0), 'ready');
    expect(look.groundReady!('grass', 0, 1, 0)).toBe(true);
    expect(look.groundReady!('grass', 3, 2, 0)).toBe(false); // no such frame
    expect(sets.wants).toEqual([]);
    expect(sets.used).toEqual([]);
    expect(look.incomplete()).toBe(0);
    expect(look.fallbacksUsed()).toEqual([]);
  });
});
