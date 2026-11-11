/**
 * Pure view models for the scenario front end (Phase 5 §4.4, §4.7, §4.13, §7): goal texts and progress, deadlines,
 * scenario cards, start conditions, end-screen facts, award mascots, newest save. Owner: W3-I. No DOM.
 */
import { text } from '../../data/strings/en';
import { scenarioName } from '../contentName';
import type { Difficulty, Objective, ScenarioDef } from '../../data/scenarios/types';
import { DIFFICULTY } from '../../data/tuning/scenario';
import { DIFFICULTIES, openScenarioIds, unlockWinsFor, type Progress } from '../../progress';
import type { AwardId } from '../../sim/awards/types';
import type { ScenarioResult } from '../../sim/scenario/api';
import type { ObjectiveProgress } from '../../sim/scenario/types';
import { monthIndexOf } from '../../sim/time';
import { monthName } from '../../i18n';
import { formatMoney, formatRating } from '../format';

/** "Feb · Year 2" for a month index (month 0 = March, Year 1). */
export function monthLabel(monthIndex: number): string {
  const m = ((monthIndex % 12) + 12) % 12;
  return text('prog.monthYear', { month: monthName(m), year: Math.floor(monthIndex / 12) + 1 });
}

/** The month and the year of a save's tick, without the clock (the park line under Continue), in the game's language. */
export function saveDateLabel(tick: number): string {
  return monthLabel(monthIndexOf(tick));
}

export const monthsText = (n: number): string => (n === 1 ? text('prog.months.one') : text('prog.months.many', { n }));
const daysText = (n: number): string => (n === 1 ? text('prog.days.one') : text('prog.days.many', { n }));
/** Happiness 0–255 as a whole percent (170 → 67). */
export const happinessPercent = (h: number): number => Math.round((h * 100) / 255);

/** One line per goal (Phase 5 §4.3 table). Money in cents, ratings 0–1000, excitement in hundredths. */
export function goalText(o: Objective): string {
  switch (o.type) {
    case 'guestsInPark':
      return o.minRating === undefined
        ? text('prog.goal.guestsInPark', { count: o.count })
        : text('prog.goal.guestsInParkRating', { count: o.count, rating: o.minRating });
    case 'parkRatingHeld':
      return text('prog.goal.parkRatingHeld', { rating: o.rating, months: monthsText(o.months) });
    case 'parkValue':
      return text('prog.goal.parkValue', { value: formatMoney(o.value) });
    case 'monthlyRideIncome':
      return text('prog.goal.monthlyRideIncome', { amount: formatMoney(o.amount), months: monthsText(o.months) });
    case 'monthlyProfit':
      return text('prog.goal.monthlyProfit', { amount: formatMoney(o.amount), months: monthsText(o.months) });
    case 'coasterExcitement': {
      const excitement = formatRating(o.minExcitement);
      const goal = o.count === 1 ? text('prog.goal.coasterExcitement.one', { excitement }) : text('prog.goal.coasterExcitement.many', { count: o.count, excitement });
      return o.maxIntensity === undefined ? goal : text('prog.goal.coasterIntensity', { goal, intensity: formatRating(o.maxIntensity) });
    }
    case 'ridesOpen': {
      const kind = o.flag ?? o.tag;
      return kind ? text('prog.goal.ridesOpenKind', { count: o.count, kind: text(`prog.rideKind.${kind}`) }) : text('prog.goal.ridesOpen', { count: o.count });
    }
    case 'repayLoan':
      return text('prog.goal.repayLoan');
    case 'temperamentBalance':
      return text('prog.goal.temperamentBalance', { guests: o.minGuests, share: o.minShare, happiness: happinessPercent(o.minHappiness), months: monthsText(o.months) });
    case 'afterDarkHappiness':
      return text('prog.goal.afterDarkHappiness', { guests: o.minGuests, happiness: happinessPercent(o.minHappiness), months: monthsText(o.months) });
  }
}

export interface GoalView {
  text: string;
  met: boolean;
  /** 0–1 for the progress bar. */
  fraction: number;
  /** "312 of 250", "Loan: $5,000". */
  value: string;
  /** "Streak: 1 of 2 months", or null for goals without a streak. */
  streak: string | null;
}

const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/**
 * Objective panel row from the definition and the sim's progress record (`value` in the goal's unit, `streak` in
 * days for `parkRatingHeld` and in months for the "× months" goals). `startLoan` is the run's starting loan.
 */
export function goalView(o: Objective, p: ObjectiveProgress | undefined, startLoan = 0): GoalView {
  const met = p?.met ?? false;
  const value = p?.value ?? 0;
  const streak = p?.streak ?? 0;
  const of = (v: string, t: string): string => text('prog.objectives.value', { value: v, target: t });
  const months = (target: number): string => text('prog.objectives.streakMonths', { n: Math.min(streak, target), target });
  switch (o.type) {
    case 'guestsInPark':
      return { text: goalText(o), met, fraction: clamp01(value / o.count), value: of(String(value), String(o.count)), streak: null };
    case 'parkRatingHeld': {
      const days = o.months * 3;
      return { text: goalText(o), met, fraction: clamp01(streak / days), value: of(String(value), String(o.rating)), streak: text('prog.objectives.streakDays', { n: Math.min(streak, days), target: days }) };
    }
    case 'parkValue':
      return { text: goalText(o), met, fraction: clamp01(value / o.value), value: of(formatMoney(value), formatMoney(o.value)), streak: null };
    case 'monthlyRideIncome':
    case 'monthlyProfit':
      return { text: goalText(o), met, fraction: met ? 1 : clamp01(value / o.amount), value: of(formatMoney(value), formatMoney(o.amount)), streak: o.months > 1 ? months(o.months) : null };
    case 'coasterExcitement':
    case 'ridesOpen':
      return { text: goalText(o), met, fraction: clamp01(value / o.count), value: of(String(value), String(o.count)), streak: null };
    case 'repayLoan': {
      const fraction = value <= 0 ? 1 : 1 - value / Math.max(startLoan, value);
      return { text: goalText(o), met, fraction: clamp01(fraction), value: text('prog.objectives.loan', { value: formatMoney(value) }), streak: null };
    }
    case 'temperamentBalance':
    case 'afterDarkHappiness':
      return { text: goalText(o), met, fraction: met ? 1 : clamp01(streak / o.months), value: met ? text('prog.objectives.met') : text('prog.objectives.notMet'), streak: months(o.months) };
  }
}

/** "8 months left" until the end of the deadline month; null without a deadline. */
export function monthsLeftText(deadlineMonthIndex: number | null, tick: number): string | null {
  if (deadlineMonthIndex === null) return null;
  const left = deadlineMonthIndex - monthIndexOf(tick) + 1;
  if (left <= 0) return text('prog.monthsLeft.over');
  return left === 1 ? text('prog.monthsLeft.one') : text('prog.monthsLeft.many', { n: left });
}

/** "End of Feb · Year 2 (12 months)" for a definition's time limit (start month 0). */
export function deadlineText(def: Pick<ScenarioDef, 'timeLimitMonths'>): string {
  if (def.timeLimitMonths === null) return text('prog.detail.noDeadline');
  return text('prog.detail.deadlineValue', { date: monthLabel(def.timeLimitMonths - 1), months: monthsText(def.timeLimitMonths) });
}

/** Start cash and max loan scaled by the preset (Phase 5 §4.8), rounded to whole dollars. */
export function startConditions(def: Pick<ScenarioDef, 'start'>, difficulty: Difficulty): { cash: number; loan: number; maxLoan: number } {
  const p = DIFFICULTY[difficulty];
  const dollars = (c: number): number => Math.round(c / 100) * 100;
  return { cash: dollars(def.start.cash * p.startCash), loan: def.start.loan, maxLoan: dollars(def.start.maxLoan * p.maxLoan) };
}

export interface ScenarioCard {
  id: string;
  name: string;
  stars: number;
  climate: ScenarioDef['climate'];
  afterDark: ScenarioDef['afterDark'];
  open: boolean;
  /** Wins needed to open (0 when open). */
  winsNeeded: number;
  /** Best stars per preset, null when not won on it. */
  best: Record<Difficulty, number | null>;
  /** The stored record comes from an earlier version of the scenario. */
  earlier: boolean;
}

/** Card grid models in card order. `progress` null = unreadable (only the start scenarios open). */
export function scenarioCards(defs: readonly ScenarioDef[], progress: Progress | null, unlockAll: boolean): ScenarioCard[] {
  const ids = defs.map((d) => d.id);
  const open = new Set(openScenarioIds(progress, unlockAll, ids));
  return defs.map((d, i) => {
    const rec = progress?.scenarios[d.id];
    const best = Object.fromEntries(DIFFICULTIES.map((k) => [k, rec?.best[k]?.stars ?? null])) as Record<Difficulty, number | null>;
    return {
      id: d.id,
      name: scenarioName(d),
      stars: d.stars,
      climate: d.climate,
      afterDark: d.afterDark,
      open: open.has(d.id),
      winsNeeded: open.has(d.id) ? 0 : unlockWinsFor(i),
      best,
      earlier: rec !== undefined && rec.defVersion < d.defVersion,
    };
  });
}

/** Frost for Chill awards, Spark for Thrill awards (Phase 5 §7). */
export const AWARD_MASCOT: Readonly<Record<AwardId, 'frost' | 'spark' | 'both'>> = {
  spotlessPark: 'frost',
  bestValue: 'spark',
  thrillSeekersChoice: 'spark',
  chillHaven: 'frost',
  perfectBalance: 'both',
  nightOwlsFavourite: 'frost',
  litterbugPark: 'frost',
  ripOffPark: 'spark',
  queueNightmare: 'spark',
  breakdownCentral: 'spark',
  lostAndConfused: 'frost',
  darkAndDreary: 'frost',
};

export interface EndFact {
  label: string;
  value: string;
}

/** End-screen facts (Phase 5 §4.4): date, guests, rating, park value, total profit, best coaster excitement, stars. */
export function endFacts(result: ScenarioResult, date: string): EndFact[] {
  return [
    { label: text('prog.end.date'), value: date },
    { label: text('prog.end.guests'), value: String(result.guests) },
    { label: text('prog.end.rating'), value: String(result.rating) },
    { label: text('prog.end.parkValue'), value: formatMoney(result.parkValue) },
    { label: text('prog.end.profit'), value: formatMoney(result.totalProfit) },
    { label: text('prog.end.bestCoaster'), value: result.bestCoasterExcitement === null ? text('prog.end.noCoaster') : formatRating(result.bestCoasterExcitement) },
    { label: text('prog.end.stars'), value: text('prog.end.starsValue', { n: result.stars }) },
  ];
}

/** "Click" for a mouse, "Tap" for touch (Phase 5 §4.11: text follows the last pointer type). */
export function actVerb(pointer: 'mouse' | 'touch'): string {
  return text(pointer === 'touch' ? 'prog.tutorial.act.tap' : 'prog.tutorial.act.click');
}

/** The slot to continue: the newest save or autosave (Phase 5 §4.13), by `savedAt`. */
export function newestSlot<T extends { savedAt: string }>(infos: readonly T[]): T | null {
  let best: T | null = null;
  for (const i of infos) if (!best || i.savedAt > best.savedAt) best = i;
  return best;
}

/** Camera move in tiles between two camera centres (world px, 64 × 32 px tiles; heights ignored). */
export function cameraTiles(ax: number, ay: number, bx: number, by: number): number {
  const da = (bx - ax) / 32;
  const db = (by - ay) / 16;
  const dx = (da + db) / 2;
  const dy = (db - da) / 2;
  return Math.sqrt(dx * dx + dy * dy);
}
