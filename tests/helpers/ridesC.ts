/**
 * New rides batch C (docs/superpowers/specs/2026-11-17-new-rides-design.md): the track ride types it adds to the
 * catalogue. The research ones are Phase 6, with their research category and cost (src/data/research.ts); count tests
 * add these to the Build 3 numbers. The start ones are unlocked from the start (the Mine Train).
 */
export const RIDES_C: Readonly<Record<string, readonly [string, number]>> = {};
export const RIDES_C_IDS: readonly string[] = Object.keys(RIDES_C);
export const RIDES_C_START: readonly string[] = ['mine_train'];
