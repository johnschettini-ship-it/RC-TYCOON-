/**
 * Scenery tool (Phase 4 §7): toolbar button, theme tabs and item grid (locked themes marked), Rotate / Confirm and
 * the Repeat toggle, Remove, the ghost reason with an icon. Owner: W3-D. Registered in `../extensions.ts`.
 * Desktop: click places, Shift-click keeps the tool, `R` rotates. Touch: tap moves the ghost, Confirm places, Repeat
 * keeps the tool.
 */
import { text } from '../../data/strings/en';
import { noteShift } from '../../input/scenery';
import type { Game } from '../../game';
import type { UiContext } from '../context';
import type { UiExtension, UiPart } from '../extensions';
import { h } from '../dom';
import { createPicker, type Picker } from './picker';
import { createStatusBar } from './status';
import { injectSceneryStyles } from './style';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Toolbar icon: an original line drawing of a round tree and a flower (24 × 24). */
function treeIcon(): Element {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', 'icon');
  const path = (d: string, fill = false): void => {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('fill', fill ? 'currentColor' : 'none');
    p.setAttribute('stroke', 'currentColor');
    p.setAttribute('stroke-width', '2');
    p.setAttribute('stroke-linecap', 'round');
    p.setAttribute('stroke-linejoin', 'round');
    svg.append(p);
  };
  path('M9 21 V14 M5 11 A4.5 4.5 0 0 1 9 4 A4.5 4.5 0 0 1 13.5 9.5 A3.5 3.5 0 0 1 9 14 A3.5 3.5 0 0 1 5 11 Z');
  path('M18 21 V16 M18 16 A2 2 0 1 1 18.01 16 M3 21 H21');
  return svg;
}

/** Picker of each mounted UI (one per game). */
const pickers = new WeakMap<Game, Picker>();

function openTool(ctx: UiContext): void {
  const t = ctx.game.tool;
  const picker = pickers.get(ctx.game);
  if (t.tool === 'scenery') {
    if (picker?.isOpen()) picker.close();
    else picker?.open();
    return;
  }
  t.tool = 'scenery';
  t.defId = null;
  t.ghost = null;
  t.drag = null;
  picker?.open();
}

export const sceneryUi: UiExtension = {
  toolbar: [
    {
      id: 'scenery',
      get label() {
        return text('scenery.tool');
      },
      icon: treeIcon,
      onClick: (ctx) => openTool(ctx),
      pressed: (ctx) => ctx.game.tool.tool === 'scenery',
    },
  ],
  bars(ctx: UiContext): UiPart {
    injectSceneryStyles();
    const picker = createPicker(ctx);
    pickers.set(ctx.game, picker);
    const status = createStatusBar(ctx, () => picker.open());
    const el = h('div', { class: 'scn-layer' }, picker.el, status.el);
    // Gesture actions carry no modifier keys: note Shift at every press for "Shift-click keeps the tool".
    window.addEventListener('pointerdown', (e) => noteShift(ctx.game.tool, e.shiftKey), { capture: true });
    return {
      el,
      update() {
        const on = ctx.game.tool.tool === 'scenery';
        if (!on && picker.isOpen()) picker.close();
        picker.update();
        // Phones: the open sheet covers the bottom; the status bar comes back with Items closed.
        status.update(on && !(picker.isOpen() && ctx.root.dataset.layout === 'bottom'));
      },
    };
  },
};
