/**
 * Card details panel (Phase 7 §4.7): the data of the held ride or stall card. It takes the place of the stat lines of
 * the old picker cards. On desktop it opens when a card becomes the held card; on the phone the Details button opens it.
 */
import { getFlatRideDef, getStallDef, getTrackRideDef } from '../../data/catalog';
import { text } from '../../data/strings/en';
import { getTrackTypeDef } from '../../data/track';
import type { Game } from '../../game';
import type { PanelView, UiContext } from '../context';
import { previewCanvas, zoneName } from '../decks/card';
import { heldCardId, rideCards, stallCards, type CardSpec } from '../decks/model';
import { h, setText } from '../dom';
import { formatMoney, formatPrice, formatRating } from '../format';

export interface DetailRow {
  /** String id of the label. A track ride row is one complete string of the old track card: `value` is its text. */
  labelId: string;
  value: string;
}

/** The data rows of a card, in panel order. Pure. An id that is not in the catalog has no rows. */
export function cardDetailRows(spec: CardSpec): DetailRow[] {
  if (spec.kind === 'flat') {
    const def = getFlatRideDef(spec.id);
    if (!def) return [];
    return [
      { labelId: 'ui.details.seats', value: String(def.capacity) },
      { labelId: 'ui.stat.excitement', value: formatRating(def.excitement) },
      { labelId: 'ui.stat.intensity', value: formatRating(def.intensity) },
      { labelId: 'ui.stat.nausea', value: formatRating(def.nausea) },
      { labelId: 'ui.details.ticket', value: formatPrice(def.defaultPrice) },
      { labelId: 'ui.details.running', value: formatMoney(def.runningCostMonthly) },
      { labelId: 'ui.details.size', value: text('ui.details.sizeValue', { w: def.w, d: def.d }) },
    ];
  }
  if (spec.kind === 'stall') {
    const def = getStallDef(spec.id);
    if (!def) return [];
    return [
      { labelId: 'ui.stall.kind', value: text(`ui.kind.${def.kind}`) },
      { labelId: 'ui.details.ticket', value: formatPrice(def.defaultPrice) },
      { labelId: 'ui.details.running', value: formatMoney(def.runningCostMonthly) },
    ];
  }
  // The four lines of the old track card, in its order: drive, maximum height, seats per car, "From" cost; then the
  // climb above which the ride counts as more intense (R2, owner 2026-11-12).
  const type = getTrackTypeDef(spec.id);
  if (!type) return [];
  const line = (labelId: string, params?: Record<string, string | number>): DetailRow => ({ labelId, value: text(labelId, params) });
  return [
    line(`ui.track.drive.${getTrackRideDef(spec.id)?.drive ?? type.drive}`),
    line('ui.track.maxHeight', { n: type.maxHeightM }),
    line('ui.track.seats', { n: type.vehicle.seatsPerCar }),
    line('ui.track.from', { cost: formatMoney(spec.cost) }),
    line('ui.track.intensityFrom', { n: type.intensityHeightM }),
  ];
}

/**
 * The hint under the data: the steps that place the held card. Desktop: a flat ride or stall card is dragged, or pressed
 * and then the map is pressed; a track ride card cannot be dragged, and a click on the map places its station (then the
 * builder adds the pieces). Phone: a tap only moves the ghost and Confirm builds.
 */
export function detailsHintId(kind: CardSpec['kind'], layout: 'side' | 'bottom'): string {
  if (layout === 'bottom') return kind === 'track' ? 'ui.details.hintPhoneTrack' : 'ui.details.hintPhone';
  return kind === 'track' ? 'ui.details.hintDesktopTrack' : 'ui.details.hintDesktop';
}

/** The ride or stall card that the tool holds, or null (no card held, or the held id has no card in the hand). */
export function heldCard(game: Pick<Game, 'tool' | 'world'>): CardSpec | null {
  const id = heldCardId(game.tool);
  if (id === null) return null;
  const cards = game.tool.tool === 'placeStall' ? stallCards(game.world) : rideCards(game.world);
  return cards.find((c) => c.id === id) ?? null;
}

export function createCardDetailsPanel(ctx: UiContext): PanelView {
  const { game } = ctx;
  const spec = heldCard(game);
  const hint = h('p', { class: 'details-hint' });
  const body = h('div', { class: 'panel-content card-details' });
  if (spec) {
    const rows = cardDetailRows(spec);
    // The "From" row of a track ride is its build cost: it shows one time, as the cost.
    const from = rows.find((r) => r.labelId === 'ui.track.from');
    const list = rows.filter((r) => r !== from);
    body.append(
      h(
        'div',
        { class: 'details-top' },
        previewCanvas(spec),
        h(
          'div',
          { class: 'details-meta' },
          h('span', { class: 'chip details-zone', 'data-zone': spec.zone, text: zoneName(spec.kind, spec.zone) }),
          h('span', { class: 'details-cost', text: from?.value ?? formatMoney(spec.cost) }),
        ),
      ),
      // A track ride row is a complete line of text; a flat ride or stall row is a label and its value.
      spec.kind === 'track'
        ? h('ul', { class: 'details-lines', role: 'list' }, ...list.map((r) => h('li', { text: r.value })))
        : h('dl', { class: 'details-rows' }, ...list.map((r) => h('div', { class: 'row' }, h('dt', { class: 'row-label', text: text(r.labelId) }), h('dd', { class: 'row-value', text: r.value })))),
      hint,
    );
  }
  return {
    kind: 'cardDetails',
    id: null,
    title: spec?.name ?? '',
    body,
    update() {
      // The panel shows one card: it closes when that card is not the held card any more.
      if (!spec || heldCardId(game.tool) !== spec.id) return false;
      setText(hint, text(detailsHintId(spec.kind, ctx.root.dataset.layout === 'bottom' ? 'bottom' : 'side')));
      return true;
    },
  };
}
