/**
 * Which baked item draws each game item in the realistic look (stage 1).
 * A game id maps to a baked item (itself, or a stand-in with a similar shape) or to 'classic', today's art.
 */
import { FLAT_RIDES } from '../../data/catalog/flatRides';
import { PATH_ITEMS } from '../../data/catalog/people';
import { SCENERY } from '../../data/catalog/scenery';
import { STALLS } from '../../data/catalog/stalls';
import { TRACK_RIDES } from '../../data/catalog/trackRides';

/** Items the stage 1 bake draws. `bench` and `bin` are path items, drawn through the scenery kind. */
const BAKED = [
  'carousel', 'swing_tower', 'big_wheel',
  'snack_shack',
  'oak_round', 'pine_tall', 'birch_silver', 'willow', 'shrub_round', 'boulder', 'lamp_globe', 'bunting_pole',
  'bench', 'bin',
  'steel_coaster',
] as const;

/** Unbaked items drawn with a baked stand-in. */
const STAND_INS: Record<string, string> = {
  teacup_twirl: 'carousel',
  fizz_stand: 'snack_shack',
  restrooms: 'snack_shack',
  balloon_stand: 'snack_shack',
  mini_railway: 'steel_coaster',
};

function build(): Record<string, string | 'classic'> {
  const out: Record<string, string | 'classic'> = {};
  for (const list of [FLAT_RIDES, TRACK_RIDES, STALLS, SCENERY, PATH_ITEMS]) for (const d of list) out[d.id] = 'classic';
  for (const id of BAKED) out[id] = id;
  for (const [id, to] of Object.entries(STAND_INS)) out[id] = to;
  return out;
}

/** Every catalog id (rides, track rides, stalls, scenery, path items) → baked item or 'classic'. */
export const REAL_FALLBACK: Readonly<Record<string, string | 'classic'>> = Object.freeze(build());

/** The baked item for a game id; ids missing from the catalogs are 'classic' too. */
export function realItem(id: string): string | 'classic' {
  return REAL_FALLBACK[id] ?? 'classic';
}
