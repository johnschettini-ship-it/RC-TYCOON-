import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/sim/guests/api', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../src/sim/guests/api')>();
  return { ...real, boardRide: vi.fn(), finishRide: vi.fn(), leaveQueue: vi.fn(), forgetDestination: vi.fn() };
});

import { boardRide } from '../../../src/sim/guests/api';
import { chargeRunningCosts, rideMonthlyRunningCost } from '../../../src/sim/economy/hourly';
import { closeMonth } from '../../../src/sim/economy/monthEnd';
import { currentLedger, recordLedger } from '../../../src/sim/economy/ledger';
import { sellItem } from '../../../src/sim/stalls/api';
import { LEDGER_CATEGORIES, type LedgerMonth } from '../../../src/sim/economy/types';
import { FLAT_RIDES, STALLS } from '../../../src/data/catalog';
import { HOURS_PER_MONTH, TICKS_PER_HOUR, TICKS_PER_MONTH } from '../../../src/data/tuning/core';
import { TRACK_EXTRA_TRAIN_COST, TRACK_RUN_BASE, TRACK_RUN_PER_PIECE } from '../../../src/data/tuning/economy';
import { createTrackSlice } from '../../../src/sim/rides/track/types';
import { addGuestDirect, makeTestWorld, placeRideDirect, placeStallDirect, runTicks } from '../../helpers/world';
import type { World } from '../../../src/sim/types';
import type { Ride } from '../../../src/sim/rides/types';

const MONTH = 2;
const MONTH_START = MONTH * TICKS_PER_MONTH;

beforeEach(() => {
  vi.mocked(boardRide).mockReset().mockImplementation((w, g, r) => {
    // Stand-in for the guest system: pay the ride price (ledger: ride tickets).
    g.cash -= r.price;
    recordLedger(w, 'rideTickets', r.price);
    return true;
  });
});

/** Call the hour-start charge for every hour of the month, the way stepTick does. */
function chargeFullMonth(w: World, fromHour = 0): void {
  for (let h = fromHour; h < HOURS_PER_MONTH; h++) {
    w.state.tick = MONTH_START + h * TICKS_PER_HOUR;
    chargeRunningCosts(w);
  }
}

function worldAtMonthStart(): World {
  const w = makeTestWorld();
  w.state.tick = MONTH_START;
  return w;
}

function makeTrackRide(w: World, typeId: string, pieces: number, trains: number): Ride {
  const ride = placeRideDirect(w, 'carousel', 30, 30);
  ride.kind = 'track';
  ride.defId = typeId;
  w.state.track = createTrackSlice();
  w.state.track.rides[String(ride.id)] = {
    rideId: ride.id,
    typeId,
    pieces: Array.from({ length: pieces }, () => ({ defId: 'flat', x: 0, y: 0, z: 0, dir: 0 as const, chain: false, brakeSpeed: null })),
    circuitClosed: true,
    trainConfig: { trains, carsPerTrain: 2 },
    operation: { minDwellTicks: 0, maxDwellTicks: 0, laps: 1 },
    trains: [],
    test: null,
    colours: { track: 0, supports: 0, cars: 0 },
    openedOnce: false,
  };
  return ride;
}

describe('hourly running costs (Phase 3 §4.1, master R9, R20)', () => {
  it.each(FLAT_RIDES.map((d) => [d.id, d.runningCostMonthly] as const))(
    'a full month of %s costs exactly its catalog monthly cost (%i cents)',
    (defId, monthly) => {
      const w = worldAtMonthStart();
      const ride = placeRideDirect(w, defId, 10, 10);
      chargeFullMonth(w);
      expect(currentLedger(w).lines.rideRunning).toBe(-monthly);
      expect(ride.hoursThisMonth).toBe(HOURS_PER_MONTH);
    },
  );

  it.each(STALLS.map((d) => [d.id, d.runningCostMonthly] as const))(
    'a full month of %s costs exactly its catalog monthly cost (%i cents)',
    (defId, monthly) => {
      const w = worldAtMonthStart();
      const stall = placeStallDirect(w, defId, 20, 20);
      chargeFullMonth(w);
      expect(currentLedger(w).lines.stallRunning).toBe(-monthly);
      expect(stall.hoursThisMonth).toBe(HOURS_PER_MONTH);
    },
  );

  it('catalog amounts include values that do not divide by 72 (remainder case is covered)', () => {
    expect(FLAT_RIDES.some((d) => d.runningCostMonthly % HOURS_PER_MONTH !== 0)).toBe(true);
    expect(STALLS.some((d) => d.runningCostMonthly % HOURS_PER_MONTH !== 0)).toBe(true);
  });

  it('charges floor(M / 72) each hour and the remainder at the start of hour 71', () => {
    const w2 = worldAtMonthStart();
    placeRideDirect(w2, 'carousel', 10, 10); // $40 = 4,000 cents: 55 per hour, remainder 40
    const charges: number[] = [];
    for (let h = 0; h < HOURS_PER_MONTH; h++) {
      w2.state.tick = MONTH_START + h * TICKS_PER_HOUR;
      const before = w2.state.park.cash;
      chargeRunningCosts(w2);
      charges.push(before - w2.state.park.cash);
    }
    expect(charges.slice(0, 71).every((c) => c === 55)).toBe(true);
    expect(charges[71]).toBe(55 + 40);
    expect(currentLedger(w2).monthIndex).toBe(MONTH);
  });

  it('an item placed at the month start counts as active all month', () => {
    const w = worldAtMonthStart();
    const stall = placeStallDirect(w, 'fizz_stand', 20, 20);
    expect(stall.builtTick).toBe(MONTH_START);
    chargeFullMonth(w);
    expect(currentLedger(w).lines.stallRunning).toBe(-2_000);
  });

  it('a partial month costs only the full hours worked, with no remainder', () => {
    const w = worldAtMonthStart();
    w.state.tick = MONTH_START + 30 * TICKS_PER_HOUR + 7; // placed during hour 30
    const ride = placeRideDirect(w, 'carousel', 10, 10);
    chargeFullMonth(w, 31);
    expect(currentLedger(w).lines.rideRunning).toBe(-41 * Math.floor(4_000 / 72));
    expect(ride.hoursThisMonth).toBe(41);
  });

  it('charges running costs while cash is negative', () => {
    const w = worldAtMonthStart();
    w.state.park.cash = -50_000;
    placeRideDirect(w, 'carousel', 10, 10);
    chargeFullMonth(w);
    expect(w.state.park.cash).toBe(-54_000);
    expect(currentLedger(w).lines.rideRunning).toBe(-4_000);
  });

  it('a track ride uses the Phase 2 running cost and its month total is exact', () => {
    const w = worldAtMonthStart();
    const ride = makeTrackRide(w, 'steel_coaster', 37, 3);
    const expected =
      (TRACK_RUN_BASE.steel_coaster as number) +
      TRACK_RUN_PER_PIECE * 37 +
      ((TRACK_EXTRA_TRAIN_COST.steel_coaster as number) / 20) * 2;
    expect(rideMonthlyRunningCost(w, ride)).toBe(expected);
    expect(expected % 72).not.toBe(0);
    chargeFullMonth(w);
    expect(currentLedger(w).lines.rideRunning).toBe(-expected);
  });

  it('ledger month totals exact with remainder (Review Focus 5): several items over a month of stepTick', () => {
    const w = worldAtMonthStart();
    placeRideDirect(w, 'carousel', 10, 10);
    placeRideDirect(w, 'swing_tower', 14, 10);
    placeStallDirect(w, 'snack_shack', 20, 20);
    placeStallDirect(w, 'restrooms', 22, 20);
    runTicks(w, TICKS_PER_MONTH + 1);
    const month = w.state.economy.ledger.find((m) => m.monthIndex === MONTH)!;
    expect(month.lines.rideRunning).toBe(-(4_000 + 8_000));
    expect(month.lines.stallRunning).toBe(-(2_000 + 1_500));
    // The next month has started (its first tick ran) and holds only its own hour-0 charges.
    const next = currentLedger(w);
    expect(next.monthIndex).toBe(MONTH + 1);
    expect(next.lines.rideRunning).toBe(-(Math.floor(4_000 / 72) + Math.floor(8_000 / 72)));
  });
});

describe('closeMonth (master R13)', () => {
  it('runs once at the month start in stepTick, before the hour-0 charges of the new month', () => {
    const w = worldAtMonthStart();
    const ride = placeRideDirect(w, 'carousel', 10, 10);
    w.state.tick = MONTH_START + TICKS_PER_MONTH - 1;
    ride.hoursThisMonth = 71;
    ride.totals.ridersThisMonth = 9;
    runTicks(w, 2);
    expect(ride.totals.ridersThisMonth).toBe(0);
    expect(ride.hoursThisMonth).toBe(1);
    expect(currentLedger(w).monthIndex).toBe(MONTH + 1);
  });

  it('opens the new ledger month and resets the monthly counters', () => {
    const w = worldAtMonthStart();
    const ride = placeRideDirect(w, 'carousel', 10, 10);
    const stall = placeStallDirect(w, 'snack_shack', 20, 20);
    ride.totals = { riders: 50, income: 9_000, ridersThisMonth: 20, incomeThisMonth: 4_000 };
    ride.hoursThisMonth = 72;
    ride.breakdownsThisMonth = 2;
    stall.totals = { sales: 30, income: 9_000, salesThisMonth: 10, incomeThisMonth: 3_000 };
    stall.hoursThisMonth = 72;
    const ledgerBefore = w.state.economy.ledger.length;
    w.state.tick = MONTH_START + TICKS_PER_MONTH;
    closeMonth(w);
    expect(w.state.economy.ledger.length).toBeGreaterThan(ledgerBefore);
    expect(w.state.economy.ledger[w.state.economy.ledger.length - 1]?.monthIndex).toBe(MONTH + 1);
    expect(ride.totals).toEqual({ riders: 50, income: 9_000, ridersThisMonth: 0, incomeThisMonth: 0 });
    expect(ride.hoursThisMonth).toBe(0);
    expect(ride.breakdownsThisMonth).toBe(0);
    expect(stall.totals).toEqual({ sales: 30, income: 9_000, salesThisMonth: 0, incomeThisMonth: 0 });
    expect(stall.hoursThisMonth).toBe(0);
  });
});

describe('ledger invariant (Phase 1 §4.5)', () => {
  function sum(m: LedgerMonth): number {
    return LEDGER_CATEGORIES.reduce((s, c) => s + m.lines[c], 0);
  }

  it('cash change over a month equals the sum of that month’s ledger lines', () => {
    const w = makeTestWorld();
    runTicks(w, TICKS_PER_MONTH - w.state.tick); // to the start of month 1
    const ride = placeRideDirect(w, 'teacup_twirl', 10, 10);
    ride.status = 'open';
    const stall = placeStallDirect(w, 'fizz_stand', 20, 20);
    placeStallDirect(w, 'restrooms', 22, 20);
    const cashStart = w.state.park.cash;
    const month = w.state.tick / TICKS_PER_MONTH;
    for (let k = 0; k < TICKS_PER_MONTH; k++) {
      if (k % 300 === 7) {
        const g = addGuestDirect(w, stall.serviceTile, { cash: 10_000 });
        sellItem(w, stall, g);
        ride.queue.push(g.id);
      }
      runTicks(w, 1);
    }
    const cashEnd = w.state.park.cash;
    const record = w.state.economy.ledger.find((m) => m.monthIndex === month)!;
    // Month-start work of the next month (hour 0 charges) belongs to the next record.
    const next = currentLedger(w);
    expect(next.monthIndex).toBe(month + 1);
    expect(cashEnd - sum(next) - cashStart).toBe(sum(record));
    expect(record.lines.stallSales).toBeGreaterThan(0);
    expect(record.lines.rideTickets).toBeGreaterThan(0);
    expect(record.lines.rideRunning).toBe(-5_000);
    expect(record.lines.stallRunning).toBe(-3_500);
  });
});
