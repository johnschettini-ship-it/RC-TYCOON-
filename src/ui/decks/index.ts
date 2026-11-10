/**
 * Decks (Phase 7 §4.4–§4.6): the deck list and the hand. One deck is open at a time; a press on the open deck closes
 * the hand. The open deck is session data (saves do not store it).
 */
import { CARD_LIFT_PX } from '../../data/tuning/interface';
import type { UiContext } from '../context';
import type { UiPart } from '../extensions';
import { h } from '../dom';
import { createDeckList } from './deckList';
import { createHand } from './hand';
import type { DeckId } from './model';
import { allToolCards } from './toolCards';

export interface DecksUi extends UiPart {
  list: HTMLElement;
  hand: HTMLElement;
  /** Opens the hand with a deck. `zone` is for the ride and stall decks (their zones come with the content cards). */
  open(deck: DeckId, zone?: string): void;
  close(): void;
  current(): DeckId | null;
  /** The card of a tool when its deck is open, else its deck button; the control of the other ids; null for `inspect`. */
  controlFor(toolId: string): HTMLElement | null;
}

export function createDecks(ctx: UiContext): DecksUi {
  const defs = allToolCards(ctx);
  const hand = createHand(ctx, defs);
  const list = createDeckList(ctx, hand.el.id, (deck) => (hand.deck() === deck ? close() : open(deck)));
  ctx.root.style.setProperty('--card-lift', `${CARD_LIFT_PX}px`);

  function open(deck: DeckId): void {
    hand.show(deck);
    list.setOpen(deck);
  }
  function close(): void {
    hand.hide();
    list.setOpen(null);
  }

  const el = h('div', { class: 'decks' }, list.el, hand.el);
  return {
    el,
    list: list.el,
    hand: hand.el,
    open,
    close,
    current: () => hand.deck(),
    controlFor(toolId) {
      if (toolId === 'inspect') return null;
      const def = defs.find((d) => d.id === toolId);
      if (def) return hand.cardFor(toolId) ?? list.buttonFor(def.deck);
      if (toolId === 'demolish') return list.demolish;
      // Messages, Menu (controls) and Temperament (the mood bar) keep their `data-tool`.
      const other = ctx.root.querySelector(`[data-tool="${toolId}"]`);
      return other instanceof HTMLElement ? other : null;
    },
    update() {
      list.update();
      hand.update();
    },
  };
}
