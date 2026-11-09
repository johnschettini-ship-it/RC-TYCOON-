/**
 * Ride and stall pickers (Phase 1 §7): cards with a sprite preview, name, tag colour,
 * excitement/intensity/nausea bars, and cost. Only unlocked items are listed. Owner: W1-B.
 */
import { FLAT_RIDES, STALLS, type FlatRideDef, type StallDef } from '../../data/catalog';
import { text } from '../../data/strings/en';
import { drawPreview } from '../../render/renderer';
import { isUnlocked } from '../../sim/research/api';
import type { PanelView, UiContext } from '../context';
import { h } from '../dom';
import { formatMoney, formatPrice, formatRating } from '../format';

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

function rideCard(ctx: UiContext, def: FlatRideDef): HTMLElement {
  const tag = text(`ui.tag.${def.tag}`);
  const cost = formatMoney(def.buildCost);
  return h(
    'button',
    {
      type: 'button',
      class: `card tag-${def.tag}`,
      'data-def': def.id,
      'aria-label': text('ui.picker.card', { name: def.name, tag, cost }),
      onclick: () => choose(ctx, 'placeRide', def.id),
    },
    preview(def.id),
    h('span', { class: 'card-name', text: def.name }),
    h('span', { class: 'tag-chip', text: tag }),
    miniBar(text('ui.stat.excitement'), def.excitement),
    miniBar(text('ui.stat.intensity'), def.intensity),
    miniBar(text('ui.stat.nausea'), def.nausea),
    h('span', { class: 'card-cost', text: cost }),
  );
}

function stallCard(ctx: UiContext, def: StallDef): HTMLElement {
  const kind = text(`ui.kind.${def.kind}`);
  const cost = formatMoney(def.buildCost);
  return h(
    'button',
    {
      type: 'button',
      class: `card kind-${def.kind}`,
      'data-def': def.id,
      'aria-label': text('ui.picker.card', { name: def.name, tag: kind, cost }),
      onclick: () => choose(ctx, 'placeStall', def.id),
    },
    preview(def.id),
    h('span', { class: 'card-name', text: def.name }),
    h('span', { class: 'tag-chip', text: kind }),
    h('span', { class: 'card-price', text: text('ui.picker.price', { price: formatPrice(def.defaultPrice) }) }),
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
  const body = h('div', { class: 'panel-content' }, cards.length ? h('div', { class: 'card-grid' }, ...cards) : h('p', { class: 'muted', text: text('ui.picker.empty') }));
  return {
    kind: which,
    id: null,
    title: text(which === 'ridePicker' ? 'ui.picker.rides' : 'ui.picker.stalls'),
    body,
    update: () => true,
  };
}
