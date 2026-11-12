/** Phase 8b stage 0b test (never merged): a ground chunk assembled from predrawn pieces (tops, paths, face steps, water). */
import { Content, type MapState } from '../../../sim/map';
import { makeCanvas } from '../../canvas';
import { STEP_PX } from '../../iso';
import type { Sprite } from '../../spriteCache';
import type { ArtBounds } from '../../sprites/rides';
import { rotateSlopeMask, viewCornerHeights, viewSize, viewToMap, type ViewRotation } from '../../view';
import { faceStack } from './faces';
import { groundKey, groundVariant, K_GROUND } from './keys';
import type { PictureStore } from './store';

const HW = 32;
const HH = 16;
/** Image pixels per world pixel of a chunk image (`ART_SCALE`). */
const SCALE = 0.5;
/** Path view slope masks the catalogue holds (flat and the 4 ramps). */
const PATH_MASKS: ReadonlySet<number> = new Set([0, 3, 6, 12, 9]);
/** View neighbour offsets of the edge bits N, E, S, W (bits 1, 2, 4, 8). */
const EDGE_DU = [0, 1, 0, -1];
const EDGE_DV = [-1, 0, 1, 0];

/** What the assembly reads of the store. */
export type PieceSource = Pick<PictureStore, 'get'>;

/** Content code of a path piece (0 footpath, 1 queue, 2 entrance), or −1. */
function pathCode(c: number | undefined): number {
  return c === Content.Footpath ? 0 : c === Content.Queue ? 1 : c === Content.ParkEntrance ? 2 : -1;
}

const vc: [number, number, number, number] = [0, 0, 0, 0];
const nc: [number, number, number, number] = [0, 0, 0, 0];

/** The view edge mask of path tile (u, v): bit set where the view neighbour is no path (or off the map). */
export function pathEdges(map: MapState, u: number, v: number, r: ViewRotation): number {
  const vs = viewSize(map, r);
  let edges = 0;
  for (let d = 0; d < 4; d++) {
    const nu = u + (EDGE_DU[d] as number);
    const nv = v + (EDGE_DV[d] as number);
    if (nu < 0 || nv < 0 || nu >= vs.w || nv >= vs.h) {
      edges |= 1 << d;
      continue;
    }
    const m = viewToMap(nu, nv, r, map.width, map.height);
    if (pathCode(map.content[m.y * map.width + m.x]) < 0) edges |= 1 << d;
  }
  return edges;
}

/**
 * The chunk `rect` ([u0, u1) × [v0, v1) view tiles) as one canvas at `ART_SCALE` of `geom`: view tiles back to front
 * (as the stage 0 `paintGroundChunk`); per tile the face steps of its +u and +v edges (`faceStack`, the conditions of
 * stage 0 `paintGroundTile`), then its top or path piece, then water above the water level; one `drawImage` per piece
 * from its sheet rectangle. `complete` is false when a piece was missing (the caller drops the image and tries again).
 */
export function assembleChunk(
  store: PieceSource,
  map: MapState,
  rect: { u0: number; v0: number; u1: number; v1: number },
  r: ViewRotation,
  geom: ArtBounds,
): { sprite: Sprite | null; complete: boolean } {
  // Fix round 1 (M4): first ask for every piece (each miss is queued and counted); no canvas unless all are there.
  let complete = true;
  walkChunk(map, rect, r, (key) => {
    if (!store.get(K_GROUND, key, -1)) complete = false;
  });
  if (!complete) return { sprite: null, complete: false };
  const l = Math.floor(geom.left * SCALE);
  const t = Math.floor(geom.top * SCALE);
  const w = Math.max(1, Math.ceil(geom.right * SCALE) - l);
  const h = Math.max(1, Math.ceil(geom.bottom * SCALE) - t);
  const { canvas, ctx } = makeCanvas(w, h);
  const c2 = ctx as unknown as CanvasRenderingContext2D;
  c2.imageSmoothingEnabled = false;
  const ox = -l;
  const oy = -t;
  walkChunk(map, rect, r, (key, wx, wy) => {
    const sp = store.get(K_GROUND, key, -1);
    if (!sp) {
      complete = false;
      return;
    }
    c2.drawImage(sp.image, sp.sx ?? 0, sp.sy ?? 0, sp.w, sp.h, ox + wx * SCALE - sp.ox, oy + wy * SCALE - sp.oy, sp.w, sp.h);
  });
  return { sprite: { image: canvas as CanvasImageSource, w, h, ox, oy, scale: SCALE }, complete };
}

/** The pieces of chunk `rect` in draw order: `put(key, wx, wy)` per piece (world-pixel anchor). */
function walkChunk(
  map: MapState,
  rect: { u0: number; v0: number; u1: number; v1: number },
  r: ViewRotation,
  put: (key: number, wx: number, wy: number) => void,
): void {
  const vs = viewSize(map, r);
  const W = map.width;
  for (let d = rect.u0 + rect.v0; d <= rect.u1 + rect.v1 - 2; d++) {
    for (let u = Math.max(rect.u0, d - (rect.v1 - 1)); u <= Math.min(rect.u1 - 1, d - rect.v0); u++) {
      const v = d - u;
      const m = viewToMap(u, v, r, W, map.height);
      const i = m.y * W + m.x;
      const c = viewCornerHeights(map, i, r, vc);
      const ax = (u - v) * HW;
      const ay = (u + v) * HH;
      // Face on the +u edge: tops E', S'; bottoms the neighbour's N', W' (0 at the map edge in front).
      let bA = 0;
      let bB = 0;
      if (u + 1 < vs.w) {
        const q = viewToMap(u + 1, v, r, W, map.height);
        const n = viewCornerHeights(map, q.y * W + q.x, r, nc);
        bA = Math.min(n[0], c[1]);
        bB = Math.min(n[3], c[2]);
      }
      let fs = faceStack(c[1], c[2], bA, bB);
      for (let k = 0; k < fs.steps; k++) put(groundKey(2, 0, 0, 0, 0), ax, ay - (fs.from + k) * STEP_PX);
      if (fs.cap > 0) put(groundKey(2, 0, fs.cap, 0, 0), ax, ay - (fs.from + fs.steps) * STEP_PX);
      // Face on the +v edge: tops W', S'; bottoms the neighbour's N', E'.
      bA = 0;
      bB = 0;
      if (v + 1 < vs.h) {
        const q = viewToMap(u, v + 1, r, W, map.height);
        const n = viewCornerHeights(map, q.y * W + q.x, r, nc);
        bA = Math.min(n[0], c[3]);
        bB = Math.min(n[1], c[2]);
      }
      fs = faceStack(c[3], c[2], bA, bB);
      for (let k = 0; k < fs.steps; k++) put(groundKey(2, 1, 0, 0, 0), ax, ay - (fs.from + k) * STEP_PX);
      if (fs.cap > 0) put(groundKey(2, 1, fs.cap, 0, 0), ax, ay - (fs.from + fs.steps) * STEP_PX);
      // Top or path piece at the tile's base height.
      const base = map.heights[i] as number;
      const mask = rotateSlopeMask(map.slope[i] as number, r);
      const variant = groundVariant(m.x, m.y);
      const pc = pathCode(map.content[i]);
      if (pc >= 0 && PATH_MASKS.has(mask)) put(groundKey(1, pc, mask, pathEdges(map, u, v, r), variant), ax, ay - base * STEP_PX);
      else put(groundKey(0, map.terrain[i] as number, mask, map.owned[i] === 1 ? 1 : 0, variant), ax, ay - base * STEP_PX);
      const water = map.water[i] as number;
      if (water > base) put(groundKey(3, 0, 0, 0, 0), ax, ay - water * STEP_PX);
    }
  }
}
