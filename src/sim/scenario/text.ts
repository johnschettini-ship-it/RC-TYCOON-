/**
 * String ids and params for scenario goals, deadlines, and end reasons (Phase 5 §4.3, §4.4, §7). Owner: W3-H.
 * The UI turns them into text with `text(id, params)` (`data/strings/en.ts`). Money comes formatted by `money`.
 */
import type { Objective } from '../../data/scenarios/types';
import { scenarioStrings } from '../../data/strings/scenario';
import type { ScenarioEndReason } from './types';

export interface TextRef {
  id: string;
  params: Record<string, string | number>;
}

/** "$1,234" for whole-dollar amounts, "$1,234.50" otherwise (the HUD style). */
export function plainMoney(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const rest = abs - dollars * 100;
  const grouped = String(dollars).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}$${grouped}${rest === 0 ? '' : `.${String(rest).padStart(2, '0')}`}`;
}

/** Excitement or intensity in hundredths as "6.50". */
export function ratingText(hundredths: number): string {
  const whole = Math.floor(hundredths / 100);
  return `${whole}.${String(hundredths - whole * 100).padStart(2, '0')}`;
}

/** The goal sentence of an objective. */
export function objectiveText(obj: Objective, money: (cents: number) => string = plainMoney): TextRef {
  switch (obj.type) {
    case 'guestsInPark':
      return obj.minRating === undefined
        ? { id: 'scenario.goal.guestsInPark', params: { count: obj.count } }
        : { id: 'scenario.goal.guestsInParkRating', params: { count: obj.count, rating: obj.minRating } };
    case 'parkRatingHeld':
      return { id: obj.months === 1 ? 'scenario.goal.parkRatingHeld1' : 'scenario.goal.parkRatingHeld', params: { rating: obj.rating, months: obj.months } };
    case 'parkValue':
      return { id: 'scenario.goal.parkValue', params: { value: money(obj.value) } };
    case 'monthlyRideIncome':
      return { id: obj.months === 1 ? 'scenario.goal.monthlyRideIncome1' : 'scenario.goal.monthlyRideIncome', params: { amount: money(obj.amount), months: obj.months } };
    case 'monthlyProfit':
      return { id: obj.months === 1 ? 'scenario.goal.monthlyProfit1' : 'scenario.goal.monthlyProfit', params: { amount: money(obj.amount), months: obj.months } };
    case 'coasterExcitement': {
      const excitement = ratingText(obj.minExcitement);
      if (obj.maxIntensity !== undefined) {
        return { id: 'scenario.goal.coasterExcitementIntensity', params: { count: obj.count, excitement, intensity: ratingText(obj.maxIntensity) } };
      }
      return obj.count === 1 ? { id: 'scenario.goal.coasterExcitement1', params: { excitement } } : { id: 'scenario.goal.coasterExcitement', params: { count: obj.count, excitement } };
    }
    case 'ridesOpen':
      if (obj.flag !== undefined) return { id: 'scenario.goal.ridesOpenFlag', params: { count: obj.count, flag: scenarioStrings[`scenario.flag.${obj.flag}`] ?? obj.flag } };
      if (obj.tag !== undefined) return { id: 'scenario.goal.ridesOpenTag', params: { count: obj.count, tag: scenarioStrings[`scenario.tag.${obj.tag}`] ?? obj.tag } };
      return { id: 'scenario.goal.ridesOpen', params: { count: obj.count } };
    case 'repayLoan':
      return { id: 'scenario.goal.repayLoan', params: {} };
    case 'temperamentBalance':
      return {
        id: obj.months === 1 ? 'scenario.goal.temperamentBalance1' : 'scenario.goal.temperamentBalance',
        params: { guests: obj.minGuests, share: obj.minShare, happiness: obj.minHappiness, months: obj.months },
      };
    case 'afterDarkHappiness':
      return {
        id: obj.months === 1 ? 'scenario.goal.afterDarkHappiness1' : 'scenario.goal.afterDarkHappiness',
        params: { guests: obj.minGuests, happiness: obj.minHappiness, months: obj.months },
      };
  }
}

/** Deadline line for the objectives panel ("8 months left", Phase 5 §7) at month `monthIndex`. */
export function deadlineText(deadlineMonthIndex: number | null, monthIndex: number): TextRef {
  if (deadlineMonthIndex === null) return { id: 'scenario.noTimeLimit', params: {} };
  const left = deadlineMonthIndex - monthIndex;
  if (left < 0) return { id: 'scenario.pastDeadline', params: {} };
  if (left === 0) return { id: 'scenario.lastMonth', params: {} };
  if (left === 1) return { id: 'scenario.monthLeft', params: {} };
  return { id: 'scenario.monthsLeft', params: { n: left } };
}

export function endReasonText(reason: ScenarioEndReason): TextRef {
  return { id: `scenario.end.${reason}`, params: {} };
}
