/** Game durations as short text: "2 days 3 h", "5 h", "under 1 h". Owner: W2-B. Pure. */
import { TICKS_PER_DAY, TICKS_PER_HOUR, TICKS_PER_MONTH } from '../../data/tuning/core';
import { text } from '../../data/strings/en';

/** Whole days and hours in `ticks` (rounded down). */
export function formatDuration(ticks: number): string {
  const t = Math.max(0, Math.floor(ticks));
  const days = Math.floor(t / TICKS_PER_DAY);
  const hours = Math.floor((t % TICKS_PER_DAY) / TICKS_PER_HOUR);
  const parts: string[] = [];
  if (days > 0) parts.push(days === 1 ? text('ui.time.day') : text('ui.time.days', { n: days }));
  if (hours > 0) parts.push(text('ui.time.hours', { n: hours }));
  return parts.length > 0 ? parts.join(' ') : text('ui.time.underHour');
}

/** A campaign or interval length: whole months first ("1 month"), then days and hours. */
export function formatSpan(ticks: number): string {
  if (ticks > 0 && ticks % TICKS_PER_MONTH === 0) {
    const n = ticks / TICKS_PER_MONTH;
    return n === 1 ? text('ui.time.month') : text('ui.time.months', { n });
  }
  return formatDuration(ticks);
}
