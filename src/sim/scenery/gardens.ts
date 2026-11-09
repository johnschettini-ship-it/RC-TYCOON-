/**
 * Gardens and watering (Phase 4 §4.5). Owner: W3-D. The Groundskeeper plumbing in `staff/tasks.ts` and
 * `staff/update.ts` calls these (task `water`, state `watering`, after mess, bins, and litter).
 */
import type { World } from '../types';

/**
 * True when a garden with `waterLevel < 128` can be watered from the path tile `pathTile` (on it as an arch, or on a
 * neighbouring tile). The Groundskeeper's BFS only visits tiles in its patrol area. Stub: false.
 */
export function gardenNeedsWaterNear(_world: World, _pathTile: number): boolean {
  return false;
}

/** Watering done at `pathTile` (after WATERING_TICKS): every garden it serves gets `waterLevel = 255`. Stub: no-op. */
export function waterGardensNear(_world: World, _pathTile: number): void {}
