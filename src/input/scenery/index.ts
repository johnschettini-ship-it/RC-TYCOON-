/**
 * Scenery tool input (Phase 4 §7): ghost follows the pointer (desktop) or the tap (touch); `R` rotates (the global
 * rotate key turns `tool.rotation`); click places, Shift-click keeps the tool; touch places with Confirm and keeps
 * the tool with Repeat. The command takes the map rotation (`mapRotationFromView`). Options live in
 * `game.tool.scenery`. Owner: W3-D.
 *
 * - The ghost is the scenery ghost store (`render/scenery/ghost.ts`), not `tool.ghost` (the Build 1 controller clears
 *   that one every frame for tools it does not place itself). Validity comes from the command's own rules
 *   (`checkPlacement`), so the ghost and the command always agree.
 * - The hover or tapped tile is the footprint's view-origin tile (its top corner on screen), in every view rotation.
 * - Edge items: the rotation picks the edge (view terms: 0 = the back-right edge, then clockwise).
 * - Remove mode: click (desktop) or tap + Confirm (touch) removes the item under the pointer for the 50% refund:
 *   the centre item or arch first, else the tile's newest edge item.
 * - Placing without Repeat (or Shift on desktop) ends the tool, as the spec's "Shift-click keeps the tool" implies.
 */
import { getSceneryDef } from '../../data/catalog';
import { SCENERY_ERR } from '../../data/strings/scenery';
import type { Game } from '../../game';
import { sceneryGhostOf, setSceneryGhost, type SceneryGhost } from '../../render/scenery/ghost';
import type { ToolState } from '../../render/types';
import { mapRotationFromView, mapToView, viewToMap } from '../../render/view';
import type { CommandResult } from '../../sim/commands/types';
import type { Dir, MapState } from '../../sim/map';
import { centreSceneryAt, sceneryOnTile } from '../../sim/scenery/api';
import { sceneryRefund } from '../../sim/scenery/commands';
import { footprintOf, itemTiles } from '../../sim/scenery/index';
import { checkPlacement } from '../../sim/scenery/rules';
import type { Scenery } from '../../sim/scenery/types';
import type { World } from '../../sim/types';
import type { ToolRouter } from '../toolRouters';

export type PointerMode = 'mouse' | 'touch';

/** Per-tool input state (UI state only; never saved). */
export interface SceneryInputState {
  remove: boolean;
  /** Last pointer kind on the map. Touch places with Confirm. */
  pointer: PointerMode;
  /** Shift held at the last press (desktop: keep the tool after placing). */
  shift: boolean;
  /** Ghost anchor: the hovered or tapped tile, or null before any pointer input on touch. */
  anchor: number | null;
}

const states = new WeakMap<ToolState, SceneryInputState>();

export function sceneryInput(tool: ToolState): SceneryInputState {
  let s = states.get(tool);
  if (!s) {
    s = { remove: false, pointer: 'mouse', shift: false, anchor: null };
    states.set(tool, s);
  }
  return s;
}

/** The UI notes Shift at each pointer press (gesture actions do not carry modifier keys). */
export function noteShift(tool: ToolState, held: boolean): void {
  sceneryInput(tool).shift = held;
}

/** Map origin of a footprint whose view-origin tile is `anchor` (Phase 4 §4.8 tables), for map rotation `rot`. */
export function sceneryOrigin(map: Pick<MapState, 'width' | 'height'>, anchor: number, w: number, d: number, rot: Dir, viewRot: Dir): { x: number; y: number } {
  const ax = anchor % map.width;
  const ay = (anchor - ax) / map.width;
  const mx = rot % 2 === 1 ? d : w;
  const my = rot % 2 === 1 ? w : d;
  if (viewRot === 0) return { x: ax, y: ay };
  const p = mapToView(ax, ay, viewRot, map.width, map.height);
  const vex = viewRot % 2 === 1 ? my : mx;
  const vey = viewRot % 2 === 1 ? mx : my;
  const a = viewToMap(p.u, p.v, viewRot, map.width, map.height);
  const b = viewToMap(p.u + vex - 1, p.v + vey - 1, viewRot, map.width, map.height);
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) };
}

/** The item a remove click on `tile` takes: the centre item or arch, else the tile's newest edge item. */
export function removeTarget(world: World, tile: number): Scenery | null {
  const centre = centreSceneryAt(world, tile);
  if (centre) return centre;
  const on = sceneryOnTile(world, tile);
  return on.length > 0 ? (on[on.length - 1] as Scenery) : null;
}

/** Recompute the ghost from the tool options, the anchor, and the world. */
export function refreshSceneryGhost(game: Game): SceneryGhost | null {
  const tool = game.tool;
  const st = sceneryInput(tool);
  const world = game.world;
  const map = world.state.map;
  const n = map.width * map.height;
  if (tool.tool !== 'scenery' || st.anchor === null || st.anchor < 0 || st.anchor >= n) {
    setSceneryGhost(tool, null);
    return null;
  }
  const anchor = st.anchor;
  if (st.remove) {
    const target = removeTarget(world, anchor);
    const def = target ? getSceneryDef(target.defId) : undefined;
    const g: SceneryGhost =
      target && def
        ? { mode: 'remove', defId: target.defId, x: target.x, y: target.y, rotation: target.rotation, edge: target.edge, tiles: itemTiles(map, target, def), valid: true, reason: null, cost: sceneryRefund(def.buildCost), targetId: target.id }
        : { mode: 'remove', defId: null, x: anchor % map.width, y: Math.floor(anchor / map.width), rotation: 0, edge: -1, tiles: [anchor], valid: false, reason: SCENERY_ERR.nothingToRemove, cost: 0, targetId: -1 };
    setSceneryGhost(tool, g);
    return g;
  }
  const def = tool.scenery.defId ? getSceneryDef(tool.scenery.defId) : undefined;
  if (!def) {
    setSceneryGhost(tool, null);
    return null;
  }
  const rot = mapRotationFromView(tool.rotation, game.camera.rotation);
  const { x, y } = def.edge ? { x: anchor % map.width, y: Math.floor(anchor / map.width) } : sceneryOrigin(map, anchor, def.w, def.d, rot, game.camera.rotation);
  const edge = def.edge ? rot : -1;
  tool.scenery.edge = edge;
  const check = checkPlacement(world, { defId: def.id, x, y, rotation: rot, edge }, { setup: false });
  const tiles = def.edge ? [anchor] : (footprintOf(map, def, x, y, rot) ?? clippedFootprint(map, x, y, rot % 2 === 1 ? def.d : def.w, rot % 2 === 1 ? def.w : def.d));
  const g: SceneryGhost = { mode: 'place', defId: def.id, x, y, rotation: rot, edge, tiles, valid: check.ok, reason: check.ok ? null : check.reason, cost: def.buildCost, targetId: -1 };
  setSceneryGhost(tool, g);
  return g;
}

function clippedFootprint(map: Pick<MapState, 'width' | 'height'>, x: number, y: number, mx: number, my: number): number[] {
  const out: number[] = [];
  for (let dy = 0; dy < my; dy++) for (let dx = 0; dx < mx; dx++) if (x + dx >= 0 && y + dy >= 0 && x + dx < map.width && y + dy < map.height) out.push((y + dy) * map.width + x + dx);
  return out;
}

/** Pick an item: the scenery tool with that item, place mode. */
export function chooseSceneryItem(game: Game, defId: string): void {
  const t = game.tool;
  t.tool = 'scenery';
  t.defId = null;
  t.ghost = null;
  t.drag = null;
  t.scenery.defId = defId;
  sceneryInput(t).remove = false;
  refreshSceneryGhost(game);
}

export function setSceneryRemoveMode(game: Game, on: boolean): void {
  sceneryInput(game.tool).remove = on;
  refreshSceneryGhost(game);
}

export function rotateScenery(game: Game): void {
  game.tool.rotation = ((game.tool.rotation + 1) % 4) as Dir;
  refreshSceneryGhost(game);
}

/** Leave the scenery tool (Done, or after a placement without Repeat or Shift). */
export function exitSceneryTool(game: Game): void {
  const t = game.tool;
  t.tool = 'inspect';
  t.ghost = null;
  t.drag = null;
  setSceneryGhost(t, null);
}

/**
 * Place (or remove) at the ghost: the Confirm button, a mouse click, or Enter. Returns the command result, or null
 * when there is no ghost. After a placement the tool ends unless Repeat is on (or Shift was held).
 */
export function confirmScenery(game: Game): CommandResult | null {
  const tool = game.tool;
  const st = sceneryInput(tool);
  const g = refreshSceneryGhost(game);
  if (!g) return null;
  if (g.mode === 'remove') {
    if (g.targetId < 0) return null;
    const r = game.dispatch({ type: 'removeScenery', id: g.targetId });
    refreshSceneryGhost(game);
    return r;
  }
  if (!g.defId) return null;
  const r = game.dispatch({ type: 'placeScenery', defId: g.defId, x: g.x, y: g.y, rotation: g.rotation, edge: g.edge });
  if (r.ok && !tool.scenery.repeat && !st.shift) exitSceneryTool(game);
  else refreshSceneryGhost(game);
  return r;
}

export const sceneryRouter: ToolRouter = {
  enter(game) {
    const st = sceneryInput(game.tool);
    st.remove = st.remove && game.tool.scenery.defId === null;
    st.anchor = st.pointer === 'mouse' ? game.tool.hoverTile : null;
    refreshSceneryGhost(game);
  },
  leave(game) {
    setSceneryGhost(game.tool, null);
    sceneryInput(game.tool).shift = false;
  },
  gesture(game, a, tileAt) {
    const tool = game.tool;
    const st = sceneryInput(tool);
    if (a.type === 'hover') {
      st.pointer = 'mouse';
      st.anchor = tileAt(a.x, a.y);
      tool.hoverTile = st.anchor;
      refreshSceneryGhost(game);
      return true;
    }
    if (a.type === 'tap') {
      st.pointer = a.pointerType === 'mouse' ? 'mouse' : 'touch';
      const tile = tileAt(a.x, a.y);
      if (tile === null) return true;
      st.anchor = tile;
      tool.hoverTile = tile;
      refreshSceneryGhost(game);
      // Touch: a tap only moves the ghost; the Confirm button places or removes.
      if (st.pointer === 'mouse') confirmScenery(game);
      return true;
    }
    return false;
  },
  keyDown(game, key) {
    if (key === 'Enter') {
      confirmScenery(game);
      return true;
    }
    return false;
  },
  update(game) {
    refreshSceneryGhost(game);
  },
};

export { sceneryGhostOf };
