/**
 * Award criteria (Phase 5 §4.10): each award passes, fails at its boundary, and needs its guest minimum.
 * Pure tests on `AwardMeasures`; `effects.test.ts` checks that the world is measured right.
 * Sample means and thought shares have the shape of W3-H's month-metric helpers (`sampleMeans`, `tooExpensiveShare`,
 * `lostShare`, `meanQueueWaitTicks`), which `measureAwards` reads.
 */
import { describe, expect, it } from 'vitest';
import { awardsWon, emptyMeasures, type AwardMeasures, type SampleMeans } from '../../../src/sim/awards/criteria';
import type { AwardId } from '../../../src/sim/awards/types';
import { AWARD_IDS, isPositiveAward } from '../../../src/sim/awards/types';

/** Day samples of a month (3), 120 guests each, balanced and moderately happy. */
function day(patch: Partial<SampleMeans> = {}): SampleMeans {
  return { samples: 3, guests: 120, rating: 500, happiness: 150, thrillShare: 25, chillShare: 25, thrillHappiness: 150, chillHappiness: 150, ...patch };
}

/** No night samples. */
function night(patch: Partial<SampleMeans> = {}): SampleMeans {
  return { samples: 0, guests: 0, rating: 0, happiness: 0, thrillShare: 0, chillShare: 0, thrillHappiness: 0, chillHappiness: 0, ...patch };
}

/** A month that wins nothing. */
function base(patch: Partial<Omit<AwardMeasures, 'day' | 'night'>> & { day?: Partial<SampleMeans>; night?: Partial<SampleMeans> } = {}): AwardMeasures {
  const { day: d, night: n, ...rest } = patch;
  return {
    ...emptyMeasures(),
    day: day(d),
    night: night(n),
    footpathTiles: 100,
    dirt: 5,
    calmSum: 100,
    rideTickets: 30_000,
    boardings: 100,
    queueWaitTicks: 600,
    thrillRidesExciting: 0,
    rides: 8,
    brokenRides: 0,
    tooExpensiveShare: 0,
    lostShare: 0,
    afterDark: false,
    litShare: 1,
    ...rest,
  };
}

const won = (m: AwardMeasures): AwardId[] => awardsWon(m);

describe('award table', () => {
  it('6 positive, then 6 negative, in table order', () => {
    expect(AWARD_IDS).toHaveLength(12);
    expect(AWARD_IDS.filter(isPositiveAward)).toEqual(['spotlessPark', 'bestValue', 'thrillSeekersChoice', 'chillHaven', 'perfectBalance', 'nightOwlsFavourite']);
  });

  it('the neutral base month wins nothing; an empty month wins nothing', () => {
    expect(won(base())).toEqual([]);
    expect(won(emptyMeasures())).toEqual([]);
  });
});

describe('positive awards', () => {
  it('Spotless Park: litter + mess per footpath tile ≤ 0.02', () => {
    expect(won(base({ dirt: 2 }))).toContain('spotlessPark');
    expect(won(base({ dirt: 3 }))).not.toContain('spotlessPark');
    expect(won(base({ dirt: 0, footpathTiles: 0 }))).not.toContain('spotlessPark');
  });

  it('Best Value: rating ≥ 600 and mean price paid per ride ≤ $2.50', () => {
    const good = { rideTickets: 25_000, boardings: 100 };
    expect(won(base({ ...good, day: { rating: 600 } }))).toContain('bestValue');
    expect(won(base({ ...good, day: { rating: 1799 / 3 } }))).not.toContain('bestValue');
    expect(won(base({ ...good, rideTickets: 25_001, day: { rating: 600 } }))).not.toContain('bestValue');
    expect(won(base({ rideTickets: 0, boardings: 0, day: { rating: 600 } }))).not.toContain('bestValue');
  });

  it("Thrill Seekers' Choice: ≥ 3 exciting open thrill rides and Thrill happiness ≥ 180", () => {
    const good = { thrillRidesExciting: 3, day: { thrillHappiness: 180 } };
    expect(won(base(good))).toContain('thrillSeekersChoice');
    expect(won(base({ ...good, thrillRidesExciting: 2 }))).not.toContain('thrillSeekersChoice');
    expect(won(base({ ...good, day: { thrillHappiness: (90 * 180 - 1) / 90 } }))).not.toContain('thrillSeekersChoice');
    expect(won(base({ ...good, day: { thrillShare: 0, thrillHappiness: 0 } }))).not.toContain('thrillSeekersChoice');
  });

  it('Chill Haven: mean footpath Calm ≥ 3 and Chill happiness ≥ 180', () => {
    const good = { calmSum: 300, day: { chillHappiness: 180 } };
    expect(won(base(good))).toContain('chillHaven');
    expect(won(base({ ...good, calmSum: 299 }))).not.toContain('chillHaven');
    expect(won(base({ ...good, day: { chillHappiness: (90 * 180 - 1) / 90 } }))).not.toContain('chillHaven');
  });

  it('Perfect Balance: Thrill and Chill shares ≥ 35% and both groups ≥ 170', () => {
    // 126 of 360 sampled guests in each group = 35%.
    const good = { thrillShare: (100 * 126) / 360, chillShare: (100 * 126) / 360, thrillHappiness: 170, chillHappiness: 170 };
    expect(won(base({ day: good }))).toContain('perfectBalance');
    expect(won(base({ day: { ...good, chillShare: (100 * 125) / 360 } }))).not.toContain('perfectBalance');
    expect(won(base({ day: { ...good, thrillHappiness: (126 * 170 - 1) / 126 } }))).not.toContain('perfectBalance');
  });

  it("Night Owls' Favourite: After Dark, ≥ 90% lit, night happiness ≥ 170", () => {
    const good = { afterDark: true, litShare: 0.9, night: { samples: 3, guests: 100, happiness: 170 } };
    expect(won(base(good))).toContain('nightOwlsFavourite');
    expect(won(base({ ...good, afterDark: false }))).not.toContain('nightOwlsFavourite');
    expect(won(base({ ...good, litShare: 0.89 }))).not.toContain('nightOwlsFavourite');
    expect(won(base({ ...good, night: { samples: 3, guests: 100, happiness: (300 * 170 - 1) / 300 } }))).not.toContain('nightOwlsFavourite');
    expect(won(base({ ...good, night: { samples: 3, guests: 0, happiness: 0 } }))).not.toContain('nightOwlsFavourite');
  });

  it('positive awards need a mean of ≥ 100 day-sample guests', () => {
    expect(won(base({ dirt: 0, day: { guests: 100 } }))).toContain('spotlessPark');
    expect(won(base({ dirt: 0, day: { guests: 299 / 3 } }))).not.toContain('spotlessPark');
    expect(won(base({ dirt: 0, day: { samples: 0, guests: 0 } }))).toEqual([]);
  });
});

describe('negative awards', () => {
  it('Litterbug Park: litter + mess per footpath tile ≥ 0.15', () => {
    expect(won(base({ dirt: 15 }))).toContain('litterbugPark');
    expect(won(base({ dirt: 14 }))).not.toContain('litterbugPark');
  });

  it('Rip-off Park: ≥ 15% of guests thought it too expensive', () => {
    expect(won(base({ tooExpensiveShare: 30 / 200 }))).toContain('ripOffPark');
    expect(won(base({ tooExpensiveShare: 3 / 20 }))).toContain('ripOffPark');
    expect(won(base({ tooExpensiveShare: 29 / 200 }))).not.toContain('ripOffPark');
    expect(won(base({ tooExpensiveShare: 0 }))).not.toContain('ripOffPark');
  });

  it('Queue Nightmare: mean queue wait ≥ 1,800 ticks', () => {
    expect(won(base({ queueWaitTicks: 1800 }))).toContain('queueNightmare');
    expect(won(base({ queueWaitTicks: (100 * 1800 - 1) / 100 }))).not.toContain('queueNightmare');
    expect(won(base({ queueWaitTicks: 0, boardings: 0 }))).not.toContain('queueNightmare');
  });

  it('Breakdown Central: ≥ 25% of rides broke down', () => {
    expect(won(base({ brokenRides: 2, rides: 8 }))).toContain('breakdownCentral');
    expect(won(base({ brokenRides: 1, rides: 8 }))).not.toContain('breakdownCentral');
    expect(won(base({ brokenRides: 0, rides: 0 }))).not.toContain('breakdownCentral');
  });

  it('Lost and Confused: ≥ 10% of guests were lost', () => {
    expect(won(base({ lostShare: 20 / 200 }))).toContain('lostAndConfused');
    expect(won(base({ lostShare: 19 / 200 }))).not.toContain('lostAndConfused');
  });

  it('Dark and Dreary: After Dark on and < 40% lit', () => {
    expect(won(base({ afterDark: true, litShare: 0.39 }))).toContain('darkAndDreary');
    expect(won(base({ afterDark: true, litShare: 0.4 }))).not.toContain('darkAndDreary');
    expect(won(base({ afterDark: false, litShare: 0 }))).not.toContain('darkAndDreary');
  });

  it('negative awards need a mean of ≥ 50 day-sample guests', () => {
    expect(won(base({ dirt: 15, day: { guests: 50 } }))).toEqual(['litterbugPark']);
    expect(won(base({ dirt: 15, day: { guests: 149 / 3 } }))).toEqual([]);
  });

  it('several awards come out in table order', () => {
    expect(won(base({ dirt: 20, brokenRides: 8, afterDark: true, litShare: 0, lostShare: 1 }))).toEqual([
      'litterbugPark',
      'breakdownCentral',
      'lostAndConfused',
      'darkAndDreary',
    ]);
  });
});
