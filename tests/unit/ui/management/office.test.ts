import { describe, expect, it } from 'vitest';
import { CAMPAIGNS, LOAN_MIN_LIMIT, LOAN_STEP, getCampaignDef } from '../../../../src/data/tuning/management';
import { MANAGEMENT_ERRORS } from '../../../../src/data/strings/management';
import { executeCommand } from '../../../../src/sim/commands';
import { RESEARCH_ORDER } from '../../../../src/data/research';
import {
  campaignDurationText,
  campaignEffectText,
  campaignStartCommand,
  campaignTargets,
  campaignTimeLeft,
  validateCampaignTarget,
} from '../../../../src/ui/management/marketing';
import { borrowStep, loanView, repayStep } from '../../../../src/ui/management/loans';
import { progressPercent, researchEta, researchView } from '../../../../src/ui/management/research';
import { formatDuration } from '../../../../src/ui/management/time';
import { makeTestWorld, placeRideDirect, placeStallDirect } from '../../../helpers/world';

describe('campaign target validation (Phase 3 §4.7)', () => {
  it('park campaigns need no target; ride and stall campaigns need a live one of the right kind', () => {
    const world = makeTestWorld();
    const ride = placeRideDirect(world, 'carousel', 10, 10, 0);
    const stall = placeStallDirect(world, 'snack_shack', 20, 20, 2);
    const spot = getCampaignDef('ride_spotlight')!;
    const snack = getCampaignDef('snack_deal')!;
    expect(validateCampaignTarget(world, getCampaignDef('poster_run')!, undefined)).toBeNull();
    expect(validateCampaignTarget(world, spot, undefined)).toBe(MANAGEMENT_ERRORS.pickTarget);
    expect(validateCampaignTarget(world, spot, stall.id)).toBe(MANAGEMENT_ERRORS.pickTarget);
    expect(validateCampaignTarget(world, spot, ride.id)).toBeNull();
    expect(validateCampaignTarget(world, snack, ride.id)).toBe(MANAGEMENT_ERRORS.pickTarget);
    expect(validateCampaignTarget(world, snack, stall.id)).toBeNull();
    expect(campaignTargets(world, spot)).toEqual([{ id: ride.id, name: ride.name }]);
    expect(campaignTargets(world, snack)).toEqual([{ id: stall.id, name: stall.name }]);
    expect(campaignTargets(world, getCampaignDef('radio_jingle')!)).toEqual([]);
  });

  it('the start command carries the target only for targeted campaigns, and the sim accepts it', () => {
    const world = makeTestWorld();
    const ride = placeRideDirect(world, 'carousel', 10, 10, 0);
    expect(campaignStartCommand(getCampaignDef('poster_run')!, ride.id)).toEqual({ type: 'startCampaign', campaignType: 'poster_run' });
    const cmd = campaignStartCommand(getCampaignDef('ride_spotlight')!, ride.id);
    expect(cmd).toEqual({ type: 'startCampaign', campaignType: 'ride_spotlight', targetId: ride.id });
    expect(executeCommand(world, cmd).ok).toBe(true);
    const c = world.state.management.campaigns[0]!;
    expect(campaignTimeLeft(world, c)).toBe(3600);
    world.state.tick += 1250;
    expect(campaignTimeLeft(world, c)).toBe(2350);
  });

  it('every campaign has duration and effect text with no final period (R4)', () => {
    expect(CAMPAIGNS).toHaveLength(7);
    for (const def of CAMPAIGNS) {
      const t = campaignEffectText(def);
      expect(t.length).toBeGreaterThan(0);
      expect(/\.$/.test(t)).toBe(false);
    }
    expect(campaignEffectText(getCampaignDef('radio_jingle')!)).toBe('Arrivals ×1.5');
    expect(campaignDurationText(1200)).toBe('1 day');
    expect(campaignDurationText(2400)).toBe('2 days');
    expect(campaignDurationText(3600)).toBe('1 month');
  });

  it('time left reads in days and hours', () => {
    expect(formatDuration(2400 + 150)).toBe('2 days 3 h');
    expect(formatDuration(1200)).toBe('1 day');
    expect(formatDuration(100)).toBe('2 h');
    expect(formatDuration(20)).toBe('under 1 h');
  });
});

describe('loan step math (Phase 3 §4.8)', () => {
  it('borrows in $1,000 steps up to the limit', () => {
    expect(LOAN_STEP).toBe(100_000);
    expect(borrowStep(0, LOAN_MIN_LIMIT)).toBe(LOAN_STEP);
    expect(borrowStep(LOAN_MIN_LIMIT - LOAN_STEP, LOAN_MIN_LIMIT)).toBe(LOAN_STEP);
    expect(borrowStep(LOAN_MIN_LIMIT, LOAN_MIN_LIMIT)).toBe(0);
  });

  it('repays one step, or the rest of a smaller balance, only with enough cash', () => {
    expect(repayStep(0, 1_000_000)).toBe(0);
    expect(repayStep(300_000, 1_000_000)).toBe(LOAN_STEP);
    expect(repayStep(300_000, LOAN_STEP)).toBe(LOAN_STEP);
    expect(repayStep(300_000, LOAN_STEP - 1)).toBe(0);
    expect(repayStep(50_000, 50_000)).toBe(50_000);
  });

  it('the view shows balance, limit, monthly interest, and matches the commands', () => {
    const world = makeTestWorld();
    let v = loanView(world);
    expect(v).toMatchObject({ balance: 0, limit: LOAN_MIN_LIMIT, interest: 0, borrow: LOAN_STEP, repay: 0 });
    expect(executeCommand(world, { type: 'borrow', amount: v.borrow }).ok).toBe(true);
    v = loanView(world);
    expect(v.balance).toBe(LOAN_STEP);
    expect(v.interest).toBe(1_000);
    expect(v.repay).toBe(LOAN_STEP);
    expect(executeCommand(world, { type: 'repay', amount: v.repay }).ok).toBe(true);
    expect(loanView(world).balance).toBe(0);
  });
});

describe('research progress (Phase 3 §4.6)', () => {
  it('progress percent is a whole number from 0 to 100', () => {
    expect(progressPercent(0, 150)).toBe(0);
    expect(progressPercent(75, 150)).toBe(50);
    expect(progressPercent(149, 150)).toBe(99);
    expect(progressPercent(150, 150)).toBe(100);
    expect(progressPercent(400, 150)).toBe(100);
    expect(progressPercent(-5, 150)).toBe(0);
    expect(progressPercent(0, 0)).toBe(0);
  });

  it('the view names the current item and its estimated unlock month', () => {
    const world = makeTestWorld();
    const r = world.state.management.research;
    r.level = 'medium';
    r.progress = 75;
    const v = researchView(world);
    expect(v.current).toBe(RESEARCH_ORDER[0]!.id);
    expect(v.name).toBe('Spiral Slide');
    expect(v.percent).toBe(50);
    // 75 points left at 3 points an hour = 25 hours = 1,250 ticks after now.
    expect(researchEta(world)).toBe(world.state.tick + 1250);
    r.level = 'none';
    expect(researchEta(world)).toBeNull();
  });

  it('lists unlocked items by name, newest first, and reports completion', () => {
    const world = makeTestWorld();
    const r = world.state.management.research;
    r.unlocked = ['spiral_slide', 'ice_cream_cart'];
    expect(researchView(world).unlocked).toEqual(['Ice Cream Cart', 'Spiral Slide']);
    r.current = null;
    expect(researchView(world).complete).toBe(true);
  });
});
