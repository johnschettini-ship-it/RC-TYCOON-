/**
 * Extra tool options for the Phase 3 tools (patrol painting, path items). Owner: W2-B.
 * The shared `ToolState` contract has no fields for them, so they live beside it, keyed by the
 * ToolState object (one per game). UI, input, and render read the same record.
 */
import type { ToolState } from '../types';

export type PatrolMode = 'paint' | 'erase';
export type BrushSize = 1 | 3 | 5;
export const BRUSH_SIZES: readonly BrushSize[] = [1, 3, 5];

/** What the path item tool does on a tap. The item ids match `buildPathItem.itemType`. */
export type PathItemAction = 'bench' | 'bin' | 'lamp' | 'remove' | 'repair';
export const PATH_ITEM_ACTIONS: readonly PathItemAction[] = ['bench', 'bin', 'lamp', 'remove', 'repair'];

export interface ManagementToolOptions {
  patrolMode: PatrolMode;
  brush: BrushSize;
  /** Staff member whose patrol the patrol tool edits, or −1. */
  patrolStaffId: number;
  /** Mode of the stroke in progress (Shift flips it), or null between strokes. */
  strokeMode: PatrolMode | null;
}

const store = new WeakMap<ToolState, ManagementToolOptions>();

export function toolOptions(tool: ToolState): ManagementToolOptions {
  let o = store.get(tool);
  if (!o) {
    o = { patrolMode: 'paint', brush: 1, patrolStaffId: -1, strokeMode: null };
    store.set(tool, o);
  }
  return o;
}

/** The path item tool's action: `ToolState.defId` holds it (one of PATH_ITEM_ACTIONS), default Bench. */
export function pathItemAction(tool: ToolState): PathItemAction {
  const d = tool.defId;
  return d !== null && (PATH_ITEM_ACTIONS as readonly string[]).includes(d) ? (d as PathItemAction) : 'bench';
}

/** Staff id whose patrol area the map shows: the patrol tool's member, else the selected staff member. */
export function patrolOverlayStaffId(tool: ToolState): number {
  if (tool.tool === 'patrol') {
    const id = toolOptions(tool).patrolStaffId;
    if (id >= 0) return id;
  }
  const sel = tool.selectedEntity;
  return sel && sel.kind === 'staff' ? sel.id : -1;
}
