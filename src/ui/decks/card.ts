/**
 * Cards (Phase 7 §4.5, §4.6). A tool card is a button with the icon and label of the toolbar button it replaces. A
 * content card (ride or stall) is a button with a zone band, the preview picture, the name, and the build cost. While
 * a card is held, it rises and a Put back button shows on it. A press on the held card also puts it back. A mouse or a
 * pen drags a flat ride or stall card to the map (`drag.ts`).
 */
import { text } from '../../data/strings/en';
import { drawPreview } from '../../render/renderer';
import { drawTrackPreview } from '../../render/track';
import type { UiContext } from '../context';
import { h, setAttr, toggleClass } from '../dom';
import { formatMoney } from '../format';
import { attachCardDrag } from './drag';
import { heldCardId, type CardSpec } from './model';
import { holdCard, putBack, selectTool, type ToolCardDef } from './toolCards';

export interface ToolCardView {
  def: ToolCardDef;
  /** `div.card-wrap`: the card and, while held, its Put back button. */
  wrap: HTMLElement;
  card: HTMLButtonElement;
  update(): void;
}

/** The Put back button of each card wrap. */
const backOf = new WeakMap<HTMLElement, HTMLButtonElement>();

function putBackButton(wrap: HTMLElement, onclick: () => void): void {
  backOf.set(wrap, h('button', { type: 'button', class: 'btn card-put-back', 'data-testid': 'card-put-back', text: text('ui.card.putBack'), onclick }));
}

/** Shows a card as held (raised, `aria-pressed`, Put back) or not. The caller calls it only on a change. */
export function setHeld(wrap: HTMLElement, on: boolean): void {
  const card = wrap.querySelector<HTMLElement>('.card');
  const back = backOf.get(wrap);
  if (card) setAttr(card, 'aria-pressed', on ? 'true' : 'false');
  toggleClass(wrap, 'held', on);
  if (!back) return;
  if (on) wrap.append(back);
  else {
    // Focus on Put back goes back to the card, so the keyboard keeps its place in the hand.
    const refocus = document.activeElement === back;
    back.remove();
    if (refocus) card?.focus();
  }
}

/**
 * Tool cards that select a map tool. After `Enter` or `Space` holds one, the focus leaves the card, so the map cursor's
 * `Enter` uses the tool (as with a content card). Panel cards keep the focus: their panel takes it.
 */
const MAP_TOOL_CARDS: ReadonlySet<string> = new Set(['footpath', 'queue', 'pathItems', 'scenery', 'land', 'water', 'buyLand']);

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
      onclick: (e: Event) => {
        if (held) {
          putBack(ctx, def);
          return;
        }
        def.onClick(ctx);
        if ((e as MouseEvent).detail === 0 && MAP_TOOL_CARDS.has(def.id) && def.pressed(ctx) && document.activeElement === card) card.blur();
      },
    },
    h('span', { class: 'tool-card-art', 'aria-hidden': 'true' }, def.icon()),
    h('span', { class: 'tool-card-label', text: def.label }),
  );
  const wrap = h('div', { class: 'card-wrap' }, card);
  putBackButton(wrap, () => putBack(ctx, def));
  return {
    def,
    wrap,
    card,
    update() {
      const on = def.pressed(ctx);
      if (on === held) return;
      held = on;
      setHeld(wrap, on);
    },
  };
}

/** The zone name of a card: Chill, Family, Thrill, or the stall kind. */
export function zoneName(kind: CardSpec['kind'], zone: string): string {
  return text(kind === 'stall' ? `ui.kind.${zone}` : `ui.tag.${zone}`);
}

/** Preview size in CSS px: big enough for a card at 150 % text scale. */
const PREVIEW_W = 168;
const PREVIEW_H = 120;

/** Drawn previews by id and device pixel ratio. */
const previews = new Map<string, HTMLCanvasElement>();

function newCanvas(dpr: number): HTMLCanvasElement {
  return h('canvas', { class: 'card-preview', width: Math.round(PREVIEW_W * dpr), height: Math.round(PREVIEW_H * dpr), 'aria-hidden': 'true' });
}

/**
 * The preview picture of a card. The picture is drawn one time per id and device pixel ratio (`drawPreview` or
 * `drawTrackPreview`); each call gives a new canvas with a copy of it.
 */
export function previewCanvas(spec: CardSpec): HTMLCanvasElement {
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const key = `${spec.id}@${dpr}`;
  let source = previews.get(key);
  if (!source) {
    source = newCanvas(dpr);
    const g = source.getContext('2d');
    if (g) {
      g.scale(dpr, dpr);
      try {
        if (spec.kind === 'track') drawTrackPreview(g, spec.id, PREVIEW_W, PREVIEW_H);
        else drawPreview(g, spec.id, PREVIEW_W, PREVIEW_H);
      } catch (e) {
        console.warn('card preview failed', spec.id, e);
      }
    }
    previews.set(key, source);
  }
  const copy = newCanvas(dpr);
  copy.getContext('2d')?.drawImage(source, 0, 0);
  return copy;
}

/** A comma of zero size between the parts of a card: screen readers pause there (Phase 6 §4.7). */
const sep = (): HTMLElement => h('span', { class: 'name-sep', text: ',' });

/**
 * A ride or stall card (`div.card-wrap`). Its accessible name is its visible text: zone, name, then the cost, or
 * "From {cost}" and "Track" for a track ride. `setHeld` shows it held.
 */
export function contentCard(ctx: UiContext, spec: CardSpec): HTMLElement {
  const cost = formatMoney(spec.cost);
  const price =
    spec.kind === 'track'
      ? [h('span', { class: 'card-cost', text: text('ui.card.from', { cost }) }), sep(), h('span', { class: 'card-track', text: text('ui.card.track') })]
      : [h('span', { class: 'card-cost', text: cost })];
  const card = h(
    'button',
    {
      type: 'button',
      class: 'card content-card',
      'data-def': spec.id,
      'data-kind': spec.kind,
      'data-zone': spec.zone,
      'data-testid': `card-${spec.id}`,
      'aria-pressed': 'false',
    },
    h('span', { class: 'card-band' }, zoneName(spec.kind, spec.zone), sep()),
    previewCanvas(spec),
    h('span', { class: 'card-name' }, spec.name, sep()),
    h('span', { class: 'card-price-row' }, ...price),
  );
  // A mouse or a pen drags a flat ride or stall card to the map (§4.6). The drag comes before the press: it drops the
  // click that follows a drag.
  attachCardDrag(ctx, card, spec);
  card.addEventListener('click', (e) => {
    if (heldCardId(ctx.game.tool) === spec.id) {
      selectTool(ctx, 'inspect');
      return;
    }
    holdCard(ctx, spec);
    // Phase 7 §4.10: after `Enter` or `Space` holds the card, the map cursor's `Enter` places it, so the focus
    // leaves the card (as it left the closed picker before).
    if (e.detail === 0) card.blur();
  });
  const wrap = h('div', { class: 'card-wrap' }, card);
  // Put back on a held ride or stall card selects Inspect.
  putBackButton(wrap, () => selectTool(ctx, 'inspect'));
  return wrap;
}
