/** Phase 5 §4.1, §4.5, §4.9 rules other systems read: climate, unlimited money, arrivals, content, After Dark, loans. */
import { describe, expect, it } from 'vitest';
import { getScenarioDef, type ScenarioDef } from '../../../src/data/scenarios';
import { SEASON_WEATHER_WEIGHTS, WEATHER_STATES } from '../../../src/data/tuning/management';
import { executeCommand } from '../../../src/sim/commands';
import { canAfford, recordLedger } from '../../../src/sim/economy/ledger';
import { isUnlocked } from '../../../src/sim/research/api';
import { hourlyResearch, pickNextResearch } from '../../../src/sim/research/update';
import { drawNextWeather } from '../../../src/sim/weather/update';
import {
  afterDarkLocked,
  ALWAYS_SUNNY_WEIGHTS,
  climateOf,
  climateWeights,
  scenarioArrivalFactor,
  scenarioContentRule,
  scenarioMaxLoan,
  unlimitedMoney,
  weatherWeights,
} from '../../../src/sim/scenario/api';
import { newScenarioRun } from '../../../src/sim/scenario/start';
import { emptyAwards } from '../../../src/sim/awards/types';
import type { SandboxOptions } from '../../../src/sim/scenario/types';
import type { World } from '../../../src/sim/types';
import { makeTestWorld } from '../../helpers/world';

const SANDBOX: SandboxOptions = { mapSize: 64, terrainStyle: 'flat', seed: 1, climate: 'cold', afterDark: true, unlimitedMoney: true, allUnlocked: false, guestsArrive: false, breakdowns: true, weather: 'normal', awards: true };

function sandbox(patch: Partial<SandboxOptions> = {}): World {
  const w = makeTestWorld();
  w.state.scenario = { kind: 'sandbox', options: { ...SANDBOX, ...patch }, awards: emptyAwards() };
  return w;
}

function scenario(id: string): World {
  const w = makeTestWorld();
  w.state.scenario = newScenarioRun(getScenarioDef(id)!, 'standard');
  return w;
}

describe('free play stays neutral', () => {
  it('every rule gives the Build 1 answer', () => {
    const w = makeTestWorld();
    expect(unlimitedMoney(w.state)).toBe(false);
    expect(climateOf(w.state)).toBe('temperate');
    for (const season of ['winter', 'spring', 'summer', 'autumn'] as const) expect(weatherWeights(w, season)).toBe(SEASON_WEATHER_WEIGHTS[season]);
    expect(scenarioArrivalFactor(w)).toBe(1);
    expect(scenarioContentRule(w, 'drop_tower')).toBe('normal');
    expect(afterDarkLocked(w.state)).toBeNull();
    expect(scenarioMaxLoan(w.state)).toBeNull();
  });
});

describe('climates (Phase 5 §4.9)', () => {
  it('temperate is the Phase 3 table; the others shift hot and cold by the °C offset and scale rain and sun', () => {
    expect(climateWeights('temperate', 'summer')).toBe(SEASON_WEATHER_WEIGHTS.summer);
    // Cold winter: −10 °C → 20 points from hot (0) to cold; rain × 1.2, sun × 0.8.
    expect(climateWeights('cold', 'winter')).toEqual({ sunny: 12, cloudy: 30, rain: 24, storm: 6, hot: 0, cold: 50 });
    // Hot summer: +10 °C → hot 30 + 20 = 50, × 1.5 = 75; rain × 0.5.
    expect(climateWeights('hot', 'summer')).toEqual({ sunny: 53, cloudy: 15, rain: 5, storm: 5, hot: 75, cold: 0 });
    // Hot winter: +6 °C → hot 12 (× 1.5 = 18), cold 30 − 12 = 18.
    expect(climateWeights('hot', 'winter')).toEqual({ sunny: 23, cloudy: 30, rain: 10, storm: 3, hot: 18, cold: 18 });
    // Coastal summer: −1 °C → cold +2, hot −2; rain × 1.4, sun × 0.9.
    expect(climateWeights('coastal', 'summer')).toEqual({ sunny: 32, cloudy: 15, rain: 14, storm: 14, hot: 25, cold: 2 });
    for (const c of ['temperate', 'cold', 'hot', 'coastal'] as const) {
      for (const s of ['winter', 'spring', 'summer', 'autumn'] as const) {
        for (const k of WEATHER_STATES) expect(Number.isInteger(climateWeights(c, s)[k])).toBe(true);
      }
    }
  });

  it('the park climate comes from the scenario or the sandbox option, and reaches the weather draw', () => {
    expect(climateOf(scenario('frostbite_falls').state)).toBe('cold');
    expect(climateOf(scenario('sky_high').state)).toBe('hot');
    expect(climateOf(sandbox({ climate: 'coastal' }).state)).toBe('coastal');
    expect(weatherWeights(scenario('sky_high'), 'summer')).toBe(climateWeights('hot', 'summer'));
    const count = (w: World, state: string): number => {
      const holder = { rng: 99 };
      let n = 0;
      for (let k = 0; k < 4000; k++) if (drawNextWeather(holder, 'cloudy', 'summer', weatherWeights(w, 'summer')) === state) n++;
      return n;
    };
    expect(count(scenario('sky_high'), 'hot')).toBeGreaterThan(count(makeTestWorld(), 'hot') * 1.5);
    expect(count(scenario('frostbite_falls'), 'cold')).toBeGreaterThan(0);
    expect(count(makeTestWorld(), 'cold')).toBe(0);
  });

  it('sandbox "always sunny" draws only sunny', () => {
    const w = sandbox({ weather: 'alwaysSunny' });
    expect(weatherWeights(w, 'winter')).toBe(ALWAYS_SUNNY_WEIGHTS);
    const holder = { rng: 5 };
    for (let k = 0; k < 200; k++) expect(drawNextWeather(holder, 'sunny', 'winter', weatherWeights(w, 'winter'))).toBe('sunny');
  });
});

describe('sandbox money and arrivals (Phase 5 §4.5)', () => {
  it('unlimited money: affordability passes, expenses do not lower cash, the ledger still books them', () => {
    const w = sandbox();
    w.state.park.cash = 100;
    expect(unlimitedMoney(w.state)).toBe(true);
    expect(canAfford(w, 1_000_000, { setup: false })).toBe(true);
    recordLedger(w, 'construction', -50_000);
    recordLedger(w, 'rideTickets', 300);
    expect(w.state.park.cash).toBe(400);
    expect(w.state.economy.ledger.at(-1)!.lines.construction).toBe(-50_000);
    expect(executeCommand(w, { type: 'placeRide', defId: 'carousel', x: 20, y: 20, rotation: 0 }).ok).toBe(true);
    expect(w.state.park.cash).toBe(400);
    expect(unlimitedMoney(sandbox({ unlimitedMoney: false }).state)).toBe(false);
  });

  it('guests arrive: off stops arrivals', () => {
    expect(scenarioArrivalFactor(sandbox({ guestsArrive: false }))).toBe(0);
    expect(scenarioArrivalFactor(sandbox({ guestsArrive: true }))).toBe(1);
  });
});

describe('content rules (Phase 5 §4.1 research, sandbox all unlocked)', () => {
  it('scenario `unlocked` items are available at start; research never picks them', () => {
    const w = scenario('meadow_start');
    expect(scenarioContentRule(w, 'bumper_cars')).toBe('unlocked');
    expect(scenarioContentRule(w, 'drop_tower')).toBe('normal');
    expect(isUnlocked(w, 'bumper_cars')).toBe(true);
    expect(isUnlocked(w, 'spiral_slide')).toBe(true);
    expect(isUnlocked(w, 'drop_tower')).toBe(false);
    const r = w.state.management.research;
    expect(pickNextResearch(r)).toBe('spiral_slide');
    r.current = 'spiral_slide';
    w.state.tick = 450;
    hourlyResearch(w);
    expect(r.current).toBe('ice_cream_cart');
  });

  it('`allowed` hides research content that is not listed; start content always shows', () => {
    const def: ScenarioDef = { ...getScenarioDef('meadow_start')!, id: 'meadow_start' };
    const w = scenario('meadow_start');
    const original = def.research;
    const live = getScenarioDef('meadow_start')!;
    (live as { research: ScenarioDef['research'] }).research = { unlocked: ['spiral_slide'], allowed: ['spiral_slide', 'pendulum_ship', 'volcano_ridge'] };
    try {
      expect(scenarioContentRule(w, 'drop_tower')).toBe('hidden');
      expect(isUnlocked(w, 'drop_tower')).toBe(false);
      expect(scenarioContentRule(w, 'pendulum_ship')).toBe('normal');
      expect(scenarioContentRule(w, 'carousel')).toBe('normal');
      expect(scenarioContentRule(w, 'lava_rock')).toBe('normal');
      expect(scenarioContentRule(w, 'tree_bare')).toBe('hidden');
      expect(scenarioContentRule(w, 'oak_round')).toBe('normal');
      const r = w.state.management.research;
      const order: string[] = [];
      for (let k = 0; k < 3; k++) {
        const next = pickNextResearch(r, (id) => scenarioContentRule(w, id) !== 'normal');
        if (next === null) break;
        order.push(next);
        r.unlocked.push(next);
      }
      expect(order).toEqual(['pendulum_ship']);
    } finally {
      (live as { research: ScenarioDef['research'] }).research = original;
    }
  });

  it('sandbox "all items unlocked" unlocks everything up to the build phase', () => {
    const w = sandbox({ allUnlocked: true });
    expect(scenarioContentRule(w, 'flip_arm')).toBe('unlocked');
    expect(isUnlocked(w, 'flip_arm')).toBe(true);
    expect(isUnlocked(sandbox({ allUnlocked: false }), 'flip_arm')).toBe(false);
  });
});

describe('After Dark rule and the loan limit', () => {
  it('forced and off scenarios lock the switch with a reason; "on" scenarios and the sandbox do not', () => {
    expect(afterDarkLocked(scenario('spooky_hollow').state)).toBe('After Dark is always on in this scenario');
    expect(afterDarkLocked(scenario('meadow_start').state)).toBe('After Dark is off in this scenario');
    expect(afterDarkLocked(scenario('sandy_shores').state)).toBeNull();
    expect(afterDarkLocked(sandbox().state)).toBeNull();
  });

  it('the scenario loan limit is the max loan × the preset in whole steps, never below the start loan', () => {
    const w = scenario('fading_fairground');
    expect(scenarioMaxLoan(w.state)).toBe(3_500_000);
    if (w.state.scenario.kind !== 'scenario') throw new Error();
    w.state.scenario.difficulty = 'relaxed';
    expect(scenarioMaxLoan(w.state)).toBe(5_200_000);
    w.state.scenario.difficulty = 'tough';
    expect(scenarioMaxLoan(w.state)).toBe(3_000_000);
  });
});
