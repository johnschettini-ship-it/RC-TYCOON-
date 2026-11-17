/**
 * Research order and costs (phase-3-management.md §4.6, catalog §9). Owner: W1-I (Build 1), W3-D (Build 2 entries),
 * W4-D (Build 3 entries). Costs are research points (master R10). Build 1: 21 items, 6,460 points. Build 2 (Phase 4,
 * master R10): Log Flume 480, Rapids Raft 540, each scenery theme 240 (2,220 points), after the Build 1 items.
 * Build 3 (Phase 6, master R25): 12 items with the provisional Wave 4.0 costs (4,200 points), after the Build 2 items.
 * Starting roster (owner, 2026-11-17): 18 rides start unlocked; the 11 of them that research used to unlock left the
 * order (`FORMER_RESEARCH_IDS`). The items left keep their relative order and costs: Build 1 holds 12 items (3,510
 * points), Build 2 the Rapids Raft and 5 themes (1,740), Build 3 11 items (4,050).
 * New rides batch B (2026-11-17): 5 rides inserted by cost into the Build 3 block (2,350 points), so it holds 16 items
 * (6,400 points); within each category the block still rises in cost.
 */
import type { ResearchCategory } from './catalog/types';

export interface ResearchItem {
  /** Catalog id of the flat ride, track ride type, or stall; for a scenery theme, the theme id (it unlocks every item). */
  id: string;
  category: ResearchCategory;
  cost: number;
}

export const RESEARCH_CATEGORIES: readonly ResearchCategory[] = ['gentle', 'thrill', 'coasters', 'shops', 'water', 'scenery'];

/** Default order (§4.6 table, then the Phase 4 items). */
export const RESEARCH_ORDER: readonly ResearchItem[] = Object.freeze([
  { id: 'ice_cream_cart', category: 'shops', cost: 150 },
  { id: 'umbrella_stand', category: 'shops', cost: 180 },
  { id: 'first_aid', category: 'shops', cost: 200 },
  { id: 'cocoa_hut', category: 'shops', cost: 180 },
  { id: 'pizza_slice', category: 'shops', cost: 220 },
  { id: 'thunder_disc', category: 'thrill', cost: 350 },
  { id: 'balloon_stand', category: 'shops', cost: 180 },
  { id: 'go_karts', category: 'thrill', cost: 400 },
  { id: 'ghost_train', category: 'gentle', cost: 400 },
  { id: 'cash_machine', category: 'shops', cost: 250 },
  { id: 'haunted_manor', category: 'gentle', cost: 450 },
  { id: 'flip_arm', category: 'thrill', cost: 550 },
  // Build 2 (Phase 4, master R10, R23). The spec gives no order; water rides and themes alternate, as Build 1 mixes
  // its categories. Focus picks any of them first.
  { id: 'frost_peaks', category: 'scenery', cost: 240 },
  { id: 'volcano_ridge', category: 'scenery', cost: 240 },
  { id: 'rapids_raft', category: 'water', cost: 540 },
  { id: 'spooky_hollow', category: 'scenery', cost: 240 },
  { id: 'jungle_lagoon', category: 'scenery', cost: 240 },
  { id: 'starport', category: 'scenery', cost: 240 },
  // Build 3 (Phase 6 §4.5, catalog §9, master R25: provisional costs, logged in tuning-log.md for play-testing).
  // The spec gives no order; the categories alternate as in Build 1 and 2, cheaper items first.
  { id: 'smoothie_bar', category: 'shops', cost: 180 },
  { id: 'magic_carpet', category: 'thrill', cost: 400 },
  { id: 'lightshow_tower', category: 'scenery', cost: 300 },
  { id: 'photo_booth', category: 'shops', cost: 200 },
  { id: 'merry_mill', category: 'gentle', cost: 250 },
  { id: 'station_show', category: 'gentle', cost: 300 }, // new rides batch B
  { id: 'chair_swing_twist', category: 'thrill', cost: 450 }, // new rides batch B
  { id: 'bobsled_run', category: 'coasters', cost: 500 },
  { id: 'noodle_bar', category: 'shops', cost: 220 },
  { id: 'gyro_globe', category: 'thrill', cost: 550 },
  { id: 'spin_wheel_drop', category: 'thrill', cost: 600 }, // new rides batch B
  { id: 'fireworks_launcher', category: 'scenery', cost: 350 },
  { id: 'carousel_deluxe', category: 'gentle', cost: 350 }, // new rides batch B
  { id: 'monorail', category: 'gentle', cost: 450 },
  { id: 'inverted_coaster', category: 'coasters', cost: 650 },
  { id: 'loop_swing', category: 'thrill', cost: 650 }, // new rides batch B: late
]);

/**
 * Rides that were research items until the starting roster grew (owner, 2026-11-17); their catalogue unlock is now
 * `start`. Old saves may name them in `research.current` or `research.unlocked` (`src/save/migrations/startRoster.ts`),
 * and a scenario's `allowed` list still decides whether they appear (`scenarioContentRule`).
 */
export const FORMER_RESEARCH_IDS: readonly string[] = Object.freeze([
  'spiral_slide', 'rocket_rounds', 'pendulum_ship', 'bumper_cars', 'kiddie_cars', 'mirror_maze', 'observation_tower', 'drop_tower',
  'wooden_coaster', 'spinning_mouse', 'log_flume',
]);

export function getResearchItem(id: string): ResearchItem | undefined {
  return RESEARCH_ORDER.find((r) => r.id === id);
}
