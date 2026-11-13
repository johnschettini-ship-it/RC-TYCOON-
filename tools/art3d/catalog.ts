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
