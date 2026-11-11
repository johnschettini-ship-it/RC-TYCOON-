/**
 * The hand (Phase 7 §4.5): the cards of the open deck in a strip that scrolls sideways (wheel, a mouse or pen drag on
 * the strip, touch). On desktop two arrow buttons show when the cards do not fit. `ArrowLeft`, `ArrowRight`, `Home`,
 * and `End` move the focus between the cards.
 *
 * The Rides and Stalls decks hold the ride and stall cards in zone groups, each on its part of the zone strip, then
 * their tool cards. Every `HAND_REFRESH_MS` the hand compares `handSignature` with the last value and builds the
 * content cards again only on a change; a new world builds them again at once.
 */
import { text } from '../../data/strings/en';
import { CARD_DRAG_PX, HAND_REFRESH_MS } from '../../data/tuning/interface';
import type { UiContext } from '../context';
import { h, newId, setAttr } from '../dom';
import { contentCard, createToolCard, setHeld, zoneName, type ToolCardView } from './card';
import { RIDE_ZONES, STALL_ZONES, handSignature, heldCardId, rideCards, stallCards, zonesPresent, type CardSpec, type DeckId } from './model';
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

/** One card in hand order: what the keyboard moves between. */
interface Slot {
  wrap: HTMLElement;
  card: HTMLElement;
}

/** The cards of one deck. The content part is null until built, and again when it is out of date. */
interface DeckCards {
  tools: ToolCardView[];
  content: { nodes: HTMLElement[]; slots: Slot[]; wraps: Map<string, HTMLElement> } | null;
}

const CONTENT_ZONES: Partial<Record<DeckId, readonly string[]>> = { rides: RIDE_ZONES, stalls: STALL_ZONES };

export interface HandView {
  el: HTMLElement;
  /** Shows the hand with a deck (and ends a tuck). `zone` scrolls the ride or stall cards of that zone into view. */
  show(deck: DeckId, zone?: string): void;
  hide(): void;
  /** Phone tuck: the hand keeps its deck but is hidden while `on`. */
  setTucked(on: boolean): void;
  /** The open deck (also while tucked), or null when the hand is closed. */
  deck(): DeckId | null;
  /** The hand is on the screen: a deck is open and it is not tucked. */
  visible(): boolean;
  /** The card of a tool in the open deck while the hand is visible, or null. */
  cardFor(toolId: string): HTMLElement | null;
  update(now: number): void;
}

export function createHand(ctx: UiContext, defs: readonly ToolCardDef[]): HandView {
  const cards = h('div', { class: 'hand-cards' });
  const scroller = h('div', { class: 'hand-scroll' }, cards);
  const step = (dir: -1 | 1): void => scroller.scrollBy({ left: dir * Math.max(80, scroller.clientWidth * 0.8), behavior: 'smooth' });
  const prev = h('button', { type: 'button', class: 'btn hand-arrow', 'data-testid': 'hand-prev', 'aria-label': text('ui.hand.prev'), title: text('ui.hand.prev'), hidden: true, onclick: () => step(-1) }, chevron('prev'));
  const next = h('button', { type: 'button', class: 'btn hand-arrow', 'data-testid': 'hand-next', 'aria-label': text('ui.hand.next'), title: text('ui.hand.next'), hidden: true, onclick: () => step(1) }, chevron('next'));
  const el = h('div', { class: 'hand', role: 'group', id: newId('hand'), 'data-testid': 'hand', hidden: true }, prev, scroller, next);

  /** Cards per deck, built the first time the deck opens. */
  const decks = new Map<DeckId, DeckCards>();
  let open: DeckId | null = null;
  let tucked = false;
  /** The cards on the screen in hand order, and the tool cards among them. */
  let shown: Slot[] = [];
  let shownTools: ToolCardView[] = [];
  /** The ride or stall card shown held, and the held id it shows. */
  let heldWrap: HTMLElement | null = null;
  let heldId: string | null = null;
  let lastLayout = '';
  let signature = handSignature(ctx.game.world);
  let lastCheck = 0;

  const applyHidden = (): void => {
    const hide = open === null || tucked;
    if (el.hidden !== hide) el.hidden = hide;
  };
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

  /** The ride or stall cards of a deck in zone groups; each group lies on its part of the zone strip. */
  const buildContent = (deck: DeckId, zones: readonly string[]): NonNullable<DeckCards['content']> => {
    const specs: CardSpec[] = deck === 'rides' ? rideCards(ctx.game.world) : stallCards(ctx.game.world);
    const nodes: HTMLElement[] = [];
    const slots: Slot[] = [];
    const wraps = new Map<string, HTMLElement>();
    for (const zone of zonesPresent(specs, zones)) {
      const group = h('div', { class: 'hand-group', 'data-zone': zone });
      const first = specs.find((c) => c.zone === zone) as CardSpec;
      // The strip repeats the zone of the cards on it, which name their zone themselves.
      group.append(h('span', { class: 'hand-zone', 'data-zone': zone, 'aria-hidden': 'true', text: zoneName(first.kind, zone) }));
      for (const spec of specs) {
        if (spec.zone !== zone) continue;
        const wrap = contentCard(ctx, spec);
        group.append(wrap);
        slots.push({ wrap, card: wrap.firstElementChild as HTMLElement });
        wraps.set(spec.id, wrap);
      }
      nodes.push(group);
    }
    return { nodes, slots, wraps };
  };

  const cardsOf = (deck: DeckId): DeckCards => {
    let d = decks.get(deck);
    if (!d) {
      d = { tools: cardsOfDeck(deck, defs).map((def) => createToolCard(ctx, def)), content: null };
      decks.set(deck, d);
    }
    const zones = CONTENT_ZONES[deck];
    if (zones && !d.content) d.content = buildContent(deck, zones);
    return d;
  };

  /** Puts the cards of the open deck in the strip (building what is out of date). */
  const fill = (): void => {
    if (open === null) return;
    const d = cardsOf(open);
    // A rebuilt card takes the focus of the card it replaces.
    const focused = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('.content-card')?.dataset.def;
    shownTools = d.tools;
    shown = [...(d.content?.slots ?? []), ...d.tools.map((v) => ({ wrap: v.wrap, card: v.card }))];
    const nodes = [...(d.content?.nodes ?? []), ...d.tools.map((v) => v.wrap)];
    // The Rides and Stalls decks always hold their start content, so this text cannot show today.
    if (nodes.length === 0) nodes.push(h('p', { class: 'muted', text: text('ui.picker.empty') }));
    cards.replaceChildren(...nodes);
    if (heldWrap) setHeld(heldWrap, false);
    heldWrap = null;
    heldId = null;
    syncHeld();
    if (focused) (d.content?.wraps.get(focused)?.firstElementChild as HTMLElement | undefined)?.focus();
  };

  /** Shows the held ride or stall card of the open deck as held (only on a change). */
  function syncHeld(): void {
    const id = heldCardId(ctx.game.tool);
    if (id === heldId) return;
    heldId = id;
    const wrap = (id !== null && open !== null && decks.get(open)?.content?.wraps.get(id)) || null;
    if (heldWrap) setHeld(heldWrap, false);
    if (wrap) setHeld(wrap, true);
    heldWrap = wrap;
  }

  /** Marks the ride and stall cards out of date; the open deck builds them again now. */
  const refresh = (toStart: boolean): void => {
    for (const d of decks.values()) d.content = null;
    if (open !== null && CONTENT_ZONES[open]) {
      const left = scroller.scrollLeft;
      fill();
      scroller.scrollLeft = toStart ? 0 : left;
    }
  };
  ctx.game.onWorldChanged(() => {
    signature = handSignature(ctx.game.world);
    refresh(true);
  });

  return {
    el,
    show(deck, zone) {
      if (open !== deck || (CONTENT_ZONES[deck] && !decks.get(deck)?.content)) {
        const changed = open !== deck;
        open = deck;
        fill();
        if (changed) scroller.scrollLeft = 0;
        setAttr(el, 'data-deck', deck);
        setAttr(el, 'aria-label', text('ui.deck.cards', { deck: text(`ui.deck.${deck}`) }));
      }
      for (const v of shownTools) v.update();
      syncHeld();
      tucked = false;
      applyHidden();
      refreshArrows();
      const group = zone ? cards.querySelector<HTMLElement>(`.hand-group[data-zone="${CSS.escape(zone)}"]`) : null;
      if (group) scroller.scrollLeft += group.getBoundingClientRect().left - scroller.getBoundingClientRect().left;
    },
    hide() {
      open = null;
      applyHidden();
    },
    setTucked(on) {
      if (tucked === on) return;
      tucked = on;
      applyHidden();
      if (!on) refreshArrows();
    },
    deck: () => open,
    visible: () => open !== null && !tucked,
    cardFor(toolId) {
      if (open === null || tucked) return null;
      return shownTools.find((v) => v.def.id === toolId)?.card ?? null;
    },
    update(now) {
      const layout = ctx.root.dataset.layout ?? '';
      if (layout !== lastLayout) {
        lastLayout = layout;
        refreshArrows();
      }
      if (now - lastCheck >= HAND_REFRESH_MS) {
        lastCheck = now;
        const sig = handSignature(ctx.game.world);
        if (sig !== signature) {
          signature = sig;
          refresh(false);
        }
      }
      if (open === null) return;
      for (const v of shownTools) v.update();
      syncHeld();
    },
  };
}
