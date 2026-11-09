/** Master R13 tick order with the Build 2 systems (Wave 3.0 stubs record their calls). */
import { describe, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => [] as string[]);

vi.mock('../../../src/sim/economy/monthEnd', () => ({ closeMonth: () => void calls.push('closeMonth') }));
vi.mock('../../../src/sim/finance/monthly', () => ({ monthlyFinance: () => void calls.push('monthlyFinance') }));
vi.mock('../../../src/sim/awards/update', () => ({ evaluateAwards: () => void calls.push('awards') }));
vi.mock('../../../src/sim/scenario/objectives', () => ({ evaluateObjectives: () => void calls.push('objectives') }));
vi.mock('../../../src/sim/scenario/lose', () => ({ checkLoseConditions: () => void calls.push('lose') }));
vi.mock('../../../src/sim/scenario/metrics', () => ({
  resetMonthMetrics: () => void calls.push('resetMetrics'),
  recordSamples: () => void calls.push('samples'),
}));
vi.mock('../../../src/sim/weather/update', async (orig) => ({ ...(await orig<object>()), updateWeather: () => void calls.push('weather') }));
vi.mock('../../../src/sim/park/rating', async (orig) => ({ ...(await orig<object>()), updateRating: () => void calls.push('rating') }));
vi.mock('../../../src/sim/scenery/update', () => ({ hourlyScenery: () => void calls.push('scenery') }));
vi.mock('../../../src/sim/fields/update', () => ({ hourlyFields: () => void calls.push('fields') }));
vi.mock('../../../src/sim/tutorial/update', () => ({ hourlyTutorial: () => void calls.push('tutorial') }));

import { stepTick } from '../../../src/sim/tick';
import { makeTestWorld } from '../../helpers/world';

describe('tick order (master R13, Phase 5 §4.6)', () => {
  it('month start: ledger close → monthly tasks → awards → objectives → lose checks → metric resets → monthEnded, then the tick', () => {
    const w = makeTestWorld();
    w.state.tick = 3600; // 00:00, 1 April: month start and hour start.
    calls.length = 0;
    stepTick(w);
    expect(calls).toEqual([
      'closeMonth',
      'monthlyFinance',
      'awards',
      'objectives',
      'lose',
      'resetMetrics',
      'weather',
      'rating',
      'scenery',
      'fields',
      'samples',
      'tutorial',
    ]);
    expect(w.events.some((e) => e.type === 'monthEnded')).toBe(true);
  });

  it('a plain tick runs no month or hour work', () => {
    const w = makeTestWorld();
    w.state.tick = 451;
    calls.length = 0;
    stepTick(w);
    expect(calls).toEqual(['weather']);
  });
});
