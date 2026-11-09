/**
 * Scenery tool input (Phase 4 §7): ghost follows the pointer (desktop) or the tap (touch); `R` rotates (the global
 * rotate key turns `tool.rotation`); click places, Shift-click keeps the tool; touch places with Confirm and keeps
 * the tool with Repeat. The command takes the map rotation (`mapRotationFromView`). Options live in
 * `game.tool.scenery`; the ghost is `game.tool.ghost` with kind `scenery`. Owner: W3-D. Stub: uses nothing.
 */
import type { ToolRouter } from '../toolRouters';

export const sceneryRouter: ToolRouter = {};
