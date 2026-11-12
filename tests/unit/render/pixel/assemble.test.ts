/** Phase 8b stage 0b test (never merged): ground assembly, the shadow pass, track and elevated drawing of the app runtime. */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { FakeCanvas, install, make } from '../fakeCanvas';
import { K_GROUND, K_GUEST, K_POST, K_DECK, K_RAIL, K_SCENERY, K_SHADOW, K_SUPPORT, pixel } from '../../../../src/render/artHook';
import { TICKS_PER_HOUR } from '../../../../src/data/tuning/core';
import { deckKey, groundKey, groundVariant, railKey, shadowKey, supportKey, SUPPORT_STYLES, TRACK_PIECE_IDS, TRACK_TYPE_IDS } from '../../../../src/render/pixel/app/keys';
import { AppRuntime } from '../../../../src/render/pixel/app/runtime';
import { shadowPhase } from '../../../../src/render/pixel/app/shadows';
import { TrackPictures } from '../../../../src/render/pixel/app/track';
import { casterMask, casterOf } from '../../../../src/render/pixel/shadows';
import { projectY } from '../../../../src/render/track/project';
import { viewAffine, viewSpriteRotation, viewTileSX, viewTileSY } from '../../../../src/render/view';
import { createStats } from '../../../../src/render/pixel/app/stats';
import { PictureStore, type StoreIo } from '../../../../src/render/pixel/app/store';
import type { LayerFrame } from '../../../../src/render/layers';
import type { Sprite } from '../../../../src/render/spriteCache';
import type { SliceRec } from '../../../../src/render/track/layer';
import { viewFrame } from '../../../../src/render/track/project';
import { rotateSlopeMask, type ViewRotation } from '../../../../src/render/view';
import { Content, generateMap, Owned, Terrain, type MapState } from '../../../../src/sim/map';
import { RAMP_MASK } from '../../../../src/sim/paths/nodes';
import { pieceWorldTiles } from '../../../../src/sim/rides/track/geometry';
import type { TrackRideData } from '../../../../src/sim/rides/track/types';
import type { World } from '../../../../src/sim/types';
import { createWorld } from '../../../../src/sim/world';
import { addGuestDirect, placeFootpath } from '../../../helpers/world';
import { executeCommand } from '../../../../src/sim/commands';

beforeAll(() => install());
afterEach(() => {
  pixel.rt = null;
  vi.restoreAllMocks();
});

const noIo: StoreIo = { fetch: () => Promise.reject(new Error('no io')), decode: () => Promise.reject(new Error('no io')), now: () => 0 };

/** A runtime whose store returns 1 × 1 pictures and logs every key (`miss` decides a missing one). */
function runtime(miss: (kind: number, key: number, n: number) => boolean = () => false) {
  const store = new PictureStore(noIo, 64 * 1024 * 1024);
  const log: Array<{ kind: number; key: number; swap: number }> = [];
  const img = make(1, 1) as unknown as CanvasImageSource;
  vi.spyOn(store, 'get').mockImplementation((kind, key, swap) => {
    log.push({ kind, key, swap });
    if (miss(kind, key, log.length)) return null;
    const sp: Sprite = { image: img, w: 1, h: 1, ox: 0, oy: 0, scale: 0.5, sx: 0, sy: 0 };
    return sp;
  });
  const rt = new AppRuntime(store, createStats('coarse', 'phone'), null);
  return { rt, log };
}

/** A flat owned grass map at height 4. */
function flatMap(side = 32): MapState {
  const m = generateMap({ width: side, height: side });
  m.heights.fill(4);
  m.slope.fill(0);
  m.water.fill(0);
  m.content.fill(Content.Empty);
  m.terrain.fill(Terrain.Grass);
  m.owned.fill(Owned.Owned);
  m.entranceTile = -1;
  return m;
}

const GEOM = { left: -600, right: 600, top: -200, bottom: 600 };
const part = (key: number): number => Math.floor(key / (8 * 16 * 16 * 4));

function frameOf(rotation: number, art = { n: 2, scale: 1, offX: 0, offY: 0, night: false }): LayerFrame {
  return { scale: 1, offX: 0, offY: 0, dpr: 1, bucket: 0.5, view: { x0: -1e6, y0: -1e6, x1: 1e6, y1: 1e6 }, rotation: rotation as 0, alpha: 0, width: 400, height: 400, art };
}

describe('ground assembly', () => {
  it('a flat chunk draws one top per tile and no face', () => {
    const { rt, log } = runtime();
    const sp = rt.chunk(flatMap(), { u0: 8, v0: 8, u1: 16, v1: 16 }, 0, GEOM);
    expect(sp).not.toBeNull();
    expect((sp?.image as unknown as FakeCanvas).count('drawImage')).toBe(64);
    // Fix round 1 (M4): every piece is asked for once before the canvas is made, then once to draw.
    expect(log.length).toBe(128);
    expect(log.every((e) => e.kind === K_GROUND && part(e.key) === 0)).toBe(true);
    expect(sp?.scale).toBe(0.5);
  });

  it('a raised tile draws its face stacks and the variant from groundVariant', () => {
    const m = flatMap();
    const i = 10 * 32 + 10;
    m.heights[i] = 6;
    const { rt, log } = runtime();
    rt.chunk(m, { u0: 8, v0: 8, u1: 16, v1: 16 }, 0, GEOM);
    const faces = log.slice(log.length / 2).filter((e) => part(e.key) === 2);
    expect(faces.map((e) => e.key).sort()).toEqual([groundKey(2, 0, 0, 0, 0), groundKey(2, 0, 0, 0, 0), groundKey(2, 1, 0, 0, 0), groundKey(2, 1, 0, 0, 0)].sort());
    expect(log.some((e) => e.key === groundKey(0, Terrain.Grass, 0, 1, groundVariant(10, 10)))).toBe(true);
    // A tile outside the park uses the outside top (owned 0 only when `owned` is not 1).
    m.owned[i] = Owned.LandForSale;
    const b = runtime();
    b.rt.chunk(m, { u0: 8, v0: 8, u1: 16, v1: 16 }, 0, GEOM);
    expect(b.log.some((e) => e.key === groundKey(0, Terrain.Grass, 0, 0, groundVariant(10, 10)))).toBe(true);
  });

  it('a path tile uses the view edge mask', () => {
    const m = flatMap();
    m.content[10 * 32 + 10] = Content.Footpath;
    m.content[9 * 32 + 10] = Content.Footpath;
    const paths = (r: ViewRotation): number[] => {
      const { rt, log } = runtime();
      rt.chunk(m, { u0: 0, v0: 0, u1: 32, v1: 32 }, r, GEOM);
      return log.filter((e) => part(e.key) === 1).map((e) => e.key);
    };
    // View rotation 0: map N is view N, so the edges are E, S, W.
    expect(paths(0)).toContain(groundKey(1, 0, 0, 2 | 4 | 8, groundVariant(10, 10)));
    // View rotation 1: map N (y − 1) is view E (u + 1).
    expect(paths(1)).toContain(groundKey(1, 0, 0, 1 | 4 | 8, groundVariant(10, 10)));
  });

  it('missing piece leaves the chunk incomplete', () => {
    const { rt, log } = runtime((_k, _key, n) => n === 1);
    const made = vi.spyOn(FakeCanvas.prototype, 'getContext');
    expect(rt.chunk(flatMap(), { u0: 8, v0: 8, u1: 16, v1: 16 }, 0, GEOM)).toBeNull();
    // Fix round 1 (M4): every piece was asked for (all misses queue at once), no canvas was made, no timing fed.
    expect(log.length).toBe(64);
    expect(made).not.toHaveBeenCalled();
    expect(rt.stats.chunkMsMax).toBe(0);
  });
});

/** A world with a stall, an oak (round caster) and guests. */
function shadowWorld(): World {
  const world = createWorld({ seed: 3, parkName: 'Shadows', mapSize: 32 });
  for (let x = 4; x <= 12; x++) placeFootpath(world, x, 16);
  addGuestDirect(world, 16 * 32 + 6);
  expect(executeCommand(world, { type: 'placeStall', defId: 'snack_shack', x: 8, y: 15, rotation: 2 }).ok).toBe(true);
  expect(executeCommand(world, { type: 'placeScenery', defId: 'oak_round', x: 12, y: 12, rotation: 0, edge: -1 }).ok).toBe(true);
  return world;
}

describe('shadow pass', () => {
  it('no object shadow at night; guests keep theirs', () => {
    const world = shadowWorld();
    const day = runtime();
    const ctx = make(400, 400).getContext() as CanvasRenderingContext2D;
    day.rt.drawShadows(ctx, world, frameOf(0));
    const shadows = day.log.filter((e) => e.kind === K_SHADOW);
    expect(shadows.length).toBe(2);
    world.state.park.afterDark = true;
    world.state.tick = 23 * TICKS_PER_HOUR;
    const night = runtime();
    // The runtime's art frame carries the night flag (`beginFrame`).
    const f = night.rt.beginFrame({ centerX: 0, centerY: 0, zoom: 1, rotation: 0 }, world, 400, 400, 1, 0);
    expect(f.night).toBe(true);
    night.rt.drawShadows(ctx, world, { ...frameOf(0), art: f });
    expect(night.log.filter((e) => e.kind === K_SHADOW)).toHaveLength(0);
    // Guests are never in the shadow pass: their shadow is inside the guest picture.
    expect([...day.log, ...night.log].some((e) => e.kind === K_GUEST)).toBe(false);
  });

  it('shadow phase follows the anchor parity', () => {
    // Two anchors one art pixel (2 world px) apart take the two phases; a mask anchor of odd parity flips both.
    expect(shadowPhase(64, 32, 16, 0)).toBe(0);
    expect(shadowPhase(66, 32, 16, 0)).toBe(1);
    expect(shadowPhase(64, 34, 16, 0)).toBe(1);
    expect(shadowPhase(66, 32, 5, 2)).toBe(0);
    // In the pass: the oak (an ellipse) uses its sprite view rotation and the phase of its footprint-centre anchor.
    const world = shadowWorld();
    const { rt, log } = runtime();
    const ctx = make(400, 400).getContext() as CanvasRenderingContext2D;
    rt.drawShadows(ctx, world, frameOf(1));
    const oak = log.filter((e) => e.key === shadowKey(K_SCENERY, 'oak_round', 1, 0) || e.key === shadowKey(K_SCENERY, 'oak_round', 1, 1));
    expect(oak).toHaveLength(1);
    // Fix round 1 (M7): the stall's key has the phase of its anchor and mask anchor.
    const st = world.state.stalls[0] as { x: number; y: number; rotation: number; defId: string };
    const view = viewSpriteRotation(st.rotation as 0, 1);
    const m = casterMask(casterOf('stall', st.defId, view) as NonNullable<ReturnType<typeof casterOf>>, 0);
    const va = viewAffine(1, world.state.map.width, world.state.map.height);
    const z = world.state.map.heights[st.y * world.state.map.width + st.x] as number;
    const phase = shadowPhase(viewTileSX(va, st.x, st.y), viewTileSY(va, st.x, st.y, z), m.cx, m.cy);
    const stall = log.filter((e) => e.kind === K_SHADOW && (e.key === shadowKey(2, st.defId, view, 0) || e.key === shadowKey(2, st.defId, view, 1)));
    expect(stall).toEqual([{ kind: K_SHADOW, key: shadowKey(2, st.defId, view, phase), swap: -1 }]);
  });
});

describe('track and elevated paths', () => {
  /** A world holding one track ride with one piece at (16, 16), colours track 6, supports 9, cars 0. */
  function trackWorld(): { world: World; sl: SliceRec } {
    const world = createWorld({ seed: 1, parkName: 'Track', mapSize: 32 });
    const piece = { defId: 'straight', x: 16, y: 16, z: 7, dir: 0 as const, chain: false, brakeSpeed: null, cost: 0 };
    const data = {
      rideId: 1,
      typeId: 'steel_coaster',
      pieces: [piece],
      circuitClosed: false,
      trainConfig: { trains: 0, carsPerTrain: 1 },
      operation: { minDwellTicks: 0, maxDwellTicks: 0, laps: 1 },
      trains: [],
      test: null,
      colours: { track: 6, supports: 9, cars: 0 },
      openedOnce: false,
      testRun: null,
      lastDispatchTick: -1,
      bestLapTicks: null,
    } as unknown as TrackRideData;
    world.state.track.rides = { '1': data };
    const t = pieceWorldTiles(piece as never)[0] as { x: number; y: number };
    const sl = { rideId: 1, pieceIndex: 0, x: t.x, y: t.y, ax: 100, ay: 200, ground: 2, support: { wx: 66, wy: 66, yaw: 0, top: 7 }, supportStyle: SUPPORT_STYLES[0] } as unknown as SliceRec;
    return { world, sl };
  }

  it('a support of 5 steps draws foot, 3 steps and top with the support swap', () => {
    const { world, sl } = trackWorld();
    const { rt, log } = runtime();
    rt.beginFrame({ centerX: 0, centerY: 0, zoom: 1, rotation: 0 }, world, 400, 400, 1, 0);
    const ctx = make(400, 400).getContext() as CanvasRenderingContext2D;
    expect(rt.drawTrack(ctx, 'slice', { sl, vf: viewFrame(0, 32, 32) }, frameOf(0))).toBe(true);
    const sup = log.filter((e) => e.kind === K_SUPPORT);
    expect(sup.map((e) => e.key)).toEqual([supportKey(0, 0, 0), supportKey(0, 1, 0), supportKey(0, 1, 0), supportKey(0, 1, 0), supportKey(0, 2, 0)]);
    expect(sup.every((e) => e.swap === 9)).toBe(true);
    const rail = log.filter((e) => e.kind === K_RAIL);
    expect(rail).toEqual([{ kind: K_RAIL, key: railKey(TRACK_TYPE_IDS.indexOf('steel_coaster'), TRACK_PIECE_IDS.indexOf('straight'), 0, 0, 0), swap: 6 }]);
  });

  it('a fractional support: steps up to ceil(top − ground) − 2, the top segment at top − 1; under 1 m only the foot', () => {
    const { world, sl } = trackWorld();
    const vf = viewFrame(0, 32, 32);
    const draws: Array<{ kind: number; key: number; wx: number; wy: number }> = [];
    const proto = TrackPictures.prototype as unknown as { draw: (...a: unknown[]) => void };
    const orig = proto.draw;
    vi.spyOn(proto, 'draw').mockImplementation(function (this: unknown, ...a: unknown[]) {
      draws.push({ kind: a[1] as number, key: a[2] as number, wx: a[4] as number, wy: a[5] as number });
      orig.apply(this, a);
    });
    const { rt } = runtime();
    rt.beginFrame({ centerX: 0, centerY: 0, zoom: 1, rotation: 0 }, world, 400, 400, 1, 0);
    const ctx = make(400, 400).getContext() as CanvasRenderingContext2D;
    const sup = (sl as unknown as { support: { wx: number; wy: number; top: number } }).support;
    sup.top = 7.4;
    rt.drawTrack(ctx, 'slice', { sl, vf }, frameOf(0));
    const s1 = draws.filter((d) => d.kind === K_SUPPORT);
    expect(s1.map((d) => d.key)).toEqual([supportKey(0, 0, 0), ...Array(4).fill(supportKey(0, 1, 0)), supportKey(0, 2, 0)]);
    // M7: the top segment sits one metre under the top.
    expect((s1[s1.length - 1] as { wy: number }).wy).toBe(projectY(sup.wx, sup.wy, 7.4 - 1, vf));
    draws.length = 0;
    sup.top = 2.6;
    const sl2 = { ...sl, support: { ...sup } } as unknown as SliceRec;
    rt.drawTrack(ctx, 'slice', { sl: sl2, vf }, frameOf(0));
    expect(draws.filter((d) => d.kind === K_SUPPORT).map((d) => d.key)).toEqual([supportKey(0, 0, 0)]);
  });

  it('a car at a fractional anchor lands on whole art pixels (n = 3)', () => {
    const { rt } = runtime();
    const calls: number[][] = [];
    const ctx = { drawImage: (...a: unknown[]) => calls.push(a.slice(1) as number[]) } as unknown as CanvasRenderingContext2D;
    const f = frameOf(0, { n: 3, scale: 1.5, offX: 7, offY: 11, night: false });
    expect(rt.drawTrack(ctx, 'car', { shape: 0, yaw: 0, pitch: 0, roll: 0, front: 1, colour: 0, ax: 101.3, ay: 57.7 }, f)).toBe(true);
    const [, , , , dx, dy] = calls[0] as number[];
    expect(Number.isInteger(dx)).toBe(true);
    expect(Number.isInteger(dy)).toBe(true);
  });

  it('a slice with no picture key counts as missing (Classic draws it)', () => {
    const { world, sl } = trackWorld();
    const { rt } = runtime();
    rt.beginFrame({ centerX: 0, centerY: 0, zoom: 1, rotation: 0 }, world, 400, 400, 1, 0);
    const ctx = make(400, 400).getContext() as CanvasRenderingContext2D;
    const bad = { ...sl, pieceIndex: 5 } as unknown as SliceRec;
    expect(rt.drawTrack(ctx, 'slice', { sl: bad, vf: viewFrame(0, 32, 32) }, frameOf(0))).toBe(false);
    expect(rt.store.missing).toBe(1);
  });

  it('an elevated ramp uses the view ramp whose mask the layer would draw, posts per step', () => {
    for (const r of [0, 1, 2, 3] as const) for (let d = 0; d < 4; d++) expect(rotateSlopeMask(RAMP_MASK[d] as number, r)).toBe(RAMP_MASK[(d + r) & 3]);
    const world = createWorld({ seed: 1, parkName: 'Deck', mapSize: 32 });
    const map = world.state.map;
    map.heights.fill(4);
    map.slope.fill(0);
    const { rt, log } = runtime();
    rt.beginFrame({ centerX: 0, centerY: 0, zoom: 1, rotation: 1 }, world, 400, 400, 1, 0);
    const ctx = make(400, 400).getContext() as CanvasRenderingContext2D;
    rt.drawElevated(ctx, { id: 1, x: 5, y: 5, z: 7, kind: 'queue', rampDir: 2 }, world, frameOf(1));
    expect(log[log.length - 1]).toEqual({ kind: K_DECK, key: deckKey(1, 3), swap: -1 });
    // Deck 3 steps above the ground: 3 post steps under each flat corner (deck slab 4 px), 4 under the two raised ones.
    expect(log.filter((e) => e.kind === K_POST)).toHaveLength(3 + 3 + 4 + 4);
  });
});
