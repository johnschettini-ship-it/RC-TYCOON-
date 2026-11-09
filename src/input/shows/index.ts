/**
 * Show site placement input (Phase 6 §6, §7). Owner: W4-C. Router of the `placeShowSite` tool (`../toolRouters.ts`),
 * like place ride/stall (Phase 1 §4.1): the ghost follows the pointer (desktop) or the tap (touch) with its cost and
 * validity; `R` rotates (the global rotate key turns `tool.rotation`); a click (desktop), the Confirm button, or
 * `Enter` places through `game.dispatch({ type: 'placeShowSite', … })`; `Esc` cancels (the global cancel key).
 *
 * - The ghost is the show ghost store (`render/shows/ghost.ts`), not `tool.ghost` (the Build 1 controller clears that
 *   one every frame for tools it does not place itself). Validity comes from the command's own rules
 *   (`checkShowPlacement`), so the ghost and the command always agree.
 * - The hovered or tapped tile is the footprint's view-origin tile (its top corner on screen), in every view rotation.
 * - The command takes the map rotation (`mapRotationFromView`).
 * - After a placement the tool ends and the new site is selected, so its panel opens with the schedule (new shows
 *   start switched off, Phase 6 §6).
 */
import { getShowSiteDef } from '../../data/catalog';
import type { Game } from '../../game';
import { setShowGhost, showGhostOf, type ShowGhost } from '../../render/shows/ghost';
import type { ToolState } from '../../render/types';
import { mapRotationFromView, mapToView, viewToMap } from '../../render/view';
import type { CommandResult } from '../../sim/commands/types';
import type { Dir, MapState } from '../../sim/map';
import { checkShowPlacement, clippedFootprint } from '../../sim/shows/placement';
import type { ToolRouter } from '../toolRouters';

export type PointerMode = 'mouse' | 'touch';

/** Per-tool input state (UI state only; never saved). */
export interface ShowInputState {
  /** Last pointer kind on the map. Touch places with Confirm. */
  pointer: PointerMode;
  /** Ghost anchor: the hovered or tapped tile, or null before any pointer input on touch. */
  anchor: number | null;
}

const states = new WeakMap<ToolState, ShowInputState>();

export function showInput(tool: ToolState): ShowInputState {
  let s = states.get(tool);
  if (!s) {
    s = { pointer: 'mouse', anchor: null };
    states.set(tool, s);
  }
  return s;
}

/** Map origin of an n × n footprint whose view-origin tile is `anchor` (Phase 4 §4.8 tables). */
export function showSiteOrigin(map: Pick<MapState, 'width' | 'height'>, anchor: number, n: number, viewRot: Dir): { x: number; y: number } {
  const ax = anchor % map.width;
  const ay = (anchor - ax) / map.width;
  if (viewRot === 0 || n === 1) return { x: ax, y: ay };
  const p = mapToView(ax, ay, viewRot, map.width, map.height);
  const a = viewToMap(p.u, p.v, viewRot, map.width, map.height);
  const b = viewToMap(p.u + n - 1, p.v + n - 1, viewRot, map.width, map.height);
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) };
}

/** Recompute the ghost from the tool, the anchor, and the world. */
export function refreshShowGhost(game: Game): ShowGhost | null {
  const tool = game.tool;
  const st = showInput(tool);
  const map = game.world.state.map;
  const def = tool.defId ? getShowSiteDef(tool.defId) : undefined;
  if (tool.tool !== 'placeShowSite' || !def || st.anchor === null || st.anchor < 0 || st.anchor >= map.width * map.height) {
    setShowGhost(tool, null);
    return null;
  }
  const rotation = mapRotationFromView(tool.rotation, game.camera.rotation);
  const { x, y } = showSiteOrigin(map, st.anchor, def.w, game.camera.rotation);
  const check = checkShowPlacement(game.world, { defId: def.id, x, y, rotation }, { setup: false });
  const ghost: ShowGhost = {
    kind: 'showSite',
    defId: def.id,
    tile: y * map.width + x,
    x,
    y,
    rotation,
    tiles: clippedFootprint(map, x, y, def.w, def.d),
    valid: check.ok,
    reason: check.ok ? null : check.reason,
    cost: def.buildCost,
  };
  setShowGhost(tool, ghost);
  return ghost;
}

/** Pick a site type: the placement tool with that type. */
export function chooseShowSite(game: Game, defId: string): void {
  const t = game.tool;
  t.tool = 'placeShowSite';
  t.defId = defId;
  t.ghost = null;
  t.drag = null;
  refreshShowGhost(game);
}

export function rotateShowSite(game: Game): void {
  game.tool.rotation = ((game.tool.rotation + 1) % 4) as Dir;
  refreshShowGhost(game);
}

/** Leave the tool (Done, or after a placement). */
export function exitShowTool(game: Game): void {
  const t = game.tool;
  t.tool = 'inspect';
  t.defId = null;
  t.ghost = null;
  t.drag = null;
  setShowGhost(t, null);
}

/** Place at the ghost (a mouse click, the Confirm button, or Enter). Null when there is no ghost. */
export function confirmShowSite(game: Game): CommandResult | null {
  const g = refreshShowGhost(game);
  if (!g) return null;
  const r = game.dispatch({ type: 'placeShowSite', defId: g.defId, x: g.x, y: g.y, rotation: g.rotation });
  if (r.ok && r.id !== undefined) {
    exitShowTool(game);
    game.tool.selectedEntity = { kind: 'showSite', id: r.id };
  } else {
    refreshShowGhost(game);
  }
  return r;
}

export { showGhostOf };

export const showSiteRouter: ToolRouter = {
  enter(game) {
    const st = showInput(game.tool);
    st.anchor = st.pointer === 'mouse' ? game.tool.hoverTile : null;
    refreshShowGhost(game);
  },
  leave(game) {
    setShowGhost(game.tool, null);
  },
  gesture(game, a, tileAt) {
    const tool = game.tool;
    const st = showInput(tool);
    if (a.type === 'hover') {
      st.pointer = 'mouse';
      st.anchor = tileAt(a.x, a.y);
      tool.hoverTile = st.anchor;
      refreshShowGhost(game);
      return true;
    }
    if (a.type === 'tap') {
      st.pointer = a.pointerType === 'mouse' ? 'mouse' : 'touch';
      const tile = tileAt(a.x, a.y);
      if (tile === null) return true;
      st.anchor = tile;
      tool.hoverTile = tile;
      refreshShowGhost(game);
      // Touch: a tap only moves the ghost; the Confirm button places it.
      if (st.pointer === 'mouse') confirmShowSite(game);
      return true;
    }
    return false;
  },
  keyDown(game, key) {
    if (key === 'Enter') {
      confirmShowSite(game);
      return true;
    }
    return false;
  },
  update(game) {
    refreshShowGhost(game);
  },
};
