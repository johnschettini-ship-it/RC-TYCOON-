/**
 * Phase 1 §9 integration game (W2-D): a scripted park on a fixed seed, run for 3 game months at full speed.
 * Build: path loop, 2 queues, Carousel, Swing Tower, Snack Shack, Fizz Stand, Restrooms; open the park.
 * Expect: > 300 guests arrived; every ride has riders; every stall has sales; no guest stuck in one state
 * for > 2 game days; ledger invariant every month; average leaver happiness ≥ 150; `validateState` passes.
 *
 * All Phase 3 systems run too (weather, litter, breakdowns, research budget), as in a real Build 1 game.
 * Balance changes that make these targets hold are in docs/superpowers/specs/thrills-and-chills/tuning-log.md.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { TICKS_PER_DAY } from '../../src/data/tuning/core';
import { ARRIVAL_RATING_DIVISOR, RATING_WEIGHTS } from '../../src/data/tuning/economy';
import { validateState } from '../../src/save';
import { stateHash } from '../helpers/world';
import { PHASE1_BALANCE_SEEDS, PHASE1_MONTHS as MONTHS, PHASE1_SEED, mean, runPhase1Game, type Phase1Run } from './scenario';

const STUCK_LIMIT = 2 * TICKS_PER_DAY;
/**
 * Phase 4 (master R8) moves `RATING_WEIGHTS.atmosphere` rating points from Happiness to Atmosphere, which needs Calm
 * and Buzz (scenery). This Phase 1 park has none, so its rating can fall by up to that weight, and the arrival
 * rating factor (rating / ARRIVAL_RATING_DIVISOR) with it. The other seeds keep the 300-arrival target less that
 * share; the main seed still clears 300.
 */
const BALANCE_ARRIVALS_MIN = 300 * (1 - RATING_WEIGHTS.atmosphere / ARRIVAL_RATING_DIVISOR);
/** A 3-month game takes about 1 s on a laptop; leave room for slow CI runners. */
const LONG = 60_000;

function share(counts: Record<string, number>, key: string): number {
  let total = 0;
  for (const v of Object.values(counts)) total += v;
  return total === 0 ? 0 : (counts[key] ?? 0) / total;
}

describe(`Phase 1 integration game (seed ${PHASE1_SEED}, ${MONTHS} game months)`, () => {
  let run: Phase1Run;
  beforeAll(() => {
    run = runPhase1Game(PHASE1_SEED);
  }, LONG);

  it('more than 300 guests arrive', () => {
    expect(run.stats.arrived).toBeGreaterThan(300);
  });

  it('every ride has riders and every stall has sales', () => {
    for (const r of run.world.state.rides) expect(r.totals.riders, r.defId).toBeGreaterThan(0);
    for (const s of run.world.state.stalls) expect(s.totals.sales, s.defId).toBeGreaterThan(0);
  });

  it('no guest stays in one state for more than 2 game days', () => {
    for (const [state, ticks] of Object.entries(run.stats.maxStateTicks)) {
      expect(ticks, `longest stay in ${state}`).toBeLessThanOrEqual(STUCK_LIMIT);
    }
  });

  it('the ledger invariant holds every month: cash change = sum of the month lines', () => {
    expect(run.stats.months.length).toBe(MONTHS + 1);
    for (const m of run.stats.months) {
      expect(m.cashEnd - m.cashStart, `month ${m.monthIndex}`).toBe(m.ledgerSum);
    }
  });

  it('leavers are happy on average (≥ 150 of 255)', () => {
    expect(run.stats.leaverHappiness.length).toBeGreaterThan(200);
    expect(mean(run.stats.leaverHappiness)).toBeGreaterThanOrEqual(150);
  });

  it('Thrill and Chill guests prefer different rides', () => {
    const { thrill, chill } = run.boardings;
    expect(share(thrill, 'swing_tower')).toBeGreaterThan(share(chill, 'swing_tower') + 0.3);
    expect(share(chill, 'carousel')).toBeGreaterThan(share(thrill, 'carousel') + 0.3);
  });

  it('the state passes validateState every month and at the end', () => {
    expect(run.problems).toEqual([]);
    expect(validateState(run.world.state)).toBeNull();
  });

  it('is deterministic: the same script twice gives the same state hash', () => {
    const again = runPhase1Game(PHASE1_SEED);
    expect(stateHash(again.world)).toBe(stateHash(run.world));
  }, LONG);
});

describe('Phase 1 balance holds on other seeds (tuning-log.md)', () => {
  for (const seed of PHASE1_BALANCE_SEEDS) {
    it(`seed ${seed}: > ${BALANCE_ARRIVALS_MIN} arrivals, leaver happiness ≥ 150, riders, sales, ledger, no stuck guests`, () => {
      const { world, stats, problems } = runPhase1Game(seed);
      expect(stats.arrived).toBeGreaterThan(BALANCE_ARRIVALS_MIN);
      expect(mean(stats.leaverHappiness)).toBeGreaterThanOrEqual(150);
      for (const r of world.state.rides) expect(r.totals.riders).toBeGreaterThan(0);
      for (const s of world.state.stalls) expect(s.totals.sales).toBeGreaterThan(0);
      for (const m of stats.months) expect(m.cashEnd - m.cashStart).toBe(m.ledgerSum);
      for (const ticks of Object.values(stats.maxStateTicks)) expect(ticks).toBeLessThanOrEqual(STUCK_LIMIT);
      expect(problems).toEqual([]);
    }, LONG);
  }
});
