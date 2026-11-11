/**
 * The deck list (Phase 7 §4.4): a toolbar named "Card decks" with the 5 deck toggle buttons, a divider, and Demolish.
 * A column at the top left on desktop; a row of chips above the hand on the phone.
 */
import { text } from '../../data/strings/en';
import type { UiContext } from '../context';
import { h, setAttr } from '../dom';
import { icon } from '../icons';
import { DECK_ORDER, type DeckId } from './model';
import { selectTool } from './toolCards';

export interface DeckListView {
  el: HTMLElement;
  buttonFor(deck: DeckId): HTMLButtonElement;
  demolish: HTMLButtonElement;
  /** Marks the open deck pressed (null: none). */
  setOpen(deck: DeckId | null): void;
  update(): void;
}

export function createDeckList(ctx: UiContext, handId: string, onPress: (deck: DeckId) => void): DeckListView {
  const buttons = new Map<DeckId, HTMLButtonElement>();
  for (const deck of DECK_ORDER) {
    buttons.set(
      deck,
      h('button', {
        type: 'button',
        class: 'deck-btn',
        'data-deck': deck,
        'data-testid': `deck-${deck}`,
        // The Rides and Stalls decks replace the toolbar buttons of those ids.
        ...(deck === 'rides' || deck === 'stalls' ? { 'data-tool': deck } : {}),
        'aria-pressed': 'false',
        'aria-controls': handId,
        text: text(`ui.deck.${deck}`),
        onclick: () => onPress(deck),
      }),
    );
  }
  const demolish = h(
    'button',
    {
      type: 'button',
      class: 'deck-btn deck-demolish',
      'data-tool': 'demolish',
      'data-testid': 'tool-demolish',
      'aria-pressed': 'false',
      onclick: () => selectTool(ctx, 'demolish'),
    },
    icon('demolish'),
    h('span', { text: text('ui.tool.demolish') }),
  );
  const el = h(
    'nav',
    { class: 'deck-list', role: 'toolbar', 'aria-label': text('ui.deck.label') },
    h('span', { class: 'deck-list-title', 'aria-hidden': 'true', text: text('ui.deck.label') }),
    ...buttons.values(),
    h('span', { class: 'deck-divider', 'aria-hidden': 'true' }),
    demolish,
  );
  return {
    el,
    buttonFor: (deck) => buttons.get(deck) as HTMLButtonElement,
    demolish,
    setOpen(open) {
      for (const [deck, b] of buttons) setAttr(b, 'aria-pressed', deck === open ? 'true' : 'false');
    },
    update() {
      setAttr(demolish, 'aria-pressed', ctx.game.tool.tool === 'demolish' ? 'true' : 'false');
    },
  };
}
