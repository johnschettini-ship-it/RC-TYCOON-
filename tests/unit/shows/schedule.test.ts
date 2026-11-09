/** `setShowSchedule`, `setShowEnabled`, and the schedule math (Phase 6 §4.4, §6). Owner: W4-C. */
import { describe, expect, it } from 'vitest';
import { SHOW_ERR } from '../../../src/data/strings/shows';
import { SHOW_ANNOUNCE_TICKS } from '../../../src/data/tuning/shows';
import { executeCommand } from '../../../src/sim/commands';
import { nextStartTick, scheduleError, startOffsetTicks } from '../../../src/sim/shows/schedule';
import { makeTestWorld, stateHash } from '../../helpers/world';
import { at, placeSite, runTo } from './helpers';

describe('schedule validation (hour 20–23, minute 0 or 30, every 1–3 days)', () => {
  it('accepts every allowed value', () => {
    for (const hour of [20, 21, 22, 23]) for (const minute of [0, 30]) for (const n of [1, 2, 3]) expect(scheduleError(hour, minute, n)).toBeNull();
  });

  it('rejects each bad value with its string', () => {
    expect(scheduleError(19, 0, 1)).toBe(SHOW_ERR.hour);
    expect(scheduleError(24, 0, 1)).toBe(SHOW_ERR.hour);
    expect(scheduleError(20.5, 0, 1)).toBe(SHOW_ERR.hour);
    expect(scheduleError('21', 0, 1)).toBe(SHOW_ERR.hour);
    expect(scheduleError(21, 15, 1)).toBe(SHOW_ERR.minute);
    expect(scheduleError(21, 60, 1)).toBe(SHOW_ERR.minute);
    expect(scheduleError(21, 30, 0)).toBe(SHOW_ERR.days);
    expect(scheduleError(21, 30, 4)).toBe(SHOW_ERR.days);
    expect(scheduleError(21, 30, 1.5)).toBe(SHOW_ERR.days);
    expect(SHOW_ERR.hour).toBe('Shows start between 20:00 and 23:30');
  });

  it('setShowSchedule changes the schedule; bad values and unknown sites change nothing', () => {
    const w = makeTestWorld();
    const site = placeSite(w, 'lightshow_tower', 20, 20);
    expect(executeCommand(w, { type: 'setShowSchedule', id: site.id, hour: 23, minute: 30, everyNDays: 3 })).toEqual({ ok: true, cost: 0, warnings: [] });
    expect(site.schedule).toEqual({ hour: 23, minute: 30, everyNDays: 3, enabled: false });
    expect(site.nextShowTick).toBe(-1);
    const before = stateHash(w);
    expect(executeCommand(w, { type: 'setShowSchedule', id: site.id, hour: 19, minute: 30, everyNDays: 3 })).toEqual({ ok: false, reason: SHOW_ERR.hour });
    expect(executeCommand(w, { type: 'setShowSchedule', id: site.id, hour: 20, minute: 10, everyNDays: 3 })).toEqual({ ok: false, reason: SHOW_ERR.minute });
    expect(executeCommand(w, { type: 'setShowSchedule', id: site.id, hour: 20, minute: 0, everyNDays: 9 })).toEqual({ ok: false, reason: SHOW_ERR.days });
    expect(executeCommand(w, { type: 'setShowSchedule', id: site.id + 99, hour: 20, minute: 0, everyNDays: 1 })).toEqual({ ok: false, reason: SHOW_ERR.noSite });
    expect(executeCommand(w, { type: 'setShowEnabled', id: site.id + 99, enabled: true })).toEqual({ ok: false, reason: SHOW_ERR.noSite });
    expect(executeCommand(w, { type: 'setShowEnabled', id: site.id, enabled: 'yes' as never })).toEqual({ ok: false, reason: SHOW_ERR.badValue });
    expect(stateHash(w)).toBe(before);
  });
});

describe('next show tick', () => {
  it('start offsets: 21:00 = 1,050 ticks after midnight, 23:30 = 1,175', () => {
    expect(startOffsetTicks({ hour: 21, minute: 0 })).toBe(1050);
    expect(startOffsetTicks({ hour: 23, minute: 30 })).toBe(1175);
  });

  it('enabling picks today when the show can still be announced a full hour ahead, else tomorrow', () => {
    const w = makeTestWorld();
    const site = placeSite(w, 'lightshow_tower', 20, 20);
    // A new game starts at 09:00 of day 0.
    expect(executeCommand(w, { type: 'setShowEnabled', id: site.id, enabled: true }).ok).toBe(true);
    expect(site.nextShowTick).toBe(at(0, 21));
    expect(executeCommand(w, { type: 'setShowEnabled', id: site.id, enabled: false }).ok).toBe(true);
    expect(site.nextShowTick).toBe(-1);
    runTo(w, at(0, 20, 30));
    executeCommand(w, { type: 'setShowEnabled', id: site.id, enabled: true });
    expect(site.nextShowTick).toBe(at(1, 21));
    executeCommand(w, { type: 'setShowSchedule', id: site.id, hour: 22, minute: 0, everyNDays: 1 });
    expect(site.nextShowTick).toBe(at(0, 22));
  });

  it('the announcement may be exactly now', () => {
    expect(nextStartTick({ hour: 21, minute: 0 }, at(0, 20), 0)).toBe(at(0, 21));
    expect(nextStartTick({ hour: 21, minute: 0 }, at(0, 20) + 1, 0)).toBe(at(1, 21));
    expect(at(0, 21) - at(0, 20)).toBe(SHOW_ANNOUNCE_TICKS);
    // `minDay` holds the next show back (every N days).
    expect(nextStartTick({ hour: 20, minute: 30 }, at(0, 9), 2)).toBe(at(2, 20, 30));
  });
});
