/**
 * Scenery placement and removal (Phase 4 §4.5, §6). Owner: W3-D.
 *
 * Contract:
 * - `placeScenery { defId, x, y, rotation, edge }` checks, in order: owned (`groundOwnershipBlock`), dry, centre slot
 *   free (the §4.1 string of the blocking object), flat unless `slopeOk`, clearance `[ground, ground + height)` in the
 *   occupancy list, unlocked (skipped in setup mode), then cash. Edge items need `edge` 0–3 and go on any owned tile,
 *   path tiles included; `overPath` items need a flat ground footpath. A new item gets id from `allocId`, is inserted
 *   in id order, `waterLevel = 255`, and a centre item marks its tiles `Content.Scenery` / `contentRef = id`.
 *   Returns `{ ok: true, cost, warnings, id }`. Booked as `construction`.
 * - `removeScenery { id }` refunds 50% of the build cost (`demolitionRefunds`) and clears its tiles.
 * - Both call `markFieldsDirty`, `markLightDirty`, and (edge items on paths) `markNetworkDirty` for the tiles touched.
 * Stub: both return "Not implemented yet" and change nothing.
 */
import { notImplemented, type HandlerMap, type SceneryCommand } from '../commands/types';

export const sceneryHandlers: HandlerMap<SceneryCommand> = {
  placeScenery: notImplemented,
  removeScenery: notImplemented,
};
