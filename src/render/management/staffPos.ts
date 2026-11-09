/** Staff draw positions in continuous map coordinates (interpolated like guests). Owner: W2-B. Pure. */
import type { MapState } from '../../sim/map';
import type { Staff } from '../../sim/staff/types';
import { stepHeight, type WalkerHeights } from '../guestPos';

/** Output record, reused by the caller. `fx`, `fy`: map coordinates; `z`: height steps. */
export interface StaffPos {
  fx: number;
  fy: number;
  z: number;
}

/**
 * A staff member walks from `tile` toward `nextTile`; the sim adds 1 to `progress` per tick and
 * arrives at `ticksPerTile` (catalog walk speed). Position = (progress + alpha) / ticksPerTile, clamped.
 * Staff walk on the path centre line (guests use lanes beside it). Height: the walking surface of the path node
 * (Phase 4 §5 `Staff.z`; `stepHeight` with the world's `heights`, as for guests).
 */
export function staffPosition(
  map: MapState,
  s: Pick<Staff, 'tile' | 'nextTile' | 'progress'> & { z?: number },
  ticksPerTile: number,
  alpha: number,
  out: StaffPos,
  heights?: WalkerHeights,
): StaffPos {
  const w = map.width;
  const n = w * map.height;
  const x = s.tile % w;
  const y = (s.tile - x) / w;
  let fx = x + 0.5;
  let fy = y + 0.5;
  let t = 0;
  const inMap = s.tile >= 0 && s.tile < n;
  if (s.nextTile >= 0 && s.nextTile !== s.tile && s.nextTile < n) {
    const nx = s.nextTile % w;
    const ny = (s.nextTile - nx) / w;
    t = (s.progress + alpha) / Math.max(1, ticksPerTile);
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    fx += (nx - x) * t;
    fy += (ny - y) * t;
  }
  out.fx = fx;
  out.fy = fy;
  out.z = inMap ? stepHeight(map, heights, s.tile, s.z, s.nextTile, t, fx, fy) : 0;
  return out;
}
