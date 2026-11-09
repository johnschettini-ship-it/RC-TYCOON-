/**
 * New scenario and sandbox games (Phase 5 §4.1–4.2, §4.5, §4.8). Owner: W3-H. Called by the title flow (W3-I).
 * New game, restart, and scenario select build a new GameState; they are not commands (Phase 5 §6).
 */
import { getScenarioDef, type Difficulty, type ScenarioDef } from '../../data/scenarios';
import { DIFFICULTY, SANDBOX_SEED_TRIES, SCENARIO_START_TICK } from '../../data/tuning/scenario';
import { emptyAwards } from '../awards/types';
import { updateParkValue } from '../finance/value';
import type { Modifiers } from '../park/types';
import { updateRating } from '../park/rating';
import { pickNextResearch, scenarioResearchSkip } from '../research/update';
import { monthIndexOf } from '../time';
import type { World } from '../types';
import { createWorld } from '../world';
import { generateWorldMap } from './generate';
import { applySandboxOptions } from './options';
import { sandboxMapSpec } from './sandbox';
import { emptyMonthMetrics, type SandboxOptions, type ScenarioRun } from './types';

/** Thrown when shipped scenario data breaks a generator rule (a build-time error, Phase 5 §4.2 step 9). */
export class ScenarioDataError extends Error {}

/** Difficulty multipliers into the master R7 modifiers (Phase 5 §4.8). */
export function difficultyModifiers(difficulty: Difficulty): Modifiers {
  const p = DIFFICULTY[difficulty];
  return {
    arrivals: p.arrivals,
    priceTolerance: p.priceTolerance,
    happinessDecay: p.happinessDecay,
    researchSpeed: p.researchSpeed,
    breakdownChance: p.breakdownChance,
    loanInterest: p.loanInterest,
    ratingBonus: 0,
  };
}

/** A fresh run record of `def` on `difficulty` (status active, deadline = start month + time limit − 1). */
export function newScenarioRun(def: ScenarioDef, difficulty: Difficulty, startTick: number = SCENARIO_START_TICK): ScenarioRun {
  return {
    kind: 'scenario',
    id: def.id,
    defVersion: def.defVersion,
    difficulty,
    status: 'active',
    endReason: null,
    endMonthIndex: null,
    continued: false,
    progressRecorded: false,
    deadlineMonthIndex: def.timeLimitMonths === null ? null : monthIndexOf(startTick) + def.timeLimitMonths - 1,
    objectives: def.objectives.map(() => ({ met: false, value: 0, streak: 0 })),
    loseCounters: { bankruptMonths: 0, lowRatingDays: 0 },
    awards: emptyAwards(),
  };
}

/** Research starts on an item the scenario neither hides nor unlocked already; park value and rating are current. */
function finishStart(world: World): void {
  const r = world.state.management.research;
  r.current = pickNextResearch(r, scenarioResearchSkip(world));
  updateParkValue(world);
  updateRating(world);
  world.events.length = 0;
}

/**
 * A new run of scenario `id` on `difficulty`: generated map (seeded, golden-hashed), start conditions scaled by the
 * preset, modifiers set (master R7), research rules, climate, After Dark rule, objectives, deadline, start tick 450.
 * Null for an unknown id. Throws `ScenarioDataError` when the definition fails generation (tests catch this).
 */
export function createScenarioWorld(id: string, difficulty: Difficulty): World | null {
  const def = getScenarioDef(id);
  if (!def) return null;
  const preset = DIFFICULTY[difficulty];
  const world = createWorld({ seed: def.map.seed, parkName: def.start.parkName });
  const s = world.state;
  s.tick = SCENARIO_START_TICK;
  s.monthMetrics = emptyMonthMetrics(monthIndexOf(s.tick));
  s.scenario = newScenarioRun(def, difficulty, s.tick);
  s.modifiers = difficultyModifiers(difficulty);
  s.park.cash = Math.round(def.start.cash * preset.startCash);
  s.park.entranceFee = def.start.entranceFee;
  s.park.afterDark = def.afterDark !== 'off';
  s.management.loan.balance = def.start.loan;

  const problems = generateWorldMap(world, def.map);
  if (problems.length > 0) throw new ScenarioDataError(`Scenario ${id} does not generate: ${problems.join('; ')}`);
  finishStart(world);
  return world;
}

/**
 * A new sandbox (Phase 5 §4.5): map from the size, terrain style, and seed; all land owned except a 2-tile border;
 * options applied. A random layout that fails validation moves on to the next seed (at most `SANDBOX_SEED_TRIES`
 * tries); the seed used is the one stored in the options.
 */
export function createSandboxWorld(options: SandboxOptions, parkName: string): World {
  let last: string[] = [];
  for (let k = 0; k < SANDBOX_SEED_TRIES; k++) {
    const opts: SandboxOptions = { ...options, seed: options.seed + k };
    const world = createWorld({ seed: opts.seed, parkName });
    world.state.tick = SCENARIO_START_TICK;
    world.state.scenario = { kind: 'sandbox', options: opts, awards: emptyAwards() };
    applySandboxOptions(world, opts);
    last = generateWorldMap(world, sandboxMapSpec(opts));
    if (last.length === 0) {
      finishStart(world);
      return world;
    }
  }
  throw new ScenarioDataError(`The sandbox map does not generate: ${last.join('; ')}`);
}
