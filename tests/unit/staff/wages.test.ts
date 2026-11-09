import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/sim/pathing', async () => (await import('./fakes')).fakePathing());
vi.mock('../../../src/sim/notifications', async () => (await import('./fakes')).fakeNotifications());

import { executeCommand } from '../../../src/sim/commands';
import { currentLedger } from '../../../src/sim/economy/ledger';
import { hourlyStaff } from '../../../src/sim/staff/update';
import { STAFF } from '../../../src/data/catalog/people';
import { TICKS_PER_HOUR, TICKS_PER_MONTH, HOURS_PER_MONTH } from '../../../src/data/tuning/core';
import { makeTestWorld } from '../../helpers/world';
import { stepStaffSystems } from './steps';
import type { World } from '../../../src/sim/types';

const wage = (id: string) => (STAFF.find((s) => s.id === id) as { wageMonthly: number }).wageMonthly;

/** Run only the hour-start wage charges from `from` (inclusive) to `to` (exclusive). */
function runHours(world: World, from: number, to: number): void {
  for (let t = from; t < to; t += TICKS_PER_HOUR) {
    world.state.tick = t;
    hourlyStaff(world);
  }
  world.state.tick = to;
}

describe('wages (hourly charge rule, R9/R20)', () => {
  it('a full month costs exactly the monthly wage for every staff type', () => {
    const world = makeTestWorld();
    world.state.tick = TICKS_PER_MONTH; // month 1 start
    for (const def of STAFF) executeCommand(world, { type: 'hireStaff', staffType: def.id }, { setup: true });
    runHours(world, TICKS_PER_MONTH, 2 * TICKS_PER_MONTH);
    const total = STAFF.reduce((sum, d) => sum + d.wageMonthly, 0);
    const ledger = world.state.economy.ledger.find((l) => l.monthIndex === 1);
    expect(ledger?.lines.wages).toBe(-total);
    // 5,000 is not divisible by 72: 69 × 71 + (69 + 32) = 5,000.
    expect(wage('groundskeeper') % HOURS_PER_MONTH).not.toBe(0);
  });

  it('each hourly charge is floor(M / 72); the remainder lands at hour 71', () => {
    const world = makeTestWorld();
    world.state.tick = TICKS_PER_MONTH;
    executeCommand(world, { type: 'hireStaff', staffType: 'groundskeeper' }, { setup: true });
    const cash0 = world.state.park.cash;
    runHours(world, TICKS_PER_MONTH, TICKS_PER_MONTH + TICKS_PER_HOUR);
    expect(cash0 - world.state.park.cash).toBe(Math.floor(5000 / 72));
    runHours(world, TICKS_PER_MONTH + TICKS_PER_HOUR, 2 * TICKS_PER_MONTH - TICKS_PER_HOUR);
    const beforeLast = world.state.park.cash;
    runHours(world, 2 * TICKS_PER_MONTH - TICKS_PER_HOUR, 2 * TICKS_PER_MONTH);
    expect(beforeLast - world.state.park.cash).toBe(Math.floor(5000 / 72) + (5000 - 72 * Math.floor(5000 / 72)));
  });

  it('a partial month costs only the full hours worked (no remainder)', () => {
    const world = makeTestWorld();
    world.state.tick = TICKS_PER_MONTH + 10 * TICKS_PER_HOUR + 7; // mid-hour 10 of month 1
    executeCommand(world, { type: 'hireStaff', staffType: 'mechanic' }, { setup: true });
    runHours(world, TICKS_PER_MONTH + 11 * TICKS_PER_HOUR, 2 * TICKS_PER_MONTH);
    const ledger = world.state.economy.ledger.find((l) => l.monthIndex === 1);
    expect(ledger?.lines.wages).toBe(-61 * Math.floor(wage('mechanic') / 72));
  });

  it('the next full month after a partial one is exact again', () => {
    const world = makeTestWorld();
    world.state.tick = TICKS_PER_MONTH + 30 * TICKS_PER_HOUR;
    executeCommand(world, { type: 'hireStaff', staffType: 'performer' }, { setup: true });
    runHours(world, TICKS_PER_MONTH + 30 * TICKS_PER_HOUR, 3 * TICKS_PER_MONTH);
    const m2 = world.state.economy.ledger.find((l) => l.monthIndex === 2);
    expect(m2?.lines.wages).toBe(-wage('performer'));
  });

  it('a fired staff member stops costing wages', () => {
    const world = makeTestWorld();
    world.state.tick = TICKS_PER_MONTH;
    const r = executeCommand(world, { type: 'hireStaff', staffType: 'security' }, { setup: true });
    runHours(world, TICKS_PER_MONTH, TICKS_PER_MONTH + 10 * TICKS_PER_HOUR);
    if (!r.ok || r.id === undefined) throw new Error('hire failed');
    executeCommand(world, { type: 'fireStaff', staffId: r.id });
    runHours(world, TICKS_PER_MONTH + 10 * TICKS_PER_HOUR, 2 * TICKS_PER_MONTH);
    expect(currentLedger(world).monthIndex).toBe(2);
    const m1 = world.state.economy.ledger.find((l) => l.monthIndex === 1);
    expect(m1?.lines.wages).toBe(-10 * Math.floor(wage('security') / 72));
  });

  it('a full month through the staff tick loop matches too', () => {
    const world = makeTestWorld();
    world.state.tick = TICKS_PER_MONTH;
    executeCommand(world, { type: 'hireStaff', staffType: 'groundskeeper' }, { setup: true });
    executeCommand(world, { type: 'hireStaff', staffType: 'mechanic' }, { setup: true });
    stepStaffSystems(world, TICKS_PER_MONTH);
    const m1 = world.state.economy.ledger.find((l) => l.monthIndex === 1);
    expect(m1?.lines.wages).toBe(-(wage('groundskeeper') + wage('mechanic')));
    expect(world.state.staff.members.every((m) => m.hoursThisMonth === 72)).toBe(true);
  });
});
