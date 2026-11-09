/**
 * Path height mini-bar (Phase 4 §7): + / − height and the ramp toggle (flat, up, down) while the footpath or queue
 * tool is active. Owner: W3-B. Registered in `../extensions.ts`. Desktop: `Page Up` / `Page Down` do the same as
 * + / −. Touch: the buttons are 44 × 44 px. It floats above the tool status bar (cost and ghost state).
 */
import { text } from '../../data/strings/en';
import { changePathHeight, pathHeightRange } from '../../input/pathHeight';
import type { RampMode } from '../../sim/commands/types';
import type { UiContext } from '../context';
import type { UiExtension, UiPart } from '../extensions';
import { h, setAttr, setText } from '../dom';
import { segmented } from '../management/widgets';

/** Distance of the bar above the tool status bar's bottom edge. */
const ABOVE_STATUS = '76px';

function heightLabel(z: number | null, ground: number): string {
  if (z === null) return text('paths.ground');
  return `${text('paths.metres', { n: z })} · ${text('paths.aboveGround', { n: z - ground })}`;
}

export function createPathHeightBar(ctx: UiContext): UiPart {
  const { game } = ctx;
  const value = h('span', { class: 'status-detail', 'data-testid': 'path-height-value', 'aria-live': 'polite' });
  const lower = h(
    'button',
    {
      type: 'button',
      class: 'btn',
      'aria-label': text('paths.lower'),
      title: `${text('paths.lower')} (Page Down)`,
      'data-testid': 'path-height-down',
      onclick: () => changePathHeight(game.tool, game.world, -1),
    },
    h('span', { text: '−', 'aria-hidden': 'true' }),
  );
  const raise = h(
    'button',
    {
      type: 'button',
      class: 'btn',
      'aria-label': text('paths.raise'),
      title: `${text('paths.raise')} (Page Up)`,
      'data-testid': 'path-height-up',
      onclick: () => changePathHeight(game.tool, game.world, 1),
    },
    h('span', { text: '+', 'aria-hidden': 'true' }),
  );
  const ramp = segmented<RampMode>(
    text('paths.ramp'),
    [
      { value: 'flat', label: text('paths.rampFlat'), testId: 'path-ramp-flat' },
      { value: 'up', label: text('paths.rampUp'), testId: 'path-ramp-up' },
      { value: 'down', label: text('paths.rampDown'), testId: 'path-ramp-down' },
    ],
    (m) => {
      game.tool.pathHeight.ramp = m;
    },
    'compact',
  );
  const el = h(
    'div',
    {
      class: 'tool-status path-height-bar',
      role: 'region',
      'aria-label': text('paths.bar'),
      'data-testid': 'path-height-bar',
      hidden: true,
      style: `bottom: calc(${ABOVE_STATUS} + var(--toolbar-space, 0px) + var(--safe-bottom, 0px))`,
    },
    h('div', { class: 'status-line' }, h('span', { class: 'status-texts' }, h('span', { class: 'status-text', text: text('paths.height') }), value)),
    h('div', { class: 'status-actions wrap' }, lower, raise, ramp.el),
  );
  return {
    el,
    update() {
      const t = game.tool;
      const on = t.tool === 'footpath' || t.tool === 'queue';
      if (el.hidden === on) el.hidden = !on;
      if (!on) return;
      const map = game.world.state.map;
      const ref = t.drag ? t.drag.startTile : t.hoverTile;
      const tile = ref !== null && ref >= 0 && ref < map.width * map.height ? ref : map.entranceTile;
      const ground = tile >= 0 ? (map.heights[tile] as number) : 0;
      setText(value, heightLabel(t.pathHeight.z, ground));
      const { max } = pathHeightRange(game.world, tile >= 0 ? tile : 0);
      lower.toggleAttribute('disabled', t.pathHeight.z === null);
      raise.toggleAttribute('disabled', t.pathHeight.z !== null && t.pathHeight.z >= max);
      ramp.set(t.pathHeight.ramp);
      // Ramps apply to elevated lines only; ground paths follow the land.
      for (const b of ramp.buttons) b.toggleAttribute('disabled', t.pathHeight.z === null);
      setAttr(el, 'data-height', t.pathHeight.z === null ? 'ground' : String(t.pathHeight.z));
    },
  };
}

export const pathHeightUi: UiExtension = {
  bars: (ctx) => createPathHeightBar(ctx),
};
