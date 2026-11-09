/** Test helpers for the Calm and Buzz fields (W3-E). Direct state writes, like `tests/helpers/world.ts`. */
import { getSceneryDef, SCENERY } from '../../../src/data/catalog';
import { PathItem, tileIndex, type Dir } from '../../../src/sim/map';
import { createWorld } from '../../../src/sim/world';
import { allocId } from '../../../src/sim/ids';
import { markFieldsDirty } from '../../../src/sim/fields/api';
import { pieceWorldTiles } from '../../../src/sim/rides/track/geometry';
import type { Scenery, SceneryEdge } from '../../../src/sim/scenery/types';
import type { Ride } from '../../../src/sim/rides/types';
import type { World } from '../../../src/sim/types';
import { makeTrackRideDataDirect, placeRideDirect } from '../../helpers/world';

/** Add a scenery item without a command (W3-D's placement is not under test here) and mark the fields dirty. */
export function addSceneryDirect(
  world: World,
  defId: string,
  x: number,
  y: number,
  opts: { rotation?: Dir; edge?: SceneryEdge; waterLevel?: number } = {},
): Scenery {
  const def = getSceneryDef(defId);
  if (!def) throw new Error(`Unknown scenery ${defId}`);
  const s = world.state;
  const item: Scenery = {
    id: allocId(s),
    defId,
    x,
    y,
    z: s.map.heights[tileIndex(s.map, x, y)] as number,
    rotation: opts.rotation ?? 0,
    edge: opts.edge ?? (def.edge ? 0 : -1),
    waterLevel: opts.waterLevel ?? 255,
  };
  s.scenery.push(item);
  markFieldsDirty(world, tileIndex(s.map, x, y));
  return item;
}

export function removeSceneryDirect(world: World, id: number): void {
  const list = world.state.scenery;
  const k = list.findIndex((s) => s.id === id);
  if (k < 0) return;
  const [item] = list.splice(k, 1);
  markFieldsDirty(world, tileIndex(world.state.map, item!.x, item!.y));
}

/** A track ride of `typeId` with 3 station pieces from (x, y) heading map `rotation`, status as given. */
export function trackRideDirect(world: World, typeId: string, x: number, y: number, status: Ride['status'] = 'open'): Ride {
  // Start from a flat ride record (gates, reliability) and turn it into a track ride, as the rating tests do.
  const ride = placeRideDirect(world, 'spiral_slide', x, y, 0);
  const map = world.state.map;
  for (let i = 0; i < map.content.length; i++) if (map.contentRef[i] === ride.id) {
    map.content[i] = 0;
    map.contentRef[i] = -1;
  }
  ride.kind = 'track';
  ride.defId = typeId;
  ride.stats = null;
  makeTrackRideDataDirect(world, ride);
  ride.status = status;
  return ride;
}

/** Distinct in-map tiles of a track ride's pieces (each track tile stamps once). */
export function trackTilesOf(world: World, ride: Ride): number[] {
  const data = world.state.track.rides[String(ride.id)];
  const map = world.state.map;
  const seen = new Set<number>();
  for (const p of data?.pieces ?? []) {
    for (const t of pieceWorldTiles(p)) if (t.x >= 0 && t.y >= 0 && t.x < map.width && t.y < map.height) seen.add(tileIndex(map, t.x, t.y));
  }
  return [...seen].sort((a, b) => a - b);
}

/** Brute-force stamp total at (x, y) from sources at `tiles` with strength `s` and radius `r` (Chebyshev). */
export function bruteStamp(width: number, tiles: readonly number[], s: number, r: number, x: number, y: number): number {
  let sum = 0;
  for (const t of tiles) {
    const sx = t % width;
    const sy = (t - sx) / width;
    const d = Math.max(Math.abs(sx - x), Math.abs(sy - y));
    if (d <= r) sum += s * (r + 1 - d);
  }
  return sum;
}

/** Seeded mulberry32 for the random-operation tests (tests only; the sim uses `GameState.rng`). */
export function testRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BENCH_RIDES = ['flip_arm', 'carousel', 'swing_tower', 'drop_tower', 'teacup_twirl', 'pendulum_ship'];

/**
 * A 128 × 128 park for the field benchmarks (Phase 4 §9.4): about 2,000 scenery items, 24 open rides, 400 benches,
 * and a 20 × 20 lake. Direct state writes from a fixed LCG; the fields are built on the first read.
 */
export function buildFieldsPark(size = 128, items = 2_000): World {
  const world = createWorld({ seed: 4242, parkName: 'Fields Bench', mapSize: size });
  const s = world.state;
  const map = s.map;
  let seed = 99;
  const rnd = (n: number): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % n;
  };
  for (let k = 0; k < 24; k++) {
    placeRideDirect(world, BENCH_RIDES[k % BENCH_RIDES.length] as string, 4 + (k % 6) * 20, 4 + Math.floor(k / 6) * 30, (k % 4) as Dir).status = 'open';
  }
  for (let k = 0; k < items; k++) {
    const def = SCENERY[rnd(SCENERY.length)]!;
    s.scenery.push({
      id: allocId(s),
      defId: def.id,
      x: 1 + rnd(size - 3),
      y: 1 + rnd(size - 3),
      z: map.heights[0] as number,
      rotation: rnd(4) as Dir,
      edge: def.edge ? (rnd(4) as Dir) : -1,
      waterLevel: def.needsWater ? 64 + rnd(192) : 255,
    });
  }
  for (let k = 0; k < 400; k++) map.pathItem[rnd(size * size)] = PathItem.Bench;
  for (let y = 90; y < 110; y++) for (let x = 90; x < 110; x++) map.water[y * size + x] = 10;
  return world;
}
