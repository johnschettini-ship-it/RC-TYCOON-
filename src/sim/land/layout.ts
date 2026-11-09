/**
 * Free-play map layout (Phase 4 §4.9). Owner: W3-G.
 *
 * Contract: a flat grass map of `size` × `size` (default `MAP_SIZE_DEFAULT` = 96) at ground level 8 with an owned
 * centre square of `min(48, size − 8)` tiles, a ring around it for sale (state 2), and the outer 4 tiles not owned.
 * The park entrance sits on the south edge of the owned square in the gap of the border, owned, with the 3-tile
 * footpath stub leading north; guests spawn on the tile outside it. Deterministic; no RNG.
 *
 * Stub: the Build 1 generator at the requested size (every tile owned except the outer ring).
 */
import { MAP_SIZE_DEFAULT } from '../../data/tuning/land';
import { generateMap, type MapState } from '../map';

export function generateFreePlayMap(size: number = MAP_SIZE_DEFAULT): MapState {
  return generateMap({ width: size, height: size });
}
