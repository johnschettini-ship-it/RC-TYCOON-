/**
 * After Dark show UI (Phase 6 §4.4, §7). Owner: W4-C. Registered in `../extensions.ts`.
 *
 * - Toolbar: "Shows" opens the show site picker (2 sites; locked ones marked until the Scenery research unlocks them).
 * - Bars: the picker and the placement status bar (Rotate, Confirm, Sites, Done) of the `placeShowSite` tool.
 * - Panels: the show site panel (`panels.showSite`): schedule steppers, every-N-days picker, enabled switch, cost per
 *   show, last show watchers, total cost (commands `setShowSchedule`, `setShowEnabled`).
 * - Events: a `show` event `cancelled` toasts "Not enough cash for the show"; `announced` toasts the show time.
 */
import { getShowSiteDef } from '../../data/catalog';
import { text } from '../../data/strings/en';
import { contentName } from '../contentName';
import type { Game } from '../../game';
import { findShowSite } from '../../sim/shows/api';
import type { SimEvent } from '../../sim/types';
import type { UiContext } from '../context';
import { h } from '../dom';
import type { UiExtension, UiPart } from '../extensions';
import { createShowSitePanel } from './panel';
import { createShowPicker, type Picker } from './picker';
import { createShowStatusBar } from './status';
import { injectShowStyles } from './style';
import { tickTime } from './view';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Toolbar icon: an original line drawing of a firework burst over a launcher (24 × 24). */
function burstIcon(): Element {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', 'icon');
  const p = document.createElementNS(SVG_NS, 'path');
  p.setAttribute(
    'd',
    'M12 3 V6 M12 12 V9 M7 7.5 L9.2 9.2 M17 7.5 L14.8 9.2 M6 12.5 L8.8 11.6 M18 12.5 L15.2 11.6 M9 21 L12 15 L15 21 M8 21 H16',
  );
  p.setAttribute('fill', 'none');
  p.setAttribute('stroke', 'currentColor');
  p.setAttribute('stroke-width', '2');
  p.setAttribute('stroke-linecap', 'round');
  p.setAttribute('stroke-linejoin', 'round');
  svg.append(p);
  return svg;
}

/** Picker of each mounted UI (one per game). */
const pickers = new WeakMap<Game, Picker>();

function openTool(ctx: UiContext): void {
  const picker = pickers.get(ctx.game);
  if (!picker) return;
  if (picker.isOpen()) picker.close();
  else picker.open();
}

/** Toast text for a show event, or null. */
export function showEventToast(game: Game, ev: Extract<SimEvent, { type: 'show' }>): { message: string; kind: 'warning' | 'info' } | null {
  if (ev.phase === 'cancelled') return { message: text('shows.notEnoughCash'), kind: 'warning' };
  if (ev.phase !== 'announced') return null;
  const site = findShowSite(game.world, ev.siteId);
  const def = site ? getShowSiteDef(site.defId) : undefined;
  if (!site || !def) return null;
  return { message: text('shows.toast.announced', { name: contentName(def.id), time: tickTime(site.nextShowTick) }), kind: 'info' };
}

export const showsUi: UiExtension = {
  toolbar: [
    {
      id: 'shows',
      deck: 'rides',
      // Read when the toolbar mounts (after the locale is chosen), not when this module loads.
      get label(): string {
        return text('shows.tool');
      },
      icon: burstIcon,
      onClick: (ctx) => openTool(ctx),
      pressed: (ctx) => ctx.game.tool.tool === 'placeShowSite' || (pickers.get(ctx.game)?.isOpen() ?? false),
    },
  ],
  bars(ctx: UiContext): UiPart {
    injectShowStyles();
    const picker = createShowPicker(ctx);
    pickers.set(ctx.game, picker);
    const status = createShowStatusBar(ctx, () => picker.open());
    const el = h('div', { class: 'shw-layer' }, picker.el, status.el);
    return {
      el,
      update() {
        const placing = ctx.game.tool.tool === 'placeShowSite';
        picker.update();
        // Phones: the open sheet covers the bottom; the status bar comes back with the picker closed.
        status.update(placing && !(picker.isOpen() && ctx.root.dataset.layout === 'bottom'));
      },
    };
  },
  panels: {
    showSite: createShowSitePanel,
  },
  onEvents(ctx: UiContext, events: readonly SimEvent[]): void {
    for (const ev of events) {
      if (ev.type !== 'show') continue;
      const t = showEventToast(ctx.game, ev);
      if (t) ctx.toast(t.message, t.kind);
    }
  },
};
