/** Phase 5 §4.3, §5: month metrics — 12:00 and 22:00 samples, tracked thoughts, queue waits, broken rides. */
import { describe, expect, it } from 'vitest';
import { TICKS_PER_DAY, TICKS_PER_HOUR, TICKS_PER_MONTH } from '../../../src/data/tuning/core';
import { boardRide } from '../../../src/sim/guests/api';
import { addThought } from '../../../src/sim/guests/thoughts';
import { recordSamples } from '../../../src/sim/scenario/metrics';
import { guestsWithThoughts, insertSorted, lostShare, meanQueueWaitTicks, noteGuestIds, sampleMeans, takeSample, tooExpensiveShare } from '../../../src/sim/scenario/samples';
import { breakDown } from '../../../src/sim/breakdowns/api';
import type { World } from '../../../src/sim/types';
import { addGuestDirect, makeTestWorld, placeFootpath, placeRideDirect, runTicks } from '../../helpers/world';

function park(): World {
  const w = makeTestWorld();
  const tile = placeFootpath(w, 31, 40);
  for (const t of [10, 35, 50, 65, 90]) addGuestDirect(w, tile, { temperament: t, needs: { hunger: 0, thirst: 0, bladder: 0, energy: 255, happiness: 100 + t, nausea: 0 } });
  return w;
}

describe('samples', () => {
  it('a sample counts guests per master R6 group with their mean happiness and the current rating', () => {
    const w = park();
    w.state.park.rating = 640;
    expect(takeSample(w.state)).toEqual({
      tick: w.state.tick,
      guests: 5,
      rating: 640,
      meanHappiness: 150,
      chill: 2,
      family: 1,
      thrill: 2,
      chillHappiness: 122.5,
      familyHappiness: 150,
      thrillHappiness: 177.5,
    });
    const empty = takeSample(makeTestWorld().state);
    expect([empty.guests, empty.meanHappiness, empty.chillHappiness]).toEqual([0, 0, 0]);
  });

  it('the hour-start step takes a day sample at 12:00 and a night sample at 22:00: 3 of each per month', () => {
    const w = makeTestWorld();
    runTicks(w, TICKS_PER_MONTH - w.state.tick);
    const m = w.state.monthMetrics;
    expect(m.daySamples.map((s) => s.tick)).toEqual([0, 1, 2].map((d) => d * TICKS_PER_DAY + 12 * TICKS_PER_HOUR));
    expect(m.nightSamples.map((s) => s.tick)).toEqual([0, 1, 2].map((d) => d * TICKS_PER_DAY + 22 * TICKS_PER_HOUR));
    runTicks(w, 1);
    expect(w.state.monthMetrics).toMatchObject({ monthIndex: 1, daySamples: [], nightSamples: [] });
  });

  it('means: guests per sample, happiness and group happiness weighted by guests, shares in percent', () => {
    const a = takeSample(park().state);
    const m = sampleMeans([a, { ...a, guests: 15, thrill: 6, chill: 6, family: 3, meanHappiness: 200, thrillHappiness: 200, chillHappiness: 200 }]);
    expect(m.samples).toBe(2);
    expect(m.guests).toBe(10);
    expect(m.happiness).toBeCloseTo((150 * 5 + 200 * 15) / 20, 9);
    expect(m.thrillShare).toBeCloseTo((100 * 8) / 20, 9);
    expect(m.thrillHappiness).toBeCloseTo((177.5 * 2 + 200 * 6) / 8, 9);
    expect(sampleMeans([])).toMatchObject({ samples: 0, guests: 0, happiness: 0 });
  });
});

describe('guest hook counters', () => {
  it('tracked thoughts record each guest once per thought id; other thoughts only mark the guest as seen', () => {
    const w = park();
    const [g1, g2, g3] = w.state.guests;
    addThought(w, g2!, 'rideTooExpensive');
    addThought(w, g1!, 'rideTooExpensive');
    addThought(w, g1!, 'drinkTooExpensive');
    addThought(w, g3!, 'lost');
    addThought(w, g3!, 'hungry');
    w.state.tick += TICKS_PER_DAY;
    addThought(w, g2!, 'rideTooExpensive');
    const m = w.state.monthMetrics;
    expect(m.thoughtGuests).toEqual({ rideTooExpensive: [g1!.id, g2!.id], drinkTooExpensive: [g1!.id], lost: [g3!.id] });
    expect(m.guestsSeen).toEqual([g1!.id, g2!.id, g3!.id]);
    expect(guestsWithThoughts(m, ['rideTooExpensive', 'drinkTooExpensive', 'snackTooExpensive'])).toBe(2);
    expect(tooExpensiveShare(m)).toBeCloseTo(2 / 3, 9);
    expect(lostShare(m)).toBeCloseTo(1 / 3, 9);
  });

  it('boarding adds the queue wait to the month sum and count', () => {
    const w = park();
    const ride = placeRideDirect(w, 'carousel', 20, 20);
    ride.price = 0;
    const [g1, g2] = w.state.guests;
    g1!.state = 'queueing';
    g1!.stateTicks = 700;
    g2!.state = 'queueing';
    g2!.stateTicks = 1300;
    expect(boardRide(w, g1!, ride)).toBe(true);
    expect(boardRide(w, g2!, ride)).toBe(true);
    expect(w.state.monthMetrics).toMatchObject({ queueWaitTicks: 2000, queueWaits: 2 });
    expect(meanQueueWaitTicks(w.state.monthMetrics)).toBe(1000);
    expect(meanQueueWaitTicks(makeTestWorld().state.monthMetrics)).toBe(0);
  });
});

describe('hourly bookkeeping', () => {
  it('guests in the park join the sorted guests-seen list once; a ride that broke down this month is listed once', () => {
    const w = park();
    const ride = placeRideDirect(w, 'carousel', 20, 20);
    ride.status = 'open';
    const ids = w.state.guests.map((g) => g.id);
    w.state.monthMetrics.guestsSeen = [ids[3]!];
    recordSamples(w);
    expect(w.state.monthMetrics.guestsSeen).toEqual(ids);
    expect(w.state.monthMetrics.brokenRides).toEqual([]);
    breakDown(w, ride, 'stopped');
    recordSamples(w);
    recordSamples(w);
    expect(w.state.monthMetrics.brokenRides).toEqual([ride.id]);
  });

  it('id lists stay sorted and distinct', () => {
    const list: number[] = [];
    for (const id of [5, 1, 9, 5, 3, 9, 1]) insertSorted(list, id);
    expect(list).toEqual([1, 3, 5, 9]);
    const seen = [2, 8];
    noteGuestIds(seen, [{ id: 1 }, { id: 2 }, { id: 5 }, { id: 9 }] as never);
    expect(seen).toEqual([1, 2, 5, 8, 9]);
  });
});
