/** Toast queue (Phase 1 §7): 3 s, one at a time, the newest replaces the oldest. Owner: W1-B. Pure. */
import type { CommandResult } from '../sim/commands/types';

export const TOAST_MS = 3000;

export type ToastKind = 'error' | 'warning' | 'info';

export interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
  shownAt: number;
  until: number;
}

export class ToastQueue {
  private toast: Toast | null = null;
  private nextId = 1;

  show(message: string, kind: ToastKind, now: number): Toast {
    const t: Toast = { id: this.nextId++, message, kind, shownAt: now, until: now + TOAST_MS };
    this.toast = t;
    return t;
  }

  /** The visible toast at time `now`, or null. */
  current(now: number): Toast | null {
    const t = this.toast;
    if (!t) return null;
    if (now < t.shownAt || now >= t.until) return null;
    return t;
  }

  dismiss(): void {
    this.toast = null;
  }
}

/** Every failed command shows its reason; warnings show too. */
export function toastForResult(result: CommandResult): { message: string; kind: ToastKind } | null {
  if (!result.ok) return { message: result.reason, kind: 'error' };
  if (result.warnings.length > 0) return { message: result.warnings.join(' · '), kind: 'warning' };
  return null;
}
