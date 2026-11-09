/** Set the world RNG so its next draw is below (or at least) `p`, to test chance rolls exactly (not a test file). */
import { rngNext } from '../../../src/sim/rng';
import type { World } from '../../../src/sim/types';

function find(pred: (x: number) => boolean): number {
  for (let k = 1; k < 1_000_000; k++) if (pred(rngNext({ rng: k }))) return k;
  throw new Error('no rng state found');
}

export function nextBelow(w: World, p: number): void {
  w.state.rng = find((x) => x < p);
}

export function nextAtLeast(w: World, p: number): void {
  w.state.rng = find((x) => x >= p);
}

/** Next draw in [lo, hi). */
export function nextBetween(w: World, lo: number, hi: number): void {
  w.state.rng = find((x) => x >= lo && x < hi);
}
