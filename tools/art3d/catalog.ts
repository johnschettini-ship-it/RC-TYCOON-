/**
 * What the bake reads from the game: footprints and heights from `src/data/catalog/` (so the art cannot drift from
 * the game data), and a content hash of the kit modules an item is built from (the bake cache key).
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { getFlatRideDef, getSceneryDef, getStallDef } from '../../src/data/catalog';

export type ItemKind = 'ride' | 'stall' | 'scenery';

export interface ItemSpec {
  /** Footprint in tiles at rotation 0: [w, d]. */
  footprintTiles: [number, number];
  /** Height of the model in metres (top of the tallest part above the base). */
  heightM: number;
}

/**
 * Model heights in metres for flat rides and stalls. The catalogue holds footprints for these but no height
 * (scenery has `heightM`), so the bake keeps them here, next to the models that use them. Stage 1 items are listed;
 * any other catalogue item gets the rule below until its model is made.
 */
const RIDE_HEIGHT_M: Readonly<Record<string, number>> = {
  carousel: 8,
  big_wheel: 15,
  swing_tower: 18,
  // Batch 1 (phase 8c): the rule is today's drawn height in px / STEP_PX (8) rounded to 0.5 m, so picking and
  // gameplay sizes match; a ride with a comment is a realistic-model exception (catalog.test.ts HEIGHT_EXCEPTIONS).
  teacup_twirl: 6.5,
  bumper_cars: 7.5, // realistic: a one-storey pavilion, crown sign to 7.5 m (today's px count the floor depth)
  rocket_rounds: 10.5,
  spiral_slide: 14.5,
  observation_tower: 32, // realistic: a ring-cabin observation tower (catalog.test.ts HEIGHT_EXCEPTIONS)
  mirror_maze: 8, // realistic: a 5.3 m pavilion with the crystal on its roof (today's px count the floor depth)
  haunted_manor: 14.5,
  pendulum_ship: 13, // Task 3: the bow finial at full swing (10 m axle, 7.4 m arms); see HEIGHT_EXCEPTIONS
  thunder_disc: 11, // the U-track's 8 m ends plus the lightning signs (today's px count the floor depth)
  drop_tower: 26,
  flip_arm: 13, // Task 3: the gondola's footrest at the top of the turn (7 m hub, 5 m arm)
  magic_carpet: 11.5, // Task 3: riders' heads at the top of the orbit (5.4 m hubs, 4.4 m arms)
  kiddie_cars: 7, // realistic: a children's car ride, gold ball on a short mast (today's flag mast is drawn tall)
  merry_mill: 11.5, // realistic: 4.8 m sails on a 6.8 m hub, so the lowest gondola boards at the deck
  gyro_globe: 14, // realistic: the gimbal stands on a short turntable pedestal (catalog.test.ts HEIGHT_EXCEPTIONS)
  // New rides batch A (2026-11-17), by the same rule.
  dodgem_boats: 6.5, // the lighthouse cap
  mini_pirate_ship: 7, // realistic: 6.25 m axle and its bearings (today's px count the 3x4 floor depth)
  balloon_wheel: 9, // the top balloon's pin
  frog_hopper: 7.5, // the frog on the lily pad
};
const STALL_HEIGHT_M: Readonly<Record<string, number>> = {
  snack_shack: 3.5,
};
/** Rule for rides without a model yet: flag T (tall) rides 14 m, others 6 m. Stalls 3.5 m. */
const TALL_RIDE_M = 14;
const LOW_RIDE_M = 6;
const STALL_M = 3.5;

export function itemSpec(kind: ItemKind, id: string): ItemSpec {
  switch (kind) {
    case 'ride': {
      const def = getFlatRideDef(id);
      if (!def) throw new Error(`itemSpec: unknown flat ride '${id}'`);
      return { footprintTiles: [def.w, def.d], heightM: RIDE_HEIGHT_M[id] ?? (def.flags.tall ? TALL_RIDE_M : LOW_RIDE_M) };
    }
    case 'stall': {
      const def = getStallDef(id);
      if (!def) throw new Error(`itemSpec: unknown stall '${id}'`);
      // A stall takes one tile (placeStall in src/sim/commands/build/place.ts).
      return { footprintTiles: [1, 1], heightM: STALL_HEIGHT_M[id] ?? STALL_M };
    }
    case 'scenery': {
      const def = getSceneryDef(id);
      if (!def) throw new Error(`itemSpec: unknown scenery item '${id}'`);
      return { footprintTiles: [def.w, def.d], heightM: def.heightM };
    }
    default:
      throw new Error(`itemSpec: unknown kind '${String(kind)}'`);
  }
}

/**
 * SHA-256 (hex) over the contents of `files`, sorted by path so the listing order does not matter. Each file is
 * fed as its byte length then its bytes, so text moving from one file to the next changes the hash.
 */
export function contentHash(files: string[]): string {
  const h = createHash('sha256');
  for (const f of [...files].sort()) {
    const bytes = readFileSync(f);
    h.update(`${bytes.length}\n`);
    h.update(bytes);
  }
  return h.digest('hex');
}
