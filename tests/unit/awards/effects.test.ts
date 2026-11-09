/**
 * Awards in the world (Phase 5 §4.10): measuring the closing month, the month-end step, effects and clamps,
 * history, events, and the park kinds without awards.
 */
import { describe, expect, it } from 'vitest';
import { TICKS_PER_MONTH } from '../../../src/data/tuning/core';
import { validateState } from '../../../src/save';
import { awardArrivalFactor, awardRatingBonus } from '../../../src/sim/awards/api';
import { measureAwards } from '../../../src/sim/awards/criteria';
import { evaluateAwards } from '../../../src/sim/awards/update';
import type { AwardId } from '../../../src/sim/awards/types';
import { drainEvents } from '../../../src/sim/events';
import { PathItem, tileIndex } from '../../../src/sim/map';
import { litShare } from '../../../src/sim/lighting/api';
import { arrivalsPerHour } from '../../../src/sim/park/arrivals';
import { computeRating } from '../../../src/sim/park/rating';
import { emptyMonthMetrics, type ParkSample } from '../../../src/sim/scenario/types';
import { createSandboxWorld } from '../../../src/sim/scenario/start';
import { createTutorialWorld } from '../../../src/sim/tutorial/start';
import type { World } from '../../../src/sim/types';
import { makeTestWorld, placeFootpath, placeRideDirect, runTicks } from '../../helpers/world';

function sample(guests: number, patch: Partial<ParkSample> = {}): ParkSample {
  return { tick: 0, guests, rating: 500, meanHappiness: 150, chill: 0, family: guests, thrill: 0, chillHappiness: 0, familyHappiness: 150, thrillHappiness: 0, ...patch };
}

/** A world at the start of month `month` with metrics for the month that just closed. */
function atMonthStart(world: World, month = 1): World {
  world.state.tick = month * TICKS_PER_MONTH;
  world.state.monthMetrics = emptyMonthMetrics(month - 1);
  return world;
}

/**
 * Footpath x = 5–54 on row `y` with a lamp every 5 tiles (x = 7, 12, …, 52): a lamp lights the tiles within
 * √5 tiles (Phase 4 §4.7 stamps), so every tile of the row, and of a row 2 tiles away, is lit. New Build 2 parks
 * have After Dark on, so unlit paths would win Dark and Dreary (W3-F's real light map).
 */
function litFootpathRow(w: World, y: number): void {
  const map = w.state.map;
  for (let x = 5; x < 55; x++) placeFootpath(w, x, y);
  for (let x = 7; x < 55; x += 5) map.pathItem[tileIndex(map, x, y)] = PathItem.Lamp;
}

/** 100 clean, lit footpath tiles and 3 day samples of `guests`: Spotless Park unless dirtied. */
function spotlessWorld(guests = 120): World {
  const w = atMonthStart(makeTestWorld());
  litFootpathRow(w, 10);
  litFootpathRow(w, 12);
  const mm = w.state.monthMetrics;
  mm.daySamples = [sample(guests), sample(guests), sample(guests)];
  return w;
}

const awardEvents = (w: World): Array<{ id: AwardId; positive: boolean; monthIndex: number }> =>
  drainEvents(w).flatMap((e) => (e.type === 'award' ? [{ id: e.id, positive: e.positive, monthIndex: e.monthIndex }] : []));

describe('measureAwards reads the closing month', () => {
  it('footpaths, litter and mess, ride tickets, open thrill rides, breakdowns, and thought guests', () => {
    const w = spotlessWorld();
    const s = w.state;
    const map = s.map;
    // The Build 1 entrance stub adds 3 footpath tiles.
    const tiles = 100 + 3;
    map.litter[tileIndex(map, 5, 10)] = 2;
    map.mess[tileIndex(map, 6, 10)] = 1;
    map.litter[tileIndex(map, 5, 30)] = 9; // not a footpath tile
    const closed = s.economy.ledger.find((r) => r.monthIndex === 0)!;
    closed.lines.rideTickets = 12_345;
    const drop = placeRideDirect(w, 'drop_tower', 20, 20);
    drop.status = 'open';
    const flip = placeRideDirect(w, 'flip_arm', 30, 20);
    flip.status = 'closed';
    const swing = placeRideDirect(w, 'swing_tower', 40, 20);
    swing.status = 'open'; // excitement 4.50 < 6.00
    const mm = s.monthMetrics;
    mm.queueWaits = 4;
    mm.queueWaitTicks = 4000;
    mm.brokenRides = [drop.id, 9999];
    mm.guestsSeen = [1, 2, 3, 4, 5];
    mm.thoughtGuests = { rideTooExpensive: [1, 2], snackTooExpensive: [2, 3], lost: [4], lostNeedMap: [4], tired: [5] };
    const m = measureAwards(w);
    expect(m).toMatchObject({
      day: { samples: 3, guests: 120, rating: 500 },
      footpathTiles: tiles,
      dirt: 3,
      rideTickets: 12_345,
      boardings: 4,
      // W3-H's helpers: mean wait 4,000 / 4; 3 of the 5 guests seen thought "too expensive", 1 was lost.
      queueWaitTicks: 1000,
      thrillRidesExciting: 1,
      rides: 3,
      brokenRides: 1,
      tooExpensiveShare: 3 / 5,
      lostShare: 1 / 5,
      afterDark: true,
      litShare: 1,
    });
    expect(m.litShare).toBe(litShare(w));
  });

  it('an elevated footpath is a footpath tile: its litter counts and the light map sees it', () => {
    const w = spotlessWorld();
    const before = measureAwards(w);
    w.state.elevatedPaths.push({ id: 900_001, x: 20, y: 30, z: 12, kind: 'footpath', rampDir: -1 });
    w.state.elevatedPaths.push({ id: 900_002, x: 21, y: 30, z: 12, kind: 'queue', rampDir: -1 });
    w.state.map.litter[tileIndex(w.state.map, 20, 30)] = 4;
    const m = measureAwards(w);
    expect(m.footpathTiles).toBe(before.footpathTiles + 1);
    expect(m.dirt).toBe(before.dirt + 4);
    expect(m.litShare).toBe(litShare(w));
    expect(m.litShare).toBeLessThan(1);
  });

  it('group happiness is weighted by the group size of each sample', () => {
    const w = atMonthStart(makeTestWorld());
    w.state.monthMetrics.daySamples = [sample(100, { thrill: 10, thrillHappiness: 200 }), sample(100, { thrill: 30, thrillHappiness: 100 })];
    w.state.monthMetrics.nightSamples = [sample(50, { meanHappiness: 180 }), sample(150, { meanHappiness: 160 })];
    const m = measureAwards(w);
    expect(m.day.thrillShare).toBeCloseTo((100 * 40) / 200, 12);
    expect(m.day.thrillHappiness).toBeCloseTo((10 * 200 + 30 * 100) / 40, 12);
    expect(m.night.guests).toBe(100);
    expect(m.night.happiness).toBeCloseTo((50 * 180 + 150 * 160) / 200, 12);
  });
});

describe('evaluateAwards (month-end step 3)', () => {
  it('sets the active awards, records history for the closing month, and emits an award event each', () => {
    const w = spotlessWorld();
    evaluateAwards(w);
    const awards = w.state.scenario.kind === 'freePlay' ? w.state.scenario.awards : null;
    expect(awards).toEqual({ active: ['spotlessPark'], history: [{ monthIndex: 0, id: 'spotlessPark' }] });
    expect(awardEvents(w)).toEqual([{ id: 'spotlessPark', positive: true, monthIndex: 0 }]);
    expect(validateState(w.state)).toBeNull();
  });

  it('the next month end replaces the active list and keeps the history', () => {
    const w = spotlessWorld();
    evaluateAwards(w);
    atMonthStart(w, 2);
    const map = w.state.map;
    map.litter[tileIndex(map, 5, 10)] = 200;
    w.state.monthMetrics.daySamples = [sample(60), sample(60), sample(60)];
    evaluateAwards(w);
    expect(w.state.scenario).toMatchObject({
      awards: { active: ['litterbugPark'], history: [{ monthIndex: 0, id: 'spotlessPark' }, { monthIndex: 1, id: 'litterbugPark' }] },
    });
    atMonthStart(w, 3);
    evaluateAwards(w);
    expect(w.state.scenario).toMatchObject({ awards: { active: [] } });
    expect(w.state.scenario.kind === 'freePlay' && w.state.scenario.awards.history).toHaveLength(2);
  });

  it('unlit paths with After Dark on win Dark and Dreary from the real light map; After Dark off does not', () => {
    const w = atMonthStart(makeTestWorld());
    for (let x = 5; x < 55; x++) placeFootpath(w, x, 10);
    w.state.monthMetrics.daySamples = [sample(120), sample(120), sample(120)];
    expect(litShare(w)).toBeLessThan(0.4);
    evaluateAwards(w);
    expect(w.state.scenario.kind === 'freePlay' && w.state.scenario.awards.active).toEqual(['spotlessPark', 'darkAndDreary']);
    w.state.park.afterDark = false;
    evaluateAwards(w);
    expect(w.state.scenario.kind === 'freePlay' && w.state.scenario.awards.active).toEqual(['spotlessPark']);
  });

  it('no awards in the tutorial', () => {
    const w = atMonthStart(createTutorialWorld(1, 'Tutorial'));
    w.state.monthMetrics.daySamples = [sample(500), sample(500), sample(500)];
    for (let x = 5; x < 40; x++) placeFootpath(w, x, 10);
    evaluateAwards(w);
    expect(awardEvents(w)).toEqual([]);
    expect(awardArrivalFactor(w)).toBe(1);
    expect(awardRatingBonus(w)).toBe(0);
  });

  it('sandbox with Awards off: no awards, and earlier ones stop', () => {
    const w = createSandboxWorld(
      { mapSize: 64, terrainStyle: 'flat', seed: 3, climate: 'temperate', afterDark: false, unlimitedMoney: true, allUnlocked: true, guestsArrive: true, breakdowns: true, weather: 'normal', awards: true },
      'Sandbox',
    );
    atMonthStart(w);
    for (let x = 5; x < 55; x++) placeFootpath(w, x, 10);
    w.state.monthMetrics.daySamples = [sample(200), sample(200), sample(200)];
    evaluateAwards(w);
    expect(w.state.scenario).toMatchObject({ awards: { active: ['spotlessPark'] } });
    expect(awardArrivalFactor(w)).toBeCloseTo(1.1, 10);
    if (w.state.scenario.kind !== 'sandbox') throw new Error('sandbox expected');
    w.state.scenario.options.awards = false;
    expect(awardArrivalFactor(w)).toBe(1);
    expect(awardRatingBonus(w)).toBe(0);
    drainEvents(w);
    atMonthStart(w, 2);
    w.state.monthMetrics.daySamples = [sample(200), sample(200), sample(200)];
    evaluateAwards(w);
    expect(awardEvents(w)).toEqual([]);
    expect(w.state.scenario.awards.active).toEqual([]);
    expect(w.state.scenario.awards.history).toHaveLength(1);
  });
});

describe('award effects and clamps', () => {
  function withActive(ids: AwardId[]): World {
    const w = makeTestWorld();
    if (w.state.scenario.kind !== 'freePlay') throw new Error('free play expected');
    w.state.scenario.awards.active = ids;
    return w;
  }

  it('one positive: arrivals × 1.10 and rating +20; one negative: × 0.90 and −20', () => {
    expect(awardArrivalFactor(withActive(['bestValue']))).toBeCloseTo(1.1, 12);
    expect(awardRatingBonus(withActive(['bestValue']))).toBe(20);
    expect(awardArrivalFactor(withActive(['queueNightmare']))).toBeCloseTo(0.9, 12);
    expect(awardRatingBonus(withActive(['queueNightmare']))).toBe(-20);
    expect(awardArrivalFactor(withActive([]))).toBe(1);
    expect(awardRatingBonus(withActive([]))).toBe(0);
  });

  it('mixed awards multiply and add', () => {
    const w = withActive(['spotlessPark', 'chillHaven', 'ripOffPark']);
    expect(awardArrivalFactor(w)).toBeCloseTo(1.1 * 1.1 * 0.9, 12);
    expect(awardRatingBonus(w)).toBe(20);
  });

  it('totals clamp to 0.70–1.30 and −60 to +60', () => {
    const pos = withActive(['spotlessPark', 'bestValue', 'thrillSeekersChoice', 'chillHaven']);
    expect(awardArrivalFactor(pos)).toBe(1.3);
    expect(awardRatingBonus(pos)).toBe(60);
    const three = withActive(['spotlessPark', 'bestValue', 'thrillSeekersChoice']);
    expect(awardArrivalFactor(three)).toBe(1.3);
    expect(awardRatingBonus(three)).toBe(60);
    const neg = withActive(['litterbugPark', 'ripOffPark', 'queueNightmare', 'breakdownCentral']);
    expect(awardArrivalFactor(neg)).toBe(0.7);
    expect(awardRatingBonus(neg)).toBe(-60);
  });

  it('the rating and the arrival rate use the award terms', () => {
    const w = makeTestWorld();
    const ride = placeRideDirect(w, 'carousel', 20, 20);
    ride.status = 'open';
    w.state.park.open = true;
    w.state.park.rating = 500;
    w.state.tick = 12 * 50; // 12:00, clock factor 1
    const rating = computeRating(w);
    const arrivals = arrivalsPerHour(w);
    if (w.state.scenario.kind !== 'freePlay') throw new Error('free play expected');
    w.state.scenario.awards.active = ['bestValue'];
    expect(computeRating(w)).toBe(Math.min(1000, rating + 20));
    expect(arrivalsPerHour(w)).toBeCloseTo(arrivals * 1.1, 9);
  });

  it('the month-end pipeline runs awards on the real tick', () => {
    const w = makeTestWorld();
    litFootpathRow(w, 10);
    // Day samples land through W3-H's recorder; here they are written for the month about to close.
    runTicks(w, TICKS_PER_MONTH - w.state.tick);
    w.state.monthMetrics.daySamples = [sample(150), sample(150), sample(150)];
    // Keep the park spotless whatever the guests did.
    w.state.map.litter.fill(0);
    w.state.map.mess.fill(0);
    drainEvents(w);
    runTicks(w, 1);
    expect(awardEvents(w)).toEqual([{ id: 'spotlessPark', positive: true, monthIndex: 0 }]);
    expect(awardArrivalFactor(w)).toBeCloseTo(1.1, 12);
  });
});
