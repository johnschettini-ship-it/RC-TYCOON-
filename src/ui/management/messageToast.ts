/**
 * Message toast (Phase 3 §4.14, §7.3): breakdown and research messages show a toast with a Show button
 * that locates the target. One toast at a time: the UI index decides with a ToastArbiter. Owner: W2-B.
 */
import { text } from '../../data/strings/en';
import type { SimEvent } from '../../sim/types';
import type { UiContext } from '../context';
import { h, setAttr, setText } from '../dom';
import { mgmtIcon, setMgmtIcon } from './icons';
import { locateTarget, messageIcon, messageLine, type MessageLike } from './messages';
import { MESSAGE_TOAST_MS } from './toastArbiter';
import { goToTarget } from './widgets';

type MessageEvent = Extract<SimEvent, { type: 'message' }>;

/** `onDismiss` runs when the player closes the toast or presses Show (the next toast may show at once). */
export function createMessageToast(ctx: UiContext, onDismiss: () => void = () => {}): {
  el: HTMLElement;
  show(ev: MessageEvent, now: number): void;
  hide(): void;
  visible(now: number): boolean;
  update(now: number): void;
} {
  const iconHolder = h('span', { class: 'toast-icon', 'aria-hidden': 'true' }, mgmtIcon('wrench'));
  const msg = h('span', { class: 'toast-text', 'data-testid': 'message-toast' });
  let current: MessageLike | null = null;
  let until = 0;
  const showBtn = h(
    'button',
    {
      type: 'button',
      class: 'btn small',
      'data-testid': 'message-toast-show',
      onclick: () => {
        if (!current) return;
        const t = locateTarget(ctx.game.world, current);
        if (t) goToTarget(ctx, t);
        else ctx.openPanel('messages');
        hide();
        onDismiss();
      },
    },
    h('span', { text: text('ui.toast.show') }),
  );
  const close = h('button', { type: 'button', class: 'icon-btn', 'aria-label': text('ui.toast.dismiss'), onclick: () => { hide(); onDismiss(); } }, h('span', { 'aria-hidden': 'true', text: '×' }));
  const box = h('div', { class: 'toast msg-toast', role: 'status', hidden: true }, iconHolder, msg, showBtn, close);
  const el = h('div', { class: 'toast-host msg-toast-host' }, box);

  function hide(): void {
    current = null;
    until = 0;
    box.hidden = true;
  }

  return {
    el,
    show(ev, now) {
      current = { category: ev.category, textId: ev.textId, params: ev.params, tile: ev.tile, entityId: ev.entityId };
      until = now + MESSAGE_TOAST_MS;
      setText(msg, messageLine(current));
      setMgmtIcon(iconHolder, messageIcon(ev.category));
      box.dataset.kind = ev.category;
      setAttr(box, 'title', messageLine(current));
      box.hidden = false;
      box.classList.remove('enter');
      void box.offsetWidth;
      box.classList.add('enter');
    },
    hide,
    visible(now) {
      return current !== null && now < until;
    },
    update(now) {
      if (current && now >= until) hide();
    },
  };
}
