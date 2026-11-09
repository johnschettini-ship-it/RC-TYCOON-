/**
 * Track builder tool state (phase-2 §7): the client contract the track builder UI (`src/ui/track`),
 * its input routing (`src/input/track`), and the track renderer share. Owner: W2-A.
 * It hangs off the shared `ToolState` (master 5.2) through a side table, so `ToolState` itself does not change.
 * Plain data: the UI and input write it, the renderer only reads it.
 */
import type { Dir } from '../../sim/map';
import type { TrackPieceInstance } from '../../sim/rides/track/types';
import type { ToolState } from '../types';

/**
 * `station`: the station ghost follows the pointer. `pieces`: the palette adds pieces at the track end.
 * `entrance` / `exit`: the builder asks for the gates beside the station. `idle`: not building.
 */
export type TrackPhase = 'idle' | 'station' | 'pieces' | 'entrance' | 'exit';

/** Palette groups (§7.1): Straight, Slopes, Turns, Banking, Special (keys 1–5). */
export type PaletteGroupId = 'straight' | 'slopes' | 'turns' | 'banking' | 'special';

/** Ghost of the next piece at the track end. */
export interface TrackPieceGhost {
  defId: string;
  /** The piece as it would be placed (entry joint of the track end). */
  piece: TrackPieceInstance;
  ok: boolean;
  /** §4.6 reason when not ok. */
  reason: string | null;
  /** Cents (piece × factor, chain extra, height). 0 when not ok. */
  cost: number;
  /** Highest rail above the ground on this piece (m). */
  heightAboveGround: number;
  /** Adding it closes the circuit. */
  closes: boolean;
  /** Occupied tiles (map indices). */
  tiles: number[];
  /** Tiles whose content blocks the piece (red outline). */
  conflictTiles: number[];
}

/** Ghost of a station run: `length` tiles from (x, y) along the map direction `dir`. */
export interface StationGhost {
  typeId: string;
  x: number;
  y: number;
  dir: Dir;
  length: number;
  tiles: number[];
  valid: boolean;
  reason: string | null;
  cost: number;
}

export interface GateGhost {
  kind: 'entrance' | 'exit';
  tile: number;
  valid: boolean;
  reason: string | null;
}

export interface TrackToolState {
  phase: TrackPhase;
  typeId: string | null;
  rideId: number | null;
  /** Station tiles to place (1–12). */
  stationLength: number;
  group: PaletteGroupId;
  /** Selected piece (Build adds it). */
  selected: string | null;
  /** Desktop: palette piece under the mouse (previews its ghost). */
  hovered: string | null;
  /** Chain lift option for the next piece. */
  chain: boolean;
  /** Brake option for the next brakes piece (m/s). */
  brakeSpeed: number;
  /** Keep the track end in view while building. */
  follow: boolean;
  /** The last map input was touch or pen (no hover; taps only move ghosts). */
  touch: boolean;
  /** Tile under the pointer in the station and gate phases. */
  anchor: number | null;
  pieceGhost: TrackPieceGhost | null;
  stationGhost: StationGhost | null;
  gateGhost: GateGhost | null;
  /** Free tiles beside the station where a gate fits. */
  gateCandidates: number[];
  /** Bumped on every change the UI should show. */
  rev: number;
}

export function newTrackToolState(): TrackToolState {
  return {
    phase: 'idle',
    typeId: null,
    rideId: null,
    stationLength: 1,
    group: 'straight',
    selected: null,
    hovered: null,
    chain: false,
    brakeSpeed: 6,
    follow: true,
    touch: false,
    anchor: null,
    pieceGhost: null,
    stationGhost: null,
    gateGhost: null,
    gateCandidates: [],
    rev: 0,
  };
}

const table = new WeakMap<ToolState, TrackToolState>();

/** The track builder state of a tool state (created on first use). */
export function trackToolOf(tool: ToolState): TrackToolState {
  let st = table.get(tool);
  if (!st) {
    st = newTrackToolState();
    table.set(tool, st);
  }
  return st;
}

/** Back to idle (new world, tool change). Keeps the player's follow preference. */
export function resetTrackTool(st: TrackToolState): void {
  const follow = st.follow;
  Object.assign(st, newTrackToolState(), { follow, rev: st.rev + 1 });
}
