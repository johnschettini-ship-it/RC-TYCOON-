/** Owner: W1-H. Cleanliness C in [0, 1] for the rating (Phase 3 §4.3). */
import { DIRT_PER_TILE_ZERO, MESS_DIRT_WEIGHT } from '../../data/tuning/staff';
import { Content } from '../map';
import type { World } from '../types';

export interface DirtTotals {
  litter: number;
  mess: number;
  walkableTiles: number;
}

/** Totals over the map. Walkable tiles are footpath and queue tiles. */
export function dirtTotals(world: World): DirtTotals {
  const { content, litter, mess } = world.state.map;
  // Local copies: the rating and guest decisions call this scan every hour and tick (master §10 budget).
  const footpath = Content.Footpath;
  const queue = Content.Queue;
  const n = content.length;
  let l = 0;
  let m = 0;
  let w = 0;
  for (let i = 0; i < n; i++) {
    l += litter[i] as number;
    m += mess[i] as number;
    const c = content[i];
    if (c === footpath || c === queue) w++;
  }
  return { litter: l, mess: m, walkableTiles: w };
}

/** C = 1 − min(1, (totalLitter + 4 × totalMess) / (walkableTiles × DIRT_PER_TILE_ZERO)). 1 with no paths. */
export function cleanliness(world: World): number {
  const t = dirtTotals(world);
  if (t.walkableTiles === 0) return 1;
  const dirt = t.litter + MESS_DIRT_WEIGHT * t.mess;
  return 1 - Math.min(1, dirt / (t.walkableTiles * DIRT_PER_TILE_ZERO));
}

const perTick = new WeakMap<World, { tick: number; value: number }>();

/** Cleanliness, computed at most once per tick (guest decisions read it often). */
export function cleanlinessThisTick(world: World): number {
  const cur = perTick.get(world);
  if (cur && cur.tick === world.state.tick) return cur.value;
  const value = cleanliness(world);
  perTick.set(world, { tick: world.state.tick, value });
  return value;
}
