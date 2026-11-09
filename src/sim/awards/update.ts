/**
 * Monthly awards (Phase 5 §4.10; step 3 of the month-end pipeline, master R13: after the ledger closes and the
 * Phase 3 monthly tasks, before objectives). Owner: W3-I.
 * Contract: evaluate every award on the closing month's metrics (`state.monthMetrics`, not yet reset), set
 * `awards.active` for the coming month, append to `awards.history`, emit `{ type: 'award' }` per award. No awards in
 * the tutorial or with the sandbox option off. Stub: no-op.
 */
import type { World } from '../types';

export function evaluateAwards(_world: World): void {}
