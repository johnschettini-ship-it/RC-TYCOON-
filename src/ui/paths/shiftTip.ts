/**
 * One tip, once (touch controls spec 2026-11-18 §7): the first time a mouse player opens the footpath or queue tool,
 * the path builder row shows "Tip: Shift + drag draws a straight line" with Close. It is marked seen in storage when it
 * first shows (its own key, `tc.tip.shiftDrag`: no settings change), stays until Close or until the tool closes, and
 * never comes back. Screens whose main pointer is a finger (`pointer: coarse`) never see it.
 */
import { text } from '../../data/strings/en';
import { h } from '../dom';
import { icon } from '../icons';

export const SHIFT_TIP_KEY = 'tc.tip.shiftDrag';

function seen(): boolean {
  try {
    return window.localStorage.getItem(SHIFT_TIP_KEY) === '1';
  } catch {
    return false;
  }
}

function markSeen(): void {
  try {
    window.localStorage.setItem(SHIFT_TIP_KEY, '1');
  } catch {
    // Blocked storage: the tip shows once per page load instead.
  }
}

function finePointer(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches;
  } catch {
    return false;
  }
}

export function createShiftTip(): { el: HTMLElement; update(pathToolOn: boolean): void } {
  /** 'waiting' until it first shows, 'showing' while the tool stays open, then 'done' for good. */
  let state: 'waiting' | 'showing' | 'done' = seen() ? 'done' : 'waiting';
  const close = h(
    'button',
    { type: 'button', class: 'icon-btn path-tip-close', 'data-testid': 'path-tip-close', 'aria-label': text('paths.tipClose'), onclick: () => (state = 'done') },
    icon('cross'),
  );
  const el = h('div', { class: 'path-tip', 'data-testid': 'path-tip', role: 'note', hidden: true }, h('span', { class: 'status-detail', text: text('paths.tipShift') }), close);
  return {
    el,
    update(on) {
      if (state === 'waiting' && on && finePointer()) {
        state = 'showing';
        markSeen();
      } else if (state === 'showing' && !on) state = 'done';
      const visible = state === 'showing';
      if (el.hidden === visible) el.hidden = !visible;
    },
  };
}
