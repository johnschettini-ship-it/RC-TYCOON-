// Tint mask coverage floors of the bake (bake.mjs, through bakeNode.ts): the least share of drawn pixels a kind's tint masks may cover at the
// bake's largest density (mask weight over pixels with alpha, all its sets together). Each floor is the measured share
// less 5 % (× 0.95), rounded down to a whole per cent, so a mask path change that cuts a kind's masks (fix round 1: the
// coaster rails fell to 30 %) fails the bake instead of reaching the game.

/**
 * Measured shares, with the bake they were measured on:
 *   rail, car, support, guest  the bake before the ride colour masks (81d24fb): 0.884, 0.562, 0.712, 0.209 (`car` is the
 *                              stage 1 coaster car; it stays the floor of any car set without a class of its own below)
 *   car~<class>                the Task 3 steel coaster bake at d4, fix wave (after the loop's top half was turned the
 *                              right way over). Classes that roll or turn the car over show more of its untinted chassis
 *                              and wheels, so each class has its own floor (Task 3 review P2: one pooled floor for the
 *                              rolled classes, 49 %, let one class fall far while the others held it up).
 */
export const MASK_COVERAGE_MEASURED: Readonly<Record<string, number>> = {
  rail: 0.884, car: 0.562, support: 0.712, guest: 0.209,
  'car~base': 0.564, 'car~turn': 0.561, 'car~bank': 0.525, 'car~loop': 0.498, 'car~cork': 0.525, 'car~helix': 0.527,
};

/** The floor of a measured share: less 5 %, rounded down to a whole per cent. */
export const floorOf = (share: number): number => Math.floor(share * 0.95 * 100 + 1e-9) / 100;

/** The floors (the stage 1 kinds' as they were set: rail 0.884 gave 0.84, rounded to the nearest per cent then). */
export const MASK_COVERAGE_FLOOR: Readonly<Record<string, number>> = {
  rail: 0.84, car: 0.53, support: 0.67, guest: 0.19,
  'car~base': 0.53, 'car~turn': 0.53, 'car~bank': 0.49, 'car~loop': 0.47, 'car~cork': 0.49, 'car~helix': 0.5,
};

/**
 * The floor a set is measured against: a track car class set (`car:<type>~<class>`) against its class's floor when the
 * class has one (a class not measured yet, such as `water`, against the stage 1 `car` floor); any other set against its
 * kind's.
 */
export function coverageKind(s: { kind: string; item: string }): string {
  const m = s.kind === 'car' ? /~(\w+)$/.exec(s.item) : null;
  return m && `car~${m[1]}` in MASK_COVERAGE_FLOOR ? `car~${m[1]}` : s.kind;
}
