/** Monthly awards (Phase 5 §4.10). Owner: W3-I. Stored inside `GameState.scenario` (every kind but the tutorial). */
export type AwardId =
  | 'spotlessPark'
  | 'bestValue'
  | 'thrillSeekersChoice'
  | 'chillHaven'
  | 'perfectBalance'
  | 'nightOwlsFavourite'
  | 'litterbugPark'
  | 'ripOffPark'
  | 'queueNightmare'
  | 'breakdownCentral'
  | 'lostAndConfused'
  | 'darkAndDreary';

/** Table order: 6 positive, then 6 negative. */
export const AWARD_IDS: readonly AwardId[] = [
  'spotlessPark',
  'bestValue',
  'thrillSeekersChoice',
  'chillHaven',
  'perfectBalance',
  'nightOwlsFavourite',
  'litterbugPark',
  'ripOffPark',
  'queueNightmare',
  'breakdownCentral',
  'lostAndConfused',
  'darkAndDreary',
];

export interface AwardRecord {
  /** The month the award was won for; it is active during the next month. */
  monthIndex: number;
  id: AwardId;
}

/** `active`: awards in effect this month (won at the last month end). `history`: every award of the game. */
export interface AwardState {
  active: AwardId[];
  history: AwardRecord[];
}

export function emptyAwards(): AwardState {
  return { active: [], history: [] };
}
