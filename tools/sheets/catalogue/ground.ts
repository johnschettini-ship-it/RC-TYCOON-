/** Phase 8b stage 0b test (never merged): catalogue of ground pieces (tops, paths, one-step faces, water). */
import { STEP_PX } from '../../../src/render/iso';
import { GROUND_VARIANT_SEED, K_GROUND, groundKey, groundVariant } from '../../../src/render/pixel/app/keys';
import { faceE, faceS, paintGroundChunk, WATER_SLOT } from '../../../src/render/pixel/ground';
import type { PixelSurface } from '../../../src/render/pixel/surface';
import { Content, Owned, Terrain, generateMap, type MapState } from '../../../src/sim/map';
import { paintPicture, trim, type Picture } from '../picture';
import type { PictureSpec } from './types';

/** Base height (steps) of every synthetic tile (Task 7: heights 4). */
const BASE = 4;
/** Height of the view E and S neighbours: above any top corner, so no face lands on a top piece (faces are their own pieces). */
const HIGH = BASE + 4;
/** Synthetic map side (tiles): room for a tile with its 8 neighbours at the coordinates of each variant. */
const SIDE = 16;
/** Seed of the ground noise (the tool's choice; the runtime only places pieces). */
const NOISE_SEED = 1;
const HW = 32;
const HH = 16;
/** Path view slope masks: flat and the 4 ramps. */
export const PATH_MASKS = [0, 3, 6, 12, 9] as const;
/** Ground surfaces have no ink ring (stage 0 `terrain.ts`: `new PixelSurface(g, { ink: false })`). */
const NO_INK = { ink: false } as const;
const PATH_CONTENT = [Content.Footpath, Content.Queue, Content.ParkEntrance] as const;
const TERRAINS = [Terrain.Grass, Terrain.Sand, Terrain.Dirt, Terrain.Rock, Terrain.Snow] as const;

/** First map tile (row by row, inside a one-tile border) whose ground variant is `v`. */
function variantTile(v: number): { x: number; y: number } {
  for (let y = 1; y < SIDE - 2; y++) for (let x = 1; x < SIDE - 2; x++) if (groundVariant(x, y) === v) return { x, y };
  throw new Error(`no tile of ground variant ${v} (seed ${GROUND_VARIANT_SEED})`);
}

/** A flat grass map at height 4 with nothing on it. */
function syntheticMap(): MapState {
  const m = generateMap({ width: SIDE, height: SIDE });
  m.heights.fill(BASE);
  m.slope.fill(0);
  m.water.fill(0);
  m.content.fill(Content.Empty);
  m.terrain.fill(Terrain.Grass);
  m.owned.fill(Owned.Owned);
  m.entranceTile = -1;
  return m;
}

/**
 * Paint view tile (x, y) of `m` (view rotation 0, so view and map agree) with the stage 0 ground painter, trimmed and
 * anchored at the tile's top (N') corner at height `anchorZ` (steps).
 */
function paintTile(m: MapState, x: number, y: number, anchorZ: number, keep?: (slot: number) => boolean): Picture {
  const cx = (x - y) * HW;
  const cy = (x + y) * HH;
  const bounds = { left: cx - HW - 4, right: cx + HW + 4, top: cy - (BASE + 4) * STEP_PX, bottom: cy + 2 * HH + 4 };
  const p = paintPicture(bounds, (ctx) => paintGroundChunk(ctx as unknown as PixelSurface, m, { u0: x, v0: y, u1: x + 1, v1: y + 1 }, 0, { seed: NOISE_SEED }, false), NO_INK);
  if (keep) for (let k = 0; k < p.slots.length; k++) if (p.slots[k] !== 0 && !keep(p.slots[k] as number)) p.slots[k] = 0;
  const t = trim(p);
  return { ...t, ox: t.ox + cx / 2, oy: t.oy + (cy - anchorZ * STEP_PX) / 2 };
}

/** The tile at the variant's coordinates on a synthetic map; `setup` sets its terrain, content and neighbours. */
function tilePainter(v: number, setup: (m: MapState, i: number, x: number, y: number) => void): () => Picture {
  return () => {
    const { x, y } = variantTile(v);
    const m = syntheticMap();
    const i = y * SIDE + x;
    // No faces on the top piece: the view E (x + 1) and S (y + 1) neighbours stand higher.
    m.heights[i + 1] = HIGH;
    m.heights[i + SIDE] = HIGH;
    setup(m, i, x, y);
    return paintTile(m, x, y, BASE);
  };
}

function topSpecs(): PictureSpec[] {
  const out: PictureSpec[] = [];
  for (const terrain of TERRAINS) {
    for (let mask = 0; mask < 16; mask++) {
      for (const owned of [0, 1]) {
        for (let v = 0; v < 4; v++) {
          const paint = tilePainter(v, (m, i) => {
            m.terrain[i] = terrain;
            m.slope[i] = mask;
            m.owned[i] = owned === 1 ? Owned.Owned : Owned.NotOwned;
          });
          out.push({ pack: 'ground', group: 'ground', kind: K_GROUND, key: groundKey(0, terrain, mask, owned, v), paint, ref: null });
        }
      }
    }
  }
  return out;
}

function pathSpecs(): PictureSpec[] {
  const out: PictureSpec[] = [];
  PATH_CONTENT.forEach((content, ci) => {
    for (const mask of PATH_MASKS) {
      for (let edges = 0; edges < 16; edges++) {
        for (let v = 0; v < 4; v++) {
          const paint = tilePainter(v, (m, i) => {
            m.content[i] = content;
            m.slope[i] = mask;
            // Edge bit set: that neighbour is no path (N, E, S, W = y − 1, x + 1, y + 1, x − 1 at rotation 0).
            const nb = [i - SIDE, i + 1, i + SIDE, i - 1];
            for (let d = 0; d < 4; d++) m.content[nb[d] as number] = (edges >> d) & 1 ? Content.Empty : Content.Footpath;
          });
          out.push({ pack: 'ground', group: 'ground', kind: K_GROUND, key: groundKey(1, ci, mask, edges, v), paint, ref: null });
        }
      }
    }
  });
  return out;
}

/** One step (or a cap) of the E (side 0) or S (side 1) face of view tile (0, 0); anchor its top corner at the step's bottom. */
function facePicture(side: 0 | 1, cap: 0 | 1 | 2): Picture {
  const a = cap === 2 ? 0 : STEP_PX;
  const b = cap === 1 ? 0 : STEP_PX;
  const bounds = { left: -HW - 4, right: HW + 4, top: -4, bottom: 2 * HH + 4 };
  return trim(
    paintPicture(bounds, (ctx) => {
      const s = ctx as unknown as PixelSurface;
      if (side === 0) faceE(s, 0, 0, a, b, 0, 0);
      else faceS(s, 0, 0, a, b, 0, 0);
    }, NO_INK),
  );
}

function faceSpecs(): PictureSpec[] {
  const out: PictureSpec[] = [];
  for (const side of [0, 1] as const) {
    for (const cap of [0, 1, 2] as const) {
      out.push({ pack: 'ground', group: 'ground', kind: K_GROUND, key: groundKey(2, side, cap, 0, 0), paint: () => facePicture(side, cap), ref: null });
    }
  }
  return out;
}

/** Water: the flat water top one step above the ground (only the water slot kept), anchored at the water level. */
function waterPicture(): Picture {
  const { x, y } = variantTile(0);
  const m = syntheticMap();
  const i = y * SIDE + x;
  m.heights[i + 1] = HIGH;
  m.heights[i + SIDE] = HIGH;
  m.water[i] = BASE + 1;
  return paintTile(m, x, y, BASE + 1, (slot) => slot === WATER_SLOT);
}

/** Pack `ground`, one group `ground`: tops 640, paths 960, faces 6, water 1. */
export function groundSpecs(): PictureSpec[] {
  return [
    ...topSpecs(),
    ...pathSpecs(),
    ...faceSpecs(),
    { pack: 'ground', group: 'ground', kind: K_GROUND, key: groundKey(3, 0, 0, 0, 0), paint: waterPicture, ref: null },
  ];
}
