/**
 * The "Drag to paint" toggle of the drag tools (touch controls spec 2026-11-18 §2): patrol paint, land and water, buy
 * land. Off (the default, and again whenever the tool changes), one finger moves the map and a tap acts on one tile;
 * on, a one-finger drag paints as before. A 44 × 44 pressed-state button (`aria-pressed`).
 */
import { text } from '../data/strings/en';
import { dragPaints, setDragPaints } from '../input/dragPaint';
import type { ToolState } from '../render/types';
import { h, setAttr } from './dom';

export function paintToggle(tool: ToolState, labelId: 'ui.paintDrag' | 'ui.selectDrag', testId: string): { el: HTMLButtonElement; update(): void } {
  const el = h(
    'button',
    {
      type: 'button',
      class: 'btn paint-toggle',
      'data-testid': testId,
      'aria-pressed': 'false',
      onclick: () => setDragPaints(tool, !dragPaints(tool)),
    },
    h('span', { text: text(labelId) }),
  );
  return {
    el,
    update() {
      setAttr(el, 'aria-pressed', dragPaints(tool) ? 'true' : 'false');
    },
  };
}
