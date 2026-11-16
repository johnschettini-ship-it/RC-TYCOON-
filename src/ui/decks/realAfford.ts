/**
 * Unaffordable ride and stall cards in the realistic build (realistic title and cards, Task 3). A card whose cost is
 * more than the park's cash gets `data-afford="no"`: `src/styles/realCards.css` dims its picture and shows its price in
 * the warning colour. Callers check `import.meta.env.VITE_ART === 'real'` first, so the website build folds the calls
 * and this module away.
 */
import { canAfford } from '../../sim/economy/ledger';
import type { World } from '../../sim/types';
import { setAttr } from '../dom';

/** The build cost (cents) of each ride or stall card. */
const costOf = new WeakMap<HTMLElement, number>();

/** Remembers the cost of a ride or stall card, for `markAfford`. */
export function trackCost(card: HTMLElement, cost: number): void {
  costOf.set(card, cost);
}

/** Marks every ride or stall card under `root` that the park cannot pay for (and clears the mark on the others). */
export function markAfford(root: ParentNode, world: World): void {
  for (const card of root.querySelectorAll<HTMLElement>('.content-card')) {
    const cost = costOf.get(card);
    if (cost === undefined) continue;
    setAttr(card, 'data-afford', canAfford(world, cost, { setup: false }) ? null : 'no');
  }
}
