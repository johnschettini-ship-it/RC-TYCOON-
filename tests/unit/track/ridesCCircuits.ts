/**
 * New rides batch C test circuits (docs/superpowers/specs/2026-11-17-new-rides-design.md): one small valid circuit per
 * track type, built through the real build commands. Shared by tests/unit/track/ridesC.test.ts (ratings) and
 * tests/unit/render/track/ridesCRender.test.ts (today's look).
 */
import { expect } from 'vitest';
import { executeCommand } from '../../../src/sim/commands';
import type { TestResult } from '../../../src/sim/rides/track/types';
import type { World } from '../../../src/sim/types';
import { runTicks } from '../../helpers/world';
import { addAll, dataOf, EAST, expectOk, place, times, type PieceSpec } from './helpers';

const chain = (id: string): PieceSpec => ({ id, chain: true });

export function buildCircuit(w: World, typeId: string, x: number, y: number, pieces: readonly PieceSpec[]): number {
  const id = place(w, typeId, x, y, EAST);
  addAll(w, id, [...pieces]);
  expect(dataOf(w, id).circuitClosed).toBe(true);
  return id;
}

export function testLap(w: World, id: number): TestResult {
  expectOk(executeCommand(w, { type: 'startTestRun', rideId: id }));
  runTicks(w, (dataOf(w, id).testRun?.ticksLeft ?? 0) + 1);
  const t = dataOf(w, id).test;
  if (!t) throw new Error('no test result');
  return t;
}

/** Mine Train from (6, 4) heading +x: a 6 m chain hill, then low drops and many small turns. */
export const MINE_TRAIN: PieceSpec[] = [
  'station', 'station',
  chain('flat_to_gentle_up'), chain('gentle_up'), chain('gentle_up'), chain('gentle_up_to_flat'),
  'turn_small_right', 'flat_to_gentle_down', 'gentle_down_to_flat', 'turn_small_left', 'straight', 'flat_to_gentle_down', 'gentle_down_to_flat',
  'turn_medium_right', 'turn_medium_right', 'turn_medium_right', 'straight', 'turn_small_left', 'straight', 'turn_small_right', 'straight',
  'turn_small_left', 'straight', 'flat_to_gentle_down', 'gentle_down_to_flat', 'straight', { id: 'brakes', brakeSpeed: 7 },
  'turn_small_right', 'turn_small_left', 'turn_small_right', 'turn_small_right',
];


const BRAKE_7: PieceSpec = { id: 'brakes', brakeSpeed: 7 };
const DOWN_12: PieceSpec[] = ['flat_to_gentle_down', 'gentle_down', 'gentle_to_steep_down', 'steep_to_gentle_down', 'gentle_down_to_flat'];

/**
 * Launch Coaster from (6, 4) heading +x (review fix P2-2): seven launch pieces (to 32 m/s, no chain) and a top hat that
 * climbs 40 m, the type's intensity step height; then brakes and three 12 m drops down in stages (a single 40 m drop
 * would pass 5 G in the pull-out), and turns home (the closing pieces are Auto-finish's).
 */
export const LAUNCH_COASTER: PieceSpec[] = [
  'station', 'station', ...times(7, 'launch'),
  'flat_to_gentle_up', 'gentle_to_steep_up', ...times(5, 'steep_up'), 'steep_to_gentle_up', 'gentle_up_to_flat',
  BRAKE_7, 'turn_medium_right', ...DOWN_12, BRAKE_7, ...DOWN_12, BRAKE_7, 'turn_medium_right', ...DOWN_12, BRAKE_7,
  'flat_to_gentle_down', 'gentle_down_to_flat', 'flat_to_gentle_down', 'gentle_down_to_flat',
  'turn_medium_right', 'turn_medium_left', 'turn_medium_right', ...times(5, 'straight'), BRAKE_7, 'turn_medium_left', 'turn_small_right', 'turn_small_right',
];

/**
 * Water Coaster from (6, 4) heading +x: a 16 m chain hill, a 16 m drop into the Log Flume's splashdown and channel
 * straight, a small chain hill, and turns home.
 */
export const WATER_COASTER: PieceSpec[] = [
  'station', 'station',
  chain('flat_to_gentle_up'), chain('gentle_to_steep_up'), chain('steep_up'), chain('steep_to_gentle_up'), chain('gentle_up_to_flat'),
  'turn_medium_right', 'flat_to_gentle_down', 'gentle_to_steep_down', 'steep_down', 'steep_to_gentle_down', 'gentle_down_to_flat',
  'flume_splashdown', 'flume_straight', chain('flat_to_gentle_up'), chain('gentle_up_to_flat'),
  'turn_medium_right', 'flat_to_gentle_down', 'gentle_down_to_flat',
  'turn_medium_right', 'turn_medium_left', 'turn_small_right', ...times(8, 'straight'), 'turn_small_left', 'turn_small_right', 'turn_small_right',
];

const LIFT_16: PieceSpec[] = [chain('flat_to_gentle_up'), chain('gentle_to_steep_up'), chain('steep_up'), chain('steep_to_gentle_up'), chain('gentle_up_to_flat')];
const DROP_12: PieceSpec[] = ['flat_to_gentle_down', 'gentle_down', 'gentle_to_steep_down', 'steep_to_gentle_down', 'gentle_down_to_flat'];

/**
 * Flying Coaster from (4, 2) heading +x: the Inverted Coaster's reference circuit (tests/unit/track/phase6Rides.test.ts):
 * a 16 m lift, a helix down, a 12 m drop, a corkscrew, brakes and medium turns home.
 */
export const FLYING_COASTER: PieceSpec[] = [
  'station', 'station', ...LIFT_16, 'helix_right_down', 'turn_medium_right', ...DROP_12, 'corkscrew_right',
  { id: 'brakes', brakeSpeed: 8 }, 'turn_medium_right', ...times(11, 'straight'), 'turn_medium_right', ...times(9, 'straight'), 'turn_medium_right',
];

const UP_8: PieceSpec[] = ['flat_to_gentle_up', ...times(3, 'gentle_up'), 'gentle_up_to_flat'];
const DOWN_8: PieceSpec[] = ['flat_to_gentle_down', ...times(3, 'gentle_down'), 'gentle_down_to_flat'];

/**
 * Sky Ride from (6, 4) heading +x: a station at each end (stations stand on the ground), the rope climbing 8 m over
 * the span between them both ways, and turns home.
 */
export const SKY_RIDE: PieceSpec[] = [
  'station', 'station', ...UP_8, ...times(3, 'straight'), ...DOWN_8,
  'turn_medium_right', 'station', 'station', 'turn_medium_right', ...UP_8, ...times(3, 'straight'), ...DOWN_8,
  'turn_medium_right', ...times(3, 'straight'), 'turn_small_left', 'turn_small_right', 'turn_small_right',
];
