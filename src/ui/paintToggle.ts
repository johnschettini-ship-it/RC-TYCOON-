/**
 * The "Drag paints" toggle of the drag tools (touch controls spec 2026-11-18 §2): patrol paint, land and water, buy
 * land, all with the same wording. Off (the default, and again whenever the tool changes), one finger moves the map and
 * a tap acts on one tile; on, a one-finger drag paints as before. A 44 px pressed-state button (`aria-pressed`) with a
 * small switch and "On" / "Off" beside its name, so it reads as a setting, not as the land tool's Paint mode.
 */
import { text } from '../data/strings/en';
import { dragPaints, setDragPaints } from '../input/dragPaint';
import type { ToolState } from '../render/types';
import { h, setAttr, setText } from './dom';

/** The tool hint for the toggle state: off, "One finger moves the map · <the tool's tap hint>"; on, the drag hint. */
export function dragHint(on: boolean, offHint: string): string {
  return on ? text('ui.hint.dragOn') : text('ui.hint.dragOff', { hint: offHint });
}

export function paintToggle(tool: ToolState, testId: string): { el: HTMLButtonElement; update(): void } {
  const state = h('span', { class: 'paint-toggle-state', text: text('ui.toggleOff') });
  const el = h(
    'button',
    {
      type: 'button',
      class: 'btn paint-toggle',
      'data-testid': testId,
      'aria-pressed': 'false',
      onclick: () => setDragPaints(tool, !dragPaints(tool)),
    },
    h('span', { class: 'paint-toggle-switch', 'aria-hidden': 'true' }, h('span', { class: 'paint-toggle-knob' })),
    h('span', { text: text('ui.dragPaints') }),
    state,
  );
  let last: boolean | null = null;
  return {
    el,
    update() {
      const on = dragPaints(tool);
      if (on === last) return;
      last = on;
      setAttr(el, 'aria-pressed', on ? 'true' : 'false');
      setText(state, text(on ? 'ui.toggleOn' : 'ui.toggleOff'));
    },
  };
}
