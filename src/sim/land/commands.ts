/**
 * Land purchase (Phase 4 §4.9, §6). Owner: W3-G.
 *
 * Contract for `buyLand { x0, y0, x1, y1 }` (any corner order): buys every state-2 tile in the rectangle (→ 1) at
 * `park.landPrice` and every state-4 tile (→ 3) at `park.rightsPrice`; other tiles are skipped. Atomic for cash:
 * `"Not enough cash"` fails the whole command. No tile to buy: `"Nothing to buy here"`; a single-tile rectangle on
 * a state-0 tile: `"This land is not for sale"`. Booked as ledger `landPurchase`. Setup mode skips cash and ledger.
 * Stub: returns "Not implemented yet" and changes nothing.
 */
import { notImplemented, type HandlerMap, type LandCommand } from '../commands/types';

export const landHandlers: HandlerMap<LandCommand> = {
  buyLand: notImplemented,
};
