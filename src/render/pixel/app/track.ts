/** Phase 8b stage 0b test (never merged): track and elevated paths from predrawn pictures (Test decisions 8, 9). */
import { getTrackPieceDef } from '../../../data/track';
import { RAMP_MASK } from '../../../sim/paths/nodes';
import type { ElevatedPath } from '../../../sim/paths/types';
import { pieceWorldTiles } from '../../../sim/rides/track/geometry';
import type { World } from '../../../sim/types';
import type { PixelFrame } from '../../artHook';
import type { LayerFrame } from '../../layers';
import type { SliceRec } from '../../track/layer';
import { PX_Z, projectX, projectY, viewYaw, type ViewFrame } from '../../track/project';
import { rotateSlopeMask, type ViewRotation } from '../../view';
import { blitArt, snapArt } from '../grid';
import {
  carKey,
  deckKey,
  GATE_ROOFS,
  gateKey,
  K_CAR,
  K_DECK,
  K_GATE,
  K_POST,
  K_RAIL,
  K_SUPPORT,
  postKey,
  railKey,
  SUPPORT_STYLES,
  supportKey,
  TRACK_PIECE_IDS,
  TRACK_TYPE_IDS,
} from './keys';
import type { PictureStore } from './store';

/** A slice drawable: the layer's slice record and its view frame. */
export interface TrackSliceRec {
  sl: SliceRec;
  vf: ViewFrame;
}

/** A car drawable: pose steps, front car, colour index and anchor (world px). */
export interface TrackCarRec {
  shape: number;
  yaw: number;
  pitch: number;
  roll: number;
  front: number;
  colour: number;
  ax: number;
  ay: number;
}

/** A gate drawable: 0 entrance, 1 exit; roof colour; anchor (world px). */
export interface TrackGateRec {
  kind: number;
  roof: string;
  ax: number;
  ay: number;
}

type Store = Pick<PictureStore, 'get'> & Partial<Pick<PictureStore, 'noteMissing'>>;

/** Rail key, piece height and support style of a slice, computed once per slice record. */
interface SliceKey {
  rail: number;
  baseZ: number;
  style: number;
}

const HW = 32;
const HH = 16;
const STEP = 8;
/** Deck slab thickness (world px), as the elevated layer. */
const DECK_PX = 4;
const CORNER_DU = [0, 1, 1, 0];
const CORNER_DV = [0, 0, 1, 1];

const typeIndex = new Map<string, number>(TRACK_TYPE_IDS.map((id, i) => [id, i]));
const pieceIndex = new Map<string, number>(TRACK_PIECE_IDS.map((id, i) => [id, i]));
const styleIndex = new Map<string, number>(SUPPORT_STYLES.map((id, i) => [id, i]));

export class TrackPictures {
  private readonly keys = new WeakMap<SliceRec, SliceKey | null>();
  /** Pictures drawn and segments asked for (tests). */
  readonly log: Array<{ kind: number; key: number; swap: number }> = [];
  logging = false;

  constructor(private readonly store: Store) {}

  private draw(ctx: CanvasRenderingContext2D, kind: number, key: number, swap: number, wx: number, wy: number, frame: PixelFrame): void {
    if (this.logging) this.log.push({ kind, key, swap });
    const sp = this.store.get(kind, key, swap);
    // Fix round 1 (I4): car and support-top anchors can be fractional; every copy lands on whole art pixels.
    if (sp) blitArt(ctx, sp, snapArt(wx), snapArt(wy), frame);
  }

  private sliceKey(world: World, sl: SliceRec, view: number): SliceKey | null {
    let k = this.keys.get(sl);
    if (k !== undefined) return k;
    k = null;
    const data = world.state.track.rides[String(sl.rideId)];
    const piece = data?.pieces[sl.pieceIndex];
    const ti = data ? typeIndex.get(data.typeId) : undefined;
    const pi = piece ? pieceIndex.get(piece.defId) : undefined;
    if (data && piece && ti !== undefined && pi !== undefined && getTrackPieceDef(piece.defId)) {
      const tile = pieceWorldTiles(piece).findIndex((t) => t.x === sl.x && t.y === sl.y);
      if (tile >= 0) k = { rail: railKey(ti, pi, piece.dir, tile, view), baseZ: piece.z, style: styleIndex.get(sl.supportStyle) ?? -1 };
    }
    this.keys.set(sl, k);
    return k;
  }

  /**
   * A slice: its support as stacked segments from the ground to `support.top` (foot at the ground, one step per metre,
   * the top segment one metre under the top; swap = support colour), then the rail picture at the tile centre lifted
   * by the piece's base height (swap = track colour). False when the slice has no picture key (Classic draws it).
   */
  slice(ctx: CanvasRenderingContext2D, world: World, rec: TrackSliceRec, frame: PixelFrame): boolean {
    const { sl, vf } = rec;
    const k = this.sliceKey(world, sl, vf.rot);
    const colours = k ? world.state.track.rides[String(sl.rideId)]?.colours : undefined;
    if (!k || !colours) {
      // Fix round 1 (M2): Classic draws it, but the frame is not all predrawn.
      this.store.noteMissing?.();
      return false;
    }
    const sup = sl.support;
    if (sup && k.style >= 0) {
      const view = ((Math.round(viewYaw(sup.yaw, vf) / (Math.PI / 2)) % 4) + 4) % 4;
      const x = projectX(sup.wx, sup.wy, vf);
      const g = sl.ground;
      // Fix round 1 (M6): the foot, steps up to ceil(top − ground) − 2, the top segment at top − 1 (only the foot under 1 m).
      const n = Math.max(1, Math.ceil(sup.top - g));
      this.draw(ctx, K_SUPPORT, supportKey(k.style, 0, view), colours.supports, x, projectY(sup.wx, sup.wy, g, vf), frame);
      for (let s = 1; s <= n - 2; s++) this.draw(ctx, K_SUPPORT, supportKey(k.style, 1, view), colours.supports, x, projectY(sup.wx, sup.wy, g + s, vf), frame);
      if (n >= 2) this.draw(ctx, K_SUPPORT, supportKey(k.style, 2, view), colours.supports, x, projectY(sup.wx, sup.wy, sup.top - 1, vf), frame);
    }
    this.draw(ctx, K_RAIL, k.rail, colours.track, sl.ax, sl.ay - k.baseZ * PX_Z, frame);
    return true;
  }

  /** A car body (swap = car colour); the layer still draws the riders and the spray. */
  car(ctx: CanvasRenderingContext2D, rec: TrackCarRec, frame: PixelFrame): boolean {
    this.draw(ctx, K_CAR, carKey(rec.shape, rec.yaw, rec.pitch, rec.roll, rec.front ? 1 : 0), rec.colour % 12, rec.ax, rec.ay, frame);
    return true;
  }

  /** A gate booth with its real roof (fix round 1, I2: not swapped). */
  gate(ctx: CanvasRenderingContext2D, rec: TrackGateRec, frame: PixelFrame): boolean {
    const roof = rec.kind === 0 ? GATE_ROOFS.indexOf(rec.roof) : 3;
    if (roof < 0) this.store.noteMissing?.();
    this.draw(ctx, K_GATE, gateKey(roof < 0 ? 3 : roof), -1, rec.ax, rec.ay, frame);
    return true;
  }

  /**
   * An elevated path: posts per step from the ground corner up under the deck at the 4 view corners (back corner
   * first), then the deck piece (`deckKey(kind, view ramp)`) at the back corner at deck height.
   */
  elevated(ctx: CanvasRenderingContext2D, p: ElevatedPath, world: World, f: LayerFrame, frame: PixelFrame): void {
    const map = world.state.map;
    const r = f.rotation & 3;
    const u = r === 0 ? p.x : r === 1 ? map.height - 1 - p.y : r === 2 ? map.width - 1 - p.x : p.y;
    const v = r === 0 ? p.y : r === 1 ? p.x : r === 2 ? map.height - 1 - p.y : map.width - 1 - p.x;
    const ramp = p.rampDir >= 0 ? ((p.rampDir + r) & 3) : -1;
    // The layer's corner rule; the deck picture of view ramp `(rampDir + r) & 3` has this mask (`RAMP_MASK[ramp]`, tested).
    const mask = p.rampDir >= 0 ? rotateSlopeMask(RAMP_MASK[p.rampDir] as number, r as ViewRotation) : 0;
    const i = p.y * map.width + p.x;
    const base = map.heights[i] as number;
    const slope = map.slope[i] as number;
    for (let c = 0; c < 4; c++) {
      const cu = u + (CORNER_DU[c] as number);
      const cv = v + (CORNER_DV[c] as number);
      const flatY = (cu + cv) * HH;
      const top = flatY - (p.z + ((mask >> c) & 1)) * STEP + DECK_PX;
      const mc = (c - r + 4) & 3;
      const bottom = flatY - (base + ((slope >> mc) & 1)) * STEP;
      if (bottom <= top) continue;
      const n = Math.ceil((bottom - top) / STEP);
      for (let k = 0; k < n; k++) this.draw(ctx, K_POST, postKey(c as 0 | 1 | 2 | 3), -1, (cu - cv) * HW, bottom - (k + 1) * STEP, frame);
    }
    this.draw(ctx, K_DECK, deckKey(p.kind === 'queue' ? 1 : 0, ramp as -1 | 0 | 1 | 2 | 3), -1, (u - v) * HW, (u + v) * HH - p.z * STEP, frame);
  }
}
