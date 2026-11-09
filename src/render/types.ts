/** Client contracts shared by render (W1-A), input and UI (W1-B). Owner: integrator. */
import type { Dir } from '../sim/map';
import type { World } from '../sim/types';

export interface Camera {
  /** World-pixel point at the screen centre (zoom 1 units). */
  centerX: number;
  centerY: number;
  /** 0.25–2.0. */
  zoom: number;
  /** View rotation (Phase 4). Always 0 in Build 1. */
  rotation: Dir;
}

export type ToolId =
  | 'inspect'
  | 'footpath'
  | 'queue'
  | 'placeRide'
  | 'placeStall'
  | 'demolish'
  | 'track'
  | 'pathItem'
  | 'patrol';

export interface GhostState {
  kind: 'ride' | 'stall' | 'pathItem' | 'trackPiece' | 'station';
  defId: string;
  tile: number;
  rotation: Dir;
  valid: boolean;
  /** Block reason when not valid (shown with an icon, not colour only). */
  reason: string | null;
  cost: number;
}

export interface DragState {
  startTile: number;
  endTile: number;
  /** Tiles the drag covers (path line, patrol stroke). */
  tiles: number[];
  cost: number;
}

export interface ToolState {
  tool: ToolId;
  hoverTile: number | null;
  selectedTile: number | null;
  rotation: Dir;
  /** Picker choice for place tools. */
  defId: string | null;
  ghost: GhostState | null;
  drag: DragState | null;
  /** Active overlay (Phase 1: temperament). */
  overlay: 'none' | 'temperament' | 'patrol' | 'litter' | 'reliability' | 'calm' | 'buzz';
  /** Entity the panel shows (inspect / follow). */
  selectedEntity: { kind: 'ride' | 'stall' | 'guest' | 'staff'; id: number } | null;
}

export function defaultToolState(): ToolState {
  return { tool: 'inspect', hoverTile: null, selectedTile: null, rotation: 0, defId: null, ghost: null, drag: null, overlay: 'none', selectedEntity: null };
}

export interface Renderer {
  resize(cssWidth: number, cssHeight: number, dpr: number): void;
  /** `alpha` in [0, 1): interpolation between the last two ticks. */
  draw(world: World, camera: Camera, tool: ToolState, alpha: number): void;
}
