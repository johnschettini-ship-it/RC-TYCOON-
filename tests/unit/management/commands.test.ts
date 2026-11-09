import { describe, expect, it } from 'vitest';
import { executeCommand, type Command } from '../../../src/sim/commands';
import { makeTestWorld, placeRideDirect, stateHash } from '../../helpers/world';
import type { World } from '../../../src/sim/types';

type Case = { name: string; setup?: (w: World) => void; cmd: Command; reason: string };

/** Phase 3 §6: every failure reason of the W1-I commands, exact text, state unchanged. */
const CASES: Case[] = [
  { name: 'focus: unknown category', cmd: { type: 'setResearchFocus', category: 'space' as never, on: true }, reason: 'Unknown category' },
  { name: 'campaign: not enough cash', setup: (w) => (w.state.park.cash = 0), cmd: { type: 'startCampaign', campaignType: 'poster_run' }, reason: 'Not enough cash' },
  {
    name: 'campaign: already running',
    setup: (w) => void executeCommand(w, { type: 'startCampaign', campaignType: 'poster_run' }),
    cmd: { type: 'startCampaign', campaignType: 'poster_run' },
    reason: 'Campaign already running',
  },
  {
    name: 'campaign: weekends',
    setup: (w) => void executeCommand(w, { type: 'startCampaign', campaignType: 'chill_weekend' }),
    cmd: { type: 'startCampaign', campaignType: 'thrill_weekend' },
    reason: 'Thrill and Chill Weekends cannot run together',
  },
  { name: 'campaign: no target', cmd: { type: 'startCampaign', campaignType: 'snack_deal' }, reason: 'Pick a target' },
  { name: 'borrow: limit', cmd: { type: 'borrow', amount: 1_100_000 }, reason: 'Loan limit reached' },
  { name: 'borrow: step', cmd: { type: 'borrow', amount: 1_000 }, reason: 'Amount must be a multiple of $1,000' },
  { name: 'repay: no loan', cmd: { type: 'repay', amount: 100_000 }, reason: 'No loan to repay' },
  {
    name: 'repay: cash',
    setup: (w) => {
      executeCommand(w, { type: 'borrow', amount: 100_000 });
      w.state.park.cash = 50_000;
    },
    cmd: { type: 'repay', amount: 100_000 },
    reason: 'Not enough cash',
  },
  { name: 'repay: step', cmd: { type: 'repay', amount: 250_000 }, reason: 'Amount must be a multiple of $1,000' },
  { name: 'budget: unknown level', cmd: { type: 'setResearchBudget', level: 'max' as never }, reason: 'Unknown budget level' },
];

describe('management commands (Phase 3 §6)', () => {
  for (const c of CASES) {
    it(`${c.name} → "${c.reason}"`, () => {
      const w = makeTestWorld();
      placeRideDirect(w, 'carousel', 10, 10);
      c.setup?.(w);
      const before = stateHash(w);
      expect(executeCommand(w, c.cmd)).toEqual({ ok: false, reason: c.reason });
      expect(stateHash(w)).toBe(before);
    });
  }

  it('the always-succeeding commands return ok with cost 0', () => {
    const w = makeTestWorld();
    for (const cmd of [
      { type: 'setResearchBudget', level: 'high' },
      { type: 'setResearchFocus', category: 'thrill', on: false },
      { type: 'markMessagesRead', upToId: 0 },
    ] as Command[]) {
      expect(executeCommand(w, cmd)).toEqual({ ok: true, cost: 0, warnings: [] });
    }
    expect(w.state.management.research.level).toBe('high');
    expect(w.state.management.research.focus.thrill).toBe(false);
  });
});
