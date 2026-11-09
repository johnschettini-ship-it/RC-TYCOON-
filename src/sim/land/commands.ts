/**
 * Land purchase (Phase 4 §4.9, §6). Owner: W3-G.
 *
 * `buyLand { x0, y0, x1, y1 }` (any corner order, clamped to the map): buys every state-2 tile in the rectangle
 * (→ 1) at `park.landPrice` and every state-4 tile (→ 3) at `park.rightsPrice`; other tiles are skipped. Atomic for
 * cash: `"Not enough cash"` fails the whole command. No tile to buy: `"Nothing to buy here"`; a single-tile
 * rectangle on a state-0 tile: `"This land is not for sale"`. Booked as ledger `landPurchase`. Setup mode skips cash
 * and ledger. The fence is derived from `owned` (master R3), so nothing else changes.
 */
import { LAND_ERR } from '../../data/strings/land';
import { canAfford, pay } from '../economy/ledger';
import { Owned, type MapState } from '../map';
import type { GameState } from '../types';
import type { Cents } from '../units';
import { ok, type CommandResult, type HandlerMap, type LandCommand } from '../commands/types';

export interface LandQuote {
  /** State-2 tiles (land for sale) in the rectangle. */
  land: number;
  /** State-4 tiles (construction rights for sale) in the rectangle. */
  rights: number;
  cost: Cents;
}

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** The rectangle clamped to the map, corners sorted; null when it misses the map or a coordinate is not a number. */
function clampRect(map: Pick<MapState, 'width' | 'height'>, ax: number, ay: number, bx: number, by: number): Rect | null {
  if (![ax, ay, bx, by].every(Number.isFinite)) return null;
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx)));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by)));
  const x1 = Math.min(map.width - 1, Math.floor(Math.max(ax, bx)));
  const y1 = Math.min(map.height - 1, Math.floor(Math.max(ay, by)));
  return x0 > x1 || y0 > y1 ? null : { x0, y0, x1, y1 };
}

/**
 * What `buyLand` over this rectangle would buy and cost now (the Buy Land drag total). Pure: reads the state only.
 */
export function buyLandQuote(state: Pick<GameState, 'map' | 'park'>, ax: number, ay: number, bx: number, by: number): LandQuote {
  const map = state.map;
  const r = clampRect(map, ax, ay, bx, by);
  let land = 0;
  let rights = 0;
  if (r) {
    const w = map.width;
    for (let y = r.y0; y <= r.y1; y++) {
      for (let x = r.x0; x <= r.x1; x++) {
        const o = map.owned[y * w + x];
        if (o === Owned.LandForSale) land++;
        else if (o === Owned.RightsForSale) rights++;
      }
    }
  }
  return { land, rights, cost: land * state.park.landPrice + rights * state.park.rightsPrice };
}

export const landHandlers: HandlerMap<LandCommand> = {
  buyLand(world, cmd, ctx): CommandResult {
    const s = world.state;
    const map = s.map;
    const r = clampRect(map, cmd.x0, cmd.y0, cmd.x1, cmd.y1);
    if (!r) return { ok: false, reason: LAND_ERR.nothingToBuy };
    const q = buyLandQuote(s, r.x0, r.y0, r.x1, r.y1);
    if (q.land + q.rights === 0) {
      const single = r.x0 === r.x1 && r.y0 === r.y1;
      if (single && map.owned[r.y0 * map.width + r.x0] === Owned.NotOwned) return { ok: false, reason: LAND_ERR.notForSale };
      return { ok: false, reason: LAND_ERR.nothingToBuy };
    }
    if (!canAfford(world, q.cost, ctx)) return { ok: false, reason: LAND_ERR.notEnoughCash };
    const w = map.width;
    for (let y = r.y0; y <= r.y1; y++) {
      for (let x = r.x0; x <= r.x1; x++) {
        const i = y * w + x;
        const o = map.owned[i];
        if (o === Owned.LandForSale) map.owned[i] = Owned.Owned;
        else if (o === Owned.RightsForSale) map.owned[i] = Owned.RightsOwned;
      }
    }
    pay(world, q.cost, 'landPurchase', ctx);
    return ok(q.cost);
  },
};
