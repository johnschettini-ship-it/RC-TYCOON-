/**
 * Facility tuning (phase-3-management.md §4.10 and §8). Owner: W2-C. Starting values for play-testing.
 * Needs use the 0–255 scale. Money is integer cents. Times are ticks. Tests read these constants.
 * Item effects, prices, and the Cash Machine amounts stay in the catalog (`src/data/catalog/stalls.ts`).
 */
import type { StallKind } from '../catalog/types';

// ---------------------------------------------------------------- impulse buys (§4.10, §8)

/** §8 `IMPULSE`: chance per pass over a stall's service tile (food / drink / souvenir / info). Other kinds: no impulse. */
export const IMPULSE: Readonly<Partial<Record<StallKind, number>>> = { food: 0.05, drink: 0.05, souvenir: 0.06, info: 0.1 };

// ---------------------------------------------------------------- balloons (§4.10, §8)

/** §8 `BALLOON_LOSS`: chance per game hour that a held balloon floats away. */
export const BALLOON_LOSS = 0.01;
/** §4.10: happiness lost when the balloon floats away. */
export const BALLOON_LOSS_HAPPY = 5;

// ---------------------------------------------------------------- maps, wrong turns, lost (§4.10, §8)

/** §8 `WRONG_TURN`: chance per step on a junction that a guest without a map takes a non-best neighbour. */
export const WRONG_TURN = 0.08;
/** §4.10: a lost guest uses WRONG_TURN × this. */
export const LOST_WRONG_TURN_FACTOR = 2;
/** §4.10: a junction has at least this many walkable neighbours. */
export const JUNCTION_MIN_NEIGHBOURS = 3;
/** §8 `LOST_STEPS`: steps without getting closer to the target before a guest is lost. */
export const LOST_STEPS = 60;
/** §4.10: happiness a lost guest loses per decision. */
export const LOST_HAPPY = 1;

// ---------------------------------------------------------------- First Aid and Cash Machine (§4.10, §8)

/** §8 `FIRST_AID_NAUSEA`: a guest at or above this nausea targets the nearest First Aid. */
export const FIRST_AID_NAUSEA = 150;
/** §8 `CASH_MACHINE_HAPPY`: a guest needs at least this happiness to go to a Cash Machine. */
export const CASH_MACHINE_HAPPY = 100;
/** §4.10: a guest makes fewer than this many withdrawals per visit. */
export const CASH_MACHINE_MAX_WITHDRAWALS = 2;

// ---------------------------------------------------------------- thoughts (§4.16)

/**
 * "A cocoa would be nice" (§4.16 lists the thought, not its trigger). Not in the spec: a walking guest
 * with thirst at or above this thinks it while the weather raises Cocoa Hut sales and one is open.
 */
export const COCOA_THOUGHT_THIRST = 100;
