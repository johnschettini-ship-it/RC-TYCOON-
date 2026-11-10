/**
 * The hand (Phase 7 §4.5): the cards of the open deck in a strip that scrolls sideways (wheel, a mouse or pen drag on
 * the strip, touch). On desktop two arrow buttons show when the cards do not fit. `ArrowLeft`, `ArrowRight`, `Home`,
 * and `End` move the focus between the cards.
 */
import { text } from '../../data/strings/en';
import { CARD_DRAG_PX } from '../../data/tuning/interface';
import type { UiContext } from '../context';
import { h, newId, setAttr } from '../dom';
import { createToolCard, type ToolCardView } from './card';
import type { DeckId } from './model';
import { cardsOfDeck, type ToolCardDef } from './toolCards';

const SVG_NS = 'http://www.w3.org/2000/svg';

function chevron(dir: 'prev' | 'next'): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(SVG_NS, 'path');
  p.setAttribute('d', dir === 'prev' ? 'M15 5 L8 12 L15 19' : 'M9 5 L16 12 L9 19');
  p.setAttribute('fill', 'none');
  p.setAttribute('stroke', 'currentColor');
  p.setAttribute('stroke-width', '2.5');
  p.setAttribute('stroke-linecap', 'round');
  p.setAttribute('stroke-linejoin', 'round');
  svg.append(p);
  return svg;
}

export interface HandView {
  el: HTMLElement;
  show(deck: DeckId): void;
  hide(): void;
  /** The open deck, or null when the hand is closed. */
  deck(): DeckId | null;
  /** The card of a tool in the open deck, or null. */
  cardFor(toolId: string): HTMLElement | null;
  update(): void;
}

export function createHand(ctx: UiContext, defs: readonly ToolCardDef[]): HandView {
  const cards = h('div', { class: 'hand-cards' });
  const scroller = h('div', { class: 'hand-scroll' }, cards);
  const step = (dir: -1 | 1): void => scroller.scrollBy({ left: dir * Math.max(80, scroller.clientWidth * 0.8), behavior: 'smooth' });
  const prev = h('button', { type: 'button', class: 'btn hand-arrow', 'data-testid': 'hand-prev', 'aria-label': text('ui.hand.prev'), title: text('ui.hand.prev'), hidden: true, onclick: () => step(-1) }, chevron('prev'));
  const next = h('button', { type: 'button', class: 'btn hand-arrow', 'data-testid': 'hand-next', 'aria-label': text('ui.hand.next'), title: text('ui.hand.next'), hidden: true, onclick: () => step(1) }, chevron('next'));
  const el = h('div', { class: 'hand', role: 'group', id: newId('hand'), 'data-testid': 'hand', hidden: true }, prev, scroller, next);

  /** Card views per deck, built the first time the deck opens. */
  const views = new Map<DeckId, ToolCardView[]>();
  let open: DeckId | null = null;
  let shown: ToolCardView[] = [];
  let lastLayout = '';

  const refreshArrows = (): void => {
    const show = open !== null && ctx.root.dataset.layout === 'side' && scroller.scrollWidth > scroller.clientWidth + 1;
    if (prev.hidden === show) prev.hidden = !show;
    if (next.hidden === show) next.hidden = !show;
  };
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(refreshArrows);
    ro.observe(scroller);
    ro.observe(cards);
  }

  // Wheel: either axis scrolls the strip sideways.
  scroller.addEventListener(
    'wheel',
    (e) => {
      if (scroller.scrollWidth <= scroller.clientWidth) return;
      scroller.scrollLeft += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      e.preventDefault();
    },
    { passive: false },
  );

  // Mouse and pen: a drag of `CARD_DRAG_PX` or more scrolls the strip, and the click that ends it is dropped.
  // Touch scrolls the strip natively (`touch-action: pan-x`).
  let drag: { id: number; x: number; left: number; moved: boolean } | null = null;
  let dropClick = false;
  scroller.addEventListener('pointerdown', (e) => {
    dropClick = false;
    if (e.pointerType === 'touch' || e.button !== 0) return;
    drag = { id: e.pointerId, x: e.clientX, left: scroller.scrollLeft, moved: false };
  });
  scroller.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    if (!drag.moved) {
      if (Math.abs(dx) < CARD_DRAG_PX) return;
      drag.moved = true;
      scroller.setPointerCapture(e.pointerId);
    }
    scroller.scrollLeft = drag.left - dx;
  });
  const endDrag = (e: PointerEvent): void => {
    if (!drag || e.pointerId !== drag.id) return;
    dropClick = drag.moved;
    drag = null;
  };
  scroller.addEventListener('pointerup', endDrag);
  scroller.addEventListener('pointercancel', endDrag);
  scroller.addEventListener(
    'click',
    (e) => {
      if (!dropClick) return;
      dropClick = false;
      e.preventDefault();
      e.stopPropagation();
    },
    true,
  );

  // Keyboard: the arrow keys, Home, and End move between the cards (and not the map).
  cards.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return;
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || shown.length === 0) return;
    const from = shown.findIndex((v) => v.wrap.contains(document.activeElement));
    if (from < 0) return;
    const last = shown.length - 1;
    const to = e.key === 'Home' ? 0 : e.key === 'End' ? last : Math.min(last, Math.max(0, from + (e.key === 'ArrowLeft' ? -1 : 1)));
    e.preventDefault();
    e.stopPropagation();
    const card = shown[to]?.card;
    card?.focus();
    card?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });

  const viewsOf = (deck: DeckId): ToolCardView[] => {
    let list = views.get(deck);
    if (!list) {
      list = cardsOfDeck(deck, defs).map((d) => createToolCard(ctx, d));
      views.set(deck, list);
    }
    return list;
  };

  return {
    el,
    show(deck) {
      if (open !== deck) {
        open = deck;
        shown = viewsOf(deck);
        cards.replaceChildren(...shown.map((v) => v.wrap));
        scroller.scrollLeft = 0;
        setAttr(el, 'data-deck', deck);
        setAttr(el, 'aria-label', text('ui.deck.cards', { deck: text(`ui.deck.${deck}`) }));
      }
      for (const v of shown) v.update();
      if (el.hidden) el.hidden = false;
      refreshArrows();
    },
    hide() {
      open = null;
      if (!el.hidden) el.hidden = true;
    },
    deck: () => open,
    cardFor(toolId) {
      if (open === null) return null;
      return shown.find((v) => v.def.id === toolId)?.card ?? null;
    },
    update() {
      const layout = ctx.root.dataset.layout ?? '';
      if (layout !== lastLayout) {
        lastLayout = layout;
        refreshArrows();
      }
      if (open === null) return;
      for (const v of shown) v.update();
    },
  };
}
