import { describe, expect, it } from 'vitest';
import { executeCommand } from '../../../src/sim/commands';
import { campaignArrivalFactor, hourlyMarketing } from '../../../src/sim/marketing/update';
import {
  arrivalTemperament,
  campaignRideScoreFactor,
  campaignStallPrice,
  campaignStallWant,
  effectiveEntranceFee,
  endCampaignsForTarget,
  isCampaignRunning,
} from '../../../src/sim/marketing/campaigns';
import { currentLedger } from '../../../src/sim/economy/ledger';
import { CAMPAIGNS, CAMPAIGN_ARRIVAL_CAP, getCampaignDef } from '../../../src/data/tuning/management';
import { MSG } from '../../../src/data/strings/management';
import { TICKS_PER_DAY, TICKS_PER_HOUR, TICKS_PER_MONTH } from '../../../src/data/tuning/core';
import { addGuestDirect, makeTestWorld, placeRideDirect, placeStallDirect, stateHash } from '../../helpers/world';
import type { World } from '../../../src/sim/types';

function start(w: World, campaignType: string, targetId?: number) {
  return executeCommand(w, targetId === undefined ? { type: 'startCampaign', campaignType } : { type: 'startCampaign', campaignType, targetId });
}

describe('campaign table (Phase 3 §4.7)', () => {
  it('has the 7 campaigns with spec cost, duration, and arrival effect', () => {
    expect(CAMPAIGNS.map((c) => [c.id, c.cost, c.durationTicks, c.target, c.arrivals])).toEqual([
      ['open_gate_day', 40_000, TICKS_PER_DAY, 'park', 1.8],
      ['poster_run', 60_000, TICKS_PER_MONTH, 'park', 1.25],
      ['radio_jingle', 120_000, TICKS_PER_MONTH, 'park', 1.5],
      ['ride_spotlight', 35_000, TICKS_PER_MONTH, 'ride', 1.1],
      ['snack_deal', 25_000, TICKS_PER_MONTH, 'stall', 1.05],
      ['thrill_weekend', 50_000, 2 * TICKS_PER_DAY, 'park', 1.2],
      ['chill_weekend', 50_000, 2 * TICKS_PER_DAY, 'park', 1.2],
    ]);
    expect(CAMPAIGN_ARRIVAL_CAP).toBe(2.5);
  });
});

describe('startCampaign', () => {
  it('charges the full cost at once to marketing and sets the end tick', () => {
    const w = makeTestWorld();
    const cash = w.state.park.cash;
    expect(start(w, 'radio_jingle')).toEqual({ ok: true, cost: 120_000, warnings: [] });
    expect(w.state.park.cash).toBe(cash - 120_000);
    expect(currentLedger(w).lines.marketing).toBe(-120_000);
    expect(w.state.management.campaigns).toEqual([{ type: 'radio_jingle', targetId: -1, endTick: w.state.tick + TICKS_PER_MONTH }]);
    expect(isCampaignRunning(w, 'radio_jingle')).toBe(true);
  });

  it('allows one campaign of each type', () => {
    const w = makeTestWorld();
    start(w, 'poster_run');
    expect(start(w, 'poster_run')).toEqual({ ok: false, reason: 'Campaign already running' });
  });

  it('Thrill and Chill Weekends cannot run together', () => {
    const w = makeTestWorld();
    expect(start(w, 'thrill_weekend').ok).toBe(true);
    expect(start(w, 'chill_weekend')).toEqual({ ok: false, reason: 'Thrill and Chill Weekends cannot run together' });
  });

  it('targeted campaigns need a live ride or stall', () => {
    const w = makeTestWorld();
    const ride = placeRideDirect(w, 'carousel', 10, 10);
    const stall = placeStallDirect(w, 'snack_shack', 20, 20);
    expect(start(w, 'ride_spotlight')).toEqual({ ok: false, reason: 'Pick a target' });
    expect(start(w, 'ride_spotlight', stall.id)).toEqual({ ok: false, reason: 'Pick a target' });
    expect(start(w, 'snack_deal', ride.id)).toEqual({ ok: false, reason: 'Pick a target' });
    expect(start(w, 'snack_deal', 999)).toEqual({ ok: false, reason: 'Pick a target' });
    expect(start(w, 'ride_spotlight', ride.id).ok).toBe(true);
    expect(start(w, 'snack_deal', stall.id).ok).toBe(true);
    expect(w.state.management.campaigns.map((c) => [c.type, c.targetId])).toEqual([
      ['ride_spotlight', ride.id],
      ['snack_deal', stall.id],
    ]);
  });

  it('fails without enough cash or for an unknown type, and a failure changes nothing', () => {
    const w = makeTestWorld();
    w.state.park.cash = 59_999;
    const before = stateHash(w);
    expect(start(w, 'poster_run')).toEqual({ ok: false, reason: 'Not enough cash' });
    expect(start(w, 'mega_blimp')).toEqual({ ok: false, reason: 'Unknown campaign' });
    expect(stateHash(w)).toBe(before);
    w.state.park.cash = 60_000;
    expect(start(w, 'poster_run').ok).toBe(true);
    expect(w.state.park.cash).toBe(0);
  });

  it('setup mode skips the charge', () => {
    const w = makeTestWorld();
    const cash = w.state.park.cash;
    expect(executeCommand(w, { type: 'startCampaign', campaignType: 'radio_jingle' }, { setup: true }).ok).toBe(true);
    expect(w.state.park.cash).toBe(cash);
  });
});

describe('arrival factor', () => {
  it('multiplies running campaigns and caps the product', () => {
    const w = makeTestWorld();
    expect(campaignArrivalFactor(w)).toBe(1);
    start(w, 'poster_run');
    expect(campaignArrivalFactor(w)).toBeCloseTo(1.25, 10);
    start(w, 'radio_jingle');
    expect(campaignArrivalFactor(w)).toBeCloseTo(1.875, 10);
    start(w, 'open_gate_day');
    expect(campaignArrivalFactor(w)).toBe(2.5);
  });

  it('each campaign alone gives its own factor', () => {
    for (const def of CAMPAIGNS) {
      const w = makeTestWorld();
      const ride = placeRideDirect(w, 'carousel', 10, 10);
      const stall = placeStallDirect(w, 'snack_shack', 20, 20);
      const target = def.target === 'ride' ? ride.id : def.target === 'stall' ? stall.id : undefined;
      expect(start(w, def.id, target).ok).toBe(true);
      expect(campaignArrivalFactor(w)).toBeCloseTo(def.arrivals, 10);
    }
  });
});

describe('campaign effects', () => {
  it('Open Gate Day makes the entrance fee $0 for arrivals', () => {
    const w = makeTestWorld();
    expect(effectiveEntranceFee(w)).toBe(w.state.park.entranceFee);
    start(w, 'open_gate_day');
    expect(effectiveEntranceFee(w)).toBe(0);
  });

  it('Ride Spotlight scores its ride ×1.6', () => {
    const w = makeTestWorld();
    const a = placeRideDirect(w, 'carousel', 10, 10);
    const b = placeRideDirect(w, 'teacup_twirl', 20, 10);
    const g = addGuestDirect(w, 0);
    start(w, 'ride_spotlight', a.id);
    expect(campaignRideScoreFactor(w, g, a)).toBeCloseTo(1.6, 10);
    expect(campaignRideScoreFactor(w, g, b)).toBe(1);
  });

  it('Snack Deal halves the price and raises the want chance at its stall only', () => {
    const w = makeTestWorld();
    const a = placeStallDirect(w, 'snack_shack', 20, 20);
    const b = placeStallDirect(w, 'fizz_stand', 22, 20);
    a.price = 310;
    expect(campaignStallPrice(w, a)).toBe(310);
    start(w, 'snack_deal', a.id);
    expect(campaignStallPrice(w, a)).toBe(155);
    expect(campaignStallPrice(w, b)).toBe(b.price);
    a.price = 305;
    expect(campaignStallPrice(w, a)).toBe(152);
    expect(campaignStallWant(w, a)).toBeCloseTo(1.5, 10);
    expect(campaignStallWant(w, b)).toBe(1);
  });

  it('Thrill Weekend shifts new guests +20 and scores thrill rides ×1.2', () => {
    const w = makeTestWorld();
    const thrill = placeRideDirect(w, 'swing_tower', 10, 10);
    const family = placeRideDirect(w, 'carousel', 20, 10);
    const g = addGuestDirect(w, 0);
    expect(arrivalTemperament(w, 50)).toBe(50);
    start(w, 'thrill_weekend');
    expect(arrivalTemperament(w, 50)).toBe(70);
    expect(arrivalTemperament(w, 90)).toBe(100);
    expect(campaignRideScoreFactor(w, g, thrill)).toBeCloseTo(1.2, 10);
    expect(campaignRideScoreFactor(w, g, family)).toBe(1);
  });

  it('Chill Weekend shifts new guests −20 and scores chill rides ×1.2', () => {
    const w = makeTestWorld();
    const chill = placeRideDirect(w, 'big_wheel', 10, 10);
    const thrill = placeRideDirect(w, 'swing_tower', 20, 10);
    const g = addGuestDirect(w, 0);
    start(w, 'chill_weekend');
    expect(arrivalTemperament(w, 50)).toBe(30);
    expect(arrivalTemperament(w, 10)).toBe(0);
    expect(campaignRideScoreFactor(w, g, chill)).toBeCloseTo(1.2, 10);
    expect(campaignRideScoreFactor(w, g, thrill)).toBe(1);
  });
});

describe('campaign expiry and target removal', () => {
  it('expires at the first hour start at or after its end tick and posts a message', () => {
    const w = makeTestWorld();
    w.state.tick = 10 * TICKS_PER_HOUR + 7;
    start(w, 'open_gate_day');
    const end = w.state.tick + TICKS_PER_DAY;
    w.state.tick = end - 7; // hour start before the end
    hourlyMarketing(w);
    expect(isCampaignRunning(w, 'open_gate_day')).toBe(true);
    w.state.tick = end - 7 + TICKS_PER_HOUR;
    hourlyMarketing(w);
    expect(isCampaignRunning(w, 'open_gate_day')).toBe(false);
    expect(w.state.management.messages).toEqual([
      expect.objectContaining({ category: 'marketing', textId: MSG.campaignEnded, params: { campaign: 'Open Gate Day' } }),
    ]);
  });

  it('a targeted campaign ends early, without refund, when its target is removed', () => {
    const w = makeTestWorld();
    const ride = placeRideDirect(w, 'carousel', 10, 10);
    start(w, 'ride_spotlight', ride.id);
    start(w, 'poster_run');
    const cash = w.state.park.cash;
    w.state.rides = [];
    w.state.tick = 11 * TICKS_PER_HOUR;
    hourlyMarketing(w);
    expect(w.state.management.campaigns.map((c) => c.type)).toEqual(['poster_run']);
    expect(w.state.park.cash).toBe(cash);
    expect(w.state.management.messages).toEqual([
      expect.objectContaining({ category: 'marketing', textId: MSG.campaignTargetRemoved, params: { campaign: 'Ride Spotlight' }, entityId: -1 }),
    ]);
  });

  it('endCampaignsForTarget ends it at once (for demolish)', () => {
    const w = makeTestWorld();
    const stall = placeStallDirect(w, 'snack_shack', 20, 20);
    start(w, 'snack_deal', stall.id);
    endCampaignsForTarget(w, stall.id);
    expect(w.state.management.campaigns).toEqual([]);
    expect(w.state.management.messages.map((m) => m.textId)).toEqual([MSG.campaignTargetRemoved]);
    expect(getCampaignDef('snack_deal')?.name).toBe('Snack Deal');
  });
});
