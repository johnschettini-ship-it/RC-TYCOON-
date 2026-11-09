/** Toast view (Phase 1 §7): one message, 3 s, newest replaces oldest. Owner: W1-B. */
import { text } from '../data/strings/en';
import { h, setAttr, setText } from './dom';
import { icon } from './icons';
import { ToastQueue, type ToastKind } from './toasts';

export function createToastView(): { el: HTMLElement; show(message: string, kind: ToastKind): void; update(now: number): void } {
  const queue = new ToastQueue();
  const msg = h('span', { class: 'toast-text', 'data-testid': 'toast' });
  const warn = icon('warning', 'icon toast-icon');
  const button = h('button', { type: 'button', class: 'toast', 'aria-label': text('ui.toast.dismiss'), hidden: true, onclick: () => queue.dismiss() }, warn, msg);
  // A live region that stays in the DOM, so screen readers announce each new message.
  const live = h('div', { class: 'sr-only', role: 'status', 'aria-live': 'polite' });
  const el = h('div', { class: 'toast-host' }, button, live);
  let shownId = -1;

  return {
    el,
    show(message: string, kind: ToastKind) {
      queue.show(message, kind, performance.now());
    },
    update(now: number) {
      const t = queue.current(now);
      if (!t) {
        if (!button.hidden) button.hidden = true;
        return;
      }
      if (t.id !== shownId) {
        shownId = t.id;
        setText(msg, t.message);
        setText(live, t.message);
        button.dataset.kind = t.kind;
        warn.style.display = t.kind === 'info' ? 'none' : '';
        setAttr(button, 'title', t.message);
        button.hidden = false;
        // Restart the entry animation.
        button.classList.remove('enter');
        void button.offsetWidth;
        button.classList.add('enter');
      }
    },
  };
}
