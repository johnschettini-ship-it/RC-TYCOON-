/**
 * Park fence (master R3): a segment on every edge between an owned tile and a tile that is not
 * owned (or outside the map), except the park entrance's outer edge. Owner: W1-A.
 */
import { Content, DIR_DX, DIR_DY, isOwned, type Dir, type MapState } from '../sim/map';
import { viewPointDepth } from './depth';
import type { ViewAffine } from './view';

export interface FenceSegment {
  /** The owned tile the edge belongs to. */
  tile: number;
  /** Which edge of that tile: 0 = N, 1 = E, 2 = S, 3 = W. */
  dir: Dir;
}

/** Direction from the park entrance tile to the outside of the park, or −1 when there is no entrance. */
export function entranceOuterDir(map: MapState): Dir | -1 {
  const e = map.entranceTile;
  if (e < 0) return -1;
  const w = map.width;
  const x = e % w;
  const y = (e - x) / w;
  for (let d = 0; d < 4; d++) {
    const nx = x + (DIR_DX[d] as number);
    const ny = y + (DIR_DY[d] as number);
    if (nx < 0 || ny < 0 || nx >= w || ny >= map.height) return d as Dir;
  }
  // Not on the map border: the outer edge is opposite the path leading in.
  for (let d = 0; d < 4; d++) {
    const j = (y + (DIR_DY[d] as number)) * w + x + (DIR_DX[d] as number);
    const c = map.content[j];
    if (c === Content.Footpath || c === Content.Queue) return ((d + 2) % 4) as Dir;
  }
  return -1;
}

export function fenceSegments(map: MapState, out: FenceSegment[] = []): FenceSegment[] {
  out.length = 0;
  const w = map.width;
  const h = map.height;
  const outer = entranceOuterDir(map);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!isOwned(map, i)) continue;
      for (let d = 0; d < 4; d++) {
        if (i === map.entranceTile && d === outer) continue;
        const nx = x + (DIR_DX[d] as number);
        const ny = y + (DIR_DY[d] as number);
        const nOwned = nx >= 0 && ny >= 0 && nx < w && ny < h && isOwned(map, ny * w + nx);
        if (!nOwned) out.push({ tile: i, dir: d as Dir });
      }
    }
  }
  return out;
}

/**
 * Depth of a fence edge: the x + y sum of the edge midpoint, or with a view rotation (`a`) the u + v of the
 * midpoint's view position (Phase 4 §4.8).
 */
export function fenceEdgeDepth(map: Pick<MapState, 'width'>, tile: number, dir: Dir, a?: ViewAffine): number {
  const x = tile % map.width;
  const y = (tile - x) / map.width;
  if (a) return viewPointDepth(x + 0.5 + (DIR_DX[dir] as number) * 0.5, y + 0.5 + (DIR_DY[dir] as number) * 0.5, a);
  switch (dir) {
    case 0:
      return x + 0.5 + y;
    case 1:
      return x + 1 + y + 0.5;
    case 2:
      return x + 0.5 + y + 1;
    default:
      return x + y + 0.5;
  }
}
