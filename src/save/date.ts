/** The short game date of a save (the park line under Continue on the title screen). */
import { MONTH_NAMES, monthOfYear, yearOf } from '../sim/time';

/** The month and the year of `tick` as `formatDate` writes them, without the clock (for example `Mar · Year 1`). */
export function formatSaveDate(tick: number): string {
  return `${MONTH_NAMES[monthOfYear(tick)]} · Year ${yearOf(tick)}`;
}
