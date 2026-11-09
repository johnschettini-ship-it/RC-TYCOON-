/** Save validator for `GameState.elevatedPaths` (Phase 4 §4.2, §5). Owner: W3-B. Ids and tiles: `integrity.ts`. */
import type { ElevatedPath, RampDir } from '../../sim/paths/types';
import { arr, byte, every, int, obj, oneOf, type V } from '../validate';

const RAMP_DIRS = every<RampDir>()([-1, 0, 1, 2, 3]);

const elevatedPathShape = obj<ElevatedPath>({
  id: int,
  x: int,
  y: int,
  z: byte,
  kind: oneOf(['footpath', 'queue'] as const),
  rampDir: oneOf(RAMP_DIRS),
});

export const elevatedPathsShape: V<ElevatedPath[]> = arr(elevatedPathShape);
