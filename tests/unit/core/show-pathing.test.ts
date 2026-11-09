/**
 * `show:N` destinations (Phase 6 §4.4, Wave 4.0 contract in `sim/pathing`): the field starts from every guest-walkable
 * node on the site's viewing tiles. `viewingTiles` is W4-C's; here a fake gives the tiles.
 */
import { describe, expect, it, vi } from 'vitest';

const viewing = vi.hoisted(() => new Map<number, number[]>());

vi.mock('../../../src/sim/shows/api', async (orig) => ({
  ...(await orig<object>()),
  viewingTiles: (_w: unknown, id: number) => viewing.get(id) ?? [],
  showTargetValid: () => true,
}));

import { atDestination, distanceTo, markNetworkDirty, nextStep } from '../../../src/sim/pathing';
import { tileIndex } from '../../../src/sim/map';
import { addGuestDirect, makeTestWorld, placeFootpath, runTicks } from '../../helpers/world';

describe('show destinations (multi-seed fields)', () => {
  it('distance is the walk to the nearest viewing node; every viewing node is a destination', () => {
    const w = makeTestWorld();
    for (let y = 40; y <= 60; y++) placeFootpath(w, 31, y);
    const at = (y: number): number => tileIndex(w.state.map, 31, y);
    viewing.set(7, [at(42), at(44), tileIndex(w.state.map, 10, 10)]);
    markNetworkDirty(w);
    expect(distanceTo(w, at(50), 'show:7')).toBe(6);
    expect(nextStep(w, at(50), 'show:7')).toBe(at(49));
    expect(distanceTo(w, at(43), 'show:7')).toBe(1);
    expect(atDestination(w, at(42), 8, 'show:7')).toBe(true);
    expect(atDestination(w, at(44), 8, 'show:7')).toBe(true);
    expect(atDestination(w, at(43), 8, 'show:7')).toBe(false);
  });

  it('no viewing tile on the network → no field (unreachable)', () => {
    const w = makeTestWorld();
    for (let y = 40; y <= 60; y++) placeFootpath(w, 31, y);
    viewing.set(8, [tileIndex(w.state.map, 10, 10)]);
    markNetworkDirty(w);
    expect(distanceTo(w, tileIndex(w.state.map, 31, 50), 'show:8')).toBeNull();
    expect(distanceTo(w, tileIndex(w.state.map, 31, 50), 'show:9')).toBeNull();
  });

  it('a guest heading for a show walks there and arrives (the W4-C stub then sends it back to deciding)', () => {
    const w = makeTestWorld();
    for (let y = 40; y <= 60; y++) placeFootpath(w, 31, y);
    const at = (y: number): number => tileIndex(w.state.map, 31, y);
    viewing.set(5, [at(44)]);
    markNetworkDirty(w);
    const g = addGuestDirect(w, at(48), { target: 'show:5', showTarget: 5, nextDecisionTick: 1e9 });
    let reached = false;
    for (let i = 0; i < 200 && !reached; i++) {
      runTicks(w, 1);
      if (g.tile === at(44)) reached = true;
    }
    expect(reached).toBe(true);
    // `arriveAtShow` (neutral) clears the show target and re-plans.
    runTicks(w, 1);
    expect(g.showTarget).toBe(-1);
    expect(g.target).not.toBe('show:5');
  });
});
