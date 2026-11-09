/**
 * Show site placement input (Phase 6 §6, §7). Owner: W4-C. Router of the `placeShowSite` tool (`../toolRouters.ts`).
 * Neutral stub: uses no gesture or key (the tool cannot be selected before W4-C adds its picker entry).
 * Contract: like place ride/stall (Phase 1 §4.1): hover/tap ghost with cost (`GhostState` kind `showSite`), `R`
 * rotates, confirm places through `game.dispatch({ type: 'placeShowSite', … })`, `Esc` cancels.
 */
import type { ToolRouter } from '../toolRouters';

export const showSiteRouter: ToolRouter = {};
