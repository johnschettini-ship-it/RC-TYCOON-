// The stage 1 bake list, readable by Node without three.js (tools/art3d/bake.mjs). Paths are relative to
// tools/art3d/. `catalog` names the game catalogue entry the footprint and height come from (catalog.ts itemSpec).
// The cache key (cacheKey.ts) hashes SHARED, `file`, `deps` (code an item module imports, beyond SHARED) and the
// full computed input (spec, track geometry, poses), so game data needs no entry here.

/** Files every item's pictures depend on. */
export const SHARED = [
  'vendor/three-0.160.0.module.min.js', 'kit.js', 'textures.js', 'people.js', 'rides.js', 'post.js', 'bakeView.js', 'camera.ts', 'bakePage.ts',
  'items/common.js', '../../src/render/real/indexFormat.ts', '../../src/render/artStyle.ts', '../../src/render/iso.ts',
];

const RIDE_DEPS = ['../../src/render/anim.ts'];
const SCENERY_DEPS = ['items/scenery.js', '../../src/render/scenery/sprites.ts'];
const PATH_ITEM_DEPS = ['items/scenery.js'];

/** The steel coaster pieces of the coaster test park (tests/perf/scenes.ts), plus the left turn. */
export const COASTER_PIECES = [
  'station', 'straight', 'block_brake', 'brakes',
  'flat_to_gentle_up', 'gentle_up', 'gentle_to_steep_up', 'steep_up', 'steep_to_gentle_up', 'gentle_up_to_flat',
  'flat_to_gentle_down', 'gentle_down', 'gentle_to_steep_down', 'steep_down', 'steep_to_gentle_down', 'gentle_down_to_flat',
  'turn_medium_right', 'turn_medium_left',
];

/**
 * Card pictures (items/cards.js): `kind` says how the item is framed (ride, stall and scenery on their footprint's
 * grass). Path items (bench, bin) have none: their tool shows icons, not pictures.
 */
export const CARD_ITEMS = [
  { id: 'carousel', kind: 'ride' }, { id: 'swing_tower', kind: 'ride' }, { id: 'big_wheel', kind: 'ride' },
  { id: 'snack_shack', kind: 'stall' },
  ...['oak_round', 'pine_tall', 'birch_silver', 'willow', 'shrub_round', 'boulder', 'lamp_globe', 'bunting_pole'].map((id) => ({ id, kind: 'scenery' })),
  { id: 'steel_coaster', kind: 'track' },
];

export const ITEM_LIST = [
  { id: 'ground', file: 'items/ground.js' },
  { id: 'guests', file: 'items/guests.js' },
  { id: 'carousel', file: 'items/carousel.js', catalog: ['ride', 'carousel'], deps: RIDE_DEPS },
  { id: 'swing_tower', file: 'items/swing_tower.js', catalog: ['ride', 'swing_tower'], deps: RIDE_DEPS },
  { id: 'big_wheel', file: 'items/big_wheel.js', catalog: ['ride', 'big_wheel'], deps: RIDE_DEPS },
  { id: 'snack_shack', file: 'items/snack_shack.js', catalog: ['stall', 'snack_shack'] },
  { id: 'oak_round', file: 'items/oak_round.js', catalog: ['scenery', 'oak_round'], deps: SCENERY_DEPS },
  { id: 'pine_tall', file: 'items/pine_tall.js', catalog: ['scenery', 'pine_tall'], deps: SCENERY_DEPS },
  { id: 'birch_silver', file: 'items/birch_silver.js', catalog: ['scenery', 'birch_silver'], deps: SCENERY_DEPS },
  { id: 'willow', file: 'items/willow.js', catalog: ['scenery', 'willow'], deps: SCENERY_DEPS },
  { id: 'shrub_round', file: 'items/shrub_round.js', catalog: ['scenery', 'shrub_round'], deps: SCENERY_DEPS },
  { id: 'boulder', file: 'items/boulder.js', catalog: ['scenery', 'boulder'], deps: SCENERY_DEPS },
  { id: 'lamp_globe', file: 'items/lamp_globe.js', catalog: ['scenery', 'lamp_globe'], deps: SCENERY_DEPS },
  { id: 'bunting_pole', file: 'items/bunting_pole.js', catalog: ['scenery', 'bunting_pole'], deps: SCENERY_DEPS },
  { id: 'bench', file: 'items/bench.js', deps: PATH_ITEM_DEPS },
  { id: 'bin', file: 'items/bin.js', deps: PATH_ITEM_DEPS },
  {
    id: 'steel_coaster', file: 'items/steel_coaster.js', track: { type: 'steel_coaster', pieces: COASTER_PIECES } },
  { id: 'facade', file: 'items/facade.js' },
];

// One small card picture per baked game item, in one set preview:cards:d2:rall (frames keyed by item id), for the
// card and picker previews. Built from the items' own modules, so it re-bakes when any of them changes.
ITEM_LIST.push({ id: 'cards', file: 'items/cards.js', cards: CARD_ITEMS, deps: cardDeps() });

function cardDeps() {
  const out = new Set();
  for (const c of CARD_ITEMS) {
    const it = ITEM_LIST.find((x) => x.id === c.id);
    for (const f of [it.file, ...(it.deps ?? [])]) out.add(f);
  }
  return [...out];
}
