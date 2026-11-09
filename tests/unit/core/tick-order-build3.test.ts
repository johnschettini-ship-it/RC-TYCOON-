/** Master R13 tick order with the Build 3 show systems (Wave 4.0 stubs record their calls). */
import { describe, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => [] as string[]);

vi.mock('../../../src/sim/stalls/update', () => ({ updateStalls: () => void calls.push('stalls') }));
vi.mock('../../../src/sim/breakdowns/update', () => ({ updateBreakdowns: () => void calls.push('breakdowns') }));
vi.mock('../../../src/sim/shows/update', () => ({
  updateShows: () => void calls.push('shows'),
  hourlyShows: () => void calls.push('hourlyShows'),
}));
vi.mock('../../../src/sim/economy/hourly', () => ({ chargeRunningCosts: () => void calls.push('runningCosts') }));
vi.mock('../../../src/sim/staff/update', () => ({
  updateStaff: () => void calls.push('staff'),
  hourlyStaff: () => void calls.push('wages'),
}));
vi.mock('../../../src/sim/research/update', async (orig) => ({ ...(await orig<object>()), hourlyResearch: () => void calls.push('research') }));
vi.mock('../../../src/sim/park/rating', async (orig) => ({ ...(await orig<object>()), updateRating: () => void calls.push('rating') }));

import { stepTick } from '../../../src/sim/tick';
import { makeTestWorld } from '../../helpers/world';

describe('tick order with shows (master R13, Phase 6 §4.4)', () => {
  it('every tick: stalls → breakdowns → shows; hour start: running costs → wages → show running costs → research', () => {
    const w = makeTestWorld();
    w.state.tick = 500; // 10:00: an hour start, not a month start.
    calls.length = 0;
    stepTick(w);
    expect(calls).toEqual(['staff', 'stalls', 'breakdowns', 'shows', 'runningCosts', 'wages', 'hourlyShows', 'research', 'rating']);
  });

  it('a plain tick runs shows but no hour work', () => {
    const w = makeTestWorld();
    w.state.tick = 451;
    calls.length = 0;
    stepTick(w);
    expect(calls).toEqual(['staff', 'stalls', 'breakdowns', 'shows']);
  });
});
