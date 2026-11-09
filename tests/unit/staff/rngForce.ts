/** Find an RNG state whose next draw is below (or at least) `p`, so chance rolls can be tested exactly. */
import { rngNext } from '../../../src/sim/rng';
import type { World } from '../../../src/sim/types';

function find(pred: (x: number) => boolean): number {
  for (let k = 1; k < 1_000_000; k++) {
    if (pred(rngNext({ rng: k }))) return k;
  }
  throw new Error('no rng state found');
}

export function forceNextBelow(world: World, p: number): void {
  world.state.rng = find((x) => x < p);
}

export function forceNextAtLeast(world: World, p: number): void {
  world.state.rng = find((x) => x >= p);
}
