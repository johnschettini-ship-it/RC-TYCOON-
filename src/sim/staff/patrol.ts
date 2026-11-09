/** Owner: W1-H. Patrol bitsets: `ceil(w × h / 8)` bytes, bit `i & 7` of byte `i >> 3` (Phase 3 §4.2). */
import type { MapState } from '../map';

export function patrolByteLength(map: Pick<MapState, 'width' | 'height'>): number {
  return Math.ceil((map.width * map.height) / 8);
}

export function createPatrol(map: Pick<MapState, 'width' | 'height'>): Uint8Array {
  return new Uint8Array(patrolByteLength(map));
}

export function patrolHas(patrol: Uint8Array, tile: number): boolean {
  return (((patrol[tile >> 3] ?? 0) >> (tile & 7)) & 1) === 1;
}

export function patrolSet(patrol: Uint8Array, tile: number, on: boolean): void {
  const b = tile >> 3;
  const mask = 1 << (tile & 7);
  const cur = patrol[b] ?? 0;
  patrol[b] = on ? cur | mask : cur & ~mask;
}

export function patrolIsEmpty(patrol: Uint8Array): boolean {
  for (let i = 0; i < patrol.length; i++) if (patrol[i] !== 0) return false;
  return true;
}

/** True when the tile is inside the patrol, or the patrol is the whole park (null). */
export function inPatrol(patrol: Uint8Array | null, tile: number): boolean {
  return patrol === null || patrolHas(patrol, tile);
}
