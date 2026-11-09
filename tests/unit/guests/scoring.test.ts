import { describe, expect, it } from 'vitest';
import { text } from '../../../src/data/strings/en';
import { isRideReject, rideValue, scoreRide } from '../../../src/sim/guests/scoring';
import { THOUGHT } from '../../../src/sim/guests/thoughts';
import { QUEUE_MAX_JOIN } from '../../../src/data/tuning/guests';
import { addGuestDirect, makeTestWorld, placeRideDirect } from '../../helpers/world';
import type { World } from '../../../src/sim/types';
import type { Ride } from '../../../src/sim/rides/types';

function openRide(w: World, defId: string, x: number): Ride {
  const r = placeRideDirect(w, defId, x, 10);
  r.status = 'open';
  return r;
}

describe('ride score hard rejects (Phase 1 §4.3)', () => {
  it('rejects intensity above max intensity with the exact thought', () => {
    const w = makeTestWorld();
    const swing = openRide(w, 'swing_tower', 10); // intensity 4.00
    // Max intensity at T = 25 is 4.00 exactly: allowed. At T = 24 it is 3.92: rejected.
    const ok = addGuestDirect(w, 0, { temperament: 25 });
    expect(isRideReject(scoreRide(w, ok, swing, 5))).toBe(false);
    const chill = addGuestDirect(w, 0, { temperament: 24 });
    const r = scoreRide(w, chill, swing, 5);
    expect(isRideReject(r) && r.thought).toBe(THOUGHT.tooIntense);
    expect(text(THOUGHT.tooIntense)).toBe('That looks too intense for me');
  });

  it('rejects a price above ride value × 1.5 with the exact thought', () => {
    const w = makeTestWorld();
    const carousel = openRide(w, 'carousel', 10); // excitement 2.50 → ride value $2.50
    expect(rideValue(w, carousel)).toBe(250);
    const g = addGuestDirect(w, 0, { temperament: 50 });
    carousel.price = 375;
    expect(isRideReject(scoreRide(w, g, carousel, 5))).toBe(false);
    carousel.price = 376;
    const r = scoreRide(w, g, carousel, 5);
    expect(isRideReject(r) && r.thought).toBe(THOUGHT.rideTooExpensive);
    expect(text(THOUGHT.rideTooExpensive)).toBe('That ride costs too much');
  });

  it('scales the price check by modifiers.priceTolerance (master R7)', () => {
    const w = makeTestWorld();
    const carousel = openRide(w, 'carousel', 10);
    const g = addGuestDirect(w, 0, { temperament: 50 });
    carousel.price = 500;
    expect(isRideReject(scoreRide(w, g, carousel, 5))).toBe(true);
    w.state.modifiers.priceTolerance = 2;
    expect(isRideReject(scoreRide(w, g, carousel, 5))).toBe(false);
  });

  it('rejects a queue of 25 or more with the exact thought', () => {
    const w = makeTestWorld();
    const carousel = openRide(w, 'carousel', 10);
    const g = addGuestDirect(w, 0, { temperament: 50 });
    carousel.queue = Array.from({ length: QUEUE_MAX_JOIN - 1 }, (_, i) => 1000 + i);
    expect(isRideReject(scoreRide(w, g, carousel, 5))).toBe(false);
    carousel.queue.push(2000);
    const r = scoreRide(w, g, carousel, 5);
    expect(isRideReject(r) && r.thought).toBe(THOUGHT.queueTooLong);
    expect(text(THOUGHT.queueTooLong)).toBe('That queue is far too long');
  });

  it('rejects a nauseous guest (≥ 120) on a ride with nausea ≥ 2.00, without a thought', () => {
    const w = makeTestWorld();
    const teacups = openRide(w, 'teacup_twirl', 10); // nausea 4.50
    const swing = openRide(w, 'swing_tower', 14); // nausea 2.00
    const carousel = openRide(w, 'carousel', 18); // nausea 0.50
    const g = addGuestDirect(w, 0, { temperament: 60 });
    g.needs.nausea = 119;
    expect(isRideReject(scoreRide(w, g, teacups, 5))).toBe(false);
    g.needs.nausea = 120;
    const r = scoreRide(w, g, teacups, 5);
    expect(isRideReject(r)).toBe(true);
    expect(isRideReject(r) && r.thought).toBe(null);
    expect(isRideReject(scoreRide(w, g, swing, 5))).toBe(true);
    expect(isRideReject(scoreRide(w, g, carousel, 5))).toBe(false);
  });

  it('never chooses a ride without stats (untested track ride)', () => {
    const w = makeTestWorld();
    const carousel = openRide(w, 'carousel', 10);
    carousel.stats = null;
    const g = addGuestDirect(w, 0);
    const r = scoreRide(w, g, carousel, 5);
    expect(isRideReject(r) && r.thought).toBe(null);
  });
});

describe('ride score terms (Phase 1 §4.3)', () => {
  it('adds excitement, tag fit, boring, price, distance, repeat, and noise terms', () => {
    const w = makeTestWorld();
    const carousel = openRide(w, 'carousel', 10); // E 2.50, I 1.00, family, value $2.50
    const g = addGuestDirect(w, 0, { temperament: 80 }); // min intensity 4.00
    carousel.price = 300; // $0.50 above value
    g.ridden[String(carousel.id)] = 2;
    const s = scoreRide(w, g, carousel, 10, 0.25);
    const expected = 2.5 * 0.6 + 0.3 * 1.5 - (4.0 - 1.0) * 0.8 - 0.5 * 0.5 - 10 * 0.02 - 2 * 1.5 + 0.25;
    expect(s).toBeCloseTo(expected, 10);
  });

  it('ranks Swing Tower above Carousel for a Thrill guest and the reverse for a Chill guest', () => {
    const w = makeTestWorld();
    const swing = openRide(w, 'swing_tower', 10);
    const carousel = openRide(w, 'carousel', 14);
    const thrill = addGuestDirect(w, 0, { temperament: 80 });
    const chill = addGuestDirect(w, 0, { temperament: 20 });
    const score = (v: ReturnType<typeof scoreRide>): number => (isRideReject(v) ? -Infinity : v);
    expect(score(scoreRide(w, thrill, swing, 8))).toBeGreaterThan(score(scoreRide(w, thrill, carousel, 8)));
    expect(score(scoreRide(w, chill, carousel, 8))).toBeGreaterThan(score(scoreRide(w, chill, swing, 8)));
    // Within the noise band the order still holds: the gaps are larger than the full noise range.
    expect(score(scoreRide(w, thrill, swing, 8, -0.5))).toBeGreaterThan(score(scoreRide(w, thrill, carousel, 8, 0.5)));
    expect(score(scoreRide(w, chill, carousel, 8, -0.5))).toBeGreaterThan(0);
  });
});
