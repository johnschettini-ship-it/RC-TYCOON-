/**
 * The facilities' per-step work (Phase 3 §4.10: lost count, impulse buys, wrong turns) runs once per step at any
 * walking speed. Ramps (× 0.75 up, × 1.10 down, Phase 4 §4.2) and Calm/Buzz walking factors move `progress` by
 * other amounts than 1 per tick, so "progress === 1" no longer marks a step start; the guest pass does.
 */
import { describe, expect, it } from 'vitest';
import { facilityStepTick } from '../../../src/sim/facilities/hooks';
import { stepBeganThisPass } from '../../../src/sim/guests/movement';
import { updateGuests } from '../../../src/sim/guests/update';
import { markNetworkDirty, distanceTo } from '../../../src/sim/pathing';
import { tileIndex } from '../../../src/sim/map';
import { SLOPE_E, SLOPE_S } from '../../../src/render/iso';
import type { World } from '../../../src/sim/types';
import { addGuestDirect, makeTestWorld, placeFootpath, placeStallDirect } from '../../helpers/world';

/**
 * Row 10, x 15–45: flat footpath at height 8 up to x 28, a ramp on x 29 (rising east), and a plateau at height 9
 * from x 30 (rows 9–11). A Snack Shack at (44, 9) serves (44, 10).
 */
function rampPark(): { w: World; target: `stall:${number}` } {
  const w = makeTestWorld(77);
  const map = w.state.map;
  for (let y = 9; y <= 11; y++) for (let x = 30; x <= 46; x++) map.heights[tileIndex(map, x, y)] = 9;
  map.slope[tileIndex(map, 29, 10)] = SLOPE_E | SLOPE_S;
  for (let x = 15; x <= 45; x++) placeFootpath(w, x, 10);
  const stall = placeStallDirect(w, 'snack_shack', 44, 9, 2);
  markNetworkDirty(w);
  return { w, target: `stall:${stall.id}` };
}

describe('facility step work at any walking speed', () => {
  it('runs once at every step start, ramp steps included (their first tick moves progress by 0.75)', () => {
    const { w, target } = rampPark();
    const map = w.state.map;
    const g = addGuestDirect(w, tileIndex(map, 16, 10), { target, nextDecisionTick: 1e9, needs: { hunger: 0, thirst: 0, bladder: 0, energy: 255, happiness: 200, nausea: 0 } });
    const starts: Array<{ from: number; progress: number; best: number; expected: number | null; lost: number }> = [];
    for (let k = 0; k < 400 && g.tile !== tileIndex(map, 44, 10); k++) {
      w.state.tick += 1;
      const was = g.nextTile;
      updateGuests(w);
      if (was < 0 && g.nextTile >= 0) starts.push({ from: g.tile % map.width, progress: g.progress, best: g.bestDistance, expected: distanceTo(w, g.tile, target), lost: g.lostSteps });
    }
    expect(g.tile).toBe(tileIndex(map, 44, 10));
    expect(g.z).toBe(9);
    expect(starts.map((s) => s.from)).toEqual(Array.from({ length: 28 }, (_, k) => 16 + k));
    // The ramp steps (28 → 29, 29 → 30) start with progress 0.75: never exactly 1.
    expect(starts.filter((s) => s.from === 28 || s.from === 29).map((s) => s.progress)).toEqual([0.75, 0.75]);
    // Every step start counted its step once: the best distance is the distance from the step's tile, never lost.
    for (const s of starts) expect(s.best, `step from x ${s.from}`).toBe(s.expected);
    expect(starts.every((s) => s.lost === 0)).toBe(true);
  });

  it('a step is handled only in the pass that began it, and the marker is empty between passes', () => {
    const { w, target } = rampPark();
    const map = w.state.map;
    const g = addGuestDirect(w, tileIndex(map, 20, 10), { target, nextDecisionTick: 1e9 });
    w.state.tick += 1;
    updateGuests(w);
    expect(g.nextTile).toBe(tileIndex(map, 21, 10));
    expect(stepBeganThisPass(w, g)).toBe(false);
    const best = g.bestDistance;
    // A later call outside a pass (or a hook in a later pass) does no step work for the same step.
    g.bestDistance = 99;
    facilityStepTick(w, g);
    expect(g.bestDistance).toBe(99);
    g.bestDistance = best;
    w.state.tick += 1;
    updateGuests(w);
    expect(g.bestDistance).toBe(best);
  });
});
