/**
 * Owner: W2-C. Info Kiosk and maps, First Aid, Cash Machine, souvenirs, impulse buys (Phase 3 §4.10)
 * as guest hooks.
 * - beforeDecision (in order): First Aid → Cash Machine → lost guests (thought, happiness, kiosk) →
 *   cocoa thought. None takes the decision; First Aid and Cash Machine set a target.
 * - perTick: the step work (lost count → impulse buy → wrong turn) once per step, then balloons.
 * - afterPurchase: souvenir and map thoughts, Cash Machine withdrawals.
 */
import type { GuestHooks } from '../hooks';
import type { Guest } from '../guests/types';
import type { World } from '../types';
import { isOnTheMove } from './common';
import { impulseAtStep } from './impulse';
import { cashMachineDecision, firstAidDecision } from './services';
import { balloonPerTick, cocoaThought, facilityAfterPurchase } from './souvenirs';
import { lostDecision, resetWayfinding, trackProgress, wrongTurnAtStep } from './wayfinding';

/**
 * perTick. A step starts on the tick where `progress` first reaches 1 (the guest system began the step
 * toward `nextTile` this tick), so each step is handled exactly once.
 */
export function facilityStepTick(world: World, guest: Guest): void {
  const tracked = guest.lostTarget !== null || guest.lostSteps !== 0 || guest.bestDistance !== -1;
  if (tracked && (guest.target === null || guest.items.map || !isOnTheMove(guest))) resetWayfinding(guest);
  if (guest.nextTile < 0 || guest.progress !== 1 || !isOnTheMove(guest)) return;
  const distance = trackProgress(world, guest);
  if (impulseAtStep(world, guest)) return;
  if (distance !== null) wrongTurnAtStep(world, guest);
}

export const facilityHooks: Partial<GuestHooks> = {
  beforeDecision: [firstAidDecision, cashMachineDecision, lostDecision, cocoaThought],
  perTick: [facilityStepTick, balloonPerTick],
  afterPurchase: [facilityAfterPurchase],
};
