/** Queue card (queue clarity spec 2026-11-18 §2): opened by a tap on a queue tile; content from `./queueCard.ts`. */
import { text } from '../../data/strings/en';
import type { PanelView, UiContext } from '../context';
import { h, setText } from '../dom';
import { warningList } from '../widgets';
import { queueCard } from './queueCard';

export function createQueuePanel(ctx: UiContext, node: number): PanelView {
  const { game } = ctx;
  const first = queueCard(game.world, node);
  let rideId = first?.rideId ?? null;
  const count = h('p', { class: 'queue-count', 'data-testid': 'queue-count' });
  const warnings = warningList();
  const open = h('button', {
    type: 'button',
    class: 'btn',
    'data-testid': 'queue-open-ride',
    text: text('queue.card.openRide'),
    onclick: () => {
      if (rideId !== null) ctx.openPanel('ride', rideId);
    },
  });
  // Count and Open ride first, on one row where they fit, so a short card (phone peek, landscape) shows them unscrolled.
  const body = h('div', { class: 'panel-content queue-card', 'data-testid': 'queue-card' }, h('div', { class: 'queue-head' }, count, open), warnings.el);
  return {
    kind: 'queue',
    id: node,
    // A small card: on the phone it opens low, so the highlighted line shows above it.
    sheet: 'peek',
    title: first?.title ?? text('queue.card.title'),
    body,
    titleNow: () => queueCard(game.world, node)?.title ?? text('queue.card.title'),
    update() {
      const card = queueCard(game.world, node);
      if (!card) return false;
      rideId = card.rideId;
      setText(count, card.count ?? '');
      count.hidden = card.count === null;
      open.hidden = card.rideId === null;
      warnings.set(card.lines);
      return true;
    },
  };
}
