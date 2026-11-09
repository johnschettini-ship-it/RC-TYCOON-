/**
 * Footprint and gate geometry for flat rides and stalls. Owner: integrator (contract).
 * Footprint origin (x, y) is the minimum corner. `w` is the front-edge length, `d` the depth.
 * Rotation 0: the front edge faces south (+y). Each rotation step turns 90° clockwise on the map:
 * 0 → front faces S, 1 → W, 2 → N, 3 → E.
 * Rotations 1 and 3 swap the map extent: the footprint covers d × w tiles (x × y).
 */
import { DIR_DX, DIR_DY, inBounds, tileIndex, type Dir, type MapState } from './map';
import { gateIndex } from '../data/catalog/flatRides';
import type { Gate } from './rides/types';

export function frontDir(rotation: Dir): Dir {
  return ((rotation + 2) % 4) as Dir;
}

/** Map extent of a w × d footprint at this rotation. */
export function extent(w: number, d: number, rotation: Dir): { ex: number; ey: number } {
  return rotation % 2 === 0 ? { ex: w, ey: d } : { ex: d, ey: w };
}

/** Map tile for local column `c` (0 … w − 1, along the front edge) and row `r` (0 = front row). */
export function footprintTile(x: number, y: number, w: number, d: number, rotation: Dir, c: number, r: number): { x: number; y: number } {
  switch (rotation) {
    case 0:
      return { x: x + c, y: y + d - 1 - r };
    case 1:
      return { x: x + r, y: y + c };
    case 2:
      return { x: x + w - 1 - c, y: y + r };
    default:
      return { x: x + d - 1 - r, y: y + w - 1 - c };
  }
}

/** All footprint tile indices, or null when any tile is outside the map. */
export function footprintTiles(map: MapState, x: number, y: number, w: number, d: number, rotation: Dir): number[] | null {
  const out: number[] = [];
  for (let r = 0; r < d; r++) {
    for (let c = 0; c < w; c++) {
      const t = footprintTile(x, y, w, d, rotation, c, r);
      if (!inBounds(map, t.x, t.y)) return null;
      out.push(tileIndex(map, t.x, t.y));
    }
  }
  return out;
}

/**
 * Entrance and exit gates (catalog legend rule). The entrance gate is front-edge tile floor((w − 1) / 2);
 * the exit gate is the matching back-edge tile. `outside` is the tile directly beyond each gate,
 * or −1 when it is outside the map.
 */
export function flatRideGates(map: MapState, x: number, y: number, w: number, d: number, rotation: Dir): { entrance: Gate; exit: Gate } {
  const g = gateIndex(w);
  const f = footprintTile(x, y, w, d, rotation, g, 0);
  const b = footprintTile(x, y, w, d, rotation, g, d - 1);
  const fd = frontDir(rotation);
  const bd = ((fd + 2) % 4) as Dir;
  const out = (t: { x: number; y: number }, dir: Dir): number => {
    const nx = t.x + (DIR_DX[dir] as number);
    const ny = t.y + (DIR_DY[dir] as number);
    return inBounds(map, nx, ny) ? tileIndex(map, nx, ny) : -1;
  };
  return {
    entrance: { gate: tileIndex(map, f.x, f.y), outside: out(f, fd) },
    exit: { gate: tileIndex(map, b.x, b.y), outside: out(b, bd) },
  };
}

/** Stall service tile: the neighbour in direction `rotation` (0 = N, 1 = E, 2 = S, 3 = W), or −1. */
export function stallServiceTile(map: MapState, x: number, y: number, rotation: Dir): number {
  const nx = x + (DIR_DX[rotation] as number);
  const ny = y + (DIR_DY[rotation] as number);
  return inBounds(map, nx, ny) ? tileIndex(map, nx, ny) : -1;
}
