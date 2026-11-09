import { describe, expect, it } from 'vitest';
import { updateNeeds } from '../../../src/sim/guests/needs';
import {
  BLADDER_RATE,
  HUNGER_RATE,
  NAUSEA_RECOVERY,
  NEED_INTERVAL,
  NEED_UNCOMFORTABLE,
  NEED_URGENT,
  THIRST_RATE,
} from '../../../src/data/tuning/guests';
import { addGuestDirect, makeTestWorld } from '../../helpers/world';
import type { World } from '../../../src/sim/types';
import type { Guest } from '../../../src/sim/guests/types';

function runNeeds(w: World, g: Guest, ticks: number): void {
  for (let i = 0; i < ticks; i++) {
    updateNeeds(w, g);
    w.state.tick++;
  }
}

describe('need rates (Phase 1 §4.3)', () => {
  it('changes needs at the table rates per 100 ticks', () => {
    const w = makeTestWorld();
    const g = addGuestDirect(w, 0, { temperament: 50 });
    g.needs = { hunger: 30, thirst: 30, bladder: 10, energy: 250, happiness: 180, nausea: 105 };
    runNeeds(w, g, 10 * NEED_INTERVAL);
    expect(g.needs.hunger).toBe(30 + 10 * HUNGER_RATE);
    expect(g.needs.thirst).toBe(30 + 10 * THIRST_RATE);
    expect(g.needs.bladder).toBe(10 + 10 * BLADDER_RATE);
    expect(g.needs.energy).toBe(250 - 30);
    expect(g.needs.nausea).toBe(105 - 10 * NAUSEA_RECOVERY);
    expect(g.needs.happiness).toBe(180);
  });

  it.each([
    [0, 24],
    [50, 30],
    [100, 36],
  ])('energy falls 3 × drain multiplier per 100 ticks (T = %i: −%i per 1,000 ticks)', (t, drop) => {
    const w = makeTestWorld();
    const g = addGuestDirect(w, 0, { temperament: t });
    g.needs.energy = 255;
    runNeeds(w, g, 10 * NEED_INTERVAL);
    expect(g.needs.energy).toBe(255 - drop);
  });

  it('applies exactly one step per 100 ticks for every guest', () => {
    const w = makeTestWorld();
    const a = addGuestDirect(w, 0);
    const b = addGuestDirect(w, 0);
    const ha = a.needs.hunger;
    const hb = b.needs.hunger;
    runNeeds(w, a, NEED_INTERVAL);
    runNeeds(w, b, NEED_INTERVAL);
    expect(a.needs.hunger - ha).toBe(HUNGER_RATE);
    expect(b.needs.hunger - hb).toBe(HUNGER_RATE);
  });

  it('clamps needs to 0–255', () => {
    const w = makeTestWorld();
    const g = addGuestDirect(w, 0, { temperament: 100 });
    g.needs = { hunger: 254, thirst: 254, bladder: 254, energy: 1, happiness: 2, nausea: 3 };
    runNeeds(w, g, NEED_INTERVAL);
    expect(g.needs).toEqual({ hunger: 255, thirst: 255, bladder: 255, energy: 0, happiness: 0, nausea: 0 });
  });

  it('costs 1 happiness per uncomfortable need and 3 per urgent need per 100 ticks', () => {
    const w = makeTestWorld();
    const g = addGuestDirect(w, 0);
    g.needs = { hunger: NEED_UNCOMFORTABLE - HUNGER_RATE, thirst: 0, bladder: 0, energy: 255, happiness: 180, nausea: 0 };
    runNeeds(w, g, NEED_INTERVAL);
    expect(g.needs.happiness).toBe(179);
    g.needs.hunger = NEED_URGENT;
    g.needs.thirst = NEED_UNCOMFORTABLE;
    g.needs.nausea = 130; // uncomfortable (120) after −10 recovery
    runNeeds(w, g, NEED_INTERVAL);
    expect(g.needs.happiness).toBe(179 - 3 - 1 - 1);
  });

  it('scales happiness loss by modifiers.happinessDecay (master R7)', () => {
    const w = makeTestWorld();
    w.state.modifiers.happinessDecay = 2;
    const g = addGuestDirect(w, 0);
    g.needs = { hunger: NEED_URGENT, thirst: 0, bladder: 0, energy: 255, happiness: 180, nausea: 0 };
    runNeeds(w, g, NEED_INTERVAL);
    expect(g.needs.happiness).toBe(174);
  });
});
