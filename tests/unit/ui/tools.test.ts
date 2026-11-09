import { describe, expect, it } from 'vitest';
import { addGuestDirect, makeTestWorld, placeFootpath, placeQueue, placeRideDirect, placeStallDirect } from '../../helpers/world';
import { tileIndex } from '../../../src/sim/map';
import { executeCommand } from '../../../src/sim/commands';
import {
  PATH_TILE_COST,
  computeGhost,
  pathLineEnd,
  pathLinePreview,
  pathLineTiles,
  pickEntity,
} from '../../../src/input/tools';

const world = makeTestWorld();
const map = world.state.map;
const T = (x: number, y: number): number => tileIndex(map, x, y);
const xy = (tiles: number[]): Array<[number, number]> => tiles.map((i) => [i % map.width, Math.floor(i / map.width)]);

describe('path line (Phase 1 §4.1): axis with the larger distance from the start', () => {
  it('follows x when |dx| > |dy|', () => {
    expect(pathLineEnd(map, T(10, 10), T(15, 12))).toBe(T(15, 10));
  });

  it('follows y when |dy| > |dx|', () => {
    expect(pathLineEnd(map, T(10, 10), T(12, 4))).toBe(T(10, 4));
  });

  it('a tie follows x', () => {
    expect(pathLineEnd(map, T(10, 10), T(13, 13))).toBe(T(13, 10));
  });

  it('lists every tile from the start to the projected end, in order', () => {
    expect(xy(pathLineTiles(map, T(10, 10), T(13, 11)))).toEqual([[10, 10], [11, 10], [12, 10], [13, 10]]);
    expect(xy(pathLineTiles(map, T(10, 10), T(7, 9)))).toEqual([[10, 10], [9, 10], [8, 10], [7, 10]]);
    expect(xy(pathLineTiles(map, T(5, 5), T(4, 8)))).toEqual([[5, 5], [5, 6], [5, 7], [5, 8]]);
    expect(xy(pathLineTiles(map, T(5, 5), T(5, 5)))).toEqual([[5, 5]]);
  });
});

describe('path line cost', () => {
  it('costs $10 per footpath tile and $12 per queue tile', () => {
    expect(PATH_TILE_COST).toEqual({ footpath: 1000, queue: 1200 });
  });

  it('sums the tiles that change; tiles that already have that path are free (the command\'s own dry run)', () => {
    const w = makeTestWorld();
    const m = w.state.map;
    const a = tileIndex(m, 10, 20);
    const b = tileIndex(m, 14, 20);
    const cost = (kind: 'footpath' | 'queue'): number => pathLinePreview(w, kind, a, b).cost;
    expect(cost('footpath')).toBe(5000);
    expect(cost('queue')).toBe(6000);
    placeFootpath(w, 11, 20);
    placeQueue(w, 12, 20);
    expect(cost('footpath')).toBe(4000);
    expect(cost('queue')).toBe(4800);
    expect(pathLinePreview(w, 'footpath', a, b).reason).toBeNull();
  });

  it('elevated lines cost their supports ($2 per m down to the ground, Phase 4 §4.2), as the command charges', () => {
    const w = makeTestWorld();
    const m = w.state.map;
    const a = tileIndex(m, 10, 24);
    const b = tileIndex(m, 13, 24);
    const ground = m.heights[a] as number;
    // 4 decks 3 steps above the ground: $10 + 3 × $2 each.
    expect(pathLinePreview(w, 'footpath', a, b, { z: ground + 3 })).toEqual({ cost: 4 * (1000 + 3 * 200), reason: null });
    // A ramp up from 1 step: 1, 2, 3, 4 steps of support.
    expect(pathLinePreview(w, 'footpath', a, b, { z: ground + 1, ramp: 'up' }).cost).toBe(4 * 1000 + (1 + 2 + 3 + 4) * 200);
    const before = w.state.park.cash;
    const r = executeCommand(w, { type: 'buildPathLine', x0: 10, y0: 24, x1: 13, y1: 24, kind: 'footpath', z: ground + 3 });
    expect(r).toMatchObject({ ok: true, cost: 4 * 1600 });
    expect(w.state.park.cash).toBe(before - 4 * 1600);
  });

  it('a line the command would refuse shows its reason and no cost', () => {
    const w = makeTestWorld();
    const m = w.state.map;
    const a = tileIndex(m, 10, 26);
    expect(pathLinePreview(w, 'footpath', a, tileIndex(m, 12, 26), { z: m.heights[a] as number })).toEqual({ cost: 0, reason: 'The path is below the land' });
    w.state.park.cash = 100;
    expect(pathLinePreview(w, 'footpath', a, tileIndex(m, 12, 26))).toEqual({ cost: 0, reason: 'Not enough cash' });
  });
});

describe('ghost validity (computed locally; the command result is the final word)', () => {
  it('a ride ghost is centred on the pointer tile and valid on empty owned land', () => {
    const w = makeTestWorld();
    const g = computeGhost(w, 'ride', 'carousel', tileIndex(w.state.map, 20, 20), 0);
    expect(g).toEqual({ kind: 'ride', defId: 'carousel', tile: tileIndex(w.state.map, 19, 19), rotation: 0, valid: true, reason: null, cost: 120000 });
  });

  it('rotation 1 swaps the footprint extent of a 3 × 5 ride', () => {
    const w = makeTestWorld();
    const g = computeGhost(w, 'ride', 'pendulum_ship', tileIndex(w.state.map, 20, 20), 1);
    // Extent is 5 × 3 (x × y): origin = anchor − (2, 1).
    expect(g?.tile).toBe(tileIndex(w.state.map, 18, 19));
    expect(g?.valid).toBe(true);
  });

  it('is invalid on land the park does not own (map edge) and stays inside the map', () => {
    const w = makeTestWorld();
    const g = computeGhost(w, 'ride', 'carousel', tileIndex(w.state.map, 0, 0), 0);
    expect(g?.tile).toBe(tileIndex(w.state.map, 0, 0));
    expect(g?.valid).toBe(false);
    expect(g?.reason).toBe('You do not own this land');
  });

  it('is invalid when something is in the way', () => {
    const w = makeTestWorld();
    placeFootpath(w, 21, 21);
    const g = computeGhost(w, 'ride', 'carousel', tileIndex(w.state.map, 20, 20), 0);
    expect(g?.valid).toBe(false);
    expect(g?.reason).toBe('Something is in the way');
  });

  it('is invalid without enough cash, valid at exactly the cost', () => {
    const w = makeTestWorld();
    w.state.park.cash = 119999;
    const at = tileIndex(w.state.map, 20, 20);
    expect(computeGhost(w, 'ride', 'carousel', at, 0)?.reason).toBe('Not enough cash');
    w.state.park.cash = 120000;
    expect(computeGhost(w, 'ride', 'carousel', at, 0)?.valid).toBe(true);
  });

  it('a stall ghost covers one tile and keeps the rotation as its service side', () => {
    const w = makeTestWorld();
    const at = tileIndex(w.state.map, 8, 9);
    expect(computeGhost(w, 'stall', 'snack_shack', at, 3)).toEqual({
      kind: 'stall', defId: 'snack_shack', tile: at, rotation: 3, valid: true, reason: null, cost: 40000,
    });
  });

  it('an unknown definition gives no ghost', () => {
    expect(computeGhost(makeTestWorld(), 'ride', 'nope', 100, 0)).toBeNull();
    expect(computeGhost(makeTestWorld(), 'stall', 'carousel', 100, 0)).toBeNull();
  });
});

describe('inspect picking', () => {
  it('finds the ride, stall, or guest on a tile', () => {
    const w = makeTestWorld();
    const m = w.state.map;
    const ride = placeRideDirect(w, 'carousel', 10, 10, 0);
    const stall = placeStallDirect(w, 'snack_shack', 20, 20, 2);
    const path = placeFootpath(w, 30, 30);
    const guest = addGuestDirect(w, path);
    expect(pickEntity(w, tileIndex(m, 11, 11))).toEqual({ kind: 'ride', id: ride.id });
    expect(pickEntity(w, tileIndex(m, 20, 20))).toEqual({ kind: 'stall', id: stall.id });
    expect(pickEntity(w, path)).toEqual({ kind: 'guest', id: guest.id });
    expect(pickEntity(w, tileIndex(m, 40, 40))).toBeNull();
    expect(pickEntity(w, null)).toBeNull();
  });
});
