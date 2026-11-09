/**
 * Land and Water tool input (Phase 4 §7). Owner: W3-A.
 * Desktop: the brush ghost follows the cursor with a cost tooltip; click applies; holding repeats every 300 ms;
 * Level drags a rectangle. Touch: tap places the ghost; the mini-bar Raise / Lower apply; Corner mode marks the
 * corner first. Options live in `game.tool.land`; the ghost in `game.tool.brush`. Stub: uses nothing (the
 * controller falls back to its default tap: inspect).
 */
import type { ToolRouter } from '../toolRouters';

export const landRouter: ToolRouter = {};
export const waterRouter: ToolRouter = {};
