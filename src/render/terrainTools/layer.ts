/**
 * Land and water tool ghosts (Phase 4 §7): the brush outline with its cost, the marked corner, the level rectangle,
 * drawn from `tool.brush` in `drawOverlay`. Owner: W3-A. Stub: draws nothing.
 */
import type { WorldLayer } from '../layers';

export function createTerrainToolLayer(): WorldLayer {
  return { name: 'terrainTools', kinds: [] };
}
