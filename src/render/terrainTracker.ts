/**
 * Terrain chunk dirty flags (Phase 0 §4.8). Owner: W1-A, W4-E.
 * The renderer never gets change events, so it keeps a snapshot of the map layers the chunk images show and diffs
 * them each frame. A changed tile dirties its chunk and the chunks of its 4 neighbours (path joins and cliff faces
 * depend on neighbours).
 *
 * Phase 6 §4.6 finding: the diff compared 9 × tiles values every frame (147,456 on 128 × 128). It now tracks only the
 * 7 layers chunk painting reads (path items and their broken flag are sprites drawn every frame, not chunk art, so a
 * vandalised bench no longer redraws terrain) and compares the byte layers 4 tiles at a time as 32-bit words
 * (49,152 compares on 128 × 128); only a changed word is looked at tile by tile.
 */
import type { MapState } from '../sim/map';

export const CHUNK_SIZE = 16;

export function chunkCount(map: Pick<MapState, 'width' | 'height'>): { cx: number; cy: number } {
  return { cx: Math.ceil(map.width / CHUNK_SIZE), cy: Math.ceil(map.height / CHUNK_SIZE) };
}

type Layer = Uint8Array | Int32Array;
/** The map layers the chunk images show (`./terrain.ts` `paintTile`, `./paths.ts` join masks). */
export const TRACKED_LAYERS = ['terrain', 'heights', 'slope', 'water', 'content', 'contentRef', 'owned'] as const;
type LayerName = (typeof TRACKED_LAYERS)[number];

/** A 32-bit word view of a byte layer, or null when its offset is not word-aligned. */
function wordView(a: Layer): Int32Array | null {
  if (a instanceof Int32Array) return null;
  return a.byteOffset % 4 === 0 ? new Int32Array(a.buffer, a.byteOffset, a.length >> 2) : null;
}

interface LayerDiff {
  /** The map's array the views below were made for. */
  src: Layer;
  words: Int32Array | null;
  snap: Layer;
  snapWords: Int32Array | null;
}

export class TerrainTracker {
  private map: MapState | null = null;
  private diffs: LayerDiff[] = [];
  private dirty = new Uint8Array(0);
  private dirtyN = 0;
  chunksX = 0;
  chunksY = 0;
  /** Bumps whenever any tracked tile changes (objects derived from the map, e.g. the fence, rebuild on it). */
  version = 0;
  /** Bumps when a new map (or a new size) replaced the snapshot; every chunk is dirty then. */
  resets = 0;

  /** Compare the map against the snapshot; mark changed chunks dirty. */
  sync(map: MapState): void {
    if (map !== this.map || this.diffs.length === 0 || (this.diffs[0] as LayerDiff).snap.length !== map.width * map.height) {
      this.reset(map);
      return;
    }
    let changed = false;
    for (let l = 0; l < TRACKED_LAYERS.length; l++) {
      const cur = map[TRACKED_LAYERS[l] as LayerName];
      const d = this.diffs[l] as LayerDiff;
      if (d.src !== cur) {
        d.src = cur;
        d.words = wordView(cur);
      }
      if (this.diffLayer(map, cur, d)) changed = true;
    }
    if (changed) this.version++;
  }

  private diffLayer(map: MapState, cur: Layer, d: LayerDiff): boolean {
    const snap = d.snap;
    const n = cur.length;
    let changed = false;
    let from = 0;
    const words = d.words;
    const snapWords = d.snapWords;
    if (words && snapWords) {
      const nw = words.length;
      for (let w = 0; w < nw; w++) {
        if (words[w] === snapWords[w]) continue;
        for (let i = w * 4; i < w * 4 + 4; i++) {
          if (cur[i] !== snap[i]) {
            snap[i] = cur[i] as number;
            this.markTile(map, i);
          }
        }
        changed = true;
      }
      from = nw * 4;
    }
    for (let i = from; i < n; i++) {
      if (cur[i] !== snap[i]) {
        snap[i] = cur[i] as number;
        this.markTile(map, i);
        changed = true;
      }
    }
    return changed;
  }

  private reset(map: MapState): void {
    this.map = map;
    this.diffs = TRACKED_LAYERS.map((k) => {
      const src = map[k];
      const snap = src.slice();
      return { src, words: wordView(src), snap, snapWords: wordView(snap) };
    });
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
