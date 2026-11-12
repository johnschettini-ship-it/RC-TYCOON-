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

/** Map directions for `placeStation` (map `Dir`: 0 = N, 1 = E, 2 = S, 3 = W). E heads +x, the track `TrackDir` 0. */
export const NORTH: Dir = 0;
export const EAST: Dir = 1;
export const SOUTH: Dir = 2;
export const WEST: Dir = 3;

/** Place a station with the `placeStation` command; `dir` is a map `Dir`. */
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

/** Build R1: Steel Coaster, station at (4, 2), heading +x (map direction E, track direction 0). */
export function buildR1(world: World, setup = true): number {
  const id = place(world, 'steel_coaster', 4, 2, EAST, setup);
  addAll(world, id, R1_PIECES, setup);
  return id;
}

/**
 * R1 variant with 3 block brakes (same footprint). Each block section is longer than a train, and every
 * block brake is followed by a chain piece or a small chain hill, so a train leaving it at 2 m/s never stalls.
 */
export const R1_BLOCKS: PieceSpec[] = [
  'station',
  'station',
  chain('flat_to_gentle_up'),
  chain('gentle_to_steep_up'),
  chain('steep_up'),
  chain('steep_to_gentle_up'),
  chain('gentle_up_to_flat'),
  'block_brake',
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

/**
 * R2 (owner 2026-11-12): a closed Mini Railway circuit (station at (10, 10) heading +x) whose back straight is a hill
 * that climbs 10 m above the station, 2 m over the railway's old 8 m limit. Pieces after the first station.
 */
export const RAIL_HILL_PIECES: PieceSpec[] = [
  'station',
  ...times(10, 'straight'),
  'turn_medium_right',
  ...times(3, 'straight'),
  'turn_medium_right',
  'flat_to_gentle_up',
  ...times(4, 'gentle_up'),
  'gentle_up_to_flat',
  'flat_to_gentle_down',
  ...times(4, 'gentle_down'),
  'gentle_down_to_flat',
  'turn_medium_right',
  ...times(3, 'straight'),
  'turn_medium_right',
];

/**
 * R6 (owner 2026-11-12): one-car reference circuits for the train-length baseline (`fixtures/one-car-baseline.json`).
 * Each is built by commands on a fresh world and set to one car per train; a one-car train must measure exactly as
 * before the forces were averaged over the cars.
 */
export const ONE_CAR_CIRCUITS: { name: string; typeId: string; x: number; y: number; pieces: PieceSpec[] }[] = (() => {
  const c = (id: string): PieceSpec => ({ id, chain: true });
  const loop8: PieceSpec[] = [
    'station', 'straight', 'straight', 'turn_medium_right', 'straight', 'straight', 'straight', 'turn_medium_right',
    'straight', 'straight', 'straight', 'straight', 'turn_medium_right', 'straight', 'straight', 'straight', 'turn_medium_right',
  ];
  const water = (set: 'flume' | 'rapids'): PieceSpec[] => {
    const p = (s: string): string => `${set}_${s}`;
    const feature = set === 'flume' ? ['flume_drop', 'flume_splashdown'] : ['rapids_waterfall', 'rapids_rough', 'rapids_whirlpool'];
    return [
      p('station'), ...times(3, p('lift')), p('straight'), p('turn_small_r'), ...feature, p('turn_small_r'),
      ...times(6, p('straight')), p('turn_small_r'), ...times(3, p('straight')), p('turn_small_r'),
    ];
  };
  return [
    {
      name: 'spinning_mouse', typeId: 'spinning_mouse', x: 10, y: 10,
      pieces: [
        c('flat_to_gentle_up'), c('gentle_up'), c('gentle_up_to_flat'), 'block_brake', c('straight'), 'turn_small_right',
        'flat_to_gentle_down', 'gentle_down', 'gentle_down_to_flat', 'brakes', 'turn_small_right',
        'straight', 'straight', 'straight', 'straight', 'straight', 'straight', 'turn_small_right',
        'straight', 'straight', 'straight', 'block_brake', 'turn_small_right',
      ],
    },
    { name: 'log_flume', typeId: 'log_flume', x: 10, y: 10, pieces: water('flume') },
    { name: 'rapids_raft', typeId: 'rapids_raft', x: 10, y: 10, pieces: water('rapids') },
    { name: 'go_karts', typeId: 'go_karts', x: 10, y: 10, pieces: loop8 },
    { name: 'mini_railway_one_car', typeId: 'mini_railway', x: 10, y: 10, pieces: loop8 },
  ];
})();

/** Build one of `ONE_CAR_CIRCUITS` on `world` with one car per train; returns the ride id. */
export function buildOneCar(world: World, c: (typeof ONE_CAR_CIRCUITS)[number]): number {
  const id = place(world, c.typeId, c.x, c.y, EAST);
  addAll(world, id, c.pieces);
  expectOk(executeCommand(world, { type: 'setTrainConfig', rideId: id, trains: 1, carsPerTrain: 1 }, { setup: true }));
  return id;
}

/**
 * R7 (owner 2026-11-12): a Steel Coaster (station at (4, 2), heading +x) with a chained climb of `steep` steep pieces
 * (16 + 6 × steep m above the station), the same steep drop into a steep-to-gentle valley, two brakes at `brakeSpeed`,
 * and closed back on the ground. Pieces after the first station.
 */
export function dropCircuit(steep: number, brakeSpeed: number): PieceSpec[] {
  return [
    'station',
    'station',
    chain('flat_to_gentle_up'),
    chain('gentle_to_steep_up'),
    ...times(steep, chain('steep_up')),
    chain('steep_to_gentle_up'),
    chain('gentle_up_to_flat'),
    'straight',
    'straight',
    'turn_medium_right',
    'flat_to_gentle_down',
    'gentle_to_steep_down',
    ...times(steep, 'steep_down'),
    'steep_to_gentle_down',
    'gentle_down_to_flat',
    { id: 'brakes', brakeSpeed },
    { id: 'brakes', brakeSpeed },
    'turn_medium_right',
    ...times(9 + steep, 'straight'),
    'turn_medium_right',
    ...times(6 + steep, 'straight'),
    'turn_medium_right',
  ];
}

/**
 * R7: climbs 70 m and drops into the valley at about 34 m/s. With the default 4 cars the train's average stays under
 * 6.0 G (about 4.85 G, ratings) while the rear car's own 5-tick window passes it (about 6.2 G, safety).
 */
export const UNSAFE_DROP_PIECES: PieceSpec[] = dropCircuit(9, 10);

/**
 * R7 (review I-2): climbs 64 m. With 4 cars each car's own 5-tick window stays at or under 6.0 G (about 5.96 G), while a
 * window of the per-tick strongest car (a different car each tick) would pass it (about 6.14 G).
 */
export const NEAR_LIMIT_DROP_PIECES: PieceSpec[] = dropCircuit(8, 8);

/**
 * R7: R1 with a straight and a small turn after its brakes (station at (4, 2), heading +x). Each car takes the small turn
 * at about 8 m/s and passes 3.0 G sideways in its own window while the train's average stays near 1.1 G.
 */
export const SHARP_TURN_PIECES: PieceSpec[] = [
  ...R1_PIECES.slice(0, 15),
  { id: 'brakes', brakeSpeed: 8 },
  'straight',
  'turn_small_right',
  ...times(12, 'straight'),
  'turn_medium_right',
  ...times(5, 'straight'),
  'turn_medium_right',
];
