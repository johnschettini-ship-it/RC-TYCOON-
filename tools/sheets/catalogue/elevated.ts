/** Phase 8b stage 0b test (never merged): catalogue of elevated path pieces (decks and one-step posts). */
import { RAMP_MASK } from '../../../src/sim/paths/nodes';
import { ELEVATED_COLOURS } from '../../../src/render/elevated/layer';
import { K_DECK, K_POST, deckKey, postKey } from '../../../src/render/pixel/app/keys';
import type { Ctx } from '../../../src/render/sprites/shapes';
import { paintPicture, type Picture } from '../picture';
import { withRoles } from '../ramps';
import type { PictureSpec } from './types';

// The constants of `src/render/elevated/layer.ts` at scale 1 (world px).
const HW = 32;
const HH = 16;
const STEP = 8;
const DECK_PX = 4;
const POST_W = 2.2;
/** View corner offsets [N', E', S', W'] of a tile's top face (as the layer). */
const CORNER_DU = [0, 1, 1, 0];
const CORNER_DV = [0, 0, 1, 1];

function quad(ctx: Ctx, pts: readonly number[]): void {
  ctx.beginPath();
  ctx.moveTo(pts[0] as number, pts[1] as number);
  for (let i = 2; i < 8; i += 2) ctx.lineTo(pts[i] as number, pts[i + 1] as number);
  ctx.closePath();
}

/**
 * The deck polygons of the layer's `drawDeck` at scale 1, without the posts: anchor at the back corner (N') at the
 * deck height; a ramp raises the two view corners of its direction by one step (`RAMP_MASK`, as `corners()`).
 */
function paintDeck(ctx: Ctx, kind: 'footpath' | 'queue', ramp: number): void {
  const col = ELEVATED_COLOURS[kind];
  const mask = ramp >= 0 ? (RAMP_MASK[ramp] as number) : 0;
  const x: number[] = [];
  const y: number[] = [];
  for (let c = 0; c < 4; c++) {
    const du = CORNER_DU[c] as number;
    const dv = CORNER_DV[c] as number;
    x.push((du - dv) * HW);
    y.push((du + dv) * HH - ((mask >> c) & 1) * STEP);
  }
  const t = DECK_PX;
  ctx.fillStyle = col.left;
  quad(ctx, [x[3]!, y[3]!, x[2]!, y[2]!, x[2]!, y[2]! + t, x[3]!, y[3]! + t]);
  ctx.fill();
  ctx.fillStyle = col.right;
  quad(ctx, [x[2]!, y[2]!, x[1]!, y[1]!, x[1]!, y[1]! + t, x[2]!, y[2]! + t]);
  ctx.fill();
  ctx.fillStyle = col.top;
  quad(ctx, [x[0]!, y[0]!, x[1]!, y[1]!, x[2]!, y[2]!, x[3]!, y[3]!]);
  ctx.fill();
  ctx.strokeStyle = col.edge;
  ctx.lineWidth = 1;
  ctx.stroke();
}

/** One step (8 world px) of the post at view corner `c`, its top at the anchor (the corner point); inset as the layer. */
function paintPost(ctx: Ctx, c: number): void {
  ctx.fillStyle = c === 1 ? ELEVATED_COLOURS.supportDark : ELEVATED_COLOURS.support;
  const inset = c === 1 ? -POST_W : c === 3 ? 0 : -POST_W / 2;
  ctx.fillRect(inset, 0, POST_W, STEP);
}

const DECK_BOUNDS = { left: -HW - 2, right: HW + 2, top: -STEP - 2, bottom: 2 * HH + DECK_PX + 2 };
const POST_BOUNDS = { left: -4, right: 4, top: -2, bottom: STEP + 2 };

/** Pack `track`, group `elevated`: decks (footpath, queue × flat and ramps 0 to 3) and posts (corner 0 to 3). */
export function elevatedSpecs(): PictureSpec[] {
  const out: PictureSpec[] = [];
  const pic = (bounds: typeof DECK_BOUNDS, draw: (ctx: Ctx) => void) => (): Picture => withRoles(() => paintPicture(bounds, draw));
  for (const [kindIdx, kind] of [
    [0, 'footpath'],
    [1, 'queue'],
  ] as const) {
    for (const ramp of [-1, 0, 1, 2, 3] as const) {
      out.push({ pack: 'track', group: 'elevated', kind: K_DECK, key: deckKey(kindIdx, ramp), paint: pic(DECK_BOUNDS, (ctx) => paintDeck(ctx, kind, ramp)), ref: null });
    }
  }
  for (const corner of [0, 1, 2, 3] as const) {
    out.push({ pack: 'track', group: 'elevated', kind: K_POST, key: postKey(corner), paint: pic(POST_BOUNDS, (ctx) => paintPost(ctx, corner)), ref: null });
  }
  return out;
}
