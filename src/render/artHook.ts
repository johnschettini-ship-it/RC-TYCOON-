/** Phase 8b stage 0b test (never merged): the only door from the game to pixel code (tool hook and runtime holder). */
// This file imports types only, so the website build carries no pixel code (B8).
import type { MapState } from '../sim/map';
import type { ElevatedPath } from '../sim/paths/types';
import type { World } from '../sim/types';
import type { LayerFrame } from './layers';
import type { ArtFrame } from './pixel/grid';
import type { Sprite } from './spriteCache';
import type { GuestLook } from './sprites/props';
import type { ArtBounds, RideArtState } from './sprites/rides';
import type { Ctx } from './sprites/shapes';
import type { SliceRec } from './track/layer';
import type { WorldSamples } from './track/paint';
import type { ViewFrame } from './track/project';
import type { Camera } from './types';
import type { ViewRotation } from './view';

/** The stage 0 art functions the sheet tool installs; each Classic function branches to them on a surface. */
export interface SurfaceArt {
  /** True when `ctx` is a pixel surface. */
  is(ctx: unknown): boolean;
  box(ctx: Ctx, u0: number, v0: number, u1: number, v1: number, h0: number, h1: number, top: string, left: string, right: string): void;
  cylinder(ctx: Ctx, cu: number, cv: number, r: number, h0: number, h1: number, side: string, top: string): void;
  cone(ctx: Ctx, cu: number, cv: number, r: number, h0: number, h1: number, colours: readonly string[], segments: number): void;
  pyramid(ctx: Ctx, u0: number, v0: number, u1: number, v1: number, h0: number, h1: number, back: string, left: string, right: string): void;
  head(ctx: Ctx, x: number, y: number, r: number, skin: string, hair: string): void;
  guest(ctx: Ctx, g: GuestLook): void;
  /** Paints the ride's twin; false when the ride has none (the Classic body then paints). */
  ride(ctx: Ctx, defId: string, ex: number, ey: number, st: RideArtState): boolean;
  slice(ctx: Ctx, sl: SliceRec, f: ViewFrame, extras: boolean): void;
  widenRuns(s: WorldSamples, runs: readonly number[]): number[];
  noteDerived(out: string, hex: string, f: number): void;
  noteMixed(out: string, a: string, b: string, t: number): void;
}

// Kind codes of predrawn pictures (one index column); Classic files may import them.
export const K_RIDE = 1;
export const K_STALL = 2;
export const K_SCENERY = 3;
export const K_PATH_ITEM = 4;
export const K_DECAL = 5;
export const K_FENCE = 6;
export const K_ENTRANCE = 7;
export const K_SHOW = 8;
export const K_GUEST = 9;
export const K_STAFF = 10;
export const K_SHADOW = 11;
export const K_GHOST = 12;
export const K_RAIL = 13;
export const K_SUPPORT = 14;
export const K_GATE = 15;
export const K_CAR = 16;
export const K_DECK = 17;
export const K_POST = 18;
export const K_GROUND = 19;

/** The canvas plan of a Pixel frame (Test decisions 2, 3). */
export interface PixelPlan {
  stretch: number;
  canvasW: number;
  canvasH: number;
  /** CSS size of the canvas box (anchored top left). */
  boxW: number;
  boxH: number;
  homeZoom: number;
  budgetBytes: number;
  coarse: boolean;
  device: 'phone' | 'tablet';
}

/** The art frame of a Pixel frame (the stage 0 `ArtFrame`, plus the night flag of the shadow pass). */
export interface PixelFrame extends ArtFrame {
  night: boolean;
}

/** The app runtime: picture store, copies on the art grid, ground, shadows, track and elevated paths. */
export interface PixelRuntime {
  plan(cssW: number, cssH: number, dpr: number): PixelPlan;
  beginFrame(cam: Camera, world: World, cssW: number, cssH: number, dpr: number, alpha: number): PixelFrame;
  picture(kind: number, key: number, swap?: number): Sprite | null;
  /** A kept-last picture: itself while its sheet is still decoded (marked used), else null (fix round 1 I3). */
  keep(sp: Sprite | null): Sprite | null;
  blit(ctx: CanvasRenderingContext2D, sp: Sprite, wx: number, wy: number): void;
  blitColumn(ctx: CanvasRenderingContext2D, sp: Sprite, ax: number, ay: number, colL: number, colR: number, ends: number): void;
  snapWalker(ax: number, ay: number, slope: 0 | 0.5 | -0.5, out: { x: number; y: number }): void;
  /** Null: a piece is still decoding. */
  chunk(map: MapState, rect: { u0: number; v0: number; u1: number; v1: number }, r: ViewRotation, geom: ArtBounds): Sprite | null;
  drawShadows(ctx: CanvasRenderingContext2D, world: World, f: LayerFrame): void;
  drawTrack(ctx: CanvasRenderingContext2D, what: 'slice' | 'car' | 'gate', rec: unknown, f: LayerFrame): boolean;
  drawElevated(ctx: CanvasRenderingContext2D, p: ElevatedPath, world: World, f: LayerFrame): void;
  /** Decoded picture bytes held now (sheets and swaps): the sprite memory budget gives way to them each frame. */
  readonly storeBytes: number;
  /**
   * Ends a frame (budget, eviction, counters); true once a complete frame of this world has been drawn. A frame with
   * placeholder ground (`groundComplete` false) is incomplete; `otherBytes` is the rest of the sprite memory.
   */
  endFrame(staticBytes: number, chunkBytes: number, groundComplete?: boolean, otherBytes?: number): boolean;
}

/** Set only by the sheet tool and by tests (never in the game). */
export const surfaceArt: { on: SurfaceArt | null } = { on: null };

/** Set by the app runtime chunk in Pixel style. */
export const pixel: { rt: PixelRuntime | null } = { rt: null };
