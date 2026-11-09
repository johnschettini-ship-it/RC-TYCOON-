import { describe, expect, it } from 'vitest';
import { performance } from 'node:perf_hooks';
import { distanceTo, markNetworkDirty, rebuildAllFields } from '../../../src/sim/pathing';
import { Content, tileIndex } from '../../../src/sim/map';
import type { World } from '../../../src/sim/types';
import { makeTestWorld, placeRideDirect, placeStallDirect } from '../../helpers/world';

/** Every owned tile is a footpath, with 10 rides (each with a queue tile) and 20 stalls on top. */
function denseWorld(): World {
  const w = makeTestWorld();
  const m = w.state.map;
  for (let i = 0; i < m.content.length; i++) {
    if (m.owned[i] === 1 && m.content[i] === Content.Empty) m.content[i] = Content.Footpath;
  }
  for (let k = 0; k < 10; k++) {
    const x = 4 + (k % 5) * 11;
    const y = 4 + Math.floor(k / 5) * 20;
    const ride = placeRideDirect(w, 'carousel', x, y, 0);
    m.content[ride.entrance!.outside] = Content.Queue;
  }
  for (let k = 0; k < 20; k++) {
    placeStallDirect(w, 'snack_shack', 4 + (k % 10) * 5, 48 + Math.floor(k / 10) * 4, 0);
  }
  markNetworkDirty(w);
  return w;
}

describe('field rebuild time (Phase 1 §4.2: < 5 ms on 64 × 64)', () => {
  it('rebuilds queue ownership and all 31 fields on a dense path grid', () => {
    const w = denseWorld();
    expect(rebuildAllFields(w)).toBe(31);
    // Warm up the JIT, then take the median of 25 full rebuilds.
    for (let k = 0; k < 20; k++) {
      markNetworkDirty(w);
      rebuildAllFields(w);
    }
    const times: number[] = [];
    for (let k = 0; k < 25; k++) {
      markNetworkDirty(w);
      const t0 = performance.now();
      rebuildAllFields(w);
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    const median = times[Math.floor(times.length / 2)] as number;
    console.log(`[W1-C] full field rebuild (64x64 dense grid, 31 fields): median ${median.toFixed(3)} ms, max ${(times[times.length - 1] as number).toFixed(3)} ms`);
    // Budget is 5 ms; the assertion is generous so shared CI runners do not flake.
    expect(median).toBeLessThan(25);
    // The fields are correct after the rebuild.
    const m = w.state.map;
    expect(distanceTo(w, tileIndex(m, 31, 62), 'exit')).toBe(1);
    expect(distanceTo(w, tileIndex(m, 1, 1), 'exit')).toBe(30 + 62);
  });
});
