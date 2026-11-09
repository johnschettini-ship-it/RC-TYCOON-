/**
 * Text description of a tile for screen readers (Phase 6 §4.7). Owner: W4-F. Neutral: empty.
 * Contract: "Tile 12, 30: footpath, 3 guests, next to Carousel" (`a11y.tile` and W4-F's strings), from the state
 * only; read-only.
 */
import type { World } from '../sim/types';

export function describeTile(world: World, tile: number): string {
  void world;
  void tile;
  return '';
}
