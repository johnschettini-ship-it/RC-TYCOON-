/** Save validators for awards and the tutorial run (Phase 5 §4.10–4.11, §5). Owner: W3-I. */
import { AWARD_IDS, type AwardRecord, type AwardState } from '../../sim/awards/types';
import type { TutorialRun } from '../../sim/tutorial/types';
import { arr, bool, int, literal, obj, oneOf, type V } from '../validate';

const awardId = oneOf(AWARD_IDS);

export const awardStateShape: V<AwardState> = obj<AwardState>({
  active: arr(awardId),
  history: arr(obj<AwardRecord>({ monthIndex: int, id: awardId })),
});

export const tutorialRunShape: V<TutorialRun> = obj<TutorialRun>({
  kind: literal('tutorial'),
  stepIndex: int,
  skipped: bool,
  done: bool,
});
