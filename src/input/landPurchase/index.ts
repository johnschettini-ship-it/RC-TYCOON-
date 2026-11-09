/**
 * Buy Land tool input (Phase 4 §4.9, §7). Owner: W3-G. Pure input logic over `Game` (no DOM).
 * - Desktop: hovering shows the tile under the cursor and its price; a drag shows the rectangle and its total;
 *   release buys (one `buyLand`); a click buys one tile.
 * - Touch: drag a rectangle (or tap one tile), check the total chip, then Confirm (`confirmBuyLand`; Enter on a
 *   keyboard). A second finger cancels the drag and pinches (Review Focus 4).
 * The renderer tints the owned states while the tool is active and draws `game.tool.brush` (the rectangle: tiles,
 * total, validity with the reason). The command result is the final word; a failure toasts its reason.
 */
import type { Game } from '../../game';
import type { BrushGhost } from '../../render/types';
import { LAND_ERR } from '../../data/strings/land';
import { buyLandQuote } from '../../sim/land/commands';
import { Owned } from '../../sim/map';
import { unlimitedMoney } from '../../sim/scenario/api';
import type { CommandResult } from '../../sim/commands/types';
import type { TileAt, ToolRouter } from '../toolRouters';

/** The rectangle being dragged or waiting for Confirm, in map tiles (start and end corners as picked). */
export interface BuySelection {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** A touch rectangle waiting for Confirm. */
  pending: boolean;
}

interface BuyState {
  sel: BuySelection | null;
  /** A drag is in progress. */
  dragging: boolean;
  /** The rectangle the brush tiles were built for (x0, y0, x1, y1; x0 = −1 for none), so frames do not rebuild the list. */
  built: [number, number, number, number];
}

const states = new WeakMap<Game, BuyState>();

function stateOf(game: Game): BuyState {
  let s = states.get(game);
  if (!s) {
    s = { sel: null, dragging: false, built: [-1, -1, -1, -1] };
    states.set(game, s);
  }
  return s;
}

/** The current selection (a copy), or null. Hover previews are not selections. */
export function buyLandSelection(game: Game): BuySelection | null {
  const s = states.get(game)?.sel;
  return s && (s.pending || stateOf(game).dragging) ? { ...s } : null;
}

function clear(game: Game): void {
  const s = stateOf(game);
  s.sel = null;
  s.dragging = false;
  s.built[0] = -1;
  game.tool.brush = null;
}

/** Drop the rectangle (the bar's Cancel). */
export function cancelBuyLand(game: Game): void {
  clear(game);
}

/** Refresh `game.tool.brush` for the selection: tiles (rebuilt only when the rectangle changes), total, validity. */
function refresh(game: Game): void {
  const s = stateOf(game);
  const sel = s.sel;
  if (!sel) {
    game.tool.brush = null;
    return;
  }
  const state = game.world.state;
  const map = state.map;
  const k = s.built;
  let brush: BrushGhost | null = game.tool.brush;
  if (!brush || k[0] !== sel.x0 || k[1] !== sel.y0 || k[2] !== sel.x1 || k[3] !== sel.y1) {
    const tiles: number[] = [];
    const xa = Math.min(sel.x0, sel.x1);
    const xb = Math.max(sel.x0, sel.x1);
    const ya = Math.min(sel.y0, sel.y1);
    const yb = Math.max(sel.y0, sel.y1);
    for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) tiles.push(y * map.width + x);
    brush = { tiles, cost: 0, valid: false, reason: null, corner: null };
    k[0] = sel.x0;
    k[1] = sel.y0;
    k[2] = sel.x1;
    k[3] = sel.y1;
  }
  const q = buyLandQuote(state, sel.x0, sel.y0, sel.x1, sel.y1);
  let reason: string | null = null;
  if (q.land + q.rights === 0) {
    const single = sel.x0 === sel.x1 && sel.y0 === sel.y1;
    reason = single && map.owned[sel.y0 * map.width + sel.x0] === Owned.NotOwned ? LAND_ERR.notForSale : LAND_ERR.nothingToBuy;
  } else if (state.park.cash < q.cost && !unlimitedMoney(state)) {
    reason = LAND_ERR.notEnoughCash;
  }
  brush.cost = q.cost;
  brush.valid = reason === null;
  brush.reason = reason;
  game.tool.brush = brush;
}

function select(game: Game, a: number, b: number, pending: boolean): void {
  const w = game.world.state.map.width;
  stateOf(game).sel = { x0: a % w, y0: Math.floor(a / w), x1: b % w, y1: Math.floor(b / w), pending };
  refresh(game);
}

/** Dispatch `buyLand` for the selection. Clears it when the purchase went through. */
function buy(game: Game): CommandResult | null {
  const sel = stateOf(game).sel;
  if (!sel) return null;
  const result = game.dispatch({ type: 'buyLand', x0: sel.x0, y0: sel.y0, x1: sel.x1, y1: sel.y1 });
  if (result.ok) clear(game);
  else refresh(game);
  return result;
}

/** Confirm a pending (touch) rectangle: dispatches `buyLand`. Null when nothing is waiting. */
export function confirmBuyLand(game: Game): CommandResult | null {
  const s = stateOf(game);
  if (!s.sel?.pending) return null;
  return buy(game);
}

export const buyLandRouter: ToolRouter = {
  primaryDrag: () => 'build',

  gesture(game, a, tileAt: TileAt) {
    const s = stateOf(game);
    switch (a.type) {
      case 'hover': {
        const t = tileAt(a.x, a.y);
        game.tool.hoverTile = t;
        if (s.dragging || s.sel?.pending) return true;
        if (t === null) clear(game);
        else select(game, t, t, false);
        return true;
      }
      case 'dragStart': {
        const t = tileAt(a.x, a.y);
        if (t === null) return true;
        s.dragging = true;
        select(game, t, t, false);
        return true;
      }
      case 'dragMove': {
        if (!s.dragging || !s.sel) return true;
        const t = tileAt(a.x, a.y);
        if (t === null) return true;
        const w = game.world.state.map.width;
        s.sel.x1 = t % w;
        s.sel.y1 = Math.floor(t / w);
        refresh(game);
        return true;
      }
      case 'dragEnd': {
        if (!s.dragging || !s.sel) return true;
        s.dragging = false;
        if (a.pointerType === 'mouse') buy(game);
        else {
          s.sel.pending = true;
          refresh(game);
        }
        return true;
      }
      case 'dragCancel':
        clear(game);
        return true;
      case 'tap': {
        const t = tileAt(a.x, a.y);
        if (t === null) return true;
        select(game, t, t, a.pointerType !== 'mouse');
        if (a.pointerType === 'mouse') buy(game);
        return true;
      }
      case 'longPress':
        return true;
      default:
        // Pans and pinches move the camera.
        return false;
    }
  },

  keyDown(game, key) {
    if (key === 'Enter') return confirmBuyLand(game) !== null;
    return false;
  },

  update(game) {
    // Cash and ownership can change under the rectangle: keep the total and the reason current.
    if (stateOf(game).sel) refresh(game);
  },

  enter(game) {
    clear(game);
  },

  leave(game) {
    clear(game);
  },
};
