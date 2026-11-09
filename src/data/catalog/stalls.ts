/** content-catalog.md §3. Money in cents. Needs on the 0–255 scale. */
import type { StallDef, StallEffects } from './types';

const fx = (needs: StallEffects['needs'], gives: StallEffects['gives'] = null, withdraw: StallEffects['withdraw'] = null): StallEffects => ({ needs, gives, withdraw });

export const STALLS: readonly StallDef[] = Object.freeze([
  { id: 'snack_shack', name: 'Snack Shack', phase: 1, unlock: 'start', kind: 'food', buildCost: 40000, runningCostMonthly: 2000, defaultPrice: 300, stockCost: 100, effects: fx({ hunger: -120 }), weatherFactors: {} },
  { id: 'fizz_stand', name: 'Fizz Stand', phase: 1, unlock: 'start', kind: 'drink', buildCost: 35000, runningCostMonthly: 2000, defaultPrice: 200, stockCost: 60, effects: fx({ thirst: -120, bladder: 40 }), weatherFactors: { hot: 1.5, cold: 0.7 } },
  { id: 'restrooms', name: 'Restrooms', phase: 1, unlock: 'start', kind: 'toilet', buildCost: 30000, runningCostMonthly: 1500, defaultPrice: 0, stockCost: 0, effects: fx({ bladder: 'reset' }), weatherFactors: {} },
  { id: 'pizza_slice', name: 'Pizza Slice', phase: 3, unlock: 'shops', kind: 'food', buildCost: 50000, runningCostMonthly: 2500, defaultPrice: 400, stockCost: 140, effects: fx({ hunger: -160 }), weatherFactors: {} },
  { id: 'ice_cream_cart', name: 'Ice Cream Cart', phase: 3, unlock: 'shops', kind: 'food', buildCost: 35000, runningCostMonthly: 2000, defaultPrice: 200, stockCost: 60, effects: fx({ hunger: -60, happiness: 10 }), weatherFactors: { hot: 1.6, cold: 0.4 } },
  { id: 'cocoa_hut', name: 'Cocoa Hut', phase: 3, unlock: 'shops', kind: 'drink', buildCost: 35000, runningCostMonthly: 2000, defaultPrice: 200, stockCost: 50, effects: fx({ thirst: -100, happiness: 5 }), weatherFactors: { cold: 1.6, rain: 1.6, hot: 0.4 } },
  { id: 'balloon_stand', name: 'Balloon Stand', phase: 3, unlock: 'shops', kind: 'souvenir', buildCost: 30000, runningCostMonthly: 1500, defaultPrice: 200, stockCost: 40, effects: fx({ happiness: 15 }, 'balloon'), weatherFactors: {} },
  { id: 'umbrella_stand', name: 'Umbrella Stand', phase: 3, unlock: 'shops', kind: 'souvenir', buildCost: 35000, runningCostMonthly: 1500, defaultPrice: 500, stockCost: 150, effects: fx({}, 'umbrella'), weatherFactors: { rain: 3.0, sunny: 0.2 } },
  { id: 'info_kiosk', name: 'Info Kiosk', phase: 3, unlock: 'start', kind: 'info', buildCost: 40000, runningCostMonthly: 1500, defaultPrice: 100, stockCost: 10, effects: fx({}, 'map'), weatherFactors: {} },
  { id: 'first_aid', name: 'First Aid', phase: 3, unlock: 'shops', kind: 'facility', buildCost: 60000, runningCostMonthly: 4000, defaultPrice: 0, stockCost: 0, effects: fx({ nausea: 'reset', happiness: 5 }), weatherFactors: {} },
  { id: 'cash_machine', name: 'Cash Machine', phase: 3, unlock: 'shops', kind: 'facility', buildCost: 80000, runningCostMonthly: 2000, defaultPrice: 0, stockCost: 0, effects: fx({}, null, { belowCents: 1000, minCents: 4000, maxCents: 8000 }), weatherFactors: {} },
  // Phase 6 §4.5 (Build 3): locked while BUILD_MAX_PHASE < 6. The Photo Booth's "want ×2 within 6 tiles of a ride
  // exit with excitement ≥ 5.00" is behaviour (W4-D, facilities hooks), not data.
  { id: 'noodle_bar', name: 'Noodle Bar', phase: 6, unlock: 'shops', kind: 'food', buildCost: 55000, runningCostMonthly: 2500, defaultPrice: 450, stockCost: 160, effects: fx({ hunger: -170 }), weatherFactors: { cold: 1.3, hot: 0.8 } },
  { id: 'smoothie_bar', name: 'Smoothie Bar', phase: 6, unlock: 'shops', kind: 'drink', buildCost: 45000, runningCostMonthly: 2000, defaultPrice: 300, stockCost: 90, effects: fx({ thirst: -140, energy: 20 }), weatherFactors: { hot: 1.5, cold: 0.6 } },
  { id: 'photo_booth', name: 'Photo Booth', phase: 6, unlock: 'shops', kind: 'souvenir', buildCost: 50000, runningCostMonthly: 2000, defaultPrice: 400, stockCost: 80, effects: fx({ happiness: 10 }, 'photo'), weatherFactors: {} },
]);

/** Definitions by id (first entry wins, as `find` would). The simulation looks these up many times per tick. */
const STALLS_BY_ID: ReadonlyMap<string, StallDef> = (() => {
  const byId = new Map<string, StallDef>();
  for (const d of STALLS) if (!byId.has(d.id)) byId.set(d.id, d);
  return byId;
})();

export function getStallDef(id: string): StallDef | undefined {
  return STALLS_BY_ID.get(id);
}
