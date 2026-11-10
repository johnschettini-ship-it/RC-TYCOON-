/**
 * One tool card (Phase 7 §4.5, §4.6): a button with the icon and label of the toolbar button it replaces. While it is
 * held (`pressed`), it rises and a Put back button shows beside it. A press on the held card also puts it back.
 */
import { text } from '../../data/strings/en';
import type { UiContext } from '../context';
import { h, setAttr, toggleClass } from '../dom';
import { putBack, type ToolCardDef } from './toolCards';

export interface ToolCardView {
  def: ToolCardDef;
  /** `div.card-wrap`: the card and, while held, its Put back button. */
  wrap: HTMLElement;
  card: HTMLButtonElement;
  update(): void;
}

export function createToolCard(ctx: UiContext, def: ToolCardDef): ToolCardView {
  let held = false;
  const card = h(
    'button',
    {
      type: 'button',
      class: 'card tool-card',
      'data-tool': def.id,
      'data-testid': `tool-${def.id}`,
      'aria-pressed': 'false',
      onclick: () => (held ? putBack(ctx, def) : def.onClick(ctx)),
    },
    h('span', { class: 'tool-card-art', 'aria-hidden': 'true' }, def.icon()),
    h('span', { class: 'tool-card-label', text: def.label }),
  );
  const back = h('button', { type: 'button', class: 'btn card-put-back', 'data-testid': 'card-put-back', text: text('ui.card.putBack'), onclick: () => putBack(ctx, def) });
  const wrap = h('div', { class: 'card-wrap' }, card);
  return {
    def,
    wrap,
    card,
    update() {
      const on = def.pressed(ctx);
      if (on === held) return;
      held = on;
      setAttr(card, 'aria-pressed', on ? 'true' : 'false');
      toggleClass(wrap, 'held', on);
      if (on) wrap.append(back);
      else {
        // Focus on Put back goes back to the card, so the keyboard keeps its place in the hand.
        const refocus = document.activeElement === back;
        back.remove();
        if (refocus) card.focus();
      }
    },
  };
}
