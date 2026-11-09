/**
 * Show site placement ghost (Phase 6 §6, §7). Owner: W4-C. Written by the placement router (`src/input/shows`), read by
 * the show layer and the show UI.
 *
 * Kept out of `ToolState.ghost` on purpose (as the scenery tool does): the Build 1 controller clears `tool.ghost`
 * every frame for tools it does not place itself, and the renderer's generic ghost would draw a second outline.
 * The shape is `GhostState` (kind `showSite`) plus the map origin and the tiles to outline. One ghost per ToolState.
 */
import type { Dir } from '../../sim/map';
import type { GhostState, ToolState } from '../types';

export interface ShowGhost extends GhostState {
  kind: 'showSite';
  /** Footprint origin (map). */
  x: number;
  y: number;
  /** Footprint tiles inside the map. */
  tiles: number[];
  rotation: Dir;
}

const ghosts = new WeakMap<ToolState, ShowGhost>();

export function showGhostOf(tool: ToolState): ShowGhost | null {
  return ghosts.get(tool) ?? null;
}

export function setShowGhost(tool: ToolState, ghost: ShowGhost | null): void {
  if (ghost) ghosts.set(tool, ghost);
  else ghosts.delete(tool);
}
