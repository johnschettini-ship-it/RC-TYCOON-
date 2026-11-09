/**
 * Research order and costs (phase-3-management.md §4.6, catalog §9). Owner: W1-I (Build 1), W3-D (Build 2 entries),
 * W4-D (Build 3 entries). Costs are research points (master R10). Build 1: 21 items, 6,460 points. Build 2 (Phase 4,
 * master R10): Log Flume 480, Rapids Raft 540, each scenery theme 240 (2,220 points), after the Build 1 items.
 * Build 3 (Phase 6, master R25): 12 items with the provisional Wave 4.0 costs (4,200 points), after the Build 2 items.
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
  { id: 'spiral_slide', category: 'gentle', cost: 150 },
  { id: 'ice_cream_cart', category: 'shops', cost: 150 },
  { id: 'umbrella_stand', category: 'shops', cost: 180 },
  { id: 'rocket_rounds', category: 'gentle', cost: 200 },
  { id: 'pendulum_ship', category: 'thrill', cost: 250 },
  { id: 'first_aid', category: 'shops', cost: 200 },
  { id: 'bumper_cars', category: 'gentle', cost: 250 },
  { id: 'cocoa_hut', category: 'shops', cost: 180 },
  { id: 'mirror_maze', category: 'gentle', cost: 250 },
  { id: 'spinning_mouse', category: 'coasters', cost: 450 },
  { id: 'pizza_slice', category: 'shops', cost: 220 },
  { id: 'thunder_disc', category: 'thrill', cost: 350 },
  { id: 'balloon_stand', category: 'shops', cost: 180 },
  { id: 'observation_tower', category: 'gentle', cost: 350 },
  { id: 'go_karts', category: 'thrill', cost: 400 },
  { id: 'ghost_train', category: 'gentle', cost: 400 },
  { id: 'cash_machine', category: 'shops', cost: 250 },
  { id: 'drop_tower', category: 'thrill', cost: 450 },
  { id: 'haunted_manor', category: 'gentle', cost: 450 },
  { id: 'wooden_coaster', category: 'coasters', cost: 600 },
  { id: 'flip_arm', category: 'thrill', cost: 550 },
  // Build 2 (Phase 4, master R10, R23). The spec gives no order; water rides and themes alternate, as Build 1 mixes
  // its categories. Focus picks any of them first.
  { id: 'log_flume', category: 'water', cost: 480 },
  { id: 'frost_peaks', category: 'scenery', cost: 240 },
  { id: 'volcano_ridge', category: 'scenery', cost: 240 },
  { id: 'rapids_raft', category: 'water', cost: 540 },
  { id: 'spooky_hollow', category: 'scenery', cost: 240 },
  { id: 'jungle_lagoon', category: 'scenery', cost: 240 },
  { id: 'starport', category: 'scenery', cost: 240 },
  // Build 3 (Phase 6 §4.5, catalog §9, master R25: provisional costs, logged in tuning-log.md for play-testing).
  // The spec gives no order; the categories alternate as in Build 1 and 2, cheaper items first.
  { id: 'kiddie_cars', category: 'gentle', cost: 150 },
  { id: 'smoothie_bar', category: 'shops', cost: 180 },
  { id: 'magic_carpet', category: 'thrill', cost: 400 },
  { id: 'lightshow_tower', category: 'scenery', cost: 300 },
  { id: 'photo_booth', category: 'shops', cost: 200 },
  { id: 'merry_mill', category: 'gentle', cost: 250 },
  { id: 'bobsled_run', category: 'coasters', cost: 500 },
  { id: 'noodle_bar', category: 'shops', cost: 220 },
  { id: 'gyro_globe', category: 'thrill', cost: 550 },
  { id: 'fireworks_launcher', category: 'scenery', cost: 350 },
  { id: 'monorail', category: 'gentle', cost: 450 },
  { id: 'inverted_coaster', category: 'coasters', cost: 650 },
]);

export function getResearchItem(id: string): ResearchItem | undefined {
  return RESEARCH_ORDER.find((r) => r.id === id);
}
