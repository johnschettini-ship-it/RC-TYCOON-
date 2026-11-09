import { describe, expect, it } from 'vitest';
import { executeCommand } from '../../../src/sim/commands';
import { stepTick } from '../../../src/sim/tick';
import { guestHooks } from '../../../src/sim/hooks';
import { weatherHooks } from '../../../src/sim/weather/hooks';
import { forgetManagementEntity } from '../../../src/sim/management/removal';
import { notify } from '../../../src/sim/notifications';
import { LEDGER_CATEGORIES } from '../../../src/sim/economy/types';
import { RESEARCH_ORDER } from '../../../src/data/research';
import { MANAGEMENT_ERRORS, managementStrings } from '../../../src/data/strings/management';
import { en } from '../../../src/data/strings/en';
import { TICKS_PER_MONTH } from '../../../src/data/tuning/core';
import { makeTestWorld, placeRideDirect, stateHash } from '../../helpers/world';
import type { World } from '../../../src/sim/types';

/** Run to the end of month `months − 1`, recording cash at each month start. */
function runMonths(w: World, months: number, each?: (monthIndex: number) => void): number[] {
  const cashAtStart: number[] = [w.state.park.cash];
  for (let m = 0; m < months; m++) {
    each?.(m);
    const end = (m + 1) * TICKS_PER_MONTH;
    while (w.state.tick < end) stepTick(w);
    cashAtStart.push(w.state.park.cash);
  }
  return cashAtStart;
}

function scriptedGame(seed: number): { w: World; cash: number[] } {
  const w = makeTestWorld(seed);
  placeRideDirect(w, 'carousel', 10, 10);
  expect(executeCommand(w, { type: 'borrow', amount: 500_000 }).ok).toBe(true);
  const cash = runMonths(w, 6, (m) => {
    if (m === 2) expect(executeCommand(w, { type: 'startCampaign', campaignType: 'poster_run' }).ok).toBe(true);
  });
  return { w, cash };
}

describe('management in the tick pipeline (Phase 3 §4.17)', () => {
  it('every month: cash change equals the sum of ledger lines (financing included)', () => {
    const { w, cash } = scriptedGame(2024);
    const ledger = w.state.economy.ledger;
    expect(ledger.map((l) => l.monthIndex)).toEqual([0, 1, 2, 3, 4, 5]);
    for (let m = 0; m < 6; m++) {
      const lines = ledger[m]!.lines;
      const sum = LEDGER_CATEGORIES.reduce((a, c) => a + lines[c], 0);
      // Month 0 also holds the loan, taken before the first tick.
      expect(sum).toBe((cash[m + 1] ?? 0) - (cash[m] ?? 0) + (m === 0 ? 500_000 : 0));
    }
    expect(ledger[0]!.lines.loan).toBe(500_000);
    for (let m = 1; m < 6; m++) expect(ledger[m]!.lines.loanInterest).toBe(-5_000);
    expect(ledger[2]!.lines.marketing).toBe(-60_000);
    expect(ledger[1]!.lines.research).toBe(-40_000);
  });

  it('research, campaigns, park value, and weather all advance', () => {
    const { w } = scriptedGame(2024);
    const m = w.state.management;
    expect(m.research.unlocked).toEqual(RESEARCH_ORDER.slice(0, 6).map((i) => i.id));
    expect(m.campaigns).toEqual([]);
    expect(m.messages.some((msg) => msg.textId === 'msg.marketing.ended')).toBe(true);
    expect(m.parkValue).toBeGreaterThan(0);
    expect(m.weather.nextChangeTick).toBe(6 * TICKS_PER_MONTH);
    // The management slice survives a JSON round trip (saves).
    expect(JSON.parse(JSON.stringify(m))).toEqual(m);
  });

  it('is deterministic for a seed', () => {
    expect(stateHash(scriptedGame(55).w)).toBe(stateHash(scriptedGame(55).w));
    expect(stateHash(scriptedGame(55).w)).not.toBe(stateHash(scriptedGame(56).w));
  });
});

describe('integration seams', () => {
  it('guestHooks include the weather hooks', () => {
    for (const k of ['beforeDecision', 'perTick', 'rideScore', 'stallWant'] as const) {
      for (const h of weatherHooks[k] ?? []) expect((guestHooks[k] as unknown[]).includes(h)).toBe(true);
    }
  });

  it('forgetManagementEntity ends targeted campaigns and clears message targets', () => {
    const w = makeTestWorld();
    const ride = placeRideDirect(w, 'carousel', 10, 10);
    executeCommand(w, { type: 'startCampaign', campaignType: 'ride_spotlight', targetId: ride.id });
    notify(w, 'breakdown', 'msg.b', { entityId: ride.id });
    forgetManagementEntity(w, ride.id);
    expect(w.state.management.campaigns).toEqual([]);
    expect(w.state.management.messages.every((msg) => msg.entityId === -1)).toBe(true);
  });

  it('strings have no final period (master R4) and are in the English table', () => {
    for (const [id, text] of Object.entries(managementStrings)) {
      expect(text.endsWith('.'), id).toBe(false);
      expect(en[id]).toBe(text);
    }
    for (const reason of Object.values(MANAGEMENT_ERRORS)) expect(reason.endsWith('.')).toBe(false);
  });
});
