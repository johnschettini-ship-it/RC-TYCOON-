/**
 * Overlays (Phase 4 §7): the overlay chip row (None, Calm, Buzz, Light, Temperament), the legend card with the 4 band
 * names and thresholds, and the exact value of the tapped or hovered tile (Light legend data from W3-F's
 * `render/lighting`). Owner: W3-E. Registered in `../extensions.ts`.
 *
 * Desktop: `V` cycles the overlays (`src/input/overlays.ts`); the legend sits in the bottom-left corner beside the
 * toolbar. Touch: the Overlays card opens the chip row; the legend is a small card under the HUD.
 * Every button is at least 44 × 44 CSS px with a text label. Data and text: `./legend.ts`.
 */
import { text } from '../../data/strings/en';
import { setOverlay } from '../../input/overlays';
import { LEGEND_GROUND } from '../../render/fields/style';
import type { OverlayId } from '../../render/types';
import type { UiContext } from '../context';
import { h, setAttr, setText } from '../dom';
import type { UiExtension, UiPart } from '../extensions';
import { legendFor, overlayChips, overlayName, tileValueText, type Legend, type LegendRow } from './legend';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Chip row open per UI root (the Overlays card and the legend card share it). */
const chipsOpen = new WeakMap<UiContext, boolean>();

/** The overlay chip row is open (the tip bubble hides while it is, Phase 7 §4.8). */
export function overlayChipsOpen(ctx: UiContext): boolean {
  return chipsOpen.get(ctx) === true;
}

function coarsePointer(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}

const STYLE_ID = 'tc-overlay-styles';
const CSS = `
.tc-overlay-card { position: absolute; pointer-events: none; display: flex; flex-direction: column; gap: 8px; max-width: min(300px, calc(100% - 20px)); }
#ui[data-layout='side'] .tc-overlay-card { left: calc(var(--deck-w) + 30px + var(--safe-left)); bottom: calc(max(var(--toolbar-space), var(--safe-bottom)) + 16px); }
#ui[data-layout='bottom'] .tc-overlay-card { right: calc(8px + var(--safe-right)); top: calc(var(--hud-bottom) + 8px); max-width: min(260px, calc(100% - 16px)); }
.tc-overlay-box { pointer-events: auto; background: var(--surface); border: var(--outline); border-radius: var(--radius-surface); box-shadow: var(--shadow); padding: 8px 10px; }
.tc-overlay-chips { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
/* 44 × 44 touch targets (a later \`.btn.small\` rule shrinks small buttons to 36 px). */
.tc-overlay-box .btn.small { min-height: var(--touch); min-width: var(--touch); padding: 4px 10px; font-size: calc(13px * var(--ts, 1)); }
.tc-overlay-legend h3 { margin: 0 0 6px; font-size: calc(14px * var(--ts, 1)); }
.tc-legend-rows { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; font-size: calc(13px * var(--ts, 1)); }
.tc-legend-rows li { display: flex; align-items: center; gap: 8px; }
.tc-legend-range { color: var(--muted-ink); margin-left: auto; padding-left: 8px; }
.tc-legend-value { margin: 8px 0 0; font-weight: 600; font-size: calc(13px * var(--ts, 1)); }
.tc-legend-help { margin: 4px 0 0; font-size: calc(12px * var(--ts, 1)); color: var(--muted-ink); }
#ui[data-layout='bottom'] .tc-legend-help { display: none; }
.tc-swatch { width: 28px; height: 16px; flex: none; border-radius: 3px; border: 1px solid var(--ink); }
`;

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.append(style);
}

function svgEl(tag: string, attrs: Record<string, string | number>): SVGElement {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

/** Overlays card icon: three stacked map layers. */
function overlaysIcon(): Element {
  const svg = svgEl('svg', { viewBox: '0 0 24 24', class: 'icon', 'aria-hidden': 'true', focusable: 'false' });
  svg.append(
    svgEl('path', { d: 'M12 3.5 L21 8 L12 12.5 L3 8 Z M3 12 L12 16.5 L21 12 M3 16 L12 20.5 L21 16', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linejoin': 'round' }),
  );
  return svg;
}

/** Legend swatch: the ground, the band tint, and its hatch lines (Calm one way, Buzz the other). */
function swatch(row: LegendRow): Element {
  const svg = svgEl('svg', { viewBox: '0 0 28 16', class: 'tc-swatch', 'aria-hidden': 'true', focusable: 'false' });
  if (row.hatchDir !== null) svg.append(svgEl('rect', { x: 0, y: 0, width: 28, height: 16, fill: LEGEND_GROUND }));
  if (row.fill !== null) svg.append(svgEl('rect', { x: 0, y: 0, width: 28, height: 16, fill: row.fill }));
  for (let m = 1; m <= row.hatch; m++) {
    const x = (28 * m) / (row.hatch + 1);
    const line = row.hatchDir === 'calm' ? { x1: x - 8, y1: 0, x2: x + 8, y2: 16 } : { x1: x + 8, y1: 0, x2: x - 8, y2: 16 };
    svg.append(svgEl('line', { ...line, stroke: row.stroke ?? '#000', 'stroke-width': 1.5 }));
  }
  return svg;
}

function legendRows(legend: Legend): HTMLElement[] {
  return legend.rows.map((row) =>
    h('li', { 'data-band': row.key }, swatch(row), h('span', { text: row.name }), ' ', h('span', { class: 'tc-legend-range', text: row.range })),
  );
}

function createOverlayCard(ctx: UiContext): UiPart {
  ensureStyles();
  const { game } = ctx;
  const chips = overlayChips().map((c) =>
    h('button', {
      type: 'button',
      class: 'btn small',
      text: c.label,
      'data-overlay': c.id,
      'data-testid': `overlay-chip-${c.id}`,
      'aria-pressed': 'false',
      onclick: () => setOverlay(game.tool, c.id),
    }),
  );
  const close = h('button', {
    type: 'button',
    class: 'btn small',
    text: '×',
    'aria-label': text('fields.overlays.close'),
    title: text('fields.overlays.close'),
    'data-testid': 'overlay-close',
    onclick: () => chipsOpen.set(ctx, false),
  });
  const chipRow = h('div', { class: 'tc-overlay-box tc-overlay-chips', role: 'group', 'aria-label': text('fields.overlays.chips'), 'data-testid': 'overlay-chips', hidden: true }, ...chips, close);

  const title = h('h3', { 'data-testid': 'overlay-legend-title' });
  const rows = h('ul', { class: 'tc-legend-rows', 'data-testid': 'overlay-legend-rows' });
  const value = h('p', { class: 'tc-legend-value', 'aria-live': 'polite', 'data-testid': 'overlay-value' });
  const help = h('p', { class: 'tc-legend-help' });
  const legendBox = h('section', { class: 'tc-overlay-box tc-overlay-legend', role: 'region', 'data-testid': 'overlay-legend', hidden: true }, title, rows, value, help);
  const el = h('div', { class: 'tc-overlay-card' }, chipRow, legendBox);

  const touch = coarsePointer();
  let shown: OverlayId | null = null;
  return {
    el,
    update() {
      const open = chipsOpen.get(ctx) === true;
      if (chipRow.hidden === open) chipRow.hidden = !open;
      const overlay = game.tool.overlay;
      for (const b of chips) setAttr(b, 'aria-pressed', b.dataset.overlay === overlay ? 'true' : 'false');
      const legend = legendFor(overlay);
      if (legend === null) {
        if (!legendBox.hidden) legendBox.hidden = true;
        shown = null;
        return;
      }
      if (shown !== overlay) {
        shown = overlay;
        setText(title, legend.title);
        setAttr(legendBox, 'aria-label', text('fields.legend.label', { overlay: overlayName(overlay) }));
        rows.replaceChildren(...legendRows(legend));
        setText(help, legend.help);
      }
      if (legendBox.hidden) legendBox.hidden = false;
      const t = game.tool;
      const v = overlay === 'temperament' ? null : tileValueText(game.world, overlay, t.hoverTile ?? t.selectedTile);
      value.hidden = overlay === 'temperament';
      setText(value, v ?? text(touch ? 'fields.value.hintTouch' : 'fields.value.hint'));
    },
  };
}

export const overlayUi: UiExtension = {
  toolbar: [
    {
      id: 'overlays',
      deck: 'manage',
      get label() {
        return text('fields.overlays');
      },
      icon: overlaysIcon,
      onClick: (ctx) => chipsOpen.set(ctx, chipsOpen.get(ctx) !== true),
      pressed: (ctx) => chipsOpen.get(ctx) === true,
    },
  ],
  bars: createOverlayCard,
};
