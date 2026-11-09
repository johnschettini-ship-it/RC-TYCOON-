/**
 * Water piece sets (Phase 4 §4.4): the 17 rows of the Log Flume and Rapids Raft table (21 ids with the left/right
 * turns). Owner: W3-C. Costs in cents (before the type's piece factor), lengths in mm.
 *
 * Geometry uses the Phase 2 names and numbers (master R17): gentle slope 2 m per tile, steep slope 6 m per tile,
 * small turn 1 tile (radius 2 m), medium turn 3 × 3 tiles (radius 10 m). Every water joint is flat, so the pieces join
 * without transition pieces: slopes are `ramp` channels at the constant gentle or steep pitch (κv = 0, phase-2 §4.3).
 * Piece costs are not in the spec; they follow the Phase 2 costs of the same geometry (tuning starting values).
 */
import { V_LIFT, V_STATION_CONVEYOR } from '../tuning/track';
import type { PieceGeometry, PieceGroup, PieceSet, PieceSpecial, TrackPieceDef, WaterDrive } from './types';

const T00: ReadonlyArray<readonly [number, number]> = [[0, 0]];

function block(x0: number, x1: number, y0: number, y1: number): ReadonlyArray<readonly [number, number]> {
  const out: [number, number][] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push([x, y]);
  return out;
}

type Shape = 'station' | 'straight' | 'turnSmallL' | 'turnSmallR' | 'turnMediumL' | 'turnMediumR' | 'slopeDown' | 'drop' | 'lift' | 'splashdown';

interface ShapeInfo {
  group: PieceGroup;
  exit: [number, number, number, -1 | 0 | 1];
  tiles: ReadonlyArray<readonly [number, number]>;
  rail: [number, number];
  lengthMm: number;
  kh: number;
  geometry: PieceGeometry;
  turnKind: 'small' | 'medium' | null;
}

const STRAIGHT: PieceGeometry = { kind: 'straight' };

/** Geometry per shape (Phase 2 §4.2 rows 1, 2, 15–18 and the gentle / steep slope numbers). */
const SHAPES: Readonly<Record<Shape, ShapeInfo>> = {
  station: { group: 'S', exit: [1, 0, 0, 0], tiles: T00, rail: [0, 0], lengthMm: 4000, kh: 0, geometry: STRAIGHT, turnKind: null },
  straight: { group: 'St', exit: [1, 0, 0, 0], tiles: T00, rail: [0, 0], lengthMm: 4000, kh: 0, geometry: STRAIGHT, turnKind: null },
  turnSmallL: { group: 'Ts', exit: [0, -1, 0, -1], tiles: T00, rail: [0, 0], lengthMm: 3142, kh: -1 / 2, geometry: { kind: 'turn', radiusM: 2, side: 'left' }, turnKind: 'small' },
  turnSmallR: { group: 'Ts', exit: [0, 1, 0, 1], tiles: T00, rail: [0, 0], lengthMm: 3142, kh: 1 / 2, geometry: { kind: 'turn', radiusM: 2, side: 'right' }, turnKind: 'small' },
  turnMediumL: { group: 'Tm', exit: [2, -3, 0, -1], tiles: block(0, 2, -2, 0), rail: [0, 0], lengthMm: 15708, kh: -1 / 10, geometry: { kind: 'turn', radiusM: 10, side: 'left' }, turnKind: 'medium' },
  turnMediumR: { group: 'Tm', exit: [2, 3, 0, 1], tiles: block(0, 2, 0, 2), rail: [0, 0], lengthMm: 15708, kh: 1 / 10, geometry: { kind: 'turn', radiusM: 10, side: 'right' }, turnKind: 'medium' },
  // Gentle slope: 2 m over one 4 m tile, √20 m long; steep slope: 6 m, √52 m long.
  slopeDown: { group: 'G', exit: [1, 0, -2, 0], tiles: T00, rail: [-2, 0], lengthMm: 4472, kh: 0, geometry: { kind: 'ramp', slope: 'G-' }, turnKind: null },
  drop: { group: 'X', exit: [1, 0, -6, 0], tiles: T00, rail: [-6, 0], lengthMm: 7211, kh: 0, geometry: { kind: 'ramp', slope: 'X-' }, turnKind: null },
  lift: { group: 'G', exit: [1, 0, 2, 0], tiles: T00, rail: [0, 2], lengthMm: 4472, kh: 0, geometry: { kind: 'ramp', slope: 'G+' }, turnKind: null },
  // "Straight, 2 tiles".
  splashdown: { group: 'W', exit: [2, 0, 0, 0], tiles: block(0, 1, 0, 0), rail: [0, 0], lengthMm: 8000, kh: 0, geometry: STRAIGHT, turnKind: null },
};

interface Row {
  id: string;
  name: string;
  shape: Shape;
  /** Overrides the shape's group (water features). */
  group?: PieceGroup;
  drive: WaterDrive;
  dollars: number;
  special?: PieceSpecial;
  wets?: boolean;
}

const FLUME: Row[] = [
  { id: 'flume_station', name: 'Flume station', shape: 'station', drive: 'conveyor', dollars: 60, special: 'station' },
  { id: 'flume_straight', name: 'Flume straight', shape: 'straight', drive: 'current', dollars: 25 },
  { id: 'flume_turn_small_l', name: 'Flume small turn left', shape: 'turnSmallL', drive: 'current', dollars: 35 },
  { id: 'flume_turn_small_r', name: 'Flume small turn right', shape: 'turnSmallR', drive: 'current', dollars: 35 },
  { id: 'flume_turn_medium_l', name: 'Flume medium turn left', shape: 'turnMediumL', drive: 'current', dollars: 120 },
  { id: 'flume_turn_medium_r', name: 'Flume medium turn right', shape: 'turnMediumR', drive: 'current', dollars: 120 },
  { id: 'flume_slope_down', name: 'Flume slope down', shape: 'slopeDown', drive: 'current', dollars: 35 },
  { id: 'flume_drop', name: 'Flume drop', shape: 'drop', drive: 'gravity', dollars: 50 },
  { id: 'flume_lift', name: 'Flume lift', shape: 'lift', drive: 'conveyor', dollars: 55 },
  { id: 'flume_splashdown', name: 'Splashdown', shape: 'splashdown', drive: 'splash', dollars: 120, special: 'splashdown', wets: true },
];

const RAPIDS: Row[] = [
  { id: 'rapids_station', name: 'Rapids station', shape: 'station', drive: 'conveyor', dollars: 60, special: 'station' },
  { id: 'rapids_straight', name: 'Rapids straight', shape: 'straight', drive: 'current', dollars: 25 },
  { id: 'rapids_turn_small_l', name: 'Rapids small turn left', shape: 'turnSmallL', drive: 'current', dollars: 35 },
  { id: 'rapids_turn_small_r', name: 'Rapids small turn right', shape: 'turnSmallR', drive: 'current', dollars: 35 },
  { id: 'rapids_turn_medium_l', name: 'Rapids medium turn left', shape: 'turnMediumL', drive: 'current', dollars: 120 },
  { id: 'rapids_turn_medium_r', name: 'Rapids medium turn right', shape: 'turnMediumR', drive: 'current', dollars: 120 },
  { id: 'rapids_slope_down', name: 'Rapids slope down', shape: 'slopeDown', drive: 'current', dollars: 35 },
  { id: 'rapids_waterfall', name: 'Waterfall', shape: 'drop', drive: 'gravity', dollars: 70, special: 'waterfall', wets: true },
  { id: 'rapids_rough', name: 'Rough water', shape: 'straight', group: 'W', drive: 'current', dollars: 40, special: 'rough' },
  { id: 'rapids_whirlpool', name: 'Whirlpool', shape: 'straight', group: 'W', drive: 'whirlpool', dollars: 90, special: 'whirlpool' },
  { id: 'rapids_lift', name: 'Rapids lift', shape: 'lift', drive: 'conveyor', dollars: 55 },
];

function conveyorMms(r: Row): number {
  if (r.drive !== 'conveyor') return 0;
  return Math.round((r.shape === 'station' ? V_STATION_CONVEYOR : V_LIFT) * 1000);
}

function toDef(r: Row, num: number, set: PieceSet): TrackPieceDef {
  const sh = SHAPES[r.shape];
  return Object.freeze({
    num,
    id: r.id,
    name: r.name,
    group: r.group ?? sh.group,
    set,
    entry: { slope: 'F', bank: 'none' },
    exit: { dx: sh.exit[0], dy: sh.exit[1], dz: sh.exit[2], turn: sh.exit[3], slope: 'F', bank: 'none' },
    tiles: sh.tiles,
    railMin: sh.rail[0],
    railMax: sh.rail[1],
    lengthMm: sh.lengthMm,
    kv: 0,
    kh: sh.kh,
    geometry: sh.geometry,
    cost: r.dollars * 100,
    chainable: false,
    inversions: 0,
    turnKind: sh.turnKind,
    special: r.special ?? null,
    water: Object.freeze({ drive: r.drive, conveyorMms: conveyorMms(r), wetsRiders: r.wets === true }),
  } satisfies TrackPieceDef);
}

/** First row number of the water pieces (the rail table ends at 29). */
const FIRST_NUM = 30;

/** Log Flume pieces then Rapids Raft pieces, in Phase 4 §4.4 table order. */
export const WATER_PIECES: readonly TrackPieceDef[] = Object.freeze([
  ...FLUME.map((r, i) => toDef(r, FIRST_NUM + i, 'flume')),
  ...RAPIDS.map((r, i) => toDef(r, FIRST_NUM + FLUME.length + i, 'rapids')),
]);
