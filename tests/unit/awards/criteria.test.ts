/**
 * Award criteria (Phase 5 §4.10): each award passes, fails at its boundary, and needs its guest minimum.
 * Pure tests on `AwardMeasures`; `measure.test.ts` checks that the world is measured right.
 */
import { describe, expect, it } from 'vitest';
import { awardsWon, emptyMeasures, type AwardMeasures } from '../../../src/sim/awards/criteria';
import type { AwardId } from '../../../src/sim/awards/types';
import { AWARD_IDS, isPositiveAward } from '../../../src/sim/awards/types';

/** One day sample of 120 guests a month (3 samples), balanced and happy, nothing that wins any award. */
function base(patch: Partial<AwardMeasures> = {}): AwardMeasures {
  return {
    ...emptyMeasures(),
    daySamples: 3,
    guestSum: 360,
    ratingSum: 1500,
    thrillSum: 90,
    chillSum: 90,
    thrillHappinessSum: 90 * 150,
    chillHappinessSum: 90 * 150,
    nightGuestSum: 0,
    nightHappinessSum: 0,
    footpathTiles: 100,
    dirt: 5,
    calmSum: 100,
    rideTickets: 30_000,
    boardings: 100,
    queueWaitTicks: 100 * 600,
    thrillRidesExciting: 0,
    rides: 8,
    brokenRides: 0,
    guestsSeen: 200,
    expensiveGuests: 0,
    lostGuests: 0,
    afterDark: false,
    litShare: 1,
    ...patch,
  };
}

const won = (m: AwardMeasures): AwardId[] => awardsWon(m);

describe('award table', () => {
  it('6 positive, then 6 negative, in table order', () => {
    expect(AWARD_IDS).toHaveLength(12);
    expect(AWARD_IDS.filter(isPositiveAward)).toEqual(['spotlessPark', 'bestValue', 'thrillSeekersChoice', 'chillHaven', 'perfectBalance', 'nightOwlsFavourite']);
  });

  it('the neutral base month wins nothing', () => {
    expect(won(base())).toEqual([]);
  });
});

describe('positive awards', () => {
  it('Spotless Park: litter + mess per footpath tile ≤ 0.02', () => {
    expect(won(base({ dirt: 2 }))).toContain('spotlessPark');
    expect(won(base({ dirt: 3 }))).not.toContain('spotlessPark');
    expect(won(base({ dirt: 0, footpathTiles: 0 }))).not.toContain('spotlessPark');
  });

  it('Best Value: rating ≥ 600 and mean price paid per ride ≤ $2.50', () => {
    const good = { ratingSum: 1800, rideTickets: 25_000, boardings: 100 };
    expect(won(base(good))).toContain('bestValue');
    expect(won(base({ ...good, ratingSum: 1799 }))).not.toContain('bestValue');
    expect(won(base({ ...good, rideTickets: 25_001 }))).not.toContain('bestValue');
    expect(won(base({ ...good, rideTickets: 0, boardings: 0 }))).not.toContain('bestValue');
  });

  it("Thrill Seekers' Choice: ≥ 3 exciting open thrill rides and Thrill happiness ≥ 180", () => {
    const good = { thrillRidesExciting: 3, thrillHappinessSum: 90 * 180 };
    expect(won(base(good))).toContain('thrillSeekersChoice');
    expect(won(base({ ...good, thrillRidesExciting: 2 }))).not.toContain('thrillSeekersChoice');
    expect(won(base({ ...good, thrillHappinessSum: 90 * 180 - 1 }))).not.toContain('thrillSeekersChoice');
    expect(won(base({ ...good, thrillSum: 0, thrillHappinessSum: 0 }))).not.toContain('thrillSeekersChoice');
  });

  it('Chill Haven: mean footpath Calm ≥ 3 and Chill happiness ≥ 180', () => {
    const good = { calmSum: 300, chillHappinessSum: 90 * 180 };
    expect(won(base(good))).toContain('chillHaven');
    expect(won(base({ ...good, calmSum: 299 }))).not.toContain('chillHaven');
    expect(won(base({ ...good, chillHappinessSum: 90 * 180 - 1 }))).not.toContain('chillHaven');
  });

  it('Perfect Balance: Thrill and Chill shares ≥ 35% and both groups ≥ 170', () => {
    const good = { thrillSum: 126, chillSum: 126, thrillHappinessSum: 126 * 170, chillHappinessSum: 126 * 170 };
    expect(won(base(good))).toContain('perfectBalance');
    expect(won(base({ ...good, chillSum: 125, chillHappinessSum: 125 * 170 }))).not.toContain('perfectBalance');
    expect(won(base({ ...good, thrillHappinessSum: 126 * 170 - 1 }))).not.toContain('perfectBalance');
  });

  it("Night Owls' Favourite: After Dark, ≥ 90% lit, night happiness ≥ 170", () => {
    const good = { afterDark: true, litShare: 0.9, nightGuestSum: 300, nightHappinessSum: 300 * 170 };
    expect(won(base(good))).toContain('nightOwlsFavourite');
    expect(won(base({ ...good, afterDark: false }))).not.toContain('nightOwlsFavourite');
    expect(won(base({ ...good, litShare: 0.89 }))).not.toContain('nightOwlsFavourite');
    expect(won(base({ ...good, nightHappinessSum: 300 * 170 - 1 }))).not.toContain('nightOwlsFavourite');
    expect(won(base({ ...good, nightGuestSum: 0, nightHappinessSum: 0 }))).not.toContain('nightOwlsFavourite');
  });

  it('positive awards need a mean of ≥ 100 day-sample guests', () => {
    const good = { dirt: 0 };
    expect(won(base({ ...good, guestSum: 300 }))).toContain('spotlessPark');
    expect(won(base({ ...good, guestSum: 299 }))).not.toContain('spotlessPark');
    expect(won(base({ ...good, daySamples: 0, guestSum: 0 }))).toEqual([]);
  });
});

describe('negative awards', () => {
  it('Litterbug Park: litter + mess per footpath tile ≥ 0.15', () => {
    expect(won(base({ dirt: 15 }))).toContain('litterbugPark');
    expect(won(base({ dirt: 14 }))).not.toContain('litterbugPark');
  });

  it('Rip-off Park: ≥ 15% of guests thought it too expensive', () => {
    expect(won(base({ expensiveGuests: 30 }))).toContain('ripOffPark');
    expect(won(base({ expensiveGuests: 29 }))).not.toContain('ripOffPark');
    expect(won(base({ expensiveGuests: 0, guestsSeen: 0 }))).not.toContain('ripOffPark');
  });

  it('Queue Nightmare: mean queue wait ≥ 1,800 ticks', () => {
    expect(won(base({ queueWaitTicks: 100 * 1800 }))).toContain('queueNightmare');
    expect(won(base({ queueWaitTicks: 100 * 1800 - 1 }))).not.toContain('queueNightmare');
    expect(won(base({ queueWaitTicks: 0, boardings: 0 }))).not.toContain('queueNightmare');
  });

  it('Breakdown Central: ≥ 25% of rides broke down', () => {
    expect(won(base({ brokenRides: 2, rides: 8 }))).toContain('breakdownCentral');
    expect(won(base({ brokenRides: 1, rides: 8 }))).not.toContain('breakdownCentral');
    expect(won(base({ brokenRides: 0, rides: 0 }))).not.toContain('breakdownCentral');
  });

  it('Lost and Confused: ≥ 10% of guests were lost', () => {
    expect(won(base({ lostGuests: 20 }))).toContain('lostAndConfused');
    expect(won(base({ lostGuests: 19 }))).not.toContain('lostAndConfused');
  });

  it('Dark and Dreary: After Dark on and < 40% lit', () => {
    expect(won(base({ afterDark: true, litShare: 0.39 }))).toContain('darkAndDreary');
    expect(won(base({ afterDark: true, litShare: 0.4 }))).not.toContain('darkAndDreary');
    expect(won(base({ afterDark: false, litShare: 0 }))).not.toContain('darkAndDreary');
  });

  it('negative awards need a mean of ≥ 50 day-sample guests', () => {
    expect(won(base({ dirt: 15, guestSum: 150 }))).toEqual(['litterbugPark']);
    expect(won(base({ dirt: 15, guestSum: 149 }))).toEqual([]);
  });

  it('several awards come out in table order', () => {
    expect(won(base({ dirt: 20, brokenRides: 8, afterDark: true, litShare: 0, lostGuests: 200 }))).toEqual([
      'litterbugPark',
      'breakdownCentral',
      'lostAndConfused',
      'darkAndDreary',
    ]);
  });
});
