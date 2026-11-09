/**
 * Calm and Buzz effects on guests (Phase 4 §4.6) through the guest hooks. Owner: W3-E.
 * - energyFactor: Phase 1 energy loss × (1 − 0.6 × C × c)
 * - nauseaRecoveryFactor: Phase 1 nausea recovery × (1 + C × (1 + 2c))
 * - perHour: happiness + round(6 × C × c) − round(3 × B × c) + round(6 × B × h)
 * - walkSpeed: Chill × (1 − 0.15 × C × c); Thrill walking to a `thrill` ride × (1 + 0.25 × B × h)
 * Stub: no hooks.
 */
import type { GuestHooks } from '../hookTypes';

export const fieldHooks: Partial<GuestHooks> = {};
