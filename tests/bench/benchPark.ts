/**
 * Benchmark park (W2-D, master §10, Phase 1 §9, Phase 3 §9.5): a dense footpath grid on the 64 × 64 map
 * with 10 flat rides (queues and exits on the grid), 6 stalls, staff, and a crowd of guests spread over
 * the paths in every state the decision loop reaches. Shared by `tick.bench.ts` and the budget test.
 */
import { FLAT_RIDES } from '../../src/data/catalog';
import { executeCommand, type Command } from '../../src/sim/commands';
import { Content } from '../../src/sim/map';
import { rebuildAllFields } from '../../src/sim/pathing';
import { stepTick } from '../../src/sim/tick';
import type { World } from '../../src/sim/types';
import type { StaffType } from '../../src/data/catalog/types';
import { addGuestDirect, makeTestWorld } from '../helpers/world';

/** Grid lines every 6 tiles: 5 × 5 cells between them. */
const LINES = [2, 8, 14, 20, 26, 32, 38, 44, 50, 56];

function setup(world: World, cmd: Command): number {
  const r = executeCommand(world, cmd, { setup: true });
  if (!r.ok) throw new Error(`${cmd.type}: ${r.reason} ${JSON.stringify(cmd)}`);
  return r.id ?? -1;
}

/** Tiny deterministic generator for placement (independent of the game RNG). */
function lcg(seed: number): () => number {
  let x = seed >>> 0;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 4294967296;
  };
}

export interface BenchParkOptions {
  guests: number;
  /** Staff counts by type. */
  staff: Partial<Record<StaffType, number>>;
  /** Litter items spread over the footpaths. */
  litter?: number;
  seed?: number;
}

export function buildBenchPark(opts: BenchParkOptions): World {
  const world = makeTestWorld(opts.seed ?? 777, 'Bench Park');
  const lo = LINES[0] as number;
  const hi = LINES[LINES.length - 1] as number;
  for (const v of LINES) {
    setup(world, { type: 'buildPathLine', x0: lo, y0: v, x1: hi, y1: v, kind: 'footpath' });
    setup(world, { type: 'buildPathLine', x0: v, y0: lo, x1: v, y1: hi, kind: 'footpath' });
  }
  // Connect the entrance stub (31, 60) to the grid's south row (y = 56).
  setup(world, { type: 'buildPathLine', x0: 31, y0: 57, x1: 31, y1: 59, kind: 'footpath' });

  // 10 rides (the 4 start rides, repeated) in grid cells: exit on the north line, a 2-tile queue to the south line.
  const starters = FLAT_RIDES.filter((d) => d.unlock === 'start' && d.w === 3 && d.d === 3);
  const rideDefs = Array.from({ length: 10 }, (_, k) => starters[k % starters.length] as (typeof starters)[number]);
  const cells: [number, number][] = [];
  for (let cy = 0; cy < LINES.length - 1; cy += 2) for (let cx = 0; cx < LINES.length - 1; cx += 2) cells.push([LINES[cx] as number, LINES[cy] as number]);
  const rideIds: number[] = [];
  rideDefs.forEach((def, k) => {
    const [x, y] = cells[k] as [number, number];
    const id = setup(world, { type: 'placeRide', defId: def.id, x: x + 2, y: y + 1, rotation: 0 });
    setup(world, { type: 'buildPathLine', x0: x + 3, y0: y + 4, x1: x + 3, y1: y + 5, kind: 'queue' });
    rideIds.push(id);
  });
  // 6 stalls in other cells, serving the west grid line.
  const stallDefs = ['snack_shack', 'fizz_stand', 'restrooms', 'snack_shack', 'fizz_stand', 'restrooms'];
  stallDefs.forEach((defId, k) => {
    const [x, y] = cells[(rideDefs.length + k) % cells.length] as [number, number];
    setup(world, { type: 'placeStall', defId, x: x + 1, y: y + 1, rotation: 3 });
  });
  // Bins and benches every few grid tiles (not on the junctions).
  const map = world.state.map;
  for (const y of LINES) {
    for (let x = lo + 3; x < hi; x += 6) {
      setup(world, { type: 'buildPathItem', x, y, itemType: (x + y) % 12 === 1 ? 'bench' : 'bin' });
    }
  }
  for (const id of rideIds) setup(world, { type: 'setRideOpen', rideId: id, open: true });
  for (const [type, n] of Object.entries(opts.staff) as [StaffType, number][]) {
    for (let k = 0; k < n; k++) setup(world, { type: 'hireStaff', staffType: type });
  }

  // Guests on random footpath tiles with varied needs and temperament.
  const rnd = lcg(opts.seed ?? 777);
  const paths: number[] = [];
  for (let i = 0; i < map.content.length; i++) if (map.content[i] === Content.Footpath) paths.push(i);
  for (let k = 0; k < opts.guests; k++) {
    const tile = paths[Math.floor(rnd() * paths.length)] as number;
    addGuestDirect(world, tile, {
      temperament: Math.round((rnd() + rnd()) * 50),
      cash: 4000 + Math.floor(rnd() * 8000),
      needs: {
        hunger: Math.floor(rnd() * 200),
        thirst: Math.floor(rnd() * 200),
        bladder: Math.floor(rnd() * 180),
        energy: 120 + Math.floor(rnd() * 135),
        happiness: 120 + Math.floor(rnd() * 120),
        nausea: Math.floor(rnd() * 60),
      },
      nextDecisionTick: world.state.tick + (k % 40),
    });
  }
  let left = opts.litter ?? 0;
  while (left > 0) {
    const tile = paths[Math.floor(rnd() * paths.length)] as number;
    if ((map.litter[tile] as number) < 8) {
      map.litter[tile] = (map.litter[tile] as number) + 1;
      left--;
    }
  }
  rebuildAllFields(world);
  return world;
}

/** Step `n` ticks and return the time of each tick in ms. */
export function timeTicks(world: World, n: number): number[] {
  const out: number[] = [];
  for (let k = 0; k < n; k++) {
    const t0 = performance.now();
    stepTick(world);
    out.push(performance.now() - t0);
  }
  return out;
}

export function summarize(ms: number[]): { mean: number; p50: number; p95: number; max: number } {
  const sorted = [...ms].sort((a, b) => a - b);
  const at = (q: number): number => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] as number;
  return { mean: ms.reduce((a, b) => a + b, 0) / ms.length, p50: at(0.5), p95: at(0.95), max: sorted[sorted.length - 1] as number };
}

/** The master §10 Build 1 scene: 2,000 guests, 10 rides, 8 staff. */
export const BUILD1_SCENE: BenchParkOptions = {
  guests: 2_000,
  staff: { groundskeeper: 3, mechanic: 2, security: 2, performer: 1 },
};

/** The Phase 3 §9.5 scene without track rides (not merged yet): 2,000 guests, 40 staff, 1,000 litter. */
export const PHASE3_SCENE: BenchParkOptions = {
  guests: 2_000,
  staff: { groundskeeper: 16, mechanic: 8, security: 8, performer: 8 },
  litter: 1_000,
};
