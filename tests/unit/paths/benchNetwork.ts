/**
 * The Phase 4 §4.10 pathing worst case: a 96 × 96 park with about 5,000 path nodes (a ground grid at 8 and an
 * elevated deck at 9 joined by ramps) and 100 destinations (99 stalls and the exit). Shared by
 * `tests/bench/pathing.bench.ts` and the CI check in `perf.test.ts`.
 */
import { Content, tileIndex } from '../../../src/sim/map';
import { distanceTo, markNetworkDirty } from '../../../src/sim/pathing';
import { createWorld } from '../../../src/sim/world';
import type { World } from '../../../src/sim/types';
import type { DestKey } from '../../../src/sim/guests/types';
import { placeStallDirect } from '../../helpers/world';
import { elevated, setLand } from './helpers';

export interface PathingBench {
  world: World;
  keys: DestKey[];
  nodes: number;
}

export function buildPathingBench(): PathingBench {
  const world = createWorld({ seed: 4242, parkName: 'Bench Park', mapSize: 96 });
  const map = world.state.map;
  const ex = map.entranceTile % map.width;
  let nodes = 0;
  // Ground grid: x 10–89, y 40–90 (every tile a footpath), plus the entrance stub column.
  for (let y = 40; y <= 90; y++) {
    for (let x = 10; x <= 89; x++) {
      map.content[tileIndex(map, x, y)] = Content.Footpath;
      nodes++;
    }
  }
  for (let y = 91; y < map.height - 1; y++) map.content[tileIndex(map, ex, y)] = Content.Footpath;
  // Ramps on row 39 (rising north) lead up to an elevated deck at 9 over rows 14–38, x 30–69.
  for (let x = 30; x <= 69; x++) {
    setLand(world, x, 39, 8, 0b0011);
    map.content[tileIndex(map, x, 39)] = Content.Footpath;
    nodes++;
  }
  for (let y = 14; y <= 38; y++) {
    for (let x = 30; x <= 69; x++) {
      elevated(world, x, y, 9);
      nodes++;
    }
  }
  // 99 stalls in holes of the ground grid, each facing a footpath to its west.
  const keys: DestKey[] = ['exit'];
  for (let k = 0; k < 99; k++) {
    const x = 12 + (k % 11) * 7;
    const y = 42 + Math.floor(k / 11) * 5;
    const stall = placeStallDirect(world, 'snack_shack', x, y, 3);
    nodes--;
    keys.push(`stall:${stall.id}`);
  }
  markNetworkDirty(world);
  return { world, keys, nodes };
}

/** One network change (a path tile toggles), then every destination's field is built by one query each. */
export function changeAndQueryAll(b: PathingBench, toggle: { on: boolean }): number {
  const { world, keys } = b;
  const map = world.state.map;
  const i = tileIndex(map, 50, 90);
  toggle.on = !toggle.on;
  map.content[i] = toggle.on ? Content.Empty : Content.Footpath;
  markNetworkDirty(world);
  const from = tileIndex(map, 50, 20);
  let reached = 0;
  for (const k of keys) if (distanceTo(world, from, k, 9) !== null) reached++;
  return reached;
}
