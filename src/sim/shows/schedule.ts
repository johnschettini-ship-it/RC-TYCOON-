/**
 * Show schedule math (Phase 6 §4.4, §6). Owner: W4-C. Pure integer functions of the schedule and the tick.
 *
 * A schedule starts at `hour:minute` (20:00–23:30, minute 0 or 30 = 25 ticks) every `everyNDays` days. The next show is
 * the first start on day `minDay` or later that can still be announced on time (`start − SHOW_ANNOUNCE_TICKS ≥ from`):
 * a show enabled or moved too late for today's announcement runs on the next day. After a show (run, cancelled, or
 * skipped because After Dark was off), the next one is `everyNDays` days after that show's day.
 */
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../../data/tuning/core';
import {
  SHOW_ANNOUNCE_TICKS,
  SHOW_EVERY_N_DAYS_MAX,
  SHOW_EVERY_N_DAYS_MIN,
  SHOW_HOUR_MAX,
  SHOW_HOUR_MIN,
} from '../../data/tuning/shows';
import { SHOW_ERR } from '../../data/strings/shows';
import { dayIndexOf } from '../time';
import type { ShowSchedule } from './types';

/** Ticks after midnight of a schedule's start time. */
export function startOffsetTicks(schedule: Pick<ShowSchedule, 'hour' | 'minute'>): number {
  return schedule.hour * TICKS_PER_HOUR + (schedule.minute * TICKS_PER_HOUR) / 60;
}

/** The first start tick on day `minDay` or later whose announcement is at or after `fromTick`. */
export function nextStartTick(schedule: Pick<ShowSchedule, 'hour' | 'minute'>, fromTick: number, minDay: number): number {
  const offset = startOffsetTicks(schedule);
  let day = Math.max(minDay, dayIndexOf(fromTick));
  while (day * TICKS_PER_DAY + offset - SHOW_ANNOUNCE_TICKS < fromTick) day += 1;
  return day * TICKS_PER_DAY + offset;
}

/** The start after the show of `showTick` (run, cancelled, or skipped): `everyNDays` days later, at the schedule time. */
export function followingStartTick(schedule: ShowSchedule, showTick: number, nowTick: number): number {
  return nextStartTick(schedule, nowTick, dayIndexOf(showTick) + schedule.everyNDays);
}

/** Null when the schedule values are allowed (hour 20–23, minute 0 or 30, every 1–3 days), else the reason. */
export function scheduleError(hour: unknown, minute: unknown, everyNDays: unknown): string | null {
  if (typeof hour !== 'number' || !Number.isInteger(hour) || hour < SHOW_HOUR_MIN || hour > SHOW_HOUR_MAX) return SHOW_ERR.hour;
  if (minute !== 0 && minute !== 30) return SHOW_ERR.minute;
  if (typeof everyNDays !== 'number' || !Number.isInteger(everyNDays) || everyNDays < SHOW_EVERY_N_DAYS_MIN || everyNDays > SHOW_EVERY_N_DAYS_MAX) {
    return SHOW_ERR.days;
  }
  return null;
}
