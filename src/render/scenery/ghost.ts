/**
 * Scenery tool ghost (Phase 4 §7): the placement preview or the removal target, in map terms. Owner: W3-D.
 * Written by the scenery input router (`src/input/scenery`), read by the scenery layer and the scenery UI.
 *
 * Kept out of `ToolState.ghost` on purpose: the Build 1 controller clears `tool.ghost` every frame for tools it does
 * not place itself, and the renderer's generic ghost would draw a second outline and icon. One ghost per ToolState.
 */
import type { Dir } from '../../sim/map';
import type { SceneryEdge } from '../../sim/scenery/types';
import type { ToolState } from '../types';

export interface SceneryGhost {
  mode: 'place' | 'remove';
  /** Place: the item. Remove: the item under the pointer, or null. */
  defId: string | null;
  /** Place: the footprint origin (map). Remove: the target's origin. */
  x: number;
  y: number;
  rotation: Dir;
  edge: SceneryEdge;
  /** Tiles to outline: the footprint, or the edge item's tile. */
  tiles: number[];
  valid: boolean;
  /** Why the ghost is red (exact command reason), or null. */
  reason: string | null;
  /** Place: build cost. Remove: the refund. Cents. */
  cost: number;
  /** Remove: the scenery id the click would remove, or −1. */
  targetId: number;
}

const ghosts = new WeakMap<ToolState, SceneryGhost>();

export function sceneryGhostOf(tool: ToolState): SceneryGhost | null {
  return ghosts.get(tool) ?? null;
}

export function setSceneryGhost(tool: ToolState, ghost: SceneryGhost | null): void {
  if (ghost) ghosts.set(tool, ghost);
  else ghosts.delete(tool);
}
