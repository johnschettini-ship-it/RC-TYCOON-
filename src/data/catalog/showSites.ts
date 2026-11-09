/** content-catalog.md §3 show sites (phase-6-polish.md §4.5). Money in cents, show length in ticks (20 per second). */
import type { ShowSiteDef } from './types';

export const SHOW_SITES: readonly ShowSiteDef[] = Object.freeze<ShowSiteDef[]>([
  { id: 'lightshow_tower', name: 'Lightshow Tower', phase: 6, unlock: 'scenery', w: 2, d: 2, buildCost: 250_000, runningCostMonthly: 4_000, costPerShow: 15_000, radius: 8, showTicks: 300 },
  { id: 'fireworks_launcher', name: 'Fireworks Launcher', phase: 6, unlock: 'scenery', w: 1, d: 1, buildCost: 150_000, runningCostMonthly: 2_000, costPerShow: 40_000, radius: 12, showTicks: 400 },
]);

export function getShowSiteDef(id: string): ShowSiteDef | undefined {
  return SHOW_SITES.find((d) => d.id === id);
}
