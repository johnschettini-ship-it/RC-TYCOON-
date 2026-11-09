/**
 * Land and Water tool input (Phase 4 §7). Owner: W3-A.
 * Desktop: the brush ghost follows the cursor with a cost tooltip; click applies; holding repeats every 300 ms;
 * Level drags a rectangle. Touch: tap places the ghost; the mini-bar Raise / Lower apply; Corner mode marks the
 * corner first. Options live in `game.tool.land`; the ghost in `game.tool.brush`.
 *
 * Mouse: a left press applies the mode at the cursor on the next frame, then again every 300 ms while the button is
 * held (also while the cursor moves: a brush stroke); Shift does the opposite (lower instead of raise). Level drags a
 * rectangle from the first tile pressed (target = its lowest corner) and levels it on release.
 * Touch and pen: a tap moves the ghost (and marks the corner in Corner mode); one-finger drags pan, except in Level
 * mode, where a drag draws the rectangle; the bar applies (`pressLandButton`). `Page Up` / `Page Down` raise and
 * lower at the ghost (Level: the target).
 * The press itself reaches this router through `noteLandPointerDown` (`render/terrainTools/toolState.ts`), which the
 * browser glue (`ui/land`) calls in the capture phase; without it a mouse click still applies on release.
 */
import type { Game } from '../../game';
import { LAND_REPEAT_MS } from '../../data/tuning/terrain';
import { screenToWorld } from '../../render/camera';
import { pickTile, screenToTileExact } from '../../render/iso';
import { isTerrainTool, landToolOf, resetLandTransient, type LandAction, type LandToolExtra } from '../../render/terrainTools/toolState';
import type { BrushGhost, ToolState } from '../../render/types';
import type { TerrainCommand } from '../../sim/commands/types';
import type { Dir, MapState } from '../../sim/map';
import { cornerVertex } from '../../sim/terrain/brush';
import { previewTerrainCommand } from '../../sim/terrain/commands';
import { minCorner } from '../../sim/terrain/corners';
import type { Corner } from '../../sim/terrain/types';
import type { DragMode, GestureAction } from '../gestures';
import type { TileAt, ToolRouter } from '../toolRouters';

/** Canvas size in CSS px (written by the browser glue into the side table), or null when unknown. */
function viewportOf(game: Game): { width: number; height: number } | null {
  const s = landToolOf(game.tool);
  return s.viewW > 0 && s.viewH > 0 ? { width: s.viewW, height: s.viewH } : null;
}

/** Ghost refresh at least this often (cash and the map change while the pointer rests). */
const GHOST_REFRESH_MS = 250;

/**
 * Corner of tile `tile` nearest a point given in continuous view coordinates (u, v) (the inverse of the master 6.4
 * projection at the tile's height): the point goes back to map terms through the inverse of `mapToViewContinuous`,
 * then the quadrant of the tile picks N, E, S, or W.
 */
export function landPickCorner(map: Pick<MapState, 'width' | 'height'>, tile: number, u: number, v: number, r: Dir): Corner {
  const W = map.width;
  const H = map.height;
  let fx: number;
  let fy: number;
  switch (r) {
    case 1:
      fx = v;
      fy = H - u;
      break;
    case 2:
      fx = W - u;
      fy = H - v;
      break;
    case 3:
      fx = W - v;
      fy = u;
      break;
    default:
      fx = u;
      fy = v;
  }
  const lx = fx - (tile % W);
  const ly = fy - Math.floor(tile / W);
  const east = lx >= 0.5;
  const south = ly >= 0.5;
  if (!south) return east ? 1 : 0;
  return east ? 2 : 3;
}

/** Corner under screen point (x, y) of `tile`, or the current one when the canvas size is unknown. */
function cornerAt(game: Game, tile: number, x: number, y: number): Corner {
  const map = game.world.state.map;
  const vp = viewportOf(game);
  if (!vp) return game.tool.land.corner ?? 0;
  const p = screenToWorld(game.camera, x, y, vp.width, vp.height);
  const z = (map.heights[tile] as number) + ((map.slope[tile] as number) !== 0 ? 0.5 : 0);
  const t = screenToTileExact(p.x, p.y, z);
  return landPickCorner(map, tile, t.x, t.y, game.camera.rotation);
}

/** Last `tileAt` the controller gave (bound once per controller), to find the screen-centre tile. */
let lastTileAt: TileAt | null = null;

function centreTile(game: Game): number {
  const vp = viewportOf(game);
  if (lastTileAt && vp) {
    const t = lastTileAt(vp.width / 2, vp.height / 2);
    if (t !== null) return t;
  }
  const map = game.world.state.map;
  return pickTile(map, game.camera.centerX, game.camera.centerY) ?? -1;
}

function anchorOf(game: Game, s: LandToolExtra): number {
  const n = game.world.state.map.width * game.world.state.map.height;
  if (s.anchor >= 0 && s.anchor < n) return s.anchor;
  return centreTile(game);
}

function setAnchor(game: Game, s: LandToolExtra, tile: number | null, x: number, y: number): void {
  if (tile === null) return;
  s.anchor = tile;
  if (game.tool.tool === 'land' && game.tool.land.mode === 'corner') game.tool.land.corner = cornerAt(game, tile, x, y);
}

/** The command a land or water action sends at tile `tile` (null: nothing to do in this mode). */
export function landCommand(tool: ToolState, tile: number, width: number, raise: boolean): TerrainCommand | null {
  if (tile < 0) return null;
  const x = tile % width;
  const y = Math.floor(tile / width);
  const size = tool.land.size;
  if (tool.tool === 'water') return { type: raise ? 'raiseWater' : 'lowerWater', x, y, size };
  switch (tool.land.mode) {
    case 'raise':
    case 'lower':
      return { type: raise ? 'raiseLand' : 'lowerLand', x, y, size };
    case 'smooth':
      return { type: 'smoothLand', x, y, size };
    case 'paint':
      return { type: 'paintTerrain', x, y, size, terrain: tool.land.paint };
    case 'corner':
      return { type: raise ? 'raiseCorner' : 'lowerCorner', x, y, corner: tool.land.corner ?? 0 };
    default:
      return null;
  }
}

/** Raise (true) or lower for a click: the mode's direction, flipped by Shift. */
function clickRaises(tool: ToolState, s: LandToolExtra, shift: boolean): boolean {
  const base = tool.tool === 'water' ? s.waterMode === 'raise' : tool.land.mode !== 'lower';
  return shift ? !base : base;
}

function send(game: Game, s: LandToolExtra, cmd: TerrainCommand | null): void {
  if (!cmd) return;
  game.dispatch(cmd);
  s.sent++;
}

function clearRect(s: LandToolExtra): void {
  s.rectStart = -1;
  s.rectEnd = -1;
  s.rectPending = false;
}

function levelCommand(game: Game, s: LandToolExtra): TerrainCommand | null {
  const t = game.tool.land.levelTarget;
  if (s.rectStart < 0 || s.rectEnd < 0 || t === null) return null;
  const w = game.world.state.map.width;
  return { type: 'levelLand', x0: s.rectStart % w, y0: Math.floor(s.rectStart / w), x1: s.rectEnd % w, y1: Math.floor(s.rectEnd / w), targetHeight: t };
}

function confirmLevel(game: Game, s: LandToolExtra): void {
  const cmd = levelCommand(game, s);
  clearRect(s);
  send(game, s, cmd);
}

function startRect(game: Game, s: LandToolExtra, tile: number): void {
  s.rectStart = tile;
  s.rectEnd = tile;
  s.rectPending = false;
  s.anchor = tile;
  game.tool.land.levelTarget = minCorner(game.world.state.map, tile);
}

function isLevel(tool: ToolState): boolean {
  return tool.tool === 'land' && tool.land.mode === 'level';
}

/** A bar button or key action. */
function runAction(game: Game, s: LandToolExtra, action: LandAction): void {
  const tool = game.tool;
  const map = game.world.state.map;
  if (isLevel(tool)) {
    if (action === 'confirm' || action === 'apply') {
      if (s.rectStart < 0) startRect(game, s, anchorOf(game, s));
      confirmLevel(game, s);
      return;
    }
    if (s.rectStart < 0) {
      const a = anchorOf(game, s);
      if (a < 0) return;
      startRect(game, s, a);
    }
    s.rectPending = true;
    const cur = tool.land.levelTarget ?? 0;
    tool.land.levelTarget = Math.max(0, Math.min(63, cur + (action === 'raise' ? 1 : -1)));
    return;
  }
  if (action === 'confirm') return;
  const raise = action === 'apply' ? clickRaises(tool, s, false) : action === 'raise';
  send(game, s, landCommand(tool, anchorOf(game, s), map.width, raise));
}

function gesture(game: Game, a: GestureAction, tileAt: TileAt): boolean {
  lastTileAt = tileAt;
  const tool = game.tool;
  const s = landToolOf(tool);
  const map = game.world.state.map;
  switch (a.type) {
    case 'hover':
      setAnchor(game, s, tileAt(a.x, a.y), a.x, a.y);
      return true;
    case 'tap':
    case 'longPress': {
      const tile = tileAt(a.x, a.y);
      setAnchor(game, s, tile, a.x, a.y);
      const mouse = a.pointerType === 'mouse';
      if (isLevel(tool)) {
        if (tile === null) return true;
        startRect(game, s, tile);
        if (mouse && a.type === 'tap') confirmLevel(game, s);
        else s.rectPending = true;
        return true;
      }
      if (!mouse || a.type === 'longPress') return true;
      // The press already applied (hold-to-repeat): the release does not apply again.
      if (s.pressApplied) {
        s.pressApplied = false;
        return true;
      }
      if (tile !== null) send(game, s, landCommand(tool, tile, map.width, clickRaises(tool, s, s.pressShift)));
      return true;
    }
    case 'dragStart': {
      const tile = tileAt(a.x, a.y);
      if (isLevel(tool)) {
        if (tile !== null) startRect(game, s, tile);
        return true;
      }
      setAnchor(game, s, tile, a.x, a.y);
      return true;
    }
    case 'dragMove': {
      const tile = tileAt(a.x, a.y);
      if (isLevel(tool)) {
        if (tile !== null && s.rectStart >= 0) {
          s.rectEnd = tile;
          s.anchor = tile;
        }
        return true;
      }
      setAnchor(game, s, tile, a.x, a.y);
      return true;
    }
    case 'dragEnd': {
      if (isLevel(tool)) {
        if (s.rectStart < 0) return true;
        if (s.pointer === 'mouse') confirmLevel(game, s);
        else s.rectPending = true;
        return true;
      }
      s.pressApplied = false;
      return true;
    }
    case 'dragCancel':
      clearRect(s);
      s.pressApplied = false;
      return true;
    default:
      return false;
  }
}

function keyDown(game: Game, key: string): boolean {
  if (key !== 'PageUp' && key !== 'PageDown') return false;
  runAction(game, landToolOf(game.tool), key === 'PageUp' ? 'raise' : 'lower');
  return true;
}

/** The ghost's command at the anchor (Level: the rectangle, or the anchor tile at its own lowest corner). */
function ghostCommand(game: Game, s: LandToolExtra, anchor: number): TerrainCommand | null {
  const tool = game.tool;
  const map = game.world.state.map;
  if (isLevel(tool)) {
    if (s.rectStart >= 0) return levelCommand(game, s);
    const x = anchor % map.width;
    const y = Math.floor(anchor / map.width);
    return { type: 'levelLand', x0: x, y0: y, x1: x, y1: y, targetHeight: minCorner(map, anchor) };
  }
  const raise = clickRaises(tool, s, false);
  return landCommand(tool, anchor, map.width, raise);
}

interface GhostMemo {
  tool: string;
  anchor: number;
  mode: string;
  size: number;
  paint: number;
  corner: number;
  target: number;
  rectStart: number;
  rectEnd: number;
  water: string;
  sent: number;
  rotation: number;
  at: number;
}

const memos = new WeakMap<ToolState, GhostMemo>();

function refreshGhost(game: Game, s: LandToolExtra, now: number): void {
  const tool = game.tool;
  const anchor = anchorOf(game, s);
  if (anchor < 0) {
    tool.brush = null;
    return;
  }
  let m = memos.get(tool);
  if (!m) {
    m = { tool: '', anchor: -2, mode: '', size: 0, paint: -1, corner: -1, target: -1, rectStart: -2, rectEnd: -2, water: '', sent: -1, rotation: -1, at: -Infinity };
    memos.set(tool, m);
  }
  const same =
    tool.brush !== null &&
    m.tool === tool.tool &&
    m.anchor === anchor &&
    m.mode === tool.land.mode &&
    m.size === tool.land.size &&
    m.paint === tool.land.paint &&
    m.corner === (tool.land.corner ?? -1) &&
    m.target === (tool.land.levelTarget ?? -1) &&
    m.rectStart === s.rectStart &&
    m.rectEnd === s.rectEnd &&
    m.water === s.waterMode &&
    m.sent === s.sent &&
    m.rotation === game.camera.rotation &&
    now - m.at < GHOST_REFRESH_MS &&
    now >= m.at;
  if (same) return;
  m.tool = tool.tool;
  m.anchor = anchor;
  m.mode = tool.land.mode;
  m.size = tool.land.size;
  m.paint = tool.land.paint;
  m.corner = tool.land.corner ?? -1;
  m.target = tool.land.levelTarget ?? -1;
  m.rectStart = s.rectStart;
  m.rectEnd = s.rectEnd;
  m.water = s.waterMode;
  m.sent = s.sent;
  m.rotation = game.camera.rotation;
  m.at = now;
  const cmd = ghostCommand(game, s, anchor);
  if (!cmd) {
    tool.brush = null;
    return;
  }
  const p = previewTerrainCommand(game.world, cmd);
  let corner: BrushGhost['corner'] = null;
  if (cmd.type === 'raiseCorner' || cmd.type === 'lowerCorner') {
    const v = cornerVertex(cmd.x, cmd.y, cmd.corner);
    corner = { x: v.vx, y: v.vy };
  }
  tool.brush = { tiles: p.tiles, cost: p.cost, valid: p.ok, reason: p.ok ? (p.warnings[0] ?? null) : p.reason, corner };
}

/** Every 300 ms; after a stall (slow frame, hidden tab) the next repeat is 300 ms from now, not a burst. */
function nextRepeat(due: number, now: number): number {
  const next = due + LAND_REPEAT_MS;
  return next > now ? next : now + LAND_REPEAT_MS;
}

function update(game: Game, now: number): void {
  const tool = game.tool;
  if (!isTerrainTool(tool.tool)) return;
  const s = landToolOf(tool);
  const map = game.world.state.map;
  if (s.queued.length > 0) {
    for (const a of s.queued.splice(0)) runAction(game, s, a);
    s.heldNextMs = now + LAND_REPEAT_MS;
  } else if (s.held && now >= s.heldNextMs) {
    runAction(game, s, s.held);
    s.heldNextMs = nextRepeat(s.heldNextMs, now);
  }
  if (s.pressDown && !isLevel(tool)) {
    if (!s.pressApplied) {
      s.pressApplied = true;
      s.nextRepeatMs = now + LAND_REPEAT_MS;
      send(game, s, landCommand(tool, anchorOf(game, s), map.width, clickRaises(tool, s, s.pressShift)));
    } else if (now >= s.nextRepeatMs) {
      s.nextRepeatMs = nextRepeat(s.nextRepeatMs, now);
      send(game, s, landCommand(tool, anchorOf(game, s), map.width, clickRaises(tool, s, s.pressShift)));
    }
  }
  refreshGhost(game, s, now);
}

function primaryDrag(game: Game): DragMode {
  if (isLevel(game.tool)) return 'build';
  return landToolOf(game.tool).pointer === 'mouse' ? 'build' : 'pan';
}

function enter(game: Game): void {
  resetLandTransient(landToolOf(game.tool));
  game.tool.brush = null;
}

function leave(game: Game): void {
  resetLandTransient(landToolOf(game.tool));
  game.tool.brush = null;
  game.tool.land.levelTarget = null;
}

export const landRouter: ToolRouter = { primaryDrag, gesture, keyDown, update, enter, leave };
export const waterRouter: ToolRouter = { primaryDrag, gesture, keyDown, update, enter, leave };
