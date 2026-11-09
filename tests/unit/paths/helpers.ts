/**
 * W3-B test helpers: shape the land and add elevated paths directly (the terrain commands belong to W3-A),
 * and run commands that must succeed.
 */
import { executeCommand, type Command, type CommandResult } from '../../../src/sim/commands';
import { Content, tileIndex } from '../../../src/sim/map';
import { allocId } from '../../../src/sim/ids';
import { markNetworkDirty } from '../../../src/sim/pathing';
import type { ElevatedPath, PathKind, RampDir } from '../../../src/sim/paths/types';
import type { World } from '../../../src/sim/types';

export const T = (w: World, x: number, y: number): number => tileIndex(w.state.map, x, y);

/** Set a tile's base height and slope mask (bits N = 1, E = 2, S = 4, W = 8). */
export function setLand(w: World, x: number, y: number, height: number, slope = 0): number {
  const i = T(w, x, y);
  w.state.map.heights[i] = height;
  w.state.map.slope[i] = slope;
  markNetworkDirty(w);
  return i;
}

/** Fill a rectangle with flat land at `height`. */
export function setLandRect(w: World, x0: number, y0: number, x1: number, y1: number, height: number): void {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) setLand(w, x, y, height, 0);
}

export function setWater(w: World, x: number, y: number, surface: number): number {
  const i = T(w, x, y);
  w.state.map.water[i] = surface;
  markNetworkDirty(w);
  return i;
}

/** A ground path written straight into the map (no checks). */
export function groundPath(w: World, x: number, y: number, kind: PathKind = 'footpath'): number {
  const i = T(w, x, y);
  w.state.map.content[i] = kind === 'queue' ? Content.Queue : Content.Footpath;
  markNetworkDirty(w);
  return i;
}

/** An elevated path written straight into the state (no checks). */
export function elevated(w: World, x: number, y: number, z: number, kind: PathKind = 'footpath', rampDir: RampDir = -1): ElevatedPath {
  const p: ElevatedPath = { id: allocId(w.state), x, y, z, kind, rampDir };
  w.state.elevatedPaths.push(p);
  markNetworkDirty(w);
  return p;
}

export function must(w: World, cmd: Command): CommandResult & { ok: true } {
  const r = executeCommand(w, cmd);
  if (!r.ok) throw new Error(`Command ${cmd.type} failed: ${r.reason} (${JSON.stringify(cmd)})`);
  return r;
}

export function reason(w: World, cmd: Command): string | null {
  const r = executeCommand(w, cmd);
  return r.ok ? null : r.reason;
}
