/**
 * The track size rule (phase 8c batch 5 plan, "Size budget per type"), by track type id. Checked by checkIndexCli on
 * the size report's track rows:
 *   - compressed: at most 6 MB for a type that builds loops, corkscrews or helixes, 3 MB for the rest;
 *   - every set at most 8 MiB decoded at density 4, its masks included;
 *   - the type's bench circuit (`tracks` scene, Task 8) at most 32 MiB resident at density 4, masks included.
 */
import { getTrackTypeDef } from '../../src/data/track';

const MiB = 1024 * 1024;
/** Compressed limit for a type with loop, corkscrew or helix pieces (`TRACK_BIG_GROUPS`). */
export const TRACK_COMPRESSED_MAX_BIG = 6_000_000;
export const TRACK_COMPRESSED_MAX = 3_000_000;
/** One set (sheets and masks) decoded at density 4. */
export const TRACK_SET_MAX_D4 = 8 * MiB;
/** The type's bench circuit resident at density 4, masks included. */
export const TRACK_BENCH_MAX_D4 = 32 * MiB;
/** Piece groups that make a type "big" (its compressed limit is `TRACK_COMPRESSED_MAX_BIG`). */
export const TRACK_BIG_GROUPS: readonly string[] = ['L', 'Cs', 'Hx'];

export interface TrackBudget { compressedMax: number; setMaxD4: number; benchMaxD4: number }

export function trackBudget(typeId: string): TrackBudget {
  const t = getTrackTypeDef(typeId);
  if (!t) throw new Error(`trackBudget: no track type '${typeId}'`);
  const big = t.groups.some((g) => TRACK_BIG_GROUPS.includes(g));
  return { compressedMax: big ? TRACK_COMPRESSED_MAX_BIG : TRACK_COMPRESSED_MAX, setMaxD4: TRACK_SET_MAX_D4, benchMaxD4: TRACK_BENCH_MAX_D4 };
}

/**
 * Baked types still in the stage 1 bake, declared with a reason (an exception that cannot give its reason is not one):
 *   - `pieces`: the pieces the bake holds; TRACK_COMPLETE checks these instead of every piece the type builds;
 *   - their sets in the stage 1 layout (`rail:<type>`, `car:<type>`, no `~<class>`) are reported against the per-set
 *     limit but do not fail it: the layout predates the class split (Task 2), and Task 3 re-bakes the type in it.
 * Task 3 removes the steel_coaster row (it bakes every piece). Kept equal to tools/art3d/items/registry.js
 * COASTER_PIECES by a test.
 */
export const STAGE1_TRACK: Readonly<Record<string, { pieces: readonly string[]; reason: string }>> = {
  steel_coaster: {
    pieces: [
      'station', 'straight', 'block_brake', 'brakes',
      'flat_to_gentle_up', 'gentle_up', 'gentle_to_steep_up', 'steep_up', 'steep_to_gentle_up', 'gentle_up_to_flat',
      'flat_to_gentle_down', 'gentle_down', 'gentle_to_steep_down', 'steep_down', 'steep_to_gentle_down', 'gentle_down_to_flat',
      'turn_medium_right', 'turn_medium_left',
    ],
    reason: 'stage 1 bake (owner-approved): 18 of 34 pieces in the one-set-per-heading layout, until batch 5 Task 3 re-bakes it on the track kit',
  },
};

/** The track type of a rail, support or car set's item (`<type>` or `<type>~<class>`). */
export function trackTypeOfItem(item: string): string {
  const i = item.indexOf('~');
  return i < 0 ? item : item.slice(0, i);
}

/** Whether set `key` of type `typeId` is in the stage 1 layout of a type declared in `STAGE1_TRACK`. */
export function stage1LayoutSet(typeId: string, item: string): boolean {
  return STAGE1_TRACK[typeId] !== undefined && !item.includes('~');
}
