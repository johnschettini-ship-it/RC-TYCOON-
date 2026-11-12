/** R6 (owner 2026-11-12), Review Focus 1: a saved open long-train coaster keeps running under the car-averaged physics. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { deserialize } from '../../../src/save';
import { drainEvents } from '../../../src/sim/events';
import { stepTick } from '../../../src/sim/tick';
import { getLayout } from '../../../src/sim/rides/track/layout';

describe('saved parks keep running under the car-averaged physics (R6, Review Focus 1)', () => {
  it('the Build 1 park’s open Steel Coaster (ride 13, 36 pieces, 4 cars) stays open with no fault for 5,000 ticks', () => {
    const r = deserialize(readFileSync(new URL('../../fixtures/save-v1.tcsave.json', import.meta.url), 'utf8'));
    if (!r.ok) throw new Error(r.error);
    const w = r.world;
    const ride = w.state.rides.find((x) => x.id === 13)!;
    const data = w.state.track.rides['13']!;
    expect([ride.status, data.pieces.length, data.trainConfig.carsPerTrain]).toEqual(['open', 36, 4]);
    const stored = structuredClone(data.test);
    const stats = structuredClone(ride.stats);
    const lapMm = getLayout(data).lengthMm;
    const prev = data.trains.map((t) => t.dist);
    let travelled = 0;
    let faults = 0;
    for (let i = 0; i < 5_000; i++) {
      stepTick(w);
      data.trains.forEach((t, k) => {
        // `dist` restarts at each dispatch: count what was travelled since the last tick.
        travelled += t.dist >= (prev[k] ?? 0) ? t.dist - (prev[k] ?? 0) : t.dist;
        prev[k] = t.dist;
      });
      for (const e of drainEvents(w)) if (e.type === 'message' && e.textId === 'track.fault') faults++;
    }
    expect(faults).toBe(0);
    expect(ride.status).toBe('open');
    // Review M-3: the train really ran (more than one lap), not just stood still (the fixture park has no riders).
    expect(travelled).toBeGreaterThan(lapMm);
    // Stored ratings are kept until the next test (plan decision 8).
    expect(w.state.track.rides['13']!.test).toEqual(stored);
    expect(ride.stats).toEqual(stats);
  });
});
