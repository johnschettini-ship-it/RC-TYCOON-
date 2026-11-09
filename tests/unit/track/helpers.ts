/** Test helpers for the track system (W1-G). */
import { executeCommand } from '../../../src/sim/commands';
import type { CommandResult } from '../../../src/sim/commands/types';
import type { Dir } from '../../../src/sim/map';
import type { World } from '../../../src/sim/types';
import type { Ride } from '../../../src/sim/rides/types';
import type { TrackRideData } from '../../../src/sim/rides/track/types';

export type PieceSpec = string | { id: string; chain?: boolean; brakeSpeed?: number };

export function expectOk(r: CommandResult): Extract<CommandResult, { ok: true }> {
  if (!r.ok) throw new Error(`Command failed: ${r.reason}`);
  return r;
}

export function rideOf(world: World, id: number): Ride {
  const r = world.state.rides.find((x) => x.id === id);
  if (!r) throw new Error(`No ride ${id}`);
  return r;
}

export function dataOf(world: World, id: number): TrackRideData {
  const d = world.state.track.rides[String(id)];
  if (!d) throw new Error(`No track data ${id}`);
  return d;
}

export function place(world: World, typeId: string, x: number, y: number, dir: Dir, setup = true): number {
  const r = expectOk(executeCommand(world, { type: 'placeStation', typeId, x, y, dir }, { setup }));
  if (r.id === undefined) throw new Error('placeStation returned no id');
  return r.id;
}

export function add(world: World, rideId: number, spec: PieceSpec, setup = true): CommandResult {
  const p = typeof spec === 'string' ? { id: spec } : spec;
  const cmd: { type: 'addTrackPiece'; rideId: number; defId: string; chain?: boolean; brakeSpeed?: number } = { type: 'addTrackPiece', rideId, defId: p.id };
  if (p.chain !== undefined) cmd.chain = p.chain;
  if (p.brakeSpeed !== undefined) cmd.brakeSpeed = p.brakeSpeed;
  return executeCommand(world, cmd, { setup });
}

export function addAll(world: World, rideId: number, specs: PieceSpec[], setup = true): void {
  specs.forEach((s, i) => {
    const r = add(world, rideId, s, setup);
    if (!r.ok) throw new Error(`Piece ${i + 2} (${typeof s === 'string' ? s : s.id}) failed: ${r.reason}`);
  });
}

export function times(n: number, spec: PieceSpec): PieceSpec[] {
  return Array.from({ length: n }, () => spec);
}

const chain = (id: string): PieceSpec => ({ id, chain: true });

/** Reference circuit R1 after the first station piece (phase-2 §9.2). */
export const R1_PIECES: PieceSpec[] = [
  'station',
  'station',
  chain('flat_to_gentle_up'),
  chain('gentle_to_steep_up'),
  chain('steep_up'),
  chain('steep_to_gentle_up'),
  chain('gentle_up_to_flat'),
  'straight',
  'straight',
  'turn_medium_right',
  'flat_to_gentle_down',
  'gentle_to_steep_down',
  'steep_down',
  'steep_to_gentle_down',
  'gentle_down_to_flat',
  { id: 'brakes', brakeSpeed: 8 },
  'turn_medium_right',
  ...times(10, 'straight'),
  'turn_medium_right',
  ...times(6, 'straight'),
  'turn_medium_right',
];

/** Build R1: Steel Coaster, station at (4, 2), direction 0. */
export function buildR1(world: World, setup = true): number {
  const id = place(world, 'steel_coaster', 4, 2, 0, setup);
  addAll(world, id, R1_PIECES, setup);
  return id;
}

/**
 * R1 variant with 3 block brakes (same footprint): a block brake after the station, and two small
 * chain hills after block brakes so trains leaving a block brake at 2 m/s never stall.
 */
export const R1_BLOCKS: PieceSpec[] = [
  'station',
  'station',
  'block_brake',
  chain('flat_to_gentle_up'),
  chain('gentle_to_steep_up'),
  chain('steep_up'),
  chain('steep_to_gentle_up'),
  chain('gentle_up_to_flat'),
  chain('straight'),
  'turn_medium_right',
  'flat_to_gentle_down',
  'gentle_to_steep_down',
  'steep_down',
  'steep_to_gentle_down',
  'gentle_down_to_flat',
  { id: 'brakes', brakeSpeed: 8 },
  'turn_medium_right',
  'straight',
  'straight',
  'block_brake',
  chain('flat_to_gentle_up'),
  chain('gentle_up_to_flat'),
  'flat_to_gentle_down',
  'gentle_down_to_flat',
  'straight',
  'straight',
  'straight',
  'turn_medium_right',
  'block_brake',
  chain('flat_to_gentle_up'),
  chain('gentle_up_to_flat'),
  'flat_to_gentle_down',
  'gentle_down_to_flat',
  'straight',
  'turn_medium_right',
];

/** A 6-piece closed circuit of small turns around (10, 10). */
export const SMALL_LOOP: PieceSpec[] = ['turn_small_right', 'turn_small_right', 'straight', 'turn_small_right', 'turn_small_right'];
