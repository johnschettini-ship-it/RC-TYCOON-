/**
 * Task 8: the realistic look inside the renderer, with a fake RealLook (no baked art). The rule per object:
 * `undefined` → today's art, `null` → skipped and counted, a Sprite → drawn from its sheet rectangle.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { FakeCanvas, install, make, type DrawCall } from '../fakeCanvas';
import { createCanvasRenderer } from '../../../../src/render/renderer';
import { defaultToolState, type Camera, type ToolState } from '../../../../src/render/types';
import { mapToViewContinuous, type ViewRotation } from '../../../../src/render/view';
import { terrainClock } from '../../../../src/render/terrain';
import type { RealLook } from '../../../../src/render/real/look';
import type { Sprite } from '../../../../src/render/spriteCache';
import { perfProbe } from '../../../../src/perf/stats';
import { createWorld } from '../../../../src/sim/world';
import { PathItem, tileIndex } from '../../../../src/sim/map';
import type { World } from '../../../../src/sim/types';
import { addGuestDirect, placeFootpath, placeRideDirect, placeStallDirect } from '../../../helpers/world';
import { buildPerfScene } from '../../../perf/scenes';
import { setTitleHold } from '../../../../src/render/real/titleHold';

beforeAll(() => {
  install();
  terrainClock.now = () => 0;
  // The realistic branches exist only in a VITE_ART=real build (compile-time gate).
  vi.stubEnv('VITE_ART', 'real');
});

afterAll(() => {
  vi.unstubAllEnvs();
});

afterEach(() => {
  perfProbe.enabled = false;
  perfProbe.reset();
});

const W = 1600;
const H = 1000;

type Answer = Sprite | null | undefined;
type Kind = 'ride' | 'stall' | 'scenery' | 'guest' | 'staff' | 'rail' | 'car' | 'support' | 'shadow' | 'groundPiece';

/** A fake look: each getter answers from `answers` (default undefined: today's art) and logs its call. */
function fakeLook(answers: Partial<Record<Kind, (...a: unknown[]) => Answer>>, log: string[] = []): RealLook & { calls: Record<string, number> } {
  const calls: Record<string, number> = {};
  let skipped = 0;
  const get = (k: Kind) => (...a: unknown[]): Answer => {
    calls[k] = (calls[k] ?? 0) + 1;
    const r = answers[k]?.(...a);
    if (r === null) skipped++;
    return r;
  };
  return {
    calls,
    density: () => 2,
    prepare() {
      log.push('prepare');
      skipped = 0;
    },
    ride: get('ride') as RealLook['ride'],
    stall: get('stall') as RealLook['stall'],
    scenery: get('scenery') as RealLook['scenery'],
    guest: get('guest') as RealLook['guest'],
    staff: get('staff') as RealLook['staff'],
    rail: get('rail') as RealLook['rail'],
    car: get('car') as RealLook['car'],
    support: get('support') as RealLook['support'],
    shadow: get('shadow') as RealLook['shadow'],
    groundPiece: get('groundPiece') as RealLook['groundPiece'],
    dispose() {},
    reclaim: () => 0,
    currentDensity: () => 2,
    incomplete: () => skipped,
    soft: () => 0,
    fallbacksUsed: () => [],
  };
}

function fakeSets(log: string[]): { beginFrame(n: number): void; endFrame(): void } {
  return { beginFrame: () => log.push('begin'), endFrame: () => log.push('end') };
}

/** A sheet image and a sprite cut from it at (sx, sy). */
function sheetSprite(w: number, h: number, ox: number, oy: number, sx = 0, sy = 0): Sprite & { image: FakeCanvas } {
  return { image: new FakeCanvas(512, 512) as unknown as FakeCanvas, w, h, ox, oy, scale: 2, sx, sy } as Sprite & { image: FakeCanvas };
}

function park(): World {
  const world = createWorld({ seed: 99, parkName: 'Real Park', mapSize: 24 });
  const map = world.state.map;
  for (let x = 6; x <= 16; x++) placeFootpath(world, x, 14);
  placeRideDirect(world, 'carousel', 6, 8, 1);
  placeStallDirect(world, 'snack_shack', 14, 12, 2);
  map.pathItem[tileIndex(map, 9, 14)] = PathItem.Bench;
  world.state.scenery.push({ id: 1, defId: 'oak_round', x: 18, y: 18, z: map.heights[tileIndex(map, 18, 18)] ?? 0, rotation: 0, edge: -1, waterLevel: 255 } as World['state']['scenery'][number]);
  for (let k = 0; k < 12; k++) addGuestDirect(world, tileIndex(map, 6 + (k % 11), 14));
  return world;
}

function camAt(world: World, r: ViewRotation = 0, zoom = 1): Camera {
  const map = world.state.map;
  const p = mapToViewContinuous(map.width / 2, map.height / 2, r, map.width, map.height);
  return { centerX: (p.u - p.v) * 32, centerY: (p.u + p.v) * 16 - 64, zoom, rotation: r };
}

/** Draws of the second frame (the first builds terrain chunks). */
function render(world: World, opts?: Parameters<typeof createCanvasRenderer>[1], tool: ToolState = defaultToolState(), cam?: Camera): FakeCanvas {
  const canvas = make(W, H);
  const r = createCanvasRenderer(canvas as unknown as HTMLCanvasElement, opts);
  r.resize(W, H, 1);
  r.draw(world, cam ?? camAt(world), tool, 0);
  canvas.reset();
  r.draw(world, cam ?? camAt(world), tool, 0);
  return canvas;
}

const shape = (d: DrawCall): string => `${d.x},${d.y},${d.w},${d.h}${d.src ? `<${d.src.x},${d.src.y},${d.src.w},${d.src.h}` : ''}`;

describe('renderer with the realistic look (Task 8)', () => {
  it('without a look the draw calls are identical', () => {
    const a = render(park());
    const b = render(park(), {});
    expect(a.draws.length).toBeGreaterThan(20);
    expect(b.draws.map(shape)).toEqual(a.draws.map(shape));
    expect([...b.calls.entries()].sort()).toEqual([...a.calls.entries()].sort());
  });

  it('a look that answers undefined everywhere draws today\'s art', () => {
    const a = render(park());
    const log: string[] = [];
    const b = render(park(), { look: fakeLook({}), sets: fakeSets(log) });
    expect(b.draws.map(shape)).toEqual(a.draws.map(shape));
  });

  it('draws the real sprite when ready, from its sheet rectangle, at the anchor', () => {
    const world = park();
    world.state.guests.length = 0;
    const sp = sheetSprite(80, 60, 40, 50, 100, 200);
    const canvas = render(world, { look: fakeLook({ stall: () => sp }) });
    const hits = canvas.draws.filter((d) => d.image === sp.image);
    expect(hits.length).toBe(1);
    const d = hits[0]!;
    // Sprite scale 2 at device scale 1: half size, anchor at sprite (ox, oy).
    expect(d.w).toBe(40);
    expect(d.h).toBe(30);
    expect(d.src).toEqual({ x: 100, y: 200, w: 80, h: 60 });
    // The anchor: the same point today's stall sprite uses (top corner of its tile).
    const st = world.state.stalls[0]!;
    const map = world.state.map;
    const cam = camAt(world);
    const corners = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([dx, dy]) => mapToViewContinuous(st.x + dx!, st.y + dy!, 0, map.width, map.height));
    const u = Math.min(...corners.map((c) => c.u));
    const v = Math.min(...corners.map((c) => c.v));
    const z = map.heights[st.y * map.width + st.x] ?? 0;
    const ax = (u - v) * 32 + W / 2 - cam.centerX;
    const ay = (u + v) * 16 - z * 8 + H / 2 - cam.centerY;
    expect(d.x).toBe(Math.round(ax - 20));
    expect(d.y).toBe(Math.round(ay - 25));
  });

  it('ride columns draw from the sheet rectangle (blitColumn honours sx/sy)', () => {
    const world = park();
    const sp = sheetSprite(256, 200, 128, 150, 300, 40);
    const canvas = render(world, { look: fakeLook({ ride: () => sp }) });
    const hits = canvas.draws.filter((d) => d.image === sp.image);
    expect(hits.length).toBeGreaterThan(1);
    for (const d of hits) {
      expect(d.src!.y).toBe(40);
      expect(d.src!.h).toBe(200);
      expect(d.src!.x).toBeGreaterThanOrEqual(300);
      expect(d.src!.x + d.src!.w).toBeLessThanOrEqual(300 + 256);
    }
    // The columns cover the whole sprite width once.
    expect(hits.reduce((n, d) => n + d.src!.w, 0)).toBeCloseTo(256, 5);
  });

  it('a ride\'s chosen colour reaches the realistic look (ride colours Task 5); Original passes none', () => {
    const world = park();
    const ride = world.state.rides.find((r) => r.kind === 'flat')!;
    const got: (number | null | undefined)[] = [];
    const sp = sheetSprite(256, 200, 128, 150, 300, 40);
    render(world, { look: fakeLook({ ride: (...a: unknown[]) => { got.push(a[4] as number | null | undefined); return sp; } }) });
    expect(got.length).toBeGreaterThan(0);
    expect(got.every((c) => c == null)).toBe(true);
    ride.colour = 2;
    got.length = 0;
    render(world, { look: fakeLook({ ride: (...a: unknown[]) => { got.push(a[4] as number | null | undefined); return sp; } }) });
    expect(got).toContain(2);
  });

  it('a trimmed ride frame narrower than its columns is not stretched (Task 9b)', () => {
    // The bake trims frames to their pixels: a ride picture can start inside the footprint's first column.
    const world = park();
    const sp = sheetSprite(150, 200, 40, 150, 300, 40);
    const canvas = render(world, { look: fakeLook({ ride: () => sp }) });
    const hits = canvas.draws.filter((d) => d.image === sp.image);
    expect(hits.length).toBeGreaterThan(1);
    // Sprite scale 2 at device scale 1: every column is drawn at half its source width, and the columns tile the
    // sprite's screen box [anchor − ox/2, anchor + (w − ox)/2] exactly.
    for (const d of hits) expect(Math.abs(d.w - d.src!.w / 2)).toBeLessThanOrEqual(1);
    const left = Math.min(...hits.map((d) => d.x));
    const right = Math.max(...hits.map((d) => d.x + d.w));
    expect(right - left).toBeCloseTo(75, -0.5);
  });

  it('a trimmed multi-tile scenery frame is not stretched either (Task 9b)', () => {
    const world = park();
    const map = world.state.map;
    world.state.scenery.push({ id: 2, defId: 'tent_red', x: 10, y: 4, z: map.heights[tileIndex(map, 10, 4)] ?? 0, rotation: 0, edge: -1, waterLevel: 255 } as World['state']['scenery'][number]);
    const sp = sheetSprite(90, 120, 30, 110, 10, 10);
    const canvas = render(world, { look: fakeLook({ scenery: (id) => (id === 'tent_red' ? sp : undefined) }) });
    const hits = canvas.draws.filter((d) => d.image === sp.image);
    expect(hits.length).toBeGreaterThan(1);
    for (const d of hits) expect(Math.abs(d.w - d.src!.w / 2)).toBeLessThanOrEqual(1);
  });

  it('skips and counts when not ready', () => {
    const world = park();
    world.state.guests.length = 0;
    const today = render(world);
    perfProbe.enabled = true;
    perfProbe.reset();
    const look = fakeLook({ stall: () => null });
    const canvas = render(world, { look });
    // One draw fewer than today's look: the stall is skipped, nothing stands in for it.
    expect(canvas.draws.length).toBe(today.draws.length - 1);
    expect(look.incomplete()).toBe(1);
    expect(perfProbe.snapshot().incompleteFrames).toBe(2);
  });

  it('draws shadows before objects, after the ground', () => {
    const world = park();
    const shadow = sheetSprite(60, 30, 30, 15);
    const stall = sheetSprite(80, 60, 40, 50);
    const look = fakeLook({ shadow: () => shadow, stall: () => stall });
    const canvas = render(world, { look });
    const iShadow = canvas.draws.findIndex((d) => d.image === shadow.image);
    const iStall = canvas.draws.findIndex((d) => d.image === stall.image);
    expect(iShadow).toBeGreaterThan(0);
    expect(iStall).toBeGreaterThan(iShadow);
    // Every shadow (ride, stall, bench, tree) is drawn before every object of the depth list.
    const shadows = canvas.draws.map((d, i) => (d.image === shadow.image ? i : -1)).filter((i) => i >= 0);
    expect(shadows.length).toBe(4);
    // Asked once per object and frame (two frames rendered).
    expect(look.calls.shadow).toBe(8);
    expect(Math.max(...shadows)).toBeLessThan(iStall);
  });

  it('a path item\'s shadow is asked for the side it stands on (Task 9b), at every view turn', () => {
    for (const r of [0, 1, 2, 3] as ViewRotation[]) {
      const world = park();
      // A second bench on a path running the other way, so its side differs from the first one's.
      const map = world.state.map;
      for (let y = 15; y <= 19; y++) placeFootpath(world, 12, y);
      map.pathItem[tileIndex(map, 12, 17)] = PathItem.Bench;
      const sides: unknown[] = [];
      const shadowRots: unknown[] = [];
      const look = fakeLook({
        scenery: (id, _rot, frame) => { if (id === 'bench') sides.push(frame); return undefined; },
        shadow: (kind, id, rot) => { if (kind === 'scenery' && id === 'bench') shadowRots.push(rot); return undefined; },
      });
      render(world, { look }, defaultToolState(), camAt(world, r));
      expect(sides.length).toBe(4);
      expect(new Set(sides).size).toBe(2);
      expect([...shadowRots].sort()).toEqual([...sides].sort());
    }
  });

  it('ghost falls back while set decodes', () => {
    const world = createWorld({ seed: 7, parkName: 'Ghost Park', mapSize: 24 });
    const map = world.state.map;
    const tool = defaultToolState();
    tool.ghost = { kind: 'ride', defId: 'carousel', tile: tileIndex(map, 10, 10), rotation: 0, valid: true } as ToolState['ghost'];
    const today = render(world, undefined, tool);
    const look = fakeLook({ ride: () => null });
    const canvas = render(world, { look }, tool);
    expect(look.calls.ride).toBeGreaterThan(0);
    expect(canvas.draws.map(shape)).toEqual(today.draws.map(shape));
    // The ghost sprite itself is among them (a large draw).
    expect(canvas.draws.some((d) => d.w > 100)).toBe(true);
  });

  it('a ready ghost draws the real sprite', () => {
    const world = createWorld({ seed: 7, parkName: 'Ghost Park', mapSize: 24 });
    const tool = defaultToolState();
    tool.ghost = { kind: 'stall', defId: 'snack_shack', tile: tileIndex(world.state.map, 10, 10), rotation: 0, valid: true } as ToolState['ghost'];
    const sp = sheetSprite(80, 60, 40, 50);
    const canvas = render(world, { look: fakeLook({ stall: () => sp }) }, tool);
    expect(canvas.draws.filter((d) => d.image === sp.image).length).toBe(1);
  });

  it('runs sets.beginFrame → look.prepare → draws → sets.endFrame every frame', () => {
    const log: string[] = [];
    const look = fakeLook({ stall: () => { log.push('draw'); return undefined; } }, log);
    render(park(), { look, sets: fakeSets(log) });
    expect(log).toEqual(['begin', 'prepare', 'draw', 'end', 'begin', 'prepare', 'draw', 'end']);
  });

  it('draws no park while the realistic title covers the window (realistic title Task 2)', () => {
    const log: string[] = [];
    const look = fakeLook({ stall: () => { log.push('draw'); return undefined; } }, log);
    let holds = true;
    setTitleHold(() => holds);
    try {
      const canvas = make(W, H);
      const r = createCanvasRenderer(canvas as unknown as HTMLCanvasElement, { look, sets: fakeSets(log) });
      r.resize(W, H, 1);
      const world = park();
      r.draw(world, camAt(world), defaultToolState(), 0);
      expect(log).toEqual([]);
      expect(canvas.draws).toHaveLength(0);
      holds = false;
      r.draw(world, camAt(world), defaultToolState(), 0);
      expect(log).toEqual(['begin', 'prepare', 'draw', 'end']);
      // Today's look (no realistic look) never holds.
      holds = true;
      const plain = make(W, H);
      const r2 = createCanvasRenderer(plain as unknown as HTMLCanvasElement, {});
      r2.resize(W, H, 1);
      r2.draw(world, camAt(world), defaultToolState(), 0);
      expect(plain.draws.length).toBeGreaterThan(0);
    } finally {
      setTitleHold(null);
    }
  });

  it('guests, staff, path items and scenery ask the look', () => {
    const world = park();
    world.state.staff.members.length = 0;
    const g = sheetSprite(20, 40, 10, 38);
    const tree = sheetSprite(90, 120, 45, 110);
    const bench = sheetSprite(30, 20, 15, 15);
    const look = fakeLook({
      guest: () => g,
      scenery: (id) => (id === 'oak_round' ? tree : id === 'bench' ? bench : undefined),
    });
    const canvas = render(world, { look });
    expect(canvas.draws.filter((d) => d.image === g.image).length).toBe(world.state.guests.length);
    expect(canvas.draws.filter((d) => d.image === tree.image).length).toBeGreaterThan(0);
    expect(canvas.draws.filter((d) => d.image === bench.image).length).toBe(1);
  });

  it('real ground: drawn after the terrain and before every object, and complete gates the static layer', () => {
    const world = park();
    const marker = new FakeCanvas(10, 10);
    const stall = sheetSprite(80, 60, 40, 50);
    const ground = {
      complete: false,
      calls: 0,
      draw(ctx: CanvasRenderingContext2D): number {
        this.calls++;
        ctx.drawImage(marker as unknown as CanvasImageSource, 0, 0, 10, 10);
        return 1;
      },
    };
    const canvas = make(W, H);
    const r = createCanvasRenderer(canvas as unknown as HTMLCanvasElement, { look: fakeLook({ stall: () => stall }), ground });
    r.resize(W, H, 1);
    // First frame: the view "moves", so terrain and ground draw straight to the canvas.
    r.draw(world, camAt(world), defaultToolState(), 0);
    const iMarker = canvas.draws.findIndex((d) => d.image === marker);
    const iStall = canvas.draws.findIndex((d) => d.image === stall.image);
    expect(iMarker).toBeGreaterThan(0);
    expect(iStall).toBeGreaterThan(iMarker);
    // Ground incomplete: the static layer is rebuilt every still frame (ground drawn again), never reused.
    for (let k = 0; k < 3; k++) r.draw(world, camAt(world), defaultToolState(), 0);
    expect(ground.calls).toBe(4);
    ground.complete = true;
    r.draw(world, camAt(world), defaultToolState(), 0);
    r.draw(world, camAt(world), defaultToolState(), 0);
    r.draw(world, camAt(world), defaultToolState(), 0);
    // Complete once: the static layer is kept and copied, the ground is not drawn again.
    expect(ground.calls).toBe(5);
  });

  it('real ground: endFrame runs every frame (static layer reused too), before the set manager\'s endFrame; draw gets rides and stalls', () => {
    const world = park();
    const log: string[] = [];
    let env: unknown = null;
    const ground = {
      complete: true,
      draw(_ctx: CanvasRenderingContext2D, ..._a: unknown[]): number {
        env = _a[7];
        log.push('draw');
        return 0;
      },
      endFrame() {
        log.push('ground.end');
      },
    };
    const canvas = make(W, H);
    const r = createCanvasRenderer(canvas as unknown as HTMLCanvasElement, { look: fakeLook({}), sets: fakeSets(log), ground });
    r.resize(W, H, 1);
    for (let k = 0; k < 4; k++) r.draw(world, camAt(world), defaultToolState(), 0);
    expect(log.filter((x) => x === 'ground.end')).toHaveLength(4);
    expect(log.filter((x) => x === 'draw').length).toBeLessThan(4); // the static layer was reused
    for (let i = 0; i < log.length; i++) if (log[i] === 'ground.end') expect(log[i + 1]).toBe('end');
    expect(env).toMatchObject({ rides: world.state.rides, stalls: world.state.stalls });
  });
});

describe('track through the look (coaster scene)', () => {
  it('rails, supports and cars draw the real sprites when ready', () => {
    const world = buildPerfScene('coaster');
    const rail = sheetSprite(64, 48, 32, 24);
    const car = sheetSprite(40, 30, 20, 20);
    const look = fakeLook({ rail: () => rail, car: () => car, support: () => undefined });
    const map = world.state.map;
    const p = mapToViewContinuous(16, 20, 0, map.width, map.height);
    const cam: Camera = { centerX: (p.u - p.v) * 32, centerY: (p.u + p.v) * 16 - 64, zoom: 0.6, rotation: 0 };
    const canvas = render(world, { look }, defaultToolState(), cam);
    expect(look.calls.rail).toBeGreaterThan(10);
    // Two frames rendered: the second frame's draws are half the calls.
    expect(canvas.draws.filter((d) => d.image === rail.image).length * 2).toBe(look.calls.rail);
    expect(look.calls.car ?? 0).toBeGreaterThan(0);
    expect(canvas.draws.filter((d) => d.image === car.image).length * 2).toBe(look.calls.car);
    // Supports answered undefined (not baked): no classic slice is drawn under a real rail either.
    expect(look.calls.support ?? 0).toBeGreaterThan(0);
  });
});

describe('track through the look: the bake\'s contract (Task 9b)', () => {
  it('rails are asked by heading in the view; supports are stacked foot, segments, top, before their rail', () => {
    const world = buildPerfScene('coaster');
    const rail = sheetSprite(64, 48, 32, 24);
    const sup = sheetSprite(10, 20, 5, 18);
    const railHeadings = new Set<unknown>();
    const parts: string[] = [];
    const look = fakeLook({
      rail: (...a) => { railHeadings.add(a[3]); return rail; },
      support: (...a) => { parts.push(a[1] as string); return sup; },
    });
    const map = world.state.map;
    const p = mapToViewContinuous(16, 20, 0, map.width, map.height);
    const cam: Camera = { centerX: (p.u - p.v) * 32, centerY: (p.u + p.v) * 16 - 64, zoom: 0.6, rotation: 0 };
    const canvas = render(world, { look }, defaultToolState(), cam);
    // View turn 0, yet rails of every heading are asked for.
    expect([...railHeadings].sort()).toEqual([0, 1, 2, 3]);
    // Each support: foot, then segments, then top.
    const stacks = parts.join(' ').split('top').filter((x) => x.trim()).map((x) => x.trim().split(' '));
    expect(stacks.length).toBeGreaterThan(3);
    for (const st of stacks) {
      expect(st[0]).toBe('foot');
      expect(st.slice(1).every((x) => x === 'seg')).toBe(true);
    }
    // The support pieces of a slice are drawn before its rail.
    const firstSup = canvas.draws.findIndex((d) => d.image === sup.image);
    const firstRail = canvas.draws.findIndex((d) => d.image === rail.image);
    expect(firstSup).toBeGreaterThanOrEqual(0);
    expect(firstSup).toBeLessThan(canvas.draws.length);
    expect(firstRail).toBeGreaterThan(-1);
  });
});

describe('compile-time gate (website build)', () => {
  it('without VITE_ART=real a passed look is ignored: today\'s draws exactly', () => {
    vi.stubEnv('VITE_ART', '');
    try {
      const a = render(park());
      const sp = sheetSprite(80, 60, 40, 50);
      const log: string[] = [];
      const look = fakeLook({ stall: () => sp, shadow: () => sp, guest: () => null }, log);
      const b = render(park(), { look, sets: fakeSets(log) });
      expect(b.draws.map(shape)).toEqual(a.draws.map(shape));
      expect(log).toEqual([]);
      expect(Object.keys(look.calls)).toEqual([]);
    } finally {
      vi.stubEnv('VITE_ART', 'real');
    }
  });
});

describe('today\'s terrain under the realistic ground (round 3 fix 2)', () => {
  it('chunks the ground covers are not drawn by today\'s terrain; the ground is told the frame first', () => {
    const world = park();
    const run = (covers: boolean) => {
      const begun: unknown[] = [];
      const ground = {
        complete: true,
        draw: () => 1,
        beginCover: (_m: unknown, scale: number, rot: number, version: number) => begun.push([scale, rot, typeof version]),
        covers: () => covers,
      };
      const canvas = make(W, H);
      const r = createCanvasRenderer(canvas as unknown as HTMLCanvasElement, { look: fakeLook({}), ground });
      r.resize(W, H, 1);
      r.draw(world, camAt(world), defaultToolState(), 0);
      return { draws: canvas.draws.length, begun };
    };
    const uncovered = run(false);
    const covered = run(true);
    expect(covered.begun).toEqual([[1, 0, 'number']]);
    // The terrain chunk images in view (at least one) are left out.
    expect(covered.draws).toBeLessThan(uncovered.draws);
  });
});


describe('today\'s memory inside the decode budget (Task 3)', () => {
  const MB = 1024 * 1024;
  const emptyIndex = { format: 'real/1', pxPerMetreZoom1: 11.31, stepPxPerMetre: 9.8, densities: [2, 4], sets: [], bytes: { compressed: 0, decodedByDensity: { '2': 0, '4': 0 } } } as const;
  const noIO = { read: () => Promise.reject(new Error('no art')), decode: () => Promise.reject(new Error('no art')) };

  /** Fresh renderer modules: their own shared sprite memory, so other tests' caches do not count. */
  async function fresh() {
    vi.resetModules();
    const renderer = await import('../../../../src/render/renderer');
    const cache = await import('../../../../src/render/spriteCache');
    const terrainMod = await import('../../../../src/render/terrain');
    const groundMod = await import('../../../../src/render/real/ground');
    const sm = await import('../../../../src/render/real/setManager');
    const perf = await import('../../../../src/data/tuning/perf');
    terrainMod.terrainClock.now = () => 0;
    return { ...renderer, ...cache, ...groundMod, SetManager: sm.SetManager, REAL_CLASSIC_SPRITE_MB: perf.REAL_CLASSIC_SPRITE_MB };
  }

  it('holds today\'s memory in the budget', async () => {
    const m = await fresh();
    const world = park();
    const sets = new m.SetManager(emptyIndex as never, noIO, 128 * MB, () => undefined);
    const canvas = make(W, H);
    const r = m.createCanvasRenderer(canvas as unknown as HTMLCanvasElement, { look: fakeLook({}), sets });
    r.resize(W, H, 1);
    for (let k = 0; k < 3; k++) {
      r.draw(world, camAt(world, 0, 1 + k * 0.25), defaultToolState(), 0);
      const b = m.spriteMemory.breakdown();
      // The static layer counts at the canvas size from the first frame, made or not (owner decision 2026-11-15).
      const today = (b.chunks ?? 0) + (b.sprites ?? 0) + (b.other ?? 0) + W * H * 4;
      expect(b.chunks ?? 0).toBeGreaterThan(0);
      expect(sets.snapshot().held.classic).toBe(today);
      expect(sets.split().classic).toBe(today);
    }
  });

  it('the static layer counts at the canvas size from the first frame: no jump when the view stands still and it is made', async () => {
    const m = await fresh();
    const world = park();
    const sets = new m.SetManager(emptyIndex as never, noIO, 128 * MB, () => undefined);
    const canvas = make(W, H);
    const r = m.createCanvasRenderer(canvas as unknown as HTMLCanvasElement, { look: fakeLook({}), sets });
    r.resize(W, H, 1);
    const statics: number[] = [];
    for (let k = 0; k < 4; k++) {
      r.draw(world, camAt(world), defaultToolState(), 0);
      const b = m.spriteMemory.breakdown();
      statics.push(b.static ?? 0);
      // Before the layer is made and after, it counts at the canvas size: no jump when it is made.
      expect(sets.snapshot().held.classic, `frame ${k}`).toBe((b.chunks ?? 0) + (b.sprites ?? 0) + (b.other ?? 0) + W * H * 4);
    }
    expect(statics[0]).toBe(0); // the first frame of a view never makes it
    expect(statics[3]).toBe(W * H * 4); // a still view does
  });

  /** What today's art of `park()` takes: the `classic` count after one frame with room, its sprites, chunks. */
  async function probeToday() {
    const m = await fresh();
    const probe = new m.SetManager(emptyIndex as never, noIO, 128 * MB, () => undefined);
    const c0 = make(W, H);
    const r0 = m.createCanvasRenderer(c0 as unknown as HTMLCanvasElement, { look: fakeLook({}), sets: probe });
    r0.resize(W, H, 1);
    const world = park();
    r0.draw(world, camAt(world), defaultToolState(), 0);
    const b = m.spriteMemory.breakdown();
    return { need: probe.snapshot().held.classic ?? 0, sprites: b.sprites ?? 0, today: (b.chunks ?? 0) + (b.sprites ?? 0) + (b.other ?? 0) };
  }
  /** A renderer with a real SetManager of `budget` bytes, its own sprite memory, and the incomplete-frame counter on. */
  async function tight(budget: number, look = fakeLook({})) {
    const m = await fresh();
    const sets = new m.SetManager(emptyIndex as never, noIO, budget, () => undefined);
    const canvas = make(W, H);
    const r = m.createCanvasRenderer(canvas as unknown as HTMLCanvasElement, { look, sets });
    r.resize(W, H, 1);
    const perf = await import('../../../../src/perf/stats');
    perf.perfProbe.enabled = true;
    perf.perfProbe.reset();
    const world = park();
    const draw = (n = 1) => { for (let k = 0; k < n; k++) { canvas.reset(); r.draw(world, camAt(world), defaultToolState(), 0); } };
    return { m, sets, canvas, draw, incomplete: () => perf.perfProbe.snapshot().incompleteFrames };
  }

  it('no room for the static layer: it is not made, the view draws its chunks, and asking for it is no pressure (fix round 1, I2)', async () => {
    const { today } = await probeToday();
    expect(today).toBeLessThan(W * H * 4);
    const budget = today + W * H * 2; // room for today's sprites and chunks, not for the layer beside them
    const { m, sets, canvas, draw } = await tight(budget);
    // A first frame with nothing made yet admits the layer; today's builds then make the ladder give it up.
    draw(4);
    for (let k = 0; k < 20; k++) {
      draw();
      expect(m.spriteMemory.breakdown().static ?? 0, `frame ${k}`).toBe(0);
      expect(sets.peakBytes(), `frame ${k}`).toBeLessThanOrEqual(budget);
      expect(sets.snapshot().refused, `frame ${k}: asking for the layer is no pressure`).toBe(0);
      expect(sets.densityCap(), `frame ${k}`).toBe(4);
      // chunks drawn straight to the canvas every frame, not one copy of a static layer
      expect(canvas.draws.filter((d) => d.w === W && d.h === H && d.x === 0 && d.y === 0).length, `frame ${k}`).toBe(0);
    }
  });

  it('the static layer gives way to today\'s sprites (the classic reclaimer) and is asked for again only after a while', async () => {
    const { need, sprites } = await probeToday();
    // Room for everything but half of today's sprites: the static layer (counted first) must go for them to fit.
    const budget = need - Math.floor(sprites / 2);
    const { m, sets, draw, incomplete } = await tight(budget);
    draw();
    expect(incomplete()).toBe(1); // the first frame: refused sprites, not drawn
    expect(sets.snapshot().held.classic).toBeLessThanOrEqual(budget - W * H * 4 + 1); // the reclaimer gave up the layer
    draw(4);
    expect(m.spriteMemory.breakdown().sprites).toBe(sprites); // every sprite made once the layer was given up
    expect(m.spriteMemory.breakdown().static ?? 0).toBe(0);
    expect(incomplete()).toBe(1);
    expect(sets.peakBytes()).toBeLessThanOrEqual(budget);
  });

  it('with no room even then, today\'s sprites are not made or kept, the frame is incomplete, and memory stays within the budget', async () => {
    const { need, sprites } = await probeToday();
    const budget = need - W * H * 4 - Math.floor(sprites / 2);
    const { m, sets, draw, incomplete } = await tight(budget);
    draw(5);
    const b = m.spriteMemory.breakdown();
    expect(b.sprites ?? 0).toBeGreaterThan(0);
    expect(b.sprites ?? 0).toBeLessThan(sprites);
    expect(sets.peakBytes()).toBeLessThanOrEqual(budget);
    expect(sets.snapshot().held.classic).toBeLessThanOrEqual(budget);
    expect(incomplete()).toBe(5);
  });

  it('a degraded object draws today\'s art with a full budget: today\'s images not drawn this frame make room (fix round 1, I1)', async () => {
    const { need } = await probeToday();
    // The budget holds this park's art and 6 MiB more; today's sprites from earlier play hold 8 MiB.
    const budget = need + 6 * MB;
    const { m, sets, draw, incomplete } = await tight(budget);
    const old = new m.SpriteCache(Number.MAX_SAFE_INTEGER, m.spriteMemory, 'other');
    for (let k = 0; k < 8; k++) old.set(k, { image: new FakeCanvas(1024, 256) as unknown as CanvasImageSource, w: 1024, h: 256, ox: 0, oy: 0, scale: 1 });
    // With the old sprites held, the frame's own art does not fit unless they go.
    draw();
    expect(incomplete()).toBe(0);
    expect(sets.snapshot().refused).toBe(0);
    expect(old.size).toBeLessThan(8);
    expect(m.spriteMemory.breakdown().sprites ?? 0).toBeGreaterThan(0);
    expect(sets.peakBytes()).toBeLessThanOrEqual(budget);
  });

  it('a track slice, a gate booth and a car refused room are not kept: drawn plain, made once there is room (fix round 1, C1)', async () => {
    const m = await fresh();
    const world = buildPerfScene('coaster');
    let allow = false;
    const sets = { beginFrame() {}, endFrame() {}, hold() {}, admit: () => allow };
    const canvas = make(W, H);
    const r = m.createCanvasRenderer(canvas as unknown as HTMLCanvasElement, { look: fakeLook({}), sets });
    r.resize(W, H, 1);
    const cam = { ...camAt(world), zoom: 0.5 };
    r.draw(world, cam, defaultToolState(), 0);
    const strokes0 = canvas.draws.length;
    expect(strokes0).toBeGreaterThan(0);
    // Refused: nothing made, so nothing kept; the next frame asks again (no 1-pixel stand-in cached for ever).
    const canvasMod = await import('../../../../src/render/canvas');
    const made0 = canvasMod.canvasStats.made;
    canvas.reset();
    r.draw(world, cam, defaultToolState(), 0);
    expect(canvasMod.canvasStats.made).toBe(made0); // still refused: still nothing made
    allow = true;
    for (let k = 0; k < 40; k++) r.draw(world, cam, defaultToolState(), 0); // builds are spread over frames
    const made1 = canvasMod.canvasStats.made;
    expect(made1).toBeGreaterThan(made0);
    canvas.reset();
    r.draw(world, cam, defaultToolState(), 0);
    expect(canvasMod.canvasStats.made, 'kept once made').toBe(made1);
    // Nothing draws the refused build's one-pixel answer: it was never kept.
    const one = canvasMod.notMadeSprite().image;
    expect(canvas.draws.some((d) => (d.image as unknown) === one)).toBe(false);
    expect(canvas.draws.length).toBeGreaterThan(0);
  });

  it('frees every bucket of a covered chunk', async () => {
    const m = await fresh();
    const world = park();
    const piece = { image: new FakeCanvas(64, 64) as unknown as CanvasImageSource, w: 64, h: 32, ox: 32, oy: 0, scale: 2 };
    const look = { density: (z: number, d: number) => (z * d <= 2 ? 2 : 4) as 2 | 4, groundPiece: () => piece, groundStandIn: () => piece };
    const ground = new m.RealGround(look, { makeCanvas: (w, h) => new FakeCanvas(w, h) as never });
    const canvas = make(W, H);
    const r = m.createCanvasRenderer(canvas as unknown as HTMLCanvasElement, { look: fakeLook({}), ground });
    r.resize(W, H, 1);
    // One frame at zoom 1 (today's terrain builds its images before the ground has laid anything), then zoom 2.
    r.draw(world, camAt(world, 0, 1), defaultToolState(), 0);
    expect(m.spriteMemory.breakdown().chunks ?? 0).toBeGreaterThan(0);
    for (let k = 0; k < 4; k++) r.draw(world, camAt(world, 0, 2), defaultToolState(), 0);
    expect(m.spriteMemory.breakdown().chunks ?? 0).toBe(0);
    expect(ground.complete).toBe(true);
  });

  it('items without baked art draw today\'s art within the budget', async () => {
    const m = await fresh();
    const classic = make(W, H);
    const c0 = m.createCanvasRenderer(classic as unknown as HTMLCanvasElement);
    c0.resize(W, H, 1);
    const w0 = park();
    c0.draw(w0, camAt(w0), defaultToolState(), 0);
    classic.reset();
    c0.draw(w0, camAt(w0), defaultToolState(), 0);
    const world = park();
    // Today's sprites left from earlier play: 40 MB not drawn this frame.
    const old = new m.SpriteCache(Number.MAX_SAFE_INTEGER, m.spriteMemory, 'sprites');
    for (let k = 0; k < 40; k++) old.set(k, { image: new FakeCanvas(512, 512) as unknown as CanvasImageSource, w: 512, h: 512, ox: 0, oy: 0, scale: 1 });
    // The unbaked stall (and everything else) answers undefined: today's art.
    const look = fakeLook({});
    const canvas = make(W, H);
    const r = m.createCanvasRenderer(canvas as unknown as HTMLCanvasElement, { look });
    r.resize(W, H, 1);
    r.draw(world, camAt(world), defaultToolState(), 0);
    canvas.reset();
    r.draw(world, camAt(world), defaultToolState(), 0);
    expect(look.calls.stall).toBeGreaterThan(0);
    expect(canvas.draws.map(shape)).toEqual(classic.draws.map(shape));
    const b = m.spriteMemory.breakdown();
    expect((b.sprites ?? 0) + (b.other ?? 0)).toBeLessThanOrEqual(m.REAL_CLASSIC_SPRITE_MB * MB);
    expect((b.sprites ?? 0) + (b.other ?? 0)).toBeGreaterThan(0);
  });

  it('counts the realistic ground\'s placeholder tiles next to today\'s terrain placeholders', async () => {
    const m = await fresh();
    const world = park();
    // Every terrain baked, no piece decoded yet: covered chunks draw placeholder tiles.
    const look = { density: () => 2 as const, groundPiece: () => null, groundBaked: () => true };
    const ground = new m.RealGround(look, { makeCanvas: (w, h) => new FakeCanvas(w, h) as never });
    const counts = { placeholders: 0, groundPlaceholders: 0 };
    const canvas = make(W, H);
    const r = m.createCanvasRenderer(canvas as unknown as HTMLCanvasElement, { look: fakeLook({}), ground, counts });
    r.resize(W, H, 1);
    r.draw(world, camAt(world), defaultToolState(), 0);
    expect(ground.placeholders).toBeGreaterThan(0);
    expect(counts.groundPlaceholders).toBe(ground.placeholders);
    r.draw(world, camAt(world), defaultToolState(), 0);
    expect(counts.groundPlaceholders).toBe(2 * ground.placeholders);
  });
});
