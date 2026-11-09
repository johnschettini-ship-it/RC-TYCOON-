/**
 * Balance sweep (W2-D): the Phase 1 integration park over many seeds, one summary line per seed.
 * Skipped unless TC_BALANCE_SEEDS is set, so it never slows the normal suite. Used for tuning-log.md:
 *
 *   TC_BALANCE_SEEDS=12345,777,2024,1,42,9001,7,99,31337,500 npx vitest run tests/integration/balance-sweep.test.ts --silent=false
 */
import { describe, expect, it } from 'vitest';
import { temperamentGroup } from '../../src/data/catalog';
import { mean, runPhase1Game } from './scenario';

const seeds = (process.env.TC_BALANCE_SEEDS ?? '')
  .split(',')
  .map((v) => Number(v.trim()))
  .filter((v) => Number.isInteger(v) && v > 0);

describe.runIf(seeds.length > 0)('Phase 1 balance sweep', () => {
  it(`runs ${seeds.length} seeds`, () => {
    const rows: string[] = [];
    const arrivals: number[] = [];
    const happiness: number[] = [];
    for (const seed of seeds) {
      const { world, stats, boardings } = runPhase1Game(seed);
      const h = mean(stats.leaverHappiness);
      arrivals.push(stats.arrived);
      happiness.push(h);
      const thrillRides = Object.values(boardings.thrill).reduce((a, b) => a + b, 0);
      const groups = world.state.guests.reduce<Record<string, number>>((acc, g) => {
        const k = temperamentGroup(g.temperament);
        acc[k] = (acc[k] ?? 0) + 1;
        return acc;
      }, {});
      rows.push(
        [
          `seed ${seed}`,
          `arrived ${stats.arrived}`,
          `turned away ${stats.turnedAway}`,
          `leavers ${stats.leaverHappiness.length} @ ${h.toFixed(1)}`,
          `longest stay ${stats.longest?.state ?? '-'} ${stats.longest?.ticks ?? 0}`,
          `cash $${(world.state.park.cash / 100).toFixed(0)}`,
          `thrill boardings ${thrillRides}`,
          `in park ${JSON.stringify(groups)}`,
        ].join(' | '),
      );
    }
    rows.push(`mean arrivals ${mean(arrivals).toFixed(0)} (min ${Math.min(...arrivals)}), mean leaver happiness ${mean(happiness).toFixed(1)} (min ${Math.min(...happiness).toFixed(1)})`);
    console.log(rows.join('\n'));
    expect(rows.length).toBe(seeds.length + 1);
  }, 600_000);
});
