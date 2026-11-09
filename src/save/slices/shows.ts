/** Save validator for `GameState.shows` (Phase 6 §5). Owner: W4-C. Ids, tiles, and defIds: `integrity.ts`. */
import type { Dir } from '../../sim/map';
import type { ShowSchedule, ShowSite, ShowStatus, ShowTotals } from '../../sim/shows/types';
import { arr, bool, every, int, obj, oneOf, str, type V } from '../validate';

const DIRS = every<Dir>()([0, 1, 2, 3]);
const STATUSES = every<ShowStatus>()(['idle', 'announced', 'running', 'done']);

const showSiteShape = obj<ShowSite>({
  id: int,
  defId: str,
  x: int,
  y: int,
  rotation: oneOf(DIRS),
  schedule: obj<ShowSchedule>({ hour: int, minute: oneOf([0, 30] as const), everyNDays: int, enabled: bool }),
  status: oneOf(STATUSES),
  nextShowTick: int,
  startTick: int,
  lastWatchers: int,
  totals: obj<ShowTotals>({ shows: int, cost: int, watchers: int }),
  totalBuildCost: int,
  builtTick: int,
});

export const showsShape: V<ShowSite[]> = arr(showSiteShape);
