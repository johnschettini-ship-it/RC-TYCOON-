/**
 * Patrol painting (Phase 3 §7.2). Owner: W2-B. Pure: no DOM.
 * A stroke collects brush stamps along the pointer path; at the end of the drag it becomes one
 * `editPatrol` command. Paint never includes tiles outside the park (the command would refuse them).
 */
import type { BrushSize, PatrolMode } from '../render/management/toolOptions';
import type { StaffCommand } from '../sim/commands/types';
import { isOwned, type MapState } from '../sim/map';

/** Tiles under a square brush of `size` centred on `center`, clipped to the map, in index order. */
export function brushTiles(map: MapState, center: number, size: BrushSize, mode: PatrolMode): number[] {
  const w = map.width;
  const cx = center % w;
  const cy = Math.floor(center / w);
  const r = (size - 1) >> 1;
  const out: number[] = [];
  for (let y = cy - r; y <= cy + r; y++) {
    if (y < 0 || y >= map.height) continue;
    for (let x = cx - r; x <= cx + r; x++) {
      if (x < 0 || x >= w) continue;
      const i = y * w + x;
      if (mode === 'paint' && !isOwned(map, i)) continue;
      out.push(i);
    }
  }
  return out;
}

/**
 * Tiles from `a` to `b` (both included), stepping one axis at a time so neighbours share an edge.
 * A fast drag skips tiles between pointer events; stamping along this line leaves no gaps.
 */
export function strokeLine(map: MapState, a: number, b: number): number[] {
  const w = map.width;
  let x = a % w;
  let y = Math.floor(a / w);
  const x1 = b % w;
  const y1 = Math.floor(b / w);
  const nx = Math.abs(x1 - x);
  const ny = Math.abs(y1 - y);
  const sx = Math.sign(x1 - x);
  const sy = Math.sign(y1 - y);
  const out = [y * w + x];
  let ix = 0;
  let iy = 0;
  while (ix < nx || iy < ny) {
    // Step x while its next midpoint comes first along the line: (1 + 2ix) / nx < (1 + 2iy) / ny.
    if (iy >= ny || (ix < nx && (1 + 2 * ix) * ny < (1 + 2 * iy) * nx)) {
      x += sx;
      ix++;
    } else {
      y += sy;
      iy++;
    }
    out.push(y * w + x);
  }
  return out;
}

/** One paint or erase stroke: unique tiles in the order painted. */
export class PatrolStroke {
  readonly tiles: number[] = [];
  private readonly seen = new Set<number>();

  constructor(
    readonly staffId: number,
    readonly mode: PatrolMode,
  ) {}

  /** Add the tiles not in the stroke yet. Returns how many were new. */
  stamp(tiles: readonly number[]): number {
    let n = 0;
    for (const t of tiles) {
      if (this.seen.has(t)) continue;
      this.seen.add(t);
      this.tiles.push(t);
      n++;
    }
    return n;
  }

  /** The one `editPatrol` command for this stroke (tiles sorted), or null for an empty stroke. */
  command(): StaffCommand | null {
    if (this.tiles.length === 0) return null;
    const sorted = [...this.tiles].sort((p, q) => p - q);
    return this.mode === 'paint'
      ? { type: 'editPatrol', staffId: this.staffId, add: sorted, remove: [] }
      : { type: 'editPatrol', staffId: this.staffId, add: [], remove: sorted };
  }
}
