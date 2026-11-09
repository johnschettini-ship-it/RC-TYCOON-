/**
 * Toast priority (Phase 3 §7.3): toasts stack at most 1. A newer toast replaces an older one of a
 * lower or equal category priority (breakdown > research > others). Owner: W2-B. Pure.
 */
import type { MessageCategory } from '../../sim/management/types';

export const TOAST_PRIORITY = { other: 0, research: 1, breakdown: 2 } as const;
export type ToastPriority = (typeof TOAST_PRIORITY)[keyof typeof TOAST_PRIORITY];

/** Message toasts last a little longer than command toasts: they carry a Show button. */
export const MESSAGE_TOAST_MS = 5000;

export function messageToastPriority(category: MessageCategory): ToastPriority {
  if (category === 'breakdown') return TOAST_PRIORITY.breakdown;
  if (category === 'research') return TOAST_PRIORITY.research;
  return TOAST_PRIORITY.other;
}

/** Breakdown and research messages also show a toast with a Show button (Phase 3 §4.14). */
export function messageHasToast(category: MessageCategory): boolean {
  return category === 'breakdown' || category === 'research';
}

export class ToastArbiter {
  private priority: ToastPriority = TOAST_PRIORITY.other;
  private until = -Infinity;

  /** May a toast of `priority` show at `now`? If yes, it becomes the current one for `durationMs`. */
  offer(priority: ToastPriority, now: number, durationMs: number): boolean {
    if (now < this.until && priority < this.priority) return false;
    this.priority = priority;
    this.until = now + durationMs;
    return true;
  }

  /** The current toast was dismissed or hidden. */
  clear(): void {
    this.until = -Infinity;
    this.priority = TOAST_PRIORITY.other;
  }
}
