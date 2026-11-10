/**
 * View rotation and Buy Land (Phase 4 §4.8–4.9, §7). Owner: W3-G. Registered in `../extensions.ts`.
 * - HUD: two 44 × 44 rotate buttons (counter-clockwise, clockwise) on all devices; keys `[` and `]` do the same.
 * - Toolbar: the Buy Land tool button.
 * - Bar: while Buy Land is active, the hint or the total chip (tiles of land and rights, price, the reason when the
 *   rectangle cannot be bought), a legend of the ownership tints, and Confirm (touch rectangles) and Cancel.
 */
import { LAND_ERR } from '../../data/strings/land';
import { text } from '../../data/strings/en';
import { localizeReason } from '../../i18n';
import { rotateView } from '../../input/camera';
import { buyLandSelection, cancelBuyLand, confirmBuyLand } from '../../input/landPurchase';
import { buyLandQuote } from '../../sim/land/commands';
import type { UiContext } from '../context';
import { h, setText, toggleClass } from '../dom';
import type { ToolbarEntry, UiExtension, UiPart } from '../extensions';
import { formatMoney } from '../format';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** A 24 × 24 line icon (stroke `currentColor`), like `../icons.ts`. */
function lineIcon(d: string, flip = false): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', 'icon');
  const p = document.createElementNS(SVG_NS, 'path');
  p.setAttribute('d', d);
  p.setAttribute('fill', 'none');
  p.setAttribute('stroke', 'currentColor');
  p.setAttribute('stroke-width', '2');
  p.setAttribute('stroke-linecap', 'round');
  p.setAttribute('stroke-linejoin', 'round');
  if (flip) p.setAttribute('transform', 'translate(24 0) scale(-1 1)');
  svg.append(p);
  return svg;
}

/** Clockwise arrow around a diamond (a tile seen from above). */
const ROTATE_D = 'M19.5 12 A7.5 7.5 0 1 1 17 6.4 M19.5 3.5 V8.5 H14.5 M12 9 L15 12 L12 15 L9 12 Z';
/** A plot of land with a price tag. */
const BUY_LAND_D = 'M3 15 L12 10.5 L21 15 L12 19.5 Z M12 3.5 H18 V8.5 L15 11 L12 8.5 Z M15 6 V6.2';

function hud(ctx: UiContext): UiPart {
  const { game } = ctx;
  const turn = (dir: 1 | -1): void => rotateView(game.camera, game.world.state.map, dir);
  const left = h(
    'button',
    { type: 'button', class: 'speed-btn view-rotate', 'data-testid': 'view-rotate-left', 'aria-label': text('land.view.rotateLeft'), title: text('land.view.rotateLeft'), onclick: () => turn(-1) },
    lineIcon(ROTATE_D, true),
  );
  const right = h(
    'button',
    { type: 'button', class: 'speed-btn view-rotate', 'data-testid': 'view-rotate-right', 'aria-label': text('land.view.rotateRight'), title: text('land.view.rotateRight'), onclick: () => turn(1) },
    lineIcon(ROTATE_D),
  );
  const el = h('div', { class: 'speed view-rotation', role: 'group', 'aria-label': text('land.view.group') }, left, right);
  return { el, update() {} };
}

const buyLandEntry: ToolbarEntry = {
  id: 'buyLand',
  deck: 'scenery',
  get label() {
    return text('land.tool.buyLand');
  },
  icon: () => lineIcon(BUY_LAND_D),
  onClick(ctx) {
    const t = ctx.game.tool;
    t.tool = t.tool === 'buyLand' ? 'inspect' : 'buyLand';
    t.defId = null;
    t.ghost = null;
    t.drag = null;
  },
  pressed: (ctx) => ctx.game.tool.tool === 'buyLand',
};

function coarsePointer(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}

function swatch(colour: string, label: string): HTMLElement {
  return h(
    'span',
    { class: 'buy-legend-item', style: 'display:inline-flex;align-items:center;gap:4px;font-size: calc(12px * var(--ts, 1));color:var(--muted)' },
    h('i', { 'aria-hidden': 'true', style: `display:inline-block;width:12px;height:12px;border-radius:3px;background:${colour}` }),
    label,
  );
}

function bar(ctx: UiContext): UiPart {
  const { game } = ctx;
  const msg = h('span', { class: 'status-text', 'data-testid': 'buy-total' });
  const detail = h('span', { class: 'status-detail', 'data-testid': 'buy-detail' });
  const confirm = h(
    'button',
    { type: 'button', class: 'btn primary', 'data-testid': 'buy-confirm', 'aria-label': text('land.buy.confirm'), onclick: () => confirmBuyLand(game) },
    h('span', { text: text('land.buy.confirm') }),
  );
  const cancel = h(
    'button',
    {
      type: 'button',
      class: 'btn',
      'data-testid': 'buy-cancel',
      'aria-label': text('land.buy.cancel'),
      onclick: () => {
        if (buyLandSelection(game)) cancelBuyLand(game);
        else game.tool.tool = 'inspect';
      },
    },
    h('span', { text: text('land.buy.cancel') }),
  );
  const legend = h(
    'span',
    { class: 'buy-legend', style: 'display:flex;flex-wrap:wrap;gap:4px 10px' },
    swatch('rgb(255,214,82)', text('land.legend.forSale')),
    swatch('rgb(90,150,255)', text('land.legend.rightsForSale')),
  );
  const el = h(
    'div',
    { class: 'tool-status buy-land-bar', role: 'region', 'aria-label': text('land.buy.label'), 'data-testid': 'buy-land-bar', hidden: true },
    h('div', { class: 'status-line', 'aria-live': 'polite' }, h('span', { class: 'status-texts' }, msg, detail, legend)),
    h('div', { class: 'status-actions' }, confirm, cancel),
  );
  return {
    el,
    update() {
      const t = game.tool;
      const visible = t.tool === 'buyLand';
      if (el.hidden === visible) el.hidden = !visible;
      if (!visible) return;
      const sel = buyLandSelection(game);
      const b = t.brush;
      let valid: boolean | null = null;
      if (b && sel) {
        const q = buyLandQuote(game.world.state, sel.x0, sel.y0, sel.x1, sel.y1);
        setText(msg, q.land + q.rights > 0 ? text('land.buy.total', { land: q.land, rights: q.rights, cost: formatMoney(q.cost) }) : localizeReason(LAND_ERR.nothingToBuy));
        setText(detail, localizeReason(b.reason ?? ''));
        valid = b.valid;
      } else if (b && b.cost > 0) {
        // Desktop hover: the tile under the cursor.
        setText(msg, formatMoney(b.cost));
        setText(detail, b.reason ? localizeReason(b.reason) : text('land.buy.hint'));
        valid = b.valid;
      } else {
        setText(msg, text('land.tool.buyLand'));
        setText(detail, coarsePointer() ? text('land.buy.hintTouch') : text('land.buy.hint'));
      }
      confirm.hidden = !sel?.pending;
      confirm.toggleAttribute('disabled', !(sel?.pending && b?.valid));
      toggleClass(el, 'valid', valid === true);
      toggleClass(el, 'invalid', valid === false);
    },
  };
}

export const viewUi: UiExtension = {
  toolbar: [buyLandEntry],
  hud,
  bars: bar,
};
