/** Save validator for `GameState.scenery` (Phase 4 §4.5, §5). Owner: W3-D. Ids, tiles, and defIds: `integrity.ts`. */
import type { Dir } from '../../sim/map';
import type { Scenery, SceneryEdge } from '../../sim/scenery/types';
import { arr, byte, every, int, obj, oneOf, str, type V } from '../validate';

const DIRS = every<Dir>()([0, 1, 2, 3]);
const EDGES = every<SceneryEdge>()([-1, 0, 1, 2, 3]);

const sceneryShape = obj<Scenery>({
  id: int,
  defId: str,
  x: int,
  y: int,
  z: byte,
  rotation: oneOf(DIRS),
  edge: oneOf(EDGES),
  waterLevel: byte,
});

export const sceneryListShape: V<Scenery[]> = arr(sceneryShape);
