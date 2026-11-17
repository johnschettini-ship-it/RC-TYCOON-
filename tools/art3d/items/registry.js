// The stage 1 bake list, readable by Node without three.js (tools/art3d/bake.mjs). Paths are relative to
// tools/art3d/. `catalog` names the game catalogue entry the footprint and height come from (catalog.ts itemSpec).
// The cache key (cacheKey.ts) hashes SHARED, `file`, `deps` (code an item module imports, beyond SHARED) and the
// full computed input (spec, track geometry, poses), so game data needs no entry here.

/** Files every item's pictures depend on. */
export const SHARED = [
  'vendor/three-0.160.0.module.min.js', 'kit.js', 'textures.js', 'people.js', 'rides.js', 'post.js', 'bakeView.js', 'camera.ts', 'bakePage.ts',
  'items/common.js', 'items/rideKeys.js', 'items/colourPart.js', 'png.ts', '../../src/render/real/indexFormat.ts', '../../src/render/artStyle.ts', '../../src/render/iso.ts',
  // imported by the files above (camera.ts, iso.ts, rideKeys.js): bakeRegistry.test.ts follows the imports
  '../../src/render/view.ts', '../../src/render/heightStep.ts', '../../src/data/tuning/track.ts', '../../src/render/anim.ts',
];

const RIDE_DEPS = ['items/flatRides.js'];
const TOWER_DEPS = [...RIDE_DEPS, 'items/towerMotion.js'];
const SWINGER_DEPS = [...RIDE_DEPS, 'items/swingers.js', 'items/swingParts.js'];
const ARENA_DEPS = [...RIDE_DEPS, 'items/arenaKeys.js', 'items/arenaKit.js'];
const SCENERY_DEPS = ['items/scenery.js', '../../src/render/scenery/sprites.ts'];
const PATH_ITEM_DEPS = SCENERY_DEPS; // bench and bin bake through items/scenery.js, which imports sprites.ts

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
  { id: 'observation_tower', kind: 'ride' }, { id: 'drop_tower', kind: 'ride' }, { id: 'gyro_globe', kind: 'ride' }, { id: 'spiral_slide', kind: 'ride' },
  { id: 'pendulum_ship', kind: 'ride' }, { id: 'magic_carpet', kind: 'ride' }, { id: 'flip_arm', kind: 'ride' },
  { id: 'bumper_cars', kind: 'ride' }, { id: 'mirror_maze', kind: 'ride' }, { id: 'haunted_manor', kind: 'ride' }, { id: 'thunder_disc', kind: 'ride' },
  { id: 'snack_shack', kind: 'stall' },
  ...['oak_round', 'pine_tall', 'birch_silver', 'willow', 'shrub_round', 'boulder', 'lamp_globe', 'bunting_pole'].map((id) => ({ id, kind: 'scenery' })),
  { id: 'steel_coaster', kind: 'track' },
  { id: 'teacup_twirl', kind: 'ride' },
  { id: 'rocket_rounds', kind: 'ride' },
  { id: 'kiddie_cars', kind: 'ride' },
  { id: 'merry_mill', kind: 'ride' },
];

export const ITEM_LIST = [
  { id: 'ground', file: 'items/ground.js' },
  { id: 'guests', file: 'items/guests.js' },
  { id: 'carousel', file: 'items/carousel.js', catalog: ['ride', 'carousel'], deps: RIDE_DEPS },
  { id: 'swing_tower', file: 'items/swing_tower.js', catalog: ['ride', 'swing_tower'], deps: RIDE_DEPS },
  { id: 'big_wheel', file: 'items/big_wheel.js', catalog: ['ride', 'big_wheel'], deps: RIDE_DEPS },
  { id: 'observation_tower', file: 'items/observation_tower.js', catalog: ['ride', 'observation_tower'], deps: TOWER_DEPS },
  { id: 'drop_tower', file: 'items/drop_tower.js', catalog: ['ride', 'drop_tower'], deps: TOWER_DEPS },
  { id: 'gyro_globe', file: 'items/gyro_globe.js', catalog: ['ride', 'gyro_globe'], deps: TOWER_DEPS },
  { id: 'spiral_slide', file: 'items/spiral_slide.js', catalog: ['ride', 'spiral_slide'], deps: TOWER_DEPS },
  { id: 'pendulum_ship', file: 'items/pendulum_ship.js', catalog: ['ride', 'pendulum_ship'], deps: SWINGER_DEPS },
  { id: 'magic_carpet', file: 'items/magic_carpet.js', catalog: ['ride', 'magic_carpet'], deps: SWINGER_DEPS },
  { id: 'flip_arm', file: 'items/flip_arm.js', catalog: ['ride', 'flip_arm'], deps: SWINGER_DEPS },
  { id: 'bumper_cars', file: 'items/bumper_cars.js', catalog: ['ride', 'bumper_cars'], deps: ARENA_DEPS },
  { id: 'mirror_maze', file: 'items/mirror_maze.js', catalog: ['ride', 'mirror_maze'], deps: ARENA_DEPS },
  { id: 'haunted_manor', file: 'items/haunted_manor.js', catalog: ['ride', 'haunted_manor'], deps: ARENA_DEPS },
  { id: 'thunder_disc', file: 'items/thunder_disc.js', catalog: ['ride', 'thunder_disc'], deps: ARENA_DEPS },
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
  { id: 'teacup_twirl', file: 'items/teacup_twirl.js', catalog: ['ride', 'teacup_twirl'], deps: [...RIDE_DEPS, 'items/spinnerMotion.js'] },
  { id: 'rocket_rounds', file: 'items/rocket_rounds.js', catalog: ['ride', 'rocket_rounds'], deps: [...RIDE_DEPS, 'items/spinnerMotion.js'] },
  { id: 'kiddie_cars', file: 'items/kiddie_cars.js', catalog: ['ride', 'kiddie_cars'], deps: [...RIDE_DEPS, 'items/spinnerMotion.js'] },
  { id: 'merry_mill', file: 'items/merry_mill.js', catalog: ['ride', 'merry_mill'], deps: [...RIDE_DEPS, 'items/spinnerMotion.js'] },
];

// New rides batch B (docs/superpowers/specs/2026-11-17-new-rides-design.md): one bake module each, their motion and
// frame keys in items/ridesB.js; each has its own card picture.
const RIDES_B_DEPS = [...RIDE_DEPS, 'items/ridesB.js'];
for (const id of ['chair_swing_twist', 'spin_wheel_drop', 'loop_swing', 'carousel_deluxe', 'station_show']) {
  ITEM_LIST.push({ id, file: `items/${id}.js`, catalog: ['ride', id], deps: RIDES_B_DEPS });
  CARD_ITEMS.push({ id, kind: 'ride' });
}

// The earlier title panorama (items/title.js): a whole park scene from a free camera and the name signs, written to
// their own folder (out: 'title-panorama', with its index.json, tools/art3d/titleIndex.ts checkTitleIndex), not as
// sets. The game shows the owner's poster cover instead (art-src/title/, tools/art3d/cover.mjs, 2026-11-17), so this
// item is out of the default bake (`explicit`): `bake.mjs --only title` still bakes it.
ITEM_LIST.push({
  id: 'title', file: 'items/title.js', out: 'title-panorama', explicit: true,
  deps: ['items/titleMirror.js', 'items/big_wheel.js', 'items/swing_tower.js', 'items/steel_coaster.js', 'items/flatRides.js', '../../src/assets/fonts/fredoka/fredoka-latin-wght-normal.woff2'],
});

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

// Tool cards (realistic title and cards, Task 4): the 8 base tool cards of the decks (src/ui/decks/toolCards.ts) get a
// baked object each, frame `tool:<id>` of the card set, modelled in items/toolCards.js. Appended after the cards entry
// is made: it holds this same CARD_ITEMS array (its bake input), and its cache key gains the tool objects' module.
CARD_ITEMS.push(...['footpath', 'queue', 'pathItems', 'staff', 'research', 'marketing', 'finance', 'park'].map((id) => ({ id: `tool:${id}`, kind: 'tool' })));
ITEM_LIST.find((x) => x.id === 'cards').deps.push('items/toolCards.js');
