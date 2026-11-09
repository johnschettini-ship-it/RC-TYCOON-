/**
 * After Dark effects on guests (Phase 4 §4.7) through the guest hooks; every effect only when `nightActive`. Owner: W3-F.
 * - perHour: guest on an unlit path tile → happiness −4, thought "This path is too dark" (cooldown 4 game hours)
 * - energyFactor: × 1.25
 * - rideScoreFactor: spooky ride × 1.3, plus 2% per spooky scenery item within 6 tiles (max +20%)
 * - afterRide: spooky ride → happiness +5 extra
 * Stub: no hooks.
 */
import type { GuestHooks } from '../hookTypes';

export const nightHooks: Partial<GuestHooks> = {};
