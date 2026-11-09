/** Piece table (phase-2-coasters.md §4.2). Owner: W1-G; the water sets (Phase 4 §4.4) are added by W3-C. Costs in cents; lengths in mm. */
import type { PieceGeometry, PieceGroup, PieceSpecial, TrackBank, TrackPieceDef, TrackSlope } from './types';
import { WATER_PIECES } from './waterPieces';

type Exit = TrackPieceDef['exit'];
const T00: ReadonlyArray<readonly [number, number]> = [[0, 0]];

function block(x0: number, x1: number, y0: number, y1: number): ReadonlyArray<readonly [number, number]> {
  const out: [number, number][] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push([x, y]);
  return out;
}

interface Row {
  num: number;
  id: string;
  name: string;
  group: PieceGroup;
  entry: [TrackSlope, TrackBank];
  exit: [number, number, number, -1 | 0 | 1, TrackSlope, TrackBank];
  tiles?: ReadonlyArray<readonly [number, number]>;
  rail: [number, number];
  lengthMm: number;
  kv?: number;
  kh?: number;
  geometry: PieceGeometry;
  dollars: number;
  chainable?: boolean;
  inversions?: number;
  turnKind?: 'small' | 'medium';
  special?: PieceSpecial;
}

const STRAIGHT: PieceGeometry = { kind: 'straight' };
const TRANS: PieceGeometry = { kind: 'transition' };
const BANK: PieceGeometry = { kind: 'bank' };

const ROWS: Row[] = [
  { num: 1, id: 'station', name: 'Station', group: 'S', entry: ['F', 'none'], exit: [1, 0, 0, 0, 'F', 'none'], rail: [0, 0], lengthMm: 4000, geometry: STRAIGHT, dollars: 60, special: 'station' },
  { num: 2, id: 'straight', name: 'Straight', group: 'St', entry: ['F', 'none'], exit: [1, 0, 0, 0, 'F', 'none'], rail: [0, 0], lengthMm: 4000, geometry: STRAIGHT, dollars: 25, chainable: true },
  { num: 3, id: 'gentle_up', name: 'Gentle slope up', group: 'G', entry: ['G+', 'none'], exit: [1, 0, 2, 0, 'G+', 'none'], rail: [0, 2], lengthMm: 4472, geometry: STRAIGHT, dollars: 35, chainable: true },
  { num: 4, id: 'gentle_down', name: 'Gentle slope down', group: 'G', entry: ['G-', 'none'], exit: [1, 0, -2, 0, 'G-', 'none'], rail: [-2, 0], lengthMm: 4472, geometry: STRAIGHT, dollars: 35 },
  { num: 5, id: 'steep_up', name: 'Steep slope up', group: 'X', entry: ['X+', 'none'], exit: [1, 0, 6, 0, 'X+', 'none'], rail: [0, 6], lengthMm: 7211, geometry: STRAIGHT, dollars: 50, chainable: true },
  { num: 6, id: 'steep_down', name: 'Steep slope down', group: 'X', entry: ['X-', 'none'], exit: [1, 0, -6, 0, 'X-', 'none'], rail: [-6, 0], lengthMm: 7211, geometry: STRAIGHT, dollars: 50 },
  { num: 7, id: 'flat_to_gentle_up', name: 'Flat to gentle up', group: 'G', entry: ['F', 'none'], exit: [1, 0, 1, 0, 'G+', 'none'], rail: [0, 1], lengthMm: 4123, kv: 1 / 24, geometry: TRANS, dollars: 40, chainable: true },
  { num: 8, id: 'gentle_up_to_flat', name: 'Gentle up to flat', group: 'G', entry: ['G+', 'none'], exit: [1, 0, 1, 0, 'F', 'none'], rail: [0, 1], lengthMm: 4123, kv: -1 / 24, geometry: TRANS, dollars: 40, chainable: true },
  { num: 9, id: 'flat_to_gentle_down', name: 'Flat to gentle down', group: 'G', entry: ['F', 'none'], exit: [1, 0, -1, 0, 'G-', 'none'], rail: [-1, 0], lengthMm: 4123, kv: -1 / 24, geometry: TRANS, dollars: 40 },
  { num: 10, id: 'gentle_down_to_flat', name: 'Gentle down to flat', group: 'G', entry: ['G-', 'none'], exit: [1, 0, -1, 0, 'F', 'none'], rail: [-1, 0], lengthMm: 4123, kv: 1 / 24, geometry: TRANS, dollars: 40 },
  { num: 11, id: 'gentle_to_steep_up', name: 'Gentle to steep up', group: 'X', entry: ['G+', 'none'], exit: [1, 0, 4, 0, 'X+', 'none'], rail: [0, 4], lengthMm: 5657, kv: 1 / 20, geometry: TRANS, dollars: 45, chainable: true },
  { num: 12, id: 'steep_to_gentle_up', name: 'Steep to gentle up', group: 'X', entry: ['X+', 'none'], exit: [1, 0, 4, 0, 'G+', 'none'], rail: [0, 4], lengthMm: 5657, kv: -1 / 20, geometry: TRANS, dollars: 45, chainable: true },
  { num: 13, id: 'gentle_to_steep_down', name: 'Gentle to steep down', group: 'X', entry: ['G-', 'none'], exit: [1, 0, -4, 0, 'X-', 'none'], rail: [-4, 0], lengthMm: 5657, kv: -1 / 20, geometry: TRANS, dollars: 45 },
  { num: 14, id: 'steep_to_gentle_down', name: 'Steep to gentle down', group: 'X', entry: ['X-', 'none'], exit: [1, 0, -4, 0, 'G-', 'none'], rail: [-4, 0], lengthMm: 5657, kv: 1 / 20, geometry: TRANS, dollars: 45 },
  { num: 15, id: 'turn_small_left', name: 'Small turn left', group: 'Ts', entry: ['F', 'none'], exit: [0, -1, 0, -1, 'F', 'none'], rail: [0, 0], lengthMm: 3142, kh: -1 / 2, geometry: { kind: 'turn', radiusM: 2, side: 'left' }, dollars: 35, turnKind: 'small' },
  { num: 16, id: 'turn_small_right', name: 'Small turn right', group: 'Ts', entry: ['F', 'none'], exit: [0, 1, 0, 1, 'F', 'none'], rail: [0, 0], lengthMm: 3142, kh: 1 / 2, geometry: { kind: 'turn', radiusM: 2, side: 'right' }, dollars: 35, turnKind: 'small' },
  { num: 17, id: 'turn_medium_left', name: 'Medium turn left', group: 'Tm', entry: ['F', 'none'], exit: [2, -3, 0, -1, 'F', 'none'], tiles: block(0, 2, -2, 0), rail: [0, 0], lengthMm: 15708, kh: -1 / 10, geometry: { kind: 'turn', radiusM: 10, side: 'left' }, dollars: 120, turnKind: 'medium' },
  { num: 18, id: 'turn_medium_right', name: 'Medium turn right', group: 'Tm', entry: ['F', 'none'], exit: [2, 3, 0, 1, 'F', 'none'], tiles: block(0, 2, 0, 2), rail: [0, 0], lengthMm: 15708, kh: 1 / 10, geometry: { kind: 'turn', radiusM: 10, side: 'right' }, dollars: 120, turnKind: 'medium' },
  { num: 19, id: 'bank_left_in', name: 'Bank left', group: 'B', entry: ['F', 'none'], exit: [1, 0, 0, 0, 'F', 'left'], rail: [0, 0], lengthMm: 4000, geometry: BANK, dollars: 40 },
  { num: 20, id: 'bank_left_out', name: 'Level from left bank', group: 'B', entry: ['F', 'left'], exit: [1, 0, 0, 0, 'F', 'none'], rail: [0, 0], lengthMm: 4000, geometry: BANK, dollars: 40 },
  { num: 21, id: 'bank_right_in', name: 'Bank right', group: 'B', entry: ['F', 'none'], exit: [1, 0, 0, 0, 'F', 'right'], rail: [0, 0], lengthMm: 4000, geometry: BANK, dollars: 40 },
  { num: 22, id: 'bank_right_out', name: 'Level from right bank', group: 'B', entry: ['F', 'right'], exit: [1, 0, 0, 0, 'F', 'none'], rail: [0, 0], lengthMm: 4000, geometry: BANK, dollars: 40 },
  { num: 23, id: 'banked_turn_medium_left', name: 'Banked turn left', group: 'B', entry: ['F', 'left'], exit: [2, -3, 0, -1, 'F', 'left'], tiles: block(0, 2, -2, 0), rail: [0, 0], lengthMm: 15708, kh: -1 / 10, geometry: { kind: 'turn', radiusM: 10, side: 'left' }, dollars: 150, turnKind: 'medium' },
  { num: 24, id: 'banked_turn_medium_right', name: 'Banked turn right', group: 'B', entry: ['F', 'right'], exit: [2, 3, 0, 1, 'F', 'right'], tiles: block(0, 2, 0, 2), rail: [0, 0], lengthMm: 15708, kh: 1 / 10, geometry: { kind: 'turn', radiusM: 10, side: 'right' }, dollars: 150, turnKind: 'medium' },
  { num: 25, id: 'brakes', name: 'Brakes', group: 'Br', entry: ['F', 'none'], exit: [1, 0, 0, 0, 'F', 'none'], rail: [0, 0], lengthMm: 4000, geometry: STRAIGHT, dollars: 60, special: 'brakes' },
  { num: 26, id: 'block_brake', name: 'Block brake', group: 'BB', entry: ['F', 'none'], exit: [1, 0, 0, 0, 'F', 'none'], rail: [0, 0], lengthMm: 4000, geometry: STRAIGHT, dollars: 90, special: 'blockBrake' },
  { num: 27, id: 'vertical_loop_left', name: 'Vertical loop left', group: 'L', entry: ['F', 'none'], exit: [4, -1, 0, 0, 'F', 'none'], tiles: block(0, 3, -1, 0), rail: [0, 16], lengthMm: 50265, geometry: { kind: 'loop', side: 'left' }, dollars: 900, inversions: 1 },
  { num: 28, id: 'vertical_loop_right', name: 'Vertical loop right', group: 'L', entry: ['F', 'none'], exit: [4, 1, 0, 0, 'F', 'none'], tiles: block(0, 3, 0, 1), rail: [0, 16], lengthMm: 50265, geometry: { kind: 'loop', side: 'right' }, dollars: 900, inversions: 1 },
  { num: 29, id: 'spooky_tunnel', name: 'Spooky tunnel', group: 'Sp', entry: ['F', 'none'], exit: [1, 0, 0, 0, 'F', 'none'], rail: [0, 0], lengthMm: 4000, geometry: STRAIGHT, dollars: 150, special: 'spooky' },
];

function toDef(r: Row): TrackPieceDef {
  const exit: Exit = { dx: r.exit[0], dy: r.exit[1], dz: r.exit[2], turn: r.exit[3], slope: r.exit[4], bank: r.exit[5] };
  return Object.freeze({
    num: r.num,
    id: r.id,
    name: r.name,
    group: r.group,
    set: 'rail',
    entry: { slope: r.entry[0], bank: r.entry[1] },
    exit,
    tiles: r.tiles ?? T00,
    railMin: r.rail[0],
    railMax: r.rail[1],
    lengthMm: r.lengthMm,
    kv: r.kv ?? 0,
    kh: r.kh ?? 0,
    geometry: r.geometry,
    cost: r.dollars * 100,
    chainable: r.chainable === true,
    inversions: r.inversions ?? 0,
    turnKind: r.turnKind ?? null,
    special: r.special ?? null,
    water: null,
  });
}

/** The 29 rail pieces of the phase-2 §4.2 table. */
export const TRACK_PIECES: readonly TrackPieceDef[] = Object.freeze(ROWS.map(toDef));

export { WATER_PIECES };

/** Rail pieces then water pieces (Phase 4 §4.4): every piece any track type can build. */
export const ALL_TRACK_PIECES: readonly TrackPieceDef[] = Object.freeze([...TRACK_PIECES, ...WATER_PIECES]);

const BY_ID: ReadonlyMap<string, TrackPieceDef> = new Map(ALL_TRACK_PIECES.map((p) => [p.id, p]));

export function getTrackPieceDef(id: string): TrackPieceDef | undefined {
  return BY_ID.get(id);
}
