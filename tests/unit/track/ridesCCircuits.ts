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

