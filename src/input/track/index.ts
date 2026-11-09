/**
 * Input routing for the track tool (phase-2 §7.2–7.3). Owner: W2-A. No DOM: the controller feeds it.
 * Map hover and taps go to the track builder; pans and pinches stay with the camera, so two-finger pan and
 * zoom keep working while the builder is open. Keys: `Enter` build or confirm, `Backspace` undo,
 * `C` chain, `1`–`5` palette groups, `R` rotate the station, `Esc` leave the builder.
 */
import type { Game } from '../../game';
import { worldToScreen } from '../../render/camera';
import { resetTrackTool, trackToolOf, type TrackToolState } from '../../render/track/toolState';
import { trackEnd } from '../../sim/rides/track/build';
import { findRide, trackData } from '../../sim/rides/track/common';
import type { TrackPieceInstance } from '../../sim/rides/track/types';
import {
  builderStillValid,
  confirmAction,
  gateCandidates,
  leaveBuilder,
  mapHover,
  mapTap,
  PALETTE_GROUPS,
  previewPieceId,
  refreshPieceGhost,
  refreshStationGhost,
  rotateStation,
  selectGroup,
  toggleChain,
  undoPiece,
} from '../../ui/track/builder';
import { clampToMap } from '../camera';
import type { GestureAction } from '../gestures';
import { mapPointToWorld } from '../camera';

export type TileAt = (x: number, y: number) => number | null;

/** Map gestures in the track tool. Returns true when the gesture was used (pans and pinches are not). */
export function trackGesture(game: Game, a: GestureAction, tileAt: TileAt): boolean {
  switch (a.type) {
    case 'hover':
      mapHover(game, tileAt(a.x, a.y));
      return true;
    case 'tap':
      mapTap(game, tileAt(a.x, a.y), a.pointerType === 'mouse');
      return true;
    case 'longPress':
      trackToolOf(game.tool).touch = true;
      return true;
    default:
      return false;
  }
}

const KEYS = new Set(['Enter', 'Backspace', 'c', 'C', '1', '2', '3', '4', '5', 'Escape', 'Esc', 'r', 'R']);

/** Keys the track tool may use (the browser glue routes them to the controller first). */
export function isTrackKey(key: string): boolean {
  return KEYS.has(key);
}

/** A key in the track tool. Returns true when the builder used it. */
export function trackKeyDown(game: Game, key: string): boolean {
  const st = trackToolOf(game.tool);
  switch (key) {
    case 'Enter':
      confirmAction(game);
      return true;
    case 'Backspace':
      undoPiece(game);
      return true;
    case 'c':
    case 'C':
      if (st.phase !== 'pieces') return false;
      toggleChain(game);
      return true;
    case 'Escape':
    case 'Esc':
      leaveBuilder(game);
      return true;
    case 'r':
    case 'R':
      if (st.phase !== 'station') return false;
      rotateStation(game);
      return true;
    default: {
      const n = Number(key);
      if (st.phase !== 'pieces' || !Number.isInteger(n) || n < 1 || n > PALETTE_GROUPS.length) return false;
      selectGroup(game, (PALETTE_GROUPS[n - 1] as (typeof PALETTE_GROUPS)[number]).id);
      return true;
    }
  }
}

interface RefreshMemo {
  pieces: TrackPieceInstance[] | null;
  n: number;
  last: TrackPieceInstance | null;
  preview: string | null;
  chain: boolean;
  brake: number;
  rev: number;
  frames: number;
  /** Track end the camera last followed. */
  followN: number;
  followRide: number | null;
}

const memos = new WeakMap<TrackToolState, RefreshMemo>();
/** Ghosts are refreshed at least this often (cash changes every tick). */
const REFRESH_FRAMES = 15;

function memoOf(st: TrackToolState): RefreshMemo {
  let m = memos.get(st);
  if (!m) {
    m = { pieces: null, n: -1, last: null, preview: null, chain: false, brake: 0, rev: -1, frames: 0, followN: -1, followRide: null };
    memos.set(st, m);
  }
  return m;
}

/**
 * Once per frame while the track tool is active: refresh the station, piece, or gate ghost and follow the track
 * end. `tileAtClamped` maps a screen point to a map tile; before any pointer input the station ghost starts at
 * the point where the builder keeps the track end (clear of the builder panel).
 */
export function refreshTrackTool(game: Game, viewport: { width: number; height: number }, tileAtClamped: (x: number, y: number) => number): void {
  const t = game.tool;
  const st = trackToolOf(t);
  if (t.tool !== 'track') {
    if (st.phase !== 'idle') resetTrackTool(st);
    return;
  }
  // The builder draws its own ghosts; the generic hover highlight and ghost stay off.
  t.ghost = null;
  t.hoverTile = null;
  if (st.phase === 'idle' || !builderStillValid(game)) {
    leaveBuilder(game, false);
    return;
  }
  const m = memoOf(st);
  m.frames++;
  if (st.phase === 'station') {
    const b = followBox(viewport.width);
    refreshStationGhost(game, st.anchor === null ? tileAtClamped(b.tx * viewport.width, b.ty * viewport.height) : null);
    return;
  }
  const data = st.rideId !== null ? trackData(game.world, st.rideId) : undefined;
  if (!data) return;
  if (st.phase === 'pieces') {
    const preview = previewPieceId(st);
    const n = data.pieces.length;
    const last = data.pieces[n - 1] ?? null;
    const changed =
      m.pieces !== data.pieces || m.n !== n || m.last !== last || m.preview !== preview || m.chain !== st.chain || m.brake !== st.brakeSpeed || m.rev !== st.rev;
    if (changed || m.frames >= REFRESH_FRAMES) {
      refreshPieceGhost(game);
      m.pieces = data.pieces;
      m.n = n;
      m.last = last;
      m.preview = preview;
      m.chain = st.chain;
      m.brake = st.brakeSpeed;
      m.rev = st.rev;
      m.frames = 0;
    }
  } else if (m.frames >= REFRESH_FRAMES) {
    st.gateCandidates = gateCandidates(game.world, data.rideId);
    m.frames = 0;
  }
  if (st.follow) followTrackEnd(game, viewport, m);
}

/** Screen box (fractions of the viewport) the track end should stay in, and where it is put back. */
export function followBox(width: number): { x0: number; x1: number; y0: number; y1: number; tx: number; ty: number } {
  // Narrow screens: the builder is a bottom sheet (≤ 45% of the height). Wide: a side panel on the right.
  return width < 900 ? { x0: 0.1, x1: 0.9, y0: 0.1, y1: 0.42, tx: 0.5, ty: 0.28 } : { x0: 0.14, x1: 0.66, y0: 0.14, y1: 0.8, tx: 0.42, ty: 0.45 };
}

function followTrackEnd(game: Game, viewport: { width: number; height: number }, m: RefreshMemo): void {
  const st = trackToolOf(game.tool);
  const rideId = st.rideId;
  const ride = rideId !== null ? findRide(game.world, rideId) : undefined;
  const data = rideId !== null ? trackData(game.world, rideId) : undefined;
  if (!ride || !data) return;
  const n = data.pieces.length;
  if (m.followRide === rideId && m.followN === n) return;
  m.followRide = rideId;
  m.followN = n;
  const end = trackEnd(game.world, ride, data);
  const cam = game.camera;
  const p = mapPointToWorld(game.world.state.map, end.x + 0.5, end.y + 0.5, end.z, cam.rotation);
  const s = worldToScreen(cam, p.sx, p.sy, viewport.width, viewport.height);
  const b = followBox(viewport.width);
  const inside = s.x >= b.x0 * viewport.width && s.x <= b.x1 * viewport.width && s.y >= b.y0 * viewport.height && s.y <= b.y1 * viewport.height;
  if (inside) return;
  cam.centerX = p.sx - (b.tx * viewport.width - viewport.width / 2) / cam.zoom;
  cam.centerY = p.sy - (b.ty * viewport.height - viewport.height / 2) / cam.zoom;
  clampToMap(cam, game.world.state.map);
}
