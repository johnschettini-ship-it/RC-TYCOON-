/**
 * Messages panel (Phase 3 §4.14, §7.1): the log, newest first, with category icons. Tap or click a
 * message to move the camera to its target and open the target's panel. Opening the panel marks the log
 * read (`markMessagesRead`); messages that were unread keep a "New" chip while the panel stays open.
 * Owner: W2-B.
 */
import { text } from '../../data/strings/en';
import type { Message } from '../../sim/management/types';
import { formatDate } from '../../sim/time';
import type { PanelView, UiContext } from '../context';
import { h } from '../dom';
import { mgmtIcon } from './icons';
import { locateTarget, messageIcon, messageLine, messagesNewestFirst } from './messages';
import { goToTarget } from './widgets';

export function createMessagesPanel(ctx: UiContext): PanelView {
  const { game } = ctx;
  const list = h('ul', { class: 'message-list', role: 'list', 'aria-label': text('ui.messages.list'), 'data-testid': 'messages-list' });
  const empty = h('p', { class: 'muted', text: text('ui.messages.empty') });
  /** Ids that were unread when they were first shown in this panel. */
  const fresh = new Set<number>();
  const startReadUpTo = game.world.state.management.messagesReadUpTo;
  let key = '';

  const row = (m: Message): HTMLElement => {
    const category = text(`ui.messages.category.${m.category}`);
    const line = messageLine(m);
    const date = formatDate(m.tick);
    const isNew = fresh.has(m.id);
    const target = locateTarget(game.world, m);
    const b = h(
      'button',
      {
        type: 'button',
        class: `message-row cat-${m.category}${isNew ? ' new' : ''}`,
        'data-testid': 'message-row',
        'data-message-id': m.id,
        'aria-label': text('ui.messages.item', { category, text: line, date }),
        onclick: () => {
          const t = locateTarget(game.world, m);
          if (t) goToTarget(ctx, t);
        },
      },
      h('span', { class: 'message-icon', 'aria-hidden': 'true' }, mgmtIcon(messageIcon(m.category))),
      h('span', { class: 'message-text' }, h('span', { class: 'message-line', text: line }), h('span', { class: 'message-date', text: `${category} · ${date}` })),
      isNew ? h('span', { class: 'chip new-chip', text: text('ui.messages.new') }) : null,
      target ? mgmtIcon('locate', 'icon message-go') : null,
    );
    return h('li', {}, b);
  };

  const body = h('div', { class: 'panel-content' }, list, empty);

  return {
    kind: 'messages',
    id: null,
    title: text('ui.messages.title'),
    body,
    update() {
      const m = game.world.state.management;
      for (const msg of m.messages) if (msg.id > startReadUpTo) fresh.add(msg.id);
      const newest = m.nextMessageId - 1;
      // The player sees the log: move the read marker (the unread badge clears).
      if (newest > m.messagesReadUpTo) game.dispatch({ type: 'markMessagesRead', upToId: newest });
      const k = `${m.messages.length}:${m.messages[0]?.id ?? 0}:${newest}`;
      if (k !== key) {
        key = k;
        list.replaceChildren(...messagesNewestFirst(m.messages).map(row));
        empty.hidden = m.messages.length > 0;
      }
      return true;
    },
  };
}
