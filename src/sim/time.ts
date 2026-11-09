import {
  DAYS_PER_MONTH,
  HOURS_PER_DAY,
  MONTHS_PER_YEAR,
  TICKS_PER_DAY,
  TICKS_PER_HOUR,
  TICKS_PER_MONTH,
} from '../data/tuning/core';

/** Tick 0 = 00:00, 1 March, Year 1 (master rule R1). */
export const MONTH_NAMES = ['Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb'] as const;
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

export function hourOf(tick: number): number {
  return Math.floor(tick / TICKS_PER_HOUR) % HOURS_PER_DAY;
}

export function clockOf(tick: number): { hour: number; minute: number } {
  const hour = hourOf(tick);
  const minute = Math.floor(((tick % TICKS_PER_HOUR) * 60) / TICKS_PER_HOUR);
  return { hour, minute };
}

export function dayIndexOf(tick: number): number {
  return Math.floor(tick / TICKS_PER_DAY);
}

/** 0 = March, Year 1. */
export function monthIndexOf(tick: number): number {
  return Math.floor(tick / TICKS_PER_MONTH);
}

/** 0 = March … 11 = February. */
export function monthOfYear(tick: number): number {
  return monthIndexOf(tick) % MONTHS_PER_YEAR;
}

export function yearOf(tick: number): number {
  return Math.floor(monthIndexOf(tick) / MONTHS_PER_YEAR) + 1;
}

/** Hour within the current month, 0–71. */
export function hourOfMonth(tick: number): number {
  return Math.floor((tick % TICKS_PER_MONTH) / TICKS_PER_HOUR);
}

export const HOURS_IN_MONTH = HOURS_PER_DAY * DAYS_PER_MONTH;

export function seasonOf(tick: number): Season {
  const m = monthOfYear(tick); // 0 = Mar
  if (m <= 2) return 'spring'; // Mar–May
  if (m <= 5) return 'summer'; // Jun–Aug
  if (m <= 8) return 'autumn'; // Sep–Nov
  return 'winter'; // Dec–Feb
}

export function isHourStart(tick: number): boolean {
  return tick % TICKS_PER_HOUR === 0;
}

export function isDayStart(tick: number): boolean {
  return tick % TICKS_PER_DAY === 0;
}

export function isMonthStart(tick: number): boolean {
  return tick % TICKS_PER_MONTH === 0;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** For example "Mar · Year 1 · 09:00". */
export function formatDate(tick: number): string {
  const { hour, minute } = clockOf(tick);
  return `${MONTH_NAMES[monthOfYear(tick)]} · Year ${yearOf(tick)} · ${pad2(hour)}:${pad2(minute)}`;
}
