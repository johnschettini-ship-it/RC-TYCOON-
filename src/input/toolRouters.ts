/**
 * Build 2 tool input routing (Wave 3.0 contract). Owner: integrator. The controller asks the router of the active
 * tool first (like the track tool), so Wave 3 cards add tool input from their own folders:
 * `land`, `water` → `./land` (W3-A); `buyLand` → `./landPurchase` (W3-G); `scenery` → `./scenery` (W3-D).
 * Routers are pure input logic over `Game` (no DOM); they dispatch commands through `game.dispatch`.
 */
import type { Game } from '../game';
import type { ToolId } from '../render/types';
import type { DragMode, GestureAction } from './gestures';
import { landRouter, waterRouter } from './land';
import { buyLandRouter } from './landPurchase';
import { sceneryRouter } from './scenery';

export type TileAt = (x: number, y: number) => number | null;

export interface ToolRouter {
  /** Primary drag of this tool: `build` (rectangles, brush strokes) or `pan` (default). */
  primaryDrag?(game: Game): DragMode;
  /** A gesture on the map while the tool is active. Return true when used; pans and pinches usually are not. */
  gesture?(game: Game, a: GestureAction, tileAt: TileAt): boolean;
  /** A key while the tool is active, before the global key map. Return true when used. */
  keyDown?(game: Game, key: string): boolean;
  /** Once per frame (ghost refresh, hold-to-repeat every 300 ms). */
  update?(game: Game, nowMs: number): void;
  /** The tool was selected / left (reset ghosts). */
  enter?(game: Game): void;
  leave?(game: Game): void;
}

export const TOOL_ROUTERS: Partial<Record<ToolId, ToolRouter>> = {
  land: landRouter,
  water: waterRouter,
  buyLand: buyLandRouter,
  scenery: sceneryRouter,
};

export function routerOf(tool: ToolId): ToolRouter | undefined {
  return TOOL_ROUTERS[tool];
}
