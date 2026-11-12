/** Phase 8b stage 0b test (never merged): picture keys shared by the sheet tool and the app runtime. */
// Objects and people keep the game's cache keys at bucket 0.5 (`spriteKey`, `scenerySpriteKey`, `guestSpriteKey`, …).
// The other keys are new: ghosts, shadows, track, elevated paths and ground. Every key stays below 2^48, so a Float64 holds it exactly.
import { ALL_TRACK_PIECES, ALL_TRACK_TYPES } from '../../../data/track';
import { defHash, FRAME_SPAN } from '../../spriteCache';
import { TAG_COLOURS } from '../../palette';
import { hash3 } from './hash';

export {
  K_CAR,
  K_DECAL,
  K_DECK,
  K_ENTRANCE,
  K_FENCE,
  K_GATE,
  K_GHOST,
  K_GROUND,
  K_GUEST,
  K_PATH_ITEM,
  K_POST,
  K_RAIL,
  K_RIDE,
  K_SCENERY,
  K_SHADOW,
  K_SHOW,
  K_STAFF,
  K_STALL,
  K_SUPPORT,
} from '../../artHook';

/** Layout as `spriteKey`: ((def hash × 4 + view) × 4096 + kind × 2 + phase) × 4. */
export function shadowKey(kind: number, defId: string, view: number, phase: 0 | 1): number {
  return ((defHash(defId) * 4 + (view & 3)) * FRAME_SPAN + ((kind & 1023) * 2 + (phase & 1))) * 4;
}

/** Layout as `spriteKey`: ((def hash × 4 + view) × 4096 + kind) × 4. */
export function ghostKey(kind: number, defId: string, view: number): number {
  return ((defHash(defId) * 4 + (view & 3)) * FRAME_SPAN + (kind & 4095)) * 4;
}

// ---------------------------------------------------------------- track and elevated paths (Task 6)
// Index tables shared by the tool and the runtime: sorted ids, so both sides number them the same way.

/** Every track type id, sorted. */
export const TRACK_TYPE_IDS: readonly string[] = [...ALL_TRACK_TYPES.map((t) => t.id)].sort();
/** Every track piece id, sorted. */
export const TRACK_PIECE_IDS: readonly string[] = [...ALL_TRACK_PIECES.map((p) => p.id)].sort();
/** Every support style the track types use, sorted. */
export const SUPPORT_STYLES: readonly string[] = [...new Set(ALL_TRACK_TYPES.map((t) => t.render.supports))].sort();

/** Rail picture: ((((type × 256 + piece) × 4 + dir) × 64 + tile) × 4 + view). `tile`: index in the piece's tile list. */
export function railKey(typeIdx: number, pieceIdx: number, dir: number, tile: number, view: number): number {
  return (((typeIdx * 256 + (pieceIdx & 255)) * 4 + (dir & 3)) * 64 + (tile & 63)) * 4 + (view & 3);
}

/** Support segment: part 0 foot, 1 one step, 2 top. */
export function supportKey(styleIdx: number, part: 0 | 1 | 2, view: number): number {
  return (styleIdx * 4 + part) * 4 + (view & 3);
}

/**
 * Gate booth roofs (fix round 1, I2): the entrance roof is the ride tag's main colour, the exit roof a fixed grey
 * (`track/layer.ts` gate loop). The booth has no view, so one picture per roof.
 */
export const GATE_ROOFS: readonly string[] = [TAG_COLOURS.thrill.main, TAG_COLOURS.family.main, TAG_COLOURS.chill.main, '#8a96a3'];

/** Gate booth by roof: 0 to 2 entrance (thrill, family, chill), 3 exit (`GATE_ROOFS`). */
export function gateKey(roof: number): number {
  return roof & 3;
}

/** Car: shape (`CAR_SHAPES` index), yaw step (16), pitch step (24), roll step (16), front car. */
export function carKey(shape: number, yaw: number, pitch: number, roll: number, front: 0 | 1): number {
  return ((((shape * 16 + yaw) * 24 + pitch) * 16 + roll) * 2) + (front & 1);
}

/** Elevated deck: kind 0 footpath, 1 queue; ramp −1 flat or the view direction 0 to 3 it rises toward. */
export function deckKey(kind: 0 | 1, ramp: -1 | 0 | 1 | 2 | 3): number {
  return (kind & 1) * 5 + ramp + 1;
}

/** Elevated post segment (one step) at view corner 0 to 3. */
export function postKey(corner: 0 | 1 | 2 | 3): number {
  return corner & 3;
}

// ---------------------------------------------------------------- ground pieces (Task 7)

/** Seed of the ground variant hash (Test decision 7). */
export const GROUND_VARIANT_SEED = 0x0b;

/** The ground variant 0 to 3 of map tile (x, y). */
export function groundVariant(x: number, y: number): number {
  return hash3(x, y, GROUND_VARIANT_SEED) & 3;
}

/**
 * Ground piece: part 0 top (terrain 0-4, view slope mask 0-15, owned 0-1, variant 0-3); 1 path (content 0 footpath /
 * 1 queue / 2 entrance, view mask in {0, 3, 6, 12, 9}, edges 0-15 in view directions N E S W = bits 1 2 4 8, variant);
 * 2 face (side 0 E / 1 S, cap 0 / 1 / 2, 0, 0); 3 water (0, 0, 0, 0). Layout ((((part × 8 + a) × 16 + b) × 16 + c) × 4 + d).
 */
export function groundKey(part: 0 | 1 | 2 | 3, a: number, b: number, c: number, d: number): number {
  return (((part * 8 + (a & 7)) * 16 + (b & 15)) * 16 + (c & 15)) * 4 + (d & 3);
}
