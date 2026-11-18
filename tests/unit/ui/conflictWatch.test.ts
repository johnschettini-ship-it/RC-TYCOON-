/** Queue clarity (spec 2026-11-18 §3): a one-time message when a queue that touches another ride's queue is built. */
import { describe, expect, it } from 'vitest';
import { createConflictWatch } from '../../../src/ui/queues/conflictWatch';
import { markNetworkDirty } from '../../../src/sim/pathing';
import { Content, tileIndex } from '../../../src/sim/map';
import type { World } from '../../../src/sim/types';
import { makeTestWorld, placeQueue, placeRideDirect } from '../../helpers/world';

function twoRides(): World {
  const w = makeTestWorld();
  placeRideDirect(w, 'carousel', 10, 10, 0).name = 'Carousel 1';
  placeRideDirect(w, 'carousel', 14, 10, 0).name = 'Carousel 2';
  placeQueue(w, 11, 13);
  placeQueue(w, 12, 13);
  placeQueue(w, 14, 13);
  placeQueue(w, 15, 13);
  markNetworkDirty(w);
  return w;
}

const join = (w: World): void => {
  placeQueue(w, 13, 13);
  markNetworkDirty(w);
};
const split = (w: World): void => {
  w.state.map.content[tileIndex(w.state.map, 13, 13)] = Content.Empty;
  markNetworkDirty(w);
};
const MSG = 'The Carousel 2 line touches the Carousel 1 line. Guests in it only go to Carousel 1';

describe('touching queue message', () => {
  it('stays quiet about conflicts that exist when it first looks (a loaded park)', () => {
    const w = twoRides();
    join(w);
    const said: string[] = [];
    const watch = createConflictWatch();
    watch.check(w, (m) => said.push(m));
    watch.check(w, (m) => said.push(m));
    expect(said).toEqual([]);
  });

  it('says it once when two queues are joined, naming both rides', () => {
    const w = twoRides();
    const said: Array<[string, string]> = [];
    const watch = createConflictWatch();
    watch.check(w, (m, k) => said.push([m, k]));
    join(w);
    watch.check(w, (m, k) => said.push([m, k]));
    watch.check(w, (m, k) => said.push([m, k]));
    expect(said).toEqual([[MSG, 'warning']]);
  });

  it('does not repeat when the same pair is split and joined again', () => {
    const w = twoRides();
    const said: string[] = [];
    const watch = createConflictWatch();
    watch.check(w, (m) => said.push(m));
    join(w);
    watch.check(w, (m) => said.push(m));
    split(w);
    watch.check(w, (m) => said.push(m));
    join(w);
    watch.check(w, (m) => said.push(m));
    expect(said).toEqual([MSG]);
  });

  it('a different world starts quiet again', () => {
    const w1 = twoRides();
    const watch = createConflictWatch();
    const said: string[] = [];
    watch.check(w1, (m) => said.push(m));
    const w2 = twoRides();
    join(w2);
    watch.check(w2, (m) => said.push(m));
    expect(said).toEqual([]);
    split(w2);
    watch.check(w2, (m) => said.push(m));
    join(w2);
    watch.check(w2, (m) => said.push(m));
    expect(said).toEqual([]); // known from the first look at w2
  });
});
