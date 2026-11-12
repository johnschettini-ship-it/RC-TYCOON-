/**
 * Track builder logic (phase-2 §7.1–7.3; water rides Phase 4 §4.4). Owner: W2-A; water types W3-C. Pure: no DOM.
 * The builder panel (`panel.ts`) and the map/key routing (`src/input/track`) both drive the builder through
 * these functions; the shared state is `TrackToolState` (`src/render/track/toolState.ts`).
 * Every world change is a command; a failed command shows its reason in a toast (the command is the final word).
 */
import { ALL_TRACK_TYPES, getTrackPieceDef, getTrackTypeDef, type PieceGroup, type TrackPieceDef, type TrackTypeDef } from '../../data/track';
import { TERRAIN_ERR } from '../../data/strings/terrain';
import { TRACK_ERR, TRACK_WARN } from '../../data/strings/track';
import { groundOwnershipBlock } from '../../sim/land/api';
import { maxCorner } from '../../sim/terrain/corners';
import { BRAKE_SPEED, STATION_MAX_TILES, TILE_MM } from '../../data/tuning/track';
import type { Command, CommandResult } from '../../sim/commands/types';
import { Content, inBounds, isOwned, tileIndex, type Dir, type MapState } from '../../sim/map';
import { isUnlocked } from '../../sim/research/api';
import { nextTrackPieces, previewTrackPiece } from '../../sim/rides/track/api';
import { stationPieces, trackEnd } from '../../sim/rides/track/build';
import { findRide, trackData } from '../../sim/rides/track/common';
import { pieceWorldTiles, TRACK_DX, TRACK_DY, trackDirFromMapDir } from '../../sim/rides/track/geometry';
import { buildOccupancy, pieceCost } from '../../sim/rides/track/placement';
import type { TrackPieceInstance } from '../../sim/rides/track/types';
import type { World } from '../../sim/types';
import {
  resetTrackTool,
  trackToolOf,
  type GateGhost,
  type PaletteGroupId,
  type StationGhost,
  type TrackPieceGhost,
  type TrackToolState,
} from '../../render/track/toolState';
import type { ToolState } from '../../render/types';
import { requestTrackTab } from './tabRequest';
import { mapRotationFromView, type ViewRotation } from '../../render/view';

/** What the builder needs from the game: the world, the shared tool state, and command dispatch. */
export interface BuilderHost {
  readonly world: World;
  readonly tool: ToolState;
  /** View rotation (Phase 4). `tool.rotation` is in view terms; commands take map rotation. */
  readonly camera?: { readonly rotation: ViewRotation };
  dispatch(cmd: Command): CommandResult;
}

// ------------------------------------------------------------------ palette

export interface PaletteGroupDef {
  id: PaletteGroupId;
  /** Piece table groups shown under this tab. */
  groups: readonly PieceGroup[];
}

/** §7.1 groups, in key order 1–5. Phase 6 (W4-D): the helix is a turn, the corkscrew a special piece. */
export const PALETTE_GROUPS: readonly PaletteGroupDef[] = Object.freeze([
  { id: 'straight', groups: ['S', 'St'] },
  { id: 'slopes', groups: ['G', 'X'] },
  { id: 'turns', groups: ['Ts', 'Tm', 'Hx'] },
  { id: 'banking', groups: ['B'] },
  { id: 'special', groups: ['Br', 'BB', 'L', 'Sp', 'W', 'Cs'] },
]);

export function paletteGroupOf(group: PieceGroup): PaletteGroupId {
  for (const g of PALETTE_GROUPS) if (g.groups.includes(group)) return g.id;
  return 'special';
}

export interface PaletteGroupView {
  id: PaletteGroupId;
  /** Pieces that fit the track end and the ride type, in piece table order. */
  pieces: TrackPieceDef[];
}

/** Palette for the ride's current track end: every group, with only the pieces that fit (§7.1 step 3). */
export function paletteFor(world: World, rideId: number): PaletteGroupView[] {
  const fit = nextTrackPieces(world, rideId);
  return PALETTE_GROUPS.map((g) => ({ id: g.id, pieces: fit.filter((p) => g.groups.includes(p.group)) }));
}

export function paletteIds(palette: readonly PaletteGroupView[]): string[] {
  const out: string[] = [];
  for (const g of palette) for (const p of g.pieces) out.push(p.id);
  return out;
}

/**
 * Keep the selection valid after the track end changed: drop a selection or hover that no longer fits, and
 * move to the first group with pieces when the current group has none.
 */
export function syncSelection(st: TrackToolState, palette: readonly PaletteGroupView[]): void {
  const ids = paletteIds(palette);
  if (st.selected !== null && !ids.includes(st.selected)) st.selected = null;
  if (st.hovered !== null && !ids.includes(st.hovered)) st.hovered = null;
  const cur = palette.find((g) => g.id === st.group);
  if (!cur || cur.pieces.length === 0) {
    const first = palette.find((g) => g.pieces.length > 0);
    if (first) st.group = first.id;
  }
}

/** The piece whose ghost shows: the hovered palette piece (desktop), else the selected one. */
export function previewPieceId(st: TrackToolState): string | null {
  if (!st.touch && st.hovered !== null) return st.hovered;
  return st.selected;
}

/** The chain option applies to this piece of this ride type. */
export function chainAllowed(typeId: string | null, defId: string | null): boolean {
  const type = typeId ? getTrackTypeDef(typeId) : undefined;
  const def = defId ? getTrackPieceDef(defId) : undefined;
  return !!type && !!def && type.chain && def.chainable;
}

export function isBrakePiece(defId: string | null): boolean {
  return !!defId && getTrackPieceDef(defId)?.special === 'brakes';
}

// ------------------------------------------------------------------ ghosts

/** Height tag of a ghost (§7.1 step 4): `+12 m`. */
export function heightTag(m: number): string {
  return `+${Math.max(0, Math.round(m))} m`;
}

/** Tiles of a failed piece that hold the conflicting thing (red outline, §7.1 step 5). */
export function conflictTiles(world: World, rideId: number, piece: TrackPieceInstance, reason: string): number[] {
  const map = world.state.map;
  const wts = pieceWorldTiles(piece);
  const out: number[] = [];
  const occ = reason === TRACK_ERR.hitsOwnTrack || reason === TRACK_ERR.hitsOtherTrack ? buildOccupancy(world) : null;
  for (const t of wts) {
    if (!inBounds(map, t.x, t.y)) continue;
    const i = tileIndex(map, t.x, t.y);
    const c = map.content[i];
    let hit = false;
    if (reason === TRACK_ERR.outsidePark || reason === TERRAIN_ERR.onlyRights) hit = !isOwned(map, i);
    else if (reason === TRACK_ERR.hitsPath) hit = c === Content.Footpath || c === Content.Queue;
    else if (reason === TRACK_ERR.hitsBuilding) hit = c === Content.Building || c === Content.ParkEntrance;
    else if (reason === TERRAIN_ERR.sceneryInWay) hit = c === Content.Scenery;
    else if (reason === TERRAIN_ERR.trackBelowLand) hit = t.railMin < maxCorner(map, i);
    else if (occ) {
      const envs = occ.get(i) ?? [];
      const want = reason === TRACK_ERR.hitsOwnTrack;
      hit = envs.some((e) => (e.rideId === rideId) === want) || (c === Content.Track && (map.contentRef[i] === rideId) === want);
    } else if (reason === TRACK_ERR.belowGround) hit = t.railMin < (map.heights[i] as number);
    if (hit && !out.includes(i)) out.push(i);
  }
  return out;
}

/** Ghost of `defId` at the ride's track end: the `addTrackPiece` checks without changing anything. */
export function pieceGhostFor(world: World, rideId: number, defId: string, chain: boolean, brakeSpeed: number): TrackPieceGhost | null {
  const ride = findRide(world, rideId);
  const data = trackData(world, rideId);
  const def = getTrackPieceDef(defId);
  if (!ride || !data || !def) return null;
  const end = trackEnd(world, ride, data);
  const useChain = chain && chainAllowed(data.typeId, defId);
  const brake = def.special === 'brakes' ? brakeSpeed : null;
  const piece: TrackPieceInstance = { defId, x: end.x, y: end.y, z: end.z, dir: end.dir, chain: useChain, brakeSpeed: brake, cost: 0 };
  const map = world.state.map;
  const tiles: number[] = [];
  let height = 0;
  for (const t of pieceWorldTiles(piece)) {
    if (!inBounds(map, t.x, t.y)) continue;
    const i = tileIndex(map, t.x, t.y);
    tiles.push(i);
    height = Math.max(height, t.railMax - (map.heights[i] as number));
  }
  const pv = previewTrackPiece(world, rideId, defId, useChain, brake ?? undefined);
  if (pv.ok) {
    piece.cost = pv.cost;
    return { defId, piece, ok: true, reason: null, cost: pv.cost, heightAboveGround: pv.heightAboveGround, closes: pv.closes, tiles: pv.tiles, conflictTiles: [] };
  }
  return { defId, piece, ok: false, reason: pv.reason, cost: 0, heightAboveGround: height, closes: false, tiles, conflictTiles: conflictTiles(world, rideId, piece, pv.reason) };
}

/** Ghost label (§7.1 step 5): `✓ $45` when valid, `✕` when not (the reason shows in the panel). */
export function ghostBadge(g: Pick<TrackPieceGhost, 'ok' | 'cost'>, money: (cents: number) => string): string {
  return g.ok ? `✓ ${money(g.cost)}` : '✕';
}

/** Station tiles needed for a train of `cars` cars (§4.8): ceil(cars × car length / 4 m), 1–12. */
export function minStationTiles(type: TrackTypeDef, cars: number): number {
  return Math.max(1, Math.min(STATION_MAX_TILES, Math.ceil((cars * type.vehicle.carLengthMm) / TILE_MM)));
}

/** Cost of a station run (type base cost + one station piece of the type per tile), cents. */
export function stationCost(type: TrackTypeDef, length: number): number {
  const def = getTrackPieceDef(type.stationPiece);
  return type.costs.base + length * (def ? pieceCost(type, def, false, 0) : 0);
}

function contentReason(c: number | undefined): string | null {
  if (c === Content.Empty) return null;
  if (c === Content.Footpath || c === Content.Queue) return TRACK_ERR.hitsPath;
  if (c === Content.Track) return TRACK_ERR.hitsOtherTrack;
  return TRACK_ERR.hitsBuilding;
}

/** Station ghost: `length` tiles from `anchor` along the map direction `dir`, checked locally (§4.5–4.6). */
export function stationGhostAt(world: World, typeId: string, anchor: number, dir: Dir, length: number): StationGhost | null {
  const type = getTrackTypeDef(typeId);
  const map: MapState = world.state.map;
  if (!type || anchor < 0 || anchor >= map.width * map.height) return null;
  const x = anchor % map.width;
  const y = Math.floor(anchor / map.width);
  const td = trackDirFromMapDir(dir);
  const tiles: number[] = [];
  let reason: string | null = null;
  const ground = map.heights[anchor] as number;
  for (let k = 0; k < length; k++) {
    const tx = x + k * (TRACK_DX[td] as number);
    const ty = y + k * (TRACK_DY[td] as number);
    if (!inBounds(map, tx, ty)) {
      reason ??= TRACK_ERR.outsidePark;
      continue;
    }
    const i = tileIndex(map, tx, ty);
    tiles.push(i);
    if (reason) continue;
    const own = groundOwnershipBlock(map, i);
    if (own) reason = own;
    else if ((map.heights[i] as number) !== ground || (map.slope[i] as number) !== 0) reason = TRACK_ERR.stationOnGround;
    else reason = contentReason(map.content[i]);
  }
  const cost = stationCost(type, length);
  if (!reason && !isUnlocked(world, typeId)) reason = TRACK_ERR.notResearched;
  if (!reason && world.state.park.cash < cost) reason = TRACK_ERR.notEnoughCash;
  return { typeId, x, y, dir, length, tiles, valid: reason === null, reason, cost };
}

// ------------------------------------------------------------------ gates

/** Free, owned tiles beside a station tile's side, where a gate fits (§7.1 step 7). */
export function gateCandidates(world: World, rideId: number): number[] {
  const data = trackData(world, rideId);
  if (!data) return [];
  const map = world.state.map;
  const out: number[] = [];
  for (const p of stationPieces(data)) {
    for (const side of [(p.dir + 1) % 4, (p.dir + 3) % 4]) {
      const x = p.x + (TRACK_DX[side] as number);
      const y = p.y + (TRACK_DY[side] as number);
      if (!inBounds(map, x, y)) continue;
      const i = tileIndex(map, x, y);
      if (!isOwned(map, i) || map.content[i] !== Content.Empty || out.includes(i)) continue;
      out.push(i);
    }
  }
  return out;
}

/** Gate ghost on `tile`: valid on a candidate, else the `placeTrackGate` reason. */
export function gateGhostAt(world: World, rideId: number, kind: 'entrance' | 'exit', tile: number): GateGhost {
  const map = world.state.map;
  const data = trackData(world, rideId);
  const x = tile % map.width;
  const y = Math.floor(tile / map.width);
  let reason: string | null = null;
  if (!data) reason = TRACK_ERR.noRide;
  else if (!inBounds(map, x, y)) reason = TRACK_ERR.outsidePark;
  else if (groundOwnershipBlock(map, tile)) reason = groundOwnershipBlock(map, tile);
  else if (!stationPieces(data).some((p) => [(p.dir + 1) % 4, (p.dir + 3) % 4].some((s) => p.x + (TRACK_DX[s] as number) === x && p.y + (TRACK_DY[s] as number) === y))) {
    reason = TRACK_ERR.gateBesideStation;
  } else if (map.content[tile] !== Content.Empty) reason = TRACK_ERR.tileNotEmpty;
  return { kind, tile, valid: reason === null, reason };
}

// ------------------------------------------------------------------ flow

function bump(st: TrackToolState): void {
  st.rev++;
}

/**
 * Track types the Rides picker lists: every unlocked type (Phase 3 types once researched; the Phase 4 water rides once
 * researched and `BUILD_MAX_PHASE` reaches 4).
 */
export function pickableTrackTypes(world: World): TrackTypeDef[] {
  return ALL_TRACK_TYPES.filter((t) => isUnlocked(world, t.id));
}

/** Pick a track type: the station ghost follows the pointer (§7.1 steps 1–2). */
export function startStation(host: BuilderHost, typeId: string): void {
  const type = getTrackTypeDef(typeId);
  if (!type) return;
  const t = host.tool;
  const st = trackToolOf(t);
  resetTrackTool(st);
  t.tool = 'track';
  t.defId = null;
  t.ghost = null;
  t.drag = null;
  t.hoverTile = null;
  t.rotation = 1;
  st.phase = 'station';
  st.typeId = typeId;
  st.stationLength = minStationTiles(type, type.vehicle.defaultCars);
  bump(st);
}

export function rotateStation(host: BuilderHost): void {
  const st = trackToolOf(host.tool);
  if (st.phase !== 'station') return;
  host.tool.rotation = ((host.tool.rotation + 1) % 4) as Dir;
  bump(st);
}

export function setStationLength(host: BuilderHost, length: number): void {
  const st = trackToolOf(host.tool);
  st.stationLength = Math.max(1, Math.min(STATION_MAX_TILES, Math.round(length)));
  bump(st);
}

/** Recompute the station ghost at the anchor (or `fallback`, the tile at the screen centre). */
export function refreshStationGhost(host: BuilderHost, fallback: number | null): void {
  const st = trackToolOf(host.tool);
  const anchor = st.anchor ?? fallback;
  st.stationGhost = st.typeId && anchor !== null ? stationGhostAt(host.world, st.typeId, anchor, mapRotationFromView(host.tool.rotation, host.camera?.rotation ?? 0), st.stationLength) : null;
}

/** Place the station run of the ghost. Returns the new ride id, or null. */
export function placeStationNow(host: BuilderHost): number | null {
  const st = trackToolOf(host.tool);
  const g = st.stationGhost;
  if (st.phase !== 'station' || !g) return null;
  const r = host.dispatch({ type: 'placeStation', typeId: g.typeId, x: g.x, y: g.y, dir: g.dir });
  if (!r.ok || r.id === undefined) return null;
  const rideId = r.id;
  const stationPiece = getTrackTypeDef(g.typeId)?.stationPiece ?? 'station';
  for (let k = 1; k < g.length; k++) {
    if (!host.dispatch({ type: 'addTrackPiece', rideId, defId: stationPiece }).ok) break;
  }
  enterPieces(host, rideId);
  return rideId;
}

/** Builder on an existing ride's track end (after placing the station, or Edit track). */
export function enterPieces(host: BuilderHost, rideId: number): void {
  const st = trackToolOf(host.tool);
  const data = trackData(host.world, rideId);
  const t = host.tool;
  t.tool = 'track';
  t.ghost = null;
  t.hoverTile = null;
  st.rideId = rideId;
  st.typeId = data?.typeId ?? st.typeId;
  st.phase = 'pieces';
  st.anchor = null;
  st.stationGhost = null;
  st.gateGhost = null;
  st.selected = null;
  st.hovered = null;
  st.chain = false;
  st.brakeSpeed = BRAKE_SPEED.default;
  syncSelection(st, paletteFor(host.world, rideId));
  // A closed circuit without both gates asks for them; with both, the builder stays for Undo and gate moves.
  const ride = findRide(host.world, rideId);
  if (data?.circuitClosed && ride && (!ride.entrance || !ride.exit)) askForGates(host);
  bump(st);
}

/** Continue building a ride (Edit track, §7.4): returns it to `building` when needed. */
export function editTrackRide(host: BuilderHost, rideId: number): boolean {
  const ride = findRide(host.world, rideId);
  if (!ride || ride.kind !== 'track') return false;
  if (ride.status !== 'building' && !host.dispatch({ type: 'editTrack', rideId }).ok) return false;
  resetTrackTool(trackToolOf(host.tool));
  enterPieces(host, rideId);
  return true;
}

export function selectPiece(host: BuilderHost, defId: string): void {
  const st = trackToolOf(host.tool);
  const def = getTrackPieceDef(defId);
  if (st.phase !== 'pieces' || !def) return;
  st.selected = defId;
  st.group = paletteGroupOf(def.group);
  bump(st);
}

/** Desktop hover preview over a palette piece (null when the mouse leaves). */
export function hoverPiece(host: BuilderHost, defId: string | null): void {
  const st = trackToolOf(host.tool);
  if (st.hovered === defId) return;
  st.hovered = defId;
  bump(st);
}

export function selectGroup(host: BuilderHost, group: PaletteGroupId): void {
  const st = trackToolOf(host.tool);
  if (st.group === group) return;
  st.group = group;
  bump(st);
}

export function toggleChain(host: BuilderHost): void {
  const st = trackToolOf(host.tool);
  const type = st.typeId ? getTrackTypeDef(st.typeId) : undefined;
  if (!type?.chain) return;
  st.chain = !st.chain;
  bump(st);
}

export function stepBrakeSpeed(host: BuilderHost, delta: number): void {
  const st = trackToolOf(host.tool);
  const v = Math.max(BRAKE_SPEED.min, Math.min(BRAKE_SPEED.max, st.brakeSpeed + delta));
  if (v === st.brakeSpeed) return;
  st.brakeSpeed = v;
  bump(st);
}

/** Recompute the ghost of the previewed piece. */
export function refreshPieceGhost(host: BuilderHost): void {
  const st = trackToolOf(host.tool);
  const id = st.phase === 'pieces' && st.rideId !== null ? previewPieceId(st) : null;
  st.pieceGhost = id !== null && st.rideId !== null ? pieceGhostFor(host.world, st.rideId, id, st.chain, st.brakeSpeed) : null;
}

/**
 * Build mode (Task 22): the track builder is open, in its station step or a piece step. The interface hides the deck
 * list and the hand while it is on.
 */
export function buildModeOn(tool: ToolState): boolean {
  return tool.tool === 'track' && trackToolOf(tool).phase !== 'idle';
}

/**
 * Why the selected piece cannot be built (Task 22): the reason of its ghost when the map shows it with ✕, else null.
 * A ghost of another piece (the desktop hover preview) says nothing about the selected one.
 */
export function blockedReason(st: TrackToolState): string | null {
  const g = st.pieceGhost;
  if (st.phase !== 'pieces' || st.selected === null || !g || g.defId !== st.selected || g.ok) return null;
  return g.reason ?? '';
}

/**
 * Build the selected piece (Build button, `Enter`, a click on the ghost, a double-click). A piece whose ghost shows ✕
 * is not tried (Task 22): the builder already shows the reason, so nothing is built and no toast repeats it.
 */
export function buildSelected(host: BuilderHost): CommandResult | null {
  const st = trackToolOf(host.tool);
  if (st.phase !== 'pieces' || st.rideId === null || st.selected === null) return null;
  if (blockedReason(st) !== null) return null;
  const def = getTrackPieceDef(st.selected);
  if (!def) return null;
  const cmd: Extract<Command, { type: 'addTrackPiece' }> = { type: 'addTrackPiece', rideId: st.rideId, defId: def.id };
  if (st.chain && chainAllowed(st.typeId, def.id)) cmd.chain = true;
  if (def.special === 'brakes') cmd.brakeSpeed = st.brakeSpeed;
  const r = host.dispatch(cmd);
  if (r.ok) afterTrackChange(host, r.warnings.includes(TRACK_WARN.circuitComplete));
  return r;
}

/** Remove the last piece (Undo, `Backspace`). A closed circuit opens again, so the builder returns to pieces. */
export function undoPiece(host: BuilderHost): CommandResult | null {
  const st = trackToolOf(host.tool);
  if (st.rideId === null || (st.phase !== 'pieces' && st.phase !== 'entrance' && st.phase !== 'exit')) return null;
  const r = host.dispatch({ type: 'removeLastTrackPiece', rideId: st.rideId });
  if (r.ok) {
    st.phase = 'pieces';
    st.gateGhost = null;
    st.gateCandidates = [];
    st.anchor = null;
    afterTrackChange(host, false);
  }
  return r;
}

function afterTrackChange(host: BuilderHost, closed: boolean): void {
  const st = trackToolOf(host.tool);
  if (st.rideId === null) return;
  syncSelection(st, paletteFor(host.world, st.rideId));
  if (closed) askForGates(host);
  bump(st);
}

/** After the circuit closes, ask for the missing gates (§7.1 step 7); with both gates, finish. */
function askForGates(host: BuilderHost): void {
  const st = trackToolOf(host.tool);
  const ride = st.rideId !== null ? findRide(host.world, st.rideId) : undefined;
  if (!ride) return;
  st.selected = null;
  st.hovered = null;
  st.pieceGhost = null;
  st.anchor = null;
  st.gateGhost = null;
  if (!ride.entrance) st.phase = 'entrance';
  else if (!ride.exit) st.phase = 'exit';
  else {
    finishBuilder(host);
    return;
  }
  st.gateCandidates = gateCandidates(host.world, ride.id);
}

/** Point a gate at `tile` (touch: shows the gate ghost until Confirm). */
export function aimGate(host: BuilderHost, tile: number): void {
  const st = trackToolOf(host.tool);
  if ((st.phase !== 'entrance' && st.phase !== 'exit') || st.rideId === null) return;
  st.anchor = tile;
  st.gateGhost = gateGhostAt(host.world, st.rideId, st.phase, tile);
  bump(st);
}

/** Place the gate the builder asks for at `tile` (or at the aimed tile). */
export function placeGateNow(host: BuilderHost, tile: number | null = null): CommandResult | null {
  const st = trackToolOf(host.tool);
  const at = tile ?? st.anchor;
  if ((st.phase !== 'entrance' && st.phase !== 'exit') || st.rideId === null || at === null) return null;
  const map = host.world.state.map;
  const r = host.dispatch({ type: 'placeTrackGate', rideId: st.rideId, kind: st.phase, x: at % map.width, y: Math.floor(at / map.width) });
  if (r.ok) {
    st.anchor = null;
    st.gateGhost = null;
    askForGates(host);
    bump(st);
  }
  return r;
}

/** Ask for a gate again (move an entrance or exit), from the builder's Done screen. */
export function chooseGate(host: BuilderHost, kind: 'entrance' | 'exit'): void {
  const st = trackToolOf(host.tool);
  if (st.rideId === null || st.phase === 'station' || st.phase === 'idle') return;
  st.phase = kind;
  st.anchor = null;
  st.gateGhost = null;
  st.selected = null;
  st.hovered = null;
  st.pieceGhost = null;
  st.gateCandidates = gateCandidates(host.world, st.rideId);
  bump(st);
}

/** Done: the ride panel opens on the Test tab (§7.1 step 8). */
export function finishBuilder(host: BuilderHost): void {
  const st = trackToolOf(host.tool);
  const rideId = st.rideId;
  leaveBuilder(host, false);
  if (rideId !== null && findRide(host.world, rideId)) {
    requestTrackTab(rideId, 'test');
    host.tool.selectedEntity = { kind: 'ride', id: rideId };
  }
}

/** Leave the builder (`Esc`, Done). The track stays as it is; `showRide` opens its panel. */
export function leaveBuilder(host: BuilderHost, showRide = true): void {
  const t = host.tool;
  const st = trackToolOf(t);
  const rideId = st.phase === 'station' ? null : st.rideId;
  resetTrackTool(st);
  if (t.tool === 'track') t.tool = 'inspect';
  t.ghost = null;
  if (showRide && rideId !== null && findRide(host.world, rideId)) {
    requestTrackTab(rideId, 'track');
    t.selectedEntity = { kind: 'ride', id: rideId };
  }
}

/** Primary action of the current phase (`Enter`, the Build / Confirm button). */
export function confirmAction(host: BuilderHost): void {
  const st = trackToolOf(host.tool);
  if (st.phase === 'station') placeStationNow(host);
  else if (st.phase === 'pieces') buildSelected(host);
  else if (st.phase === 'entrance' || st.phase === 'exit') placeGateNow(host);
}

/**
 * A tap or click on the map tile `tile` (null: off the map) in the track tool (§7.2–7.3).
 * Mouse: places the station or gate, or builds when the click hits the ghost. Touch: only moves the ghost;
 * map taps never add pieces.
 */
export function mapTap(host: BuilderHost, tile: number | null, mouse: boolean): void {
  const st = trackToolOf(host.tool);
  st.touch = !mouse;
  if (tile === null) return;
  switch (st.phase) {
    case 'station':
      st.anchor = tile;
      refreshStationGhost(host, null);
      if (mouse) placeStationNow(host);
      bump(st);
      return;
    case 'pieces':
      if (mouse && st.selected !== null) {
        if (st.hovered !== null && st.hovered !== st.selected) return;
        const g = st.pieceGhost;
        if (g && g.defId === st.selected && g.tiles.includes(tile)) buildSelected(host);
      }
      return;
    case 'entrance':
    case 'exit':
      aimGate(host, tile);
      if (mouse) placeGateNow(host, tile);
      return;
    default:
      return;
  }
}

/** Mouse hover over the map in the track tool. */
export function mapHover(host: BuilderHost, tile: number | null): void {
  const st = trackToolOf(host.tool);
  st.touch = false;
  if (st.phase !== 'station' && st.phase !== 'entrance' && st.phase !== 'exit') return;
  if (st.anchor === tile) return;
  st.anchor = tile;
  if (st.phase === 'station') refreshStationGhost(host, null);
  else if (tile !== null && st.rideId !== null) st.gateGhost = gateGhostAt(host.world, st.rideId, st.phase, tile);
  else st.gateGhost = null;
  bump(st);
}

/** The world was replaced or the ride is gone: back to idle. */
export function builderStillValid(host: BuilderHost): boolean {
  const st = trackToolOf(host.tool);
  if (st.phase === 'idle' || st.phase === 'station') return true;
  return st.rideId !== null && !!trackData(host.world, st.rideId);
}
