/**
 * New rides batch B (docs/superpowers/specs/2026-11-17-new-rides-design.md): the flat rides it adds to the catalogue,
 * all Phase 6 and unlocked by research, with their research category and cost (src/data/research.ts). Count tests add
 * these to the Build 3 numbers.
 */
export const RIDES_B: Readonly<Record<string, readonly [string, number]>> = {
  chair_swing_twist: ['thrill', 450],
  spin_wheel_drop: ['thrill', 600],
};
export const RIDES_B_IDS: readonly string[] = Object.keys(RIDES_B);
