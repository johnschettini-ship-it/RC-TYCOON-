/**
 * Guest hooks of the show system (Phase 6 §4.4). Owner: W4-C. Registered last in `sim/hooks.ts`.
 * Expected use: a `beforeDecision` hook that keeps a guest heading for a show (`showTarget ≥ 0`) from choosing
 * something else. Empty until W4-C.
 */
import type { GuestHooks } from '../hookTypes';

export const showHooks: Partial<GuestHooks> = {};
