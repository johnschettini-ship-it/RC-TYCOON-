/**
 * Ride and stall pickers (Phase 1 §7): cards with a sprite preview, name, tag colour,
 * excitement/intensity/nausea bars, and cost. Only unlocked items are listed. Owner: W1-B.
 */
import { FLAT_RIDES, STALLS, type FlatRideDef, type StallDef } from '../../data/catalog';
import { text } from '../../data/strings/en';
import { contentName } from '../contentName';
import { drawPreview } from '../../render/renderer';
import { isUnlocked } from '../../sim/research/api';
import type { PanelView, UiContext } from '../context';
import { h } from '../dom';
import { formatMoney, formatPrice, formatRating } from '../format';
import { ridePickerTabs } from '../track/picker';

const PREVIEW_W = 112;
const PREVIEW_H = 80;

function preview(defId: string): HTMLCanvasElement {
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const c = h('canvas', { class: 'card-preview', width: Math.round(PREVIEW_W * dpr), height: Math.round(PREVIEW_H * dpr), 'aria-hidden': 'true' });
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.scale(dpr, dpr);
    try {
      drawPreview(ctx, defId, PREVIEW_W, PREVIEW_H);
    } catch (e) {
      console.warn('drawPreview failed', defId, e);
    }
  }
  return c;
}

function miniBar(label: string, hundredths: number): HTMLElement {
  const fill = h('i');
  fill.style.width = `${Math.min(100, hundredths / 10)}%`;
  return h('div', { class: 'mini-bar' }, h('span', { class: 'mini-label', text: label }), h('span', { class: 'mini-track' }, fill), h('span', { class: 'mini-value', text: formatRating(hundredths) }));
}

/**
 * Phase 6 §4.7: a card's accessible name is its visible text ("Carousel, Family Excitement 2.50 … $1,200"), so
 * speech input users can say what they see. A comma after the name (`.name-sep`, zero size) gives screen readers a
 * pause.
 */
const cardTitle = (name: string): HTMLElement => h('span', { class: 'card-name' }, name, h('span', { class: 'name-sep', text: ',' }));

function rideCard(ctx: UiContext, def: FlatRideDef): HTMLElement {
  const tag = text(`ui.tag.${def.tag}`);
  const cost = formatMoney(def.buildCost);
  const stats: Array<[string, number]> = [
    [text('ui.stat.excitement'), def.excitement],
    [text('ui.stat.intensity'), def.intensity],
    [text('ui.stat.nausea'), def.nausea],
  ];
  return h(
    'button',
    {
      type: 'button',
      class: `card tag-${def.tag}`,
      'data-def': def.id,
      onclick: () => choose(ctx, 'placeRide', def.id),
    },
    preview(def.id),
    cardTitle(contentName(def.id)),
    h('span', { class: 'tag-chip', text: tag }),
    ...stats.map(([l, v]) => miniBar(l, v)),
    h('span', { class: 'card-cost', text: cost }),
  );
}

function stallCard(ctx: UiContext, def: StallDef): HTMLElement {
  const kind = text(`ui.kind.${def.kind}`);
  const cost = formatMoney(def.buildCost);
  const price = text('ui.picker.price', { price: formatPrice(def.defaultPrice) });
  return h(
    'button',
    {
      type: 'button',
      class: `card kind-${def.kind}`,
      'data-def': def.id,
      onclick: () => choose(ctx, 'placeStall', def.id),
    },
    preview(def.id),
    cardTitle(contentName(def.id)),
    h('span', { class: 'tag-chip', text: kind }),
    h('span', { class: 'card-price', text: price }),
    h('span', { class: 'card-cost', text: cost }),
  );
}

function choose(ctx: UiContext, tool: 'placeRide' | 'placeStall', defId: string): void {
  const t = ctx.game.tool;
  t.tool = tool;
  t.defId = defId;
  t.ghost = null;
  t.drag = null;
  // Rides face the viewer with rotation 0 (front south); stalls with rotation 2 (service side south).
  t.rotation = tool === 'placeRide' ? 0 : 2;
  ctx.closePanel();
}

export function createPicker(ctx: UiContext, which: 'ridePicker' | 'stallPicker'): PanelView {
  const world = ctx.game.world;
  const cards =
    which === 'ridePicker'
      ? FLAT_RIDES.filter((d) => isUnlocked(world, d.id)).map((d) => rideCard(ctx, d))
      : STALLS.filter((d) => isUnlocked(world, d.id)).map((d) => stallCard(ctx, d));
  const content = h('div', { class: 'panel-content' }, cards.length ? h('div', { class: 'card-grid' }, ...cards) : h('p', { class: 'muted', text: text('ui.picker.empty') }));
  const body = which === 'ridePicker' ? ridePickerTabs(ctx, content) : content;
  return {
    kind: which,
    id: null,
    title: text(which === 'ridePicker' ? 'ui.picker.rides' : 'ui.picker.stalls'),
    body,
    update: () => true,
  };
}
