/**
 * Tool status bar: ghost state (icon + colour + text), path cost before release,
 * and Rotate / Confirm / Cancel for placement on touch and desktop (Phase 1 §4.1). Owner: W1-B.
 * Phase 7 §4.6: on the phone, while a ride or stall card is held, a Details button opens the card details panel.
 */
import { getFlatRideDef, getStallDef } from '../data/catalog';
import { text } from '../data/strings/en';
import { contentName } from './contentName';
import { localizeReason } from '../i18n';
import type { Dir } from '../sim/map';
import type { UiContext } from './context';
import { heldCardId } from './decks/model';
import { h, setText, toggleClass } from './dom';
import { formatMoney } from './format';
import { icon } from './icons';

export function createToolStatus(ctx: UiContext): { el: HTMLElement; update(): void } {
  const { game } = ctx;
  const okIcon = icon('check', 'icon state-icon ok');
  const badIcon = icon('cross', 'icon state-icon bad');
  const msg = h('span', { class: 'status-text', 'data-testid': 'tool-status' });
  const detail = h('span', { class: 'status-detail', 'data-testid': 'tool-status-detail' });
  const cancelTool = (): void => {
    const t = game.tool;
    t.tool = 'inspect';
    t.defId = null;
    t.ghost = null;
    t.drag = null;
  };
  const rotate = h(
    'button',
    {
      type: 'button',
      class: 'btn',
      'aria-label': text('ui.status.rotate'),
      onclick: () => {
        game.tool.rotation = ((game.tool.rotation + 1) % 4) as Dir;
      },
    },
    icon('rotate'),
    h('span', { text: text('ui.status.rotate') }),
  );
  const confirm = h(
    'button',
    {
      type: 'button',
      class: 'btn primary',
      'aria-label': text('ui.status.confirm'),
      onclick: () => {
        const g = game.tool.ghost;
        if (!g) return;
        const w = game.world.state.map.width;
        const x = g.tile % w;
        const y = Math.floor(g.tile / w);
        if (g.kind === 'ride') game.dispatch({ type: 'placeRide', defId: g.defId, x, y, rotation: g.rotation });
        else if (g.kind === 'stall') game.dispatch({ type: 'placeStall', defId: g.defId, x, y, rotation: g.rotation });
      },
    },
    icon('check'),
    h('span', { text: text('ui.status.confirm') }),
  );
  const cancel = h('button', { type: 'button', class: 'btn', 'aria-label': text('ui.status.cancel'), onclick: cancelTool }, icon('cross'), h('span', { text: text('ui.status.cancel') }));
  const details = h('button', { type: 'button', class: 'btn status-details', 'data-testid': 'status-details', hidden: true, text: text('ui.card.details'), onclick: () => ctx.openPanel('cardDetails') });
  const el = h(
    'div',
    { class: 'tool-status', role: 'region', 'aria-label': text('ui.status.label'), hidden: true },
    h('div', { class: 'status-line', 'aria-live': 'polite' }, okIcon, badIcon, h('span', { class: 'status-texts' }, msg, detail)),
    details,
    h('div', { class: 'status-actions' }, rotate, confirm, cancel),
  );

  return {
    el,
    update() {
      const t = game.tool;
      const place = t.tool === 'placeRide' || t.tool === 'placeStall';
      const path = t.tool === 'footpath' || t.tool === 'queue';
      const visible = place || path || t.tool === 'demolish';
      if (el.hidden === visible) el.hidden = !visible;
      if (!visible) return;
      rotate.hidden = !place;
      confirm.hidden = !place;
      // Desktop opens the card details panel by itself; the phone opens it from here.
      const showDetails = place && ctx.root.dataset.layout === 'bottom' && heldCardId(t) !== null;
      if (details.hidden === showDetails) details.hidden = !showDetails;
      let valid: boolean | null = null;
      if (place) {
        const g = t.ghost;
        const def = t.defId ? (t.tool === 'placeRide' ? getFlatRideDef(t.defId) : getStallDef(t.defId)) : undefined;
        const name = def ? contentName(def.id) : '';
        setText(msg, def ? text('ui.status.placeCost', { name, cost: formatMoney(def.buildCost) }) : '');
        if (g) {
          valid = g.valid;
          setText(detail, g.valid ? text('ui.ghost.valid') : localizeReason(g.reason ?? ''));
        } else {
          setText(detail, '');
        }
        confirm.toggleAttribute('disabled', !g);
      } else if (path) {
        const d = t.drag;
        setText(msg, text(t.tool === 'footpath' ? 'ui.tool.footpath' : 'ui.tool.queue'));
        // The cost and the refusal come from the build command's dry run (`pathLinePreview`).
        if (d?.reason) {
          valid = false;
          setText(detail, localizeReason(d.reason));
        } else if (d) setText(detail, d.tiles.length === 1 ? text('ui.status.pathTile', { cost: formatMoney(d.cost) }) : text('ui.status.pathTiles', { count: d.tiles.length, cost: formatMoney(d.cost) }));
        else setText(detail, text('ui.status.pathHint'));
      } else {
        setText(msg, text('ui.tool.demolish'));
        setText(detail, text('ui.status.demolishHint'));
      }
      okIcon.style.display = valid === true ? '' : 'none';
      badIcon.style.display = valid === false ? '' : 'none';
      toggleClass(el, 'valid', valid === true);
      toggleClass(el, 'invalid', valid === false);
    },
  };
}
