/**
 * Terrain chunk dirty flags (Phase 0 §4.8). Owner: W1-A.
 * The renderer never gets change events, so it keeps a snapshot of the static map layers and
 * diffs them each frame (a few µs on 64 × 64). A changed tile dirties its chunk and the chunks of
 * its 4 neighbours (path joins and cliff faces depend on neighbours).
 */
import type { MapState } from '../sim/map';

export const CHUNK_SIZE = 16;

export function chunkCount(map: Pick<MapState, 'width' | 'height'>): { cx: number; cy: number } {
  return { cx: Math.ceil(map.width / CHUNK_SIZE), cy: Math.ceil(map.height / CHUNK_SIZE) };
}

type Layer = Uint8Array | Int32Array;
const LAYERS = ['terrain', 'heights', 'slope', 'water', 'content', 'contentRef', 'owned', 'pathItem', 'pathItemFlags'] as const;

export class TerrainTracker {
  private map: MapState | null = null;
  private snaps: Layer[] = [];
  private dirty = new Uint8Array(0);
  private dirtyN = 0;
  chunksX = 0;
  chunksY = 0;
  /** Bumps whenever any tile changes (objects derived from the map, e.g. the fence, rebuild on it). */
  version = 0;
  /** Bumps when a new map (or a new size) replaced the snapshot; every chunk is dirty then. */
  resets = 0;

  /** Compare the map against the snapshot; mark changed chunks dirty. */
  sync(map: MapState): void {
    if (map !== this.map || this.snaps.length === 0 || (this.snaps[0] as Layer).length !== map.width * map.height) {
      this.reset(map);
      return;
    }
    let changed = false;
    for (let l = 0; l < LAYERS.length; l++) {
      const cur = map[LAYERS[l] as (typeof LAYERS)[number]];
      const snap = this.snaps[l] as Layer;
      const n = cur.length;
      for (let i = 0; i < n; i++) {
        if (cur[i] !== snap[i]) {
          snap[i] = cur[i] as number;
          this.markTile(map, i);
          changed = true;
        }
      }
    }
    if (changed) this.version++;
  }

  private reset(map: MapState): void {
    this.map = map;
    this.snaps = LAYERS.map((k) => map[k].slice());
    const { cx, cy } = chunkCount(map);
    this.chunksX = cx;
    this.chunksY = cy;
    this.dirty = new Uint8Array(cx * cy).fill(1);
    this.dirtyN = cx * cy;
    this.version++;
    this.resets++;
  }

  private markChunkOf(map: MapState, x: number, y: number): void {
    if (x < 0 || y < 0 || x >= map.width || y >= map.height) return;
    const c = Math.floor(y / CHUNK_SIZE) * this.chunksX + Math.floor(x / CHUNK_SIZE);
    if (this.dirty[c] === 0) {
      this.dirty[c] = 1;
      this.dirtyN++;
    }
  }

  private markTile(map: MapState, i: number): void {
    const x = i % map.width;
    const y = (i - x) / map.width;
    this.markChunkOf(map, x, y);
    this.markChunkOf(map, x, y - 1);
    this.markChunkOf(map, x + 1, y);
    this.markChunkOf(map, x, y + 1);
    this.markChunkOf(map, x - 1, y);
  }

  /** Force every chunk to redraw (e.g. after a font or palette change). */
  markAll(): void {
    this.dirty.fill(1);
    this.dirtyN = this.dirty.length;
  }

  isDirty(chunk: number): boolean {
    return this.dirty[chunk] === 1;
  }

  clean(chunk: number): void {
    if (this.dirty[chunk] === 1) {
      this.dirty[chunk] = 0;
      this.dirtyN--;
    }
  }

  dirtyCount(): number {
    return this.dirtyN;
  }

  dirtyList(): number[] {
    const out: number[] = [];
    for (let c = 0; c < this.dirty.length; c++) if (this.dirty[c] === 1) out.push(c);
    return out;
  }
}
