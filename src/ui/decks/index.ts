/**
 * Decks (Phase 7 §4.4–§4.6): the deck list and the hand. One deck is open at a time; a press on the open deck closes
 * the hand. The open deck is session data (saves do not store it).
 *
 * Phone tuck: when a card (a tool card, or a held ride or stall card) becomes pressed, the hand tucks away (hidden;
 * `--toolbar-space` shrinks to the chip row) and comes back with the same deck when no card is pressed any more. A deck
 * chip pressed while tucked shows the hand, which then stays until a card next becomes pressed. Desktop never tucks; a layout change ends a tuck.
 */
import { CARD_LIFT_PX } from '../../data/tuning/interface';
import type { UiContext } from '../context';
import type { UiPart } from '../extensions';
import { h } from '../dom';
import { createDeckList } from './deckList';
import { createHand } from './hand';
import { heldCardId, type DeckId } from './model';
import { allToolCards } from './toolCards';

export { holdCard } from './toolCards';

export interface DecksUi extends UiPart {
  list: HTMLElement;
  hand: HTMLElement;
  /** Opens the hand with a deck. `zone` scrolls the ride or stall cards of that zone into view. */
  open(deck: DeckId, zone?: string): void;
  close(): void;
  current(): DeckId | null;
  /** The card of a tool when its deck is open, else its deck button; the control of the other ids; null for `inspect`. */
  controlFor(toolId: string): HTMLElement | null;
}

export function createDecks(ctx: UiContext): DecksUi {
  const defs = allToolCards(ctx);
  const hand = createHand(ctx, defs);
  const list = createDeckList(ctx, hand.el.id, (deck) => (hand.visible() && hand.deck() === deck ? close() : open(deck)));
  ctx.root.style.setProperty('--card-lift', `${CARD_LIFT_PX}px`);

  /** Deck chips are pressed only while the hand shows their deck. */
  const syncList = (): void => list.setOpen(hand.visible() ? hand.deck() : null);
  function open(deck: DeckId, zone?: string): void {
    hand.show(deck, zone);
    syncList();
  }
  function close(): void {
    hand.hide();
    syncList();
  }

  /** Pressed state of each card in the last frame: a card that turns pressed tucks the hand (phone). */
  const wasPressed = defs.map(() => false);
  let wasHeld: string | null = null;
  let lastLayout = '';
  const tuck = (): void => {
    const phone = ctx.root.dataset.layout === 'bottom';
    const layout = ctx.root.dataset.layout ?? '';
    const layoutChanged = layout !== lastLayout;
    lastLayout = layout;
    let any = false;
    let turnedOn = false;
    for (let i = 0; i < defs.length; i++) {
      const on = (defs[i] as (typeof defs)[number]).pressed(ctx);
      if (on && !wasPressed[i]) turnedOn = true;
      wasPressed[i] = on;
      any ||= on;
    }
    const held = heldCardId(ctx.game.tool);
    if (held !== null && held !== wasHeld) turnedOn = true;
    wasHeld = held;
    any ||= held !== null;
    if (!phone || layoutChanged) hand.setTucked(false);
    else if (turnedOn) hand.setTucked(true);
    else if (!any) hand.setTucked(false);
    syncList();
  };

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
      if (toolId === 'rides' || toolId === 'stalls') return list.buttonFor(toolId);
      const def = defs.find((d) => d.id === toolId);
      if (def) return hand.cardFor(toolId) ?? list.buttonFor(def.deck);
      if (toolId === 'demolish') return list.demolish;
      // Messages, Menu (controls) and Temperament (the mood bar) keep their `data-tool`.
      const other = ctx.root.querySelector(`[data-tool="${toolId}"]`);
      return other instanceof HTMLElement ? other : null;
    },
    update(now) {
      tuck();
      list.update();
      hand.update(now);
    },
  };
}
