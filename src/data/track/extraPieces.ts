/**
 * Phase 6 track pieces (phase-6-polish.md §4.5, content-catalog.md §8). Owner: W4-D. Costs in cents (before the type's
 * piece factor), lengths in mm.
 *
 * | Piece | Track types | Footprint | Height change | Inversions | Min entry speed | Cost |
 * |---|---|---|---|---|---|---|
 * | Corkscrew (left, right) | Steel, Inverted | 3 tiles straight | 0 | 1 | 10 m/s | ×3 |
 * | Helix (left, right; up, down) | Steel, Inverted, Bobsled | 3×3, 360° turn | ±4 m | 0 | — | ×5 |
 *
 * Lengths are the arc lengths of the geometry in `sim/rides/track/geometry.ts` (corkscrew: the rail's spiral, 3 tiles
 * long, radius 1.4 m round a heartline that rises 1 m; helix: 6 m lead, a 4.8 m circle, 6 m lead, climbing 4 m on a
 * smooth step), computed once and rounded to the mm.
 */
import { CORKSCREW_COST_MULTIPLE, CORKSCREW_MIN_ENTRY, HELIX_COST_MULTIPLE, HELIX_RADIUS_M, HELIX_RISE_M } from '../tuning/track';
import type { TrackPieceDef } from './types';

/** Straight piece cost (phase-2 §4.2 row 2), cents: the base of the Phase 6 cost multiples. */
const STRAIGHT_CENTS = 2_500;

const ROW: ReadonlyArray<readonly [number, number]> = [[0, 0], [1, 0], [2, 0]];

function block(x0: number, x1: number, y0: number, y1: number): ReadonlyArray<readonly [number, number]> {
  const out: [number, number][] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push([x, y]);
  return out;
}

const CORKSCREW_MM = 15_919;
const HELIX_MM = 42_386;

function corkscrew(num: number, side: 'left' | 'right'): TrackPieceDef {
  return Object.freeze({
    num,
    id: `corkscrew_${side}`,
    name: side === 'left' ? 'Corkscrew left' : 'Corkscrew right',
    group: 'Cs',
    set: 'rail',
    entry: { slope: 'F', bank: 'none' },
    exit: { dx: 3, dy: 0, dz: 0, turn: 0, slope: 'F', bank: 'none' },
    tiles: ROW,
    railMin: 0,
    railMax: 4,
    lengthMm: CORKSCREW_MM,
    kv: 0,
    kh: 0,
    geometry: { kind: 'corkscrew', side },
    cost: CORKSCREW_COST_MULTIPLE * STRAIGHT_CENTS,
    chainable: false,
    inversions: 1,
    minEntryMms: CORKSCREW_MIN_ENTRY * 1000,
    turnKind: null,
    special: null,
    water: null,
  } satisfies TrackPieceDef);
}

function helix(num: number, side: 'left' | 'right', dir: 'up' | 'down'): TrackPieceDef {
  const dz = dir === 'up' ? HELIX_RISE_M : -HELIX_RISE_M;
  return Object.freeze({
    num,
    id: `helix_${side}_${dir}`,
    name: `Helix ${side} ${dir}`,
    group: 'Hx',
    set: 'rail',
    entry: { slope: 'F', bank: 'none' },
    exit: { dx: 3, dy: 0, dz, turn: 0, slope: 'F', bank: 'none' },
    tiles: side === 'left' ? block(0, 2, -2, 0) : block(0, 2, 0, 2),
    railMin: Math.min(0, dz),
    railMax: Math.max(0, dz),
    lengthMm: HELIX_MM,
    kv: 0,
    kh: (side === 'left' ? -1 : 1) / HELIX_RADIUS_M,
    geometry: { kind: 'helix', side, radiusM: HELIX_RADIUS_M },
    cost: HELIX_COST_MULTIPLE * STRAIGHT_CENTS,
    chainable: false,
    inversions: 0,
    minEntryMms: 0,
    turnKind: 'medium',
    special: null,
    water: null,
  } satisfies TrackPieceDef);
}

/** First row number of the Phase 6 pieces: after the 29 rail and 21 water pieces. */
const FIRST_NUM = 51;

/** Corkscrew left and right, then the helix left up, left down, right up, right down. */
export const EXTRA_PIECES: readonly TrackPieceDef[] = Object.freeze([
  corkscrew(FIRST_NUM, 'left'),
  corkscrew(FIRST_NUM + 1, 'right'),
  helix(FIRST_NUM + 2, 'left', 'up'),
  helix(FIRST_NUM + 3, 'left', 'down'),
  helix(FIRST_NUM + 4, 'right', 'up'),
  helix(FIRST_NUM + 5, 'right', 'down'),
]);
