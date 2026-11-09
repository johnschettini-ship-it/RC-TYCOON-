/**
 * Render layer contract (Wave 3.0; Build 3 layers Wave 4.0). Owner: integrator. The renderer (`renderer.ts`) calls
 * every layer of `./worldLayers.ts` at fixed points of the frame, so cards draw from their own folders without
 * editing the renderer:
 *
 * 1. terrain chunks → Build 1 ground (path items, litter) → `drawGround` of each layer (tints, water surfaces)
 * 2. `collect` of each layer pushes depth-sorted drawables (kinds below); the renderer sorts all objects together
 *    and calls `drawItem` of the layer that owns the kind
 * 3. weather → `drawAfterObjects` (After Dark light pass, emissive sprites)
 * 4. Build 1 tool overlays → `drawOverlay` (brush ghosts, scenery ghosts, purchase rectangles)
 *
 * Layers read the world and the tool state; they never write the world. Coordinates: device px = world px × scale
 * + off (world px at zoom 1 from the master 6.4 projection; apply the view rotation from `./view.ts`).
 */
import type { Dir } from '../sim/map';
import type { World } from '../sim/types';
import type { ZoomBucket } from './camera';
import type { ToolState } from './types';

/** Frame facts every layer gets. */
export interface LayerFrame {
  scale: number;
  offX: number;
  offY: number;
  dpr: number;
  bucket: ZoomBucket;
  /** Visible world-pixel rectangle (zoom 1 units). */
  view: { x0: number; y0: number; x1: number; y1: number };
  /** View rotation (Phase 4 §4.8). */
  rotation: Dir;
  /** Interpolation between the last two ticks, [0, 1). */
  alpha: number;
  /** Canvas size in device px. */
  width: number;
  height: number;
}

/** The renderer's depth-sorted draw list. `depth`, `z`, `layer` as in `./depth.ts` (`packDepth`). */
export interface LayerSink {
  push(kind: number, ref: number, sub: number, ax: number, ay: number, skey: number, depth: number, z: number, layer: number): void;
}

/** Draw-list kinds of the Build 2 layers (Build 1 uses 1–7 and 40). */
export const LAYER_KIND = {
  /** Elevated path tiles and supports (W3-B). */
  elevatedPath: 60,
  elevatedSupport: 61,
  /** Scenery items, per footprint-tile slice (W3-D). */
  scenery: 70,
  sceneryEdge: 71,
  /** Build 3: show sites, per footprint-tile slice (W4-C). Beams and fireworks draw in `drawAfterObjects`. */
  showSite: 80,
} as const;

export interface WorldLayer {
  /** Debug name. */
  readonly name: string;
  /** Draw-list kinds this layer pushes and draws (from `LAYER_KIND`). */
  readonly kinds: readonly number[];
  drawGround?(ctx: CanvasRenderingContext2D, world: World, tool: ToolState, f: LayerFrame): void;
  collect?(world: World, sink: LayerSink, tool: ToolState, f: LayerFrame): void;
  drawItem?(ctx: CanvasRenderingContext2D, world: World, kind: number, ref: number, sub: number, ax: number, ay: number, skey: number, f: LayerFrame): void;
  drawAfterObjects?(ctx: CanvasRenderingContext2D, world: World, tool: ToolState, f: LayerFrame): void;
  drawOverlay?(ctx: CanvasRenderingContext2D, world: World, tool: ToolState, f: LayerFrame): void;
}
