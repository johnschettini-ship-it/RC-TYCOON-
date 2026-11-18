/**
 * "Drag to paint" toggle (touch controls spec 2026-11-18 §2). One finger always moves the map; in the drag tools
 * (patrol paint, land and water, buy land) a tap acts on one tile, and a one-finger drag paints only while the tool's
 * Paint toggle is on. The toggle lives beside the shared `ToolState` (keyed by that object, like the land tool's side
 * table) and resets when the tool changes (`InputController.toolChanged`). Plain data; no DOM.
 */
import type { ToolId, ToolState } from '../render/types';

/** The tools whose panel has a Paint toggle. */
export const DRAG_PAINT_TOOLS: ReadonlySet<ToolId> = new Set<ToolId>(['patrol', 'land', 'water', 'buyLand']);

const store = new WeakMap<ToolState, { on: boolean }>();

/** True when a one-finger (or left mouse) drag paints with the active tool. */
export function dragPaints(tool: ToolState): boolean {
  return DRAG_PAINT_TOOLS.has(tool.tool) && store.get(tool)?.on === true;
}

export function setDragPaints(tool: ToolState, on: boolean): void {
  let s = store.get(tool);
  if (!s) {
    s = { on: false };
    store.set(tool, s);
  }
  s.on = on;
}
