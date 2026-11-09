/**
 * Scenery catalog (Phase 4 §4.5 item tables, catalog §6): the base set and 6 themes, 85 items.
 * Owner: integrator (contract data, generated from the spec tables). Money is integer cents; heights are metres.
 * Flag letters as in the spec: L = light source, W = needsWater, S = slopeOk, E = edge item, P = overPath, K = spooky.
 */
import type { SceneryDef, SceneryTheme, SceneryThemeId } from './types';

/** The base set and Classic Fair are open at start; the other 5 themes come from the Scenery research category. */
export const SCENERY_THEMES: readonly SceneryTheme[] = Object.freeze<SceneryTheme[]>([
  { id: 'base', name: 'Base Set', unlock: 'start' },
  { id: 'classic_fair', name: 'Classic Fair', unlock: 'start' },
  { id: 'frost_peaks', name: 'Frost Peaks', unlock: 'scenery' },
  { id: 'volcano_ridge', name: 'Volcano Ridge', unlock: 'scenery' },
  { id: 'spooky_hollow', name: 'Spooky Hollow', unlock: 'scenery' },
  { id: 'jungle_lagoon', name: 'Jungle Lagoon', unlock: 'scenery' },
  { id: 'starport', name: 'Starport', unlock: 'scenery' },
]);

type Row = Omit<SceneryDef, 'theme'>;

/** One table row: footprint w × d (edge items 1 × 1 with flag E), height m, cost cents, Calm, Buzz, flag letters. */
function S(id: string, name: string, w: number, d: number, heightM: number, buildCost: number, calm: number, buzz: number, flags: string): Row {
  return {
    id,
    name,
    w,
    d,
    heightM,
    buildCost,
    calm,
    buzz,
    edge: flags.includes('E'),
    light: flags.includes('L'),
    needsWater: flags.includes('W'),
    slopeOk: flags.includes('S'),
    overPath: flags.includes('P'),
    spooky: flags.includes('K'),
  };
}

function theme(id: SceneryThemeId, rows: Row[]): SceneryDef[] {
  return rows.map((r) => ({ ...r, theme: id }));
}

/** Every scenery item, in spec table order. */
export const SCENERY: readonly SceneryDef[] = Object.freeze<SceneryDef[]>([
  ...theme('base', [
    S('oak_round', 'Round Oak', 1, 1, 7, 4000, 3, 0, 'S'),
    S('pine_tall', 'Tall Pine', 1, 1, 9, 4500, 3, 0, 'S'),
    S('birch_silver', 'Silver Birch', 1, 1, 6, 3500, 2, 0, 'S'),
    S('willow', 'Weeping Willow', 1, 1, 6, 6000, 4, 0, 'S'),
    S('shrub_round', 'Round Shrub', 1, 1, 1, 1500, 1, 0, 'S'),
    S('shrub_flowering', 'Flowering Shrub', 1, 1, 1, 2000, 2, 0, 'SW'),
    S('bed_mixed', 'Mixed Flower Bed', 1, 1, 1, 2500, 3, 0, 'W'),
    S('bed_tulip', 'Tulip Bed', 1, 1, 1, 2500, 3, 0, 'W'),
    S('boulder', 'Boulder', 1, 1, 2, 2000, 1, 0, 'S'),
    S('fountain_garden', 'Garden Fountain', 1, 1, 2, 15000, 5, 0, ''),
    S('hedge_low', 'Low Hedge', 1, 1, 1, 1000, 1, 0, 'E'),
    S('fence_wood', 'Wooden Fence', 1, 1, 1, 800, 0, 0, 'E'),
    S('rail_iron', 'Iron Railing', 1, 1, 1, 1200, 0, 0, 'E'),
  ]),
  ...theme('classic_fair', [
    S('tent_red', 'Striped Tent, Red', 2, 2, 5, 18000, 0, 3, ''),
    S('tent_blue', 'Striped Tent, Blue', 2, 2, 5, 18000, 1, 2, ''),
    S('bunting_pole', 'Bunting Pole', 1, 1, 6, 3000, 0, 1, ''),
    S('flower_tub', 'Flower Tub', 1, 1, 1, 2000, 2, 0, 'W'),
    S('fountain_carved', 'Carved Fountain', 2, 2, 3, 40000, 6, 0, 'L'),
    S('ticket_arch', 'Ticket Arch', 1, 1, 5, 12000, 0, 2, 'LP'),
    S('lamp_globe', 'Globe Lamp Post', 1, 1, 3, 5000, 1, 0, 'L'),
    S('bandstand', 'Bandstand', 2, 2, 4, 35000, 3, 1, 'L'),
    S('picnic_table', 'Picnic Table', 1, 1, 1, 4000, 2, 0, ''),
    S('balloon_cluster', 'Balloon Cluster', 1, 1, 4, 3500, 0, 1, ''),
    S('park_clock', 'Park Clock', 1, 1, 4, 9000, 1, 0, 'L'),
    S('fence_painted', 'Painted Fence', 1, 1, 1, 1000, 0, 0, 'E'),
  ]),
  ...theme('frost_peaks', [
    S('snow_pine', 'Snow Pine', 1, 1, 9, 5000, 3, 0, 'S'),
    S('snow_pine_small', 'Small Snow Pine', 1, 1, 5, 3500, 2, 0, 'S'),
    S('ice_arch', 'Ice Arch', 1, 1, 5, 14000, 3, 0, 'LP'),
    S('igloo', 'Igloo', 2, 2, 3, 16000, 3, 0, ''),
    S('fountain_frozen', 'Frozen Fountain', 2, 2, 3, 38000, 6, 0, 'L'),
    S('statue_frost', 'Frost Statue', 1, 1, 4, 25000, 4, 0, ''),
    S('ice_crystals', 'Ice Crystal Cluster', 1, 1, 2, 6000, 2, 0, 'L'),
    S('snowdrift', 'Snowdrift', 1, 1, 1, 1500, 1, 0, 'S'),
    S('snowman', 'Snow Figure', 1, 1, 2, 4500, 2, 0, ''),
    S('aurora_lantern', 'Aurora Lantern', 1, 1, 3, 7000, 2, 0, 'L'),
    S('sled_rack', 'Sled Rack', 1, 1, 1, 3000, 1, 0, ''),
    S('wall_ice', 'Ice Block Wall', 1, 1, 2, 2000, 1, 0, 'E'),
  ]),
  ...theme('volcano_ridge', [
    S('lava_rock', 'Lava Rock', 1, 1, 2, 2500, 0, 1, 'S'),
    S('lava_crag', 'Lava Crag', 2, 2, 6, 12000, 0, 2, 'S'),
    S('steam_vent', 'Steam Vent', 1, 1, 1, 8000, 0, 3, ''),
    S('glow_crystal', 'Glowing Crystal', 1, 1, 3, 9000, 0, 2, 'L'),
    S('ember_torch', 'Ember Torch', 1, 1, 3, 5500, 0, 1, 'L'),
    S('statue_spark', 'Spark Statue', 1, 1, 4, 25000, 0, 4, 'L'),
    S('fire_fern', 'Fire Fern', 1, 1, 2, 3000, 1, 1, 'S'),
    S('ash_palm', 'Ash Palm', 1, 1, 7, 5000, 1, 1, 'S'),
    S('magma_pool', 'Glow Pit', 2, 2, 1, 20000, 0, 4, 'L'),
    S('basalt_columns', 'Basalt Columns', 1, 1, 5, 7000, 0, 2, 'S'),
    S('volcano_gate', 'Volcano Gate', 1, 1, 6, 16000, 0, 3, 'LP'),
    S('wall_basalt', 'Basalt Wall', 1, 1, 2, 2000, 0, 1, 'E'),
  ]),
  ...theme('spooky_hollow', [
    S('tree_bare', 'Bare Tree', 1, 1, 7, 3500, 2, 0, 'SK'),
    S('tree_twisted', 'Twisted Tree', 1, 1, 6, 4500, 2, 0, 'SK'),
    S('pumpkin_patch', 'Pumpkin Patch', 1, 1, 1, 3000, 2, 0, 'WK'),
    S('pumpkin_lantern', 'Pumpkin Lantern', 1, 1, 1, 4000, 1, 0, 'LK'),
    S('ghost_lantern', 'Ghost Lantern', 1, 1, 3, 6000, 2, 0, 'LK'),
    S('gate_crooked', 'Crooked Gate', 1, 1, 4, 12000, 2, 0, 'PK'),
    S('statue_boo', 'Boo Statue', 1, 1, 3, 25000, 4, 0, 'LK'),
    S('old_well', 'Old Well', 1, 1, 2, 9000, 2, 0, 'K'),
    S('fog_pot', 'Fog Pot', 1, 1, 1, 11000, 3, 0, 'K'),
    S('owl_perch', 'Owl Perch', 1, 1, 4, 4000, 2, 0, 'K'),
    S('mossy_stones', 'Mossy Stones', 1, 1, 1, 2000, 1, 0, 'SK'),
    S('fence_spiked', 'Spiked Iron Fence', 1, 1, 2, 1500, 0, 0, 'EK'),
  ]),
  ...theme('jungle_lagoon', [
    S('lagoon_palm', 'Lagoon Palm', 1, 1, 8, 5000, 3, 0, 'S'),
    S('giant_leaf', 'Giant Leaf Plant', 1, 1, 3, 3000, 2, 0, 'SW'),
    S('bed_tropical', 'Tropical Flower Bed', 1, 1, 1, 3000, 3, 0, 'W'),
    S('ruin_arch', 'Ruined Stone Arch', 1, 1, 5, 13000, 3, 0, 'P'),
    S('mossy_pillar', 'Mossy Pillar', 1, 1, 4, 6000, 2, 0, ''),
    S('rope_bridge_decor', 'Rope Bridge Decor', 2, 1, 3, 9000, 2, 0, ''),
    S('rock_waterfall', 'Rock Waterfall', 2, 2, 6, 42000, 7, 0, ''),
    S('bamboo_grove', 'Bamboo Grove', 1, 1, 6, 4000, 3, 0, 'S'),
    S('lily_pond', 'Lily Pond', 1, 1, 1, 7000, 4, 0, ''),
    S('parrot_perch', 'Parrot Perch', 1, 1, 3, 4500, 1, 1, ''),
    S('fern_cluster', 'Fern Cluster', 1, 1, 1, 2000, 2, 0, 'SW'),
    S('wall_vine', 'Vine Wall', 1, 1, 2, 1800, 1, 0, 'E'),
  ]),
  ...theme('starport', [
    S('rocket_model', 'Rocket Model', 1, 1, 9, 22000, 0, 4, 'L'),
    S('satellite_dish', 'Satellite Dish', 2, 2, 5, 18000, 0, 2, ''),
    S('planet_globe', 'Planet Globe', 1, 1, 4, 12000, 1, 2, 'L'),
    S('neon_arch', 'Neon Arch', 1, 1, 5, 15000, 0, 3, 'LP'),
    S('neon_post', 'Neon Post', 1, 1, 3, 5000, 0, 1, 'L'),
    S('statue_robot', 'Robot Statue', 1, 1, 4, 24000, 0, 3, 'L'),
    S('crater', 'Crater', 2, 2, 1, 8000, 0, 1, ''),
    S('moon_rock', 'Moon Rock', 1, 1, 2, 2500, 0, 1, 'S'),
    S('star_beacon', 'Star Beacon', 1, 1, 6, 11000, 0, 2, 'L'),
    S('hologram_pad', 'Hologram Pad', 1, 1, 2, 16000, 1, 3, 'L'),
    S('radar_tower', 'Radar Tower', 1, 1, 8, 13000, 0, 2, 'L'),
    S('wall_hull', 'Hull Panel Wall', 1, 1, 2, 2200, 0, 1, 'E'),
  ]),
]);

const BY_ID = new Map<string, SceneryDef>(SCENERY.map((d) => [d.id, d]));

export function getSceneryDef(id: string): SceneryDef | undefined {
  return BY_ID.get(id);
}

export function getSceneryTheme(id: SceneryThemeId): SceneryTheme | undefined {
  return SCENERY_THEMES.find((t) => t.id === id);
}

/** Items of one theme, in table order. */
export function sceneryOfTheme(id: SceneryThemeId): SceneryDef[] {
  return SCENERY.filter((d) => d.theme === id);
}
