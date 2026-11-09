/** Client contracts shared by render (W1-A), input and UI (W1-B), and the Wave 3 and Wave 4 cards. Owner: integrator. */
import type { Dir, TerrainCode } from '../sim/map';
import type { World } from '../sim/types';
import type { RampMode } from '../sim/commands/types';
import type { SceneryEdge } from '../sim/scenery/types';
import type { BrushSize, Corner } from '../sim/terrain/types';

export interface Camera {
  /** World-pixel point at the screen centre (zoom 1 units). */
  centerX: number;
  centerY: number;
  /** 0.25–2.0. */
  zoom: number;
  /**
   * View rotation (Phase 4 §4.8): quarter turns clockwise. UI state only: the simulation never reads it and saves do
   * not store it. Helpers in `./view.ts` (W3-G).
   */
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
  | 'patrol'
  // Build 2 (Phase 4 §7). Input routing: `src/input/toolRouters.ts`.
  /** Terrain brushes, corner, level, paint (W3-A). */
  | 'land'
  /** Water raise and lower (W3-A). */
  | 'water'
  /** Land and construction-rights purchase (W3-G). */
  | 'buyLand'
  /** Scenery placement (W3-D). */
  | 'scenery'
  // Build 3 (Phase 6 §6, §7).
  /** Show site placement (W4-C): `defId` is the `SHOW_SITES` id; router `src/input/shows`. */
  | 'placeShowSite';

export interface GhostState {
  /**
   * `scenery`: Phase 4 scenery ghost (W3-D); `rotation` is in map terms (view rotation already taken off).
   * `showSite`: Phase 6 show site ghost (W4-C draws it in its layer's `drawOverlay`).
   */
  kind: 'ride' | 'stall' | 'pathItem' | 'trackPiece' | 'station' | 'scenery' | 'showSite';
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
  /**
   * Path lines: why the build command would fail now (W3-B `previewPathCommand`), or null when it would succeed.
   * Absent for other drags.
   */
  reason?: string | null;
}

/** Land tool modes (Phase 4 §7). */
export type LandMode = 'raise' | 'lower' | 'smooth' | 'corner' | 'level' | 'paint';

/** Land and water tool options (W3-A). */
export interface LandToolOptions {
  mode: LandMode;
  size: BrushSize;
  /** Paint mode terrain type. */
  paint: TerrainCode;
  /** Corner mode: the corner marked under the pointer (touch marks it before Raise or Lower). */
  corner: Corner | null;
  /** Level mode: target height (lowest corner of the first tile pressed; touch changes it with + and −). */
  levelTarget: number | null;
}

/** Path tool height control (Phase 4 §4.2, §7; W3-B). `z` null = ground paths. */
export interface PathHeightOptions {
  z: number | null;
  ramp: RampMode;
}

/** Scenery tool options (W3-D). The item rotation is `ToolState.rotation` (view terms). */
export interface SceneryToolOptions {
  defId: string | null;
  edge: SceneryEdge;
  /** Shift-click (desktop) or the Repeat toggle (touch) keeps the tool after placing. */
  repeat: boolean;
}

/** Ghost of a brush or rectangle tool (land, water, buy land): affected tiles, total cost, validity. */
export interface BrushGhost {
  tiles: number[];
  cost: number;
  valid: boolean;
  reason: string | null;
  /** Corner mode: the vertex as (x, y) of its map corner point. */
  corner: { x: number; y: number } | null;
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
  /** Active overlay (Phase 1: temperament; Phase 4: calm, buzz, light). */
  overlay: OverlayId;
  /** Entity the panel shows (inspect / follow). `showSite`: Phase 6 show site panel (W4-C, `ui/shows`). */
  selectedEntity: { kind: 'ride' | 'stall' | 'guest' | 'staff' | 'showSite'; id: number } | null;
  // ---- Build 2 tool options (Wave 3.0) ----
  land: LandToolOptions;
  pathHeight: PathHeightOptions;
  scenery: SceneryToolOptions;
  /** Brush or rectangle ghost of the land, water, and buy-land tools, or null. */
  brush: BrushGhost | null;
}

export type OverlayId = 'none' | 'temperament' | 'patrol' | 'litter' | 'reliability' | 'calm' | 'buzz' | 'light';

/** Phase 4 §7: the overlay key cycles None → Calm → Buzz → Light → Temperament. */
export const OVERLAY_CYCLE: readonly OverlayId[] = ['none', 'calm', 'buzz', 'light', 'temperament'];

export function defaultToolState(): ToolState {
  return {
    tool: 'inspect',
    hoverTile: null,
    selectedTile: null,
    rotation: 0,
    defId: null,
    ghost: null,
    drag: null,
    overlay: 'none',
    selectedEntity: null,
    land: { mode: 'raise', size: 1, paint: 0, corner: null, levelTarget: null },
    pathHeight: { z: null, ramp: 'flat' },
    scenery: { defId: null, edge: -1, repeat: false },
    brush: null,
  };
}

export interface Renderer {
  resize(cssWidth: number, cssHeight: number, dpr: number): void;
  /** `alpha` in [0, 1): interpolation between the last two ticks. */
  draw(world: World, camera: Camera, tool: ToolState, alpha: number): void;
}
