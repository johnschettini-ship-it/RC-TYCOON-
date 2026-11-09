/**
 * Where a scenery item draws in the current view rotation (Phase 4 §4.8). Owner: W3-D. Pure math on numbers (no
 * allocation): the render loop fills one scratch `ItemView` per item.
 */
import type { SceneryDef } from '../../data/catalog';
import type { Dir } from '../../sim/map';
import type { Scenery } from '../../sim/scenery/types';

export interface ItemView {
  /** View-origin tile of the footprint (minimum u and v). */
  u0: number;
  v0: number;
  /** View footprint. */
  ex: number;
  ey: number;
  /** Sprite rotation `(rotation + r) mod 4`; edge items: the view edge. */
  f: Dir;
  /** Depth (`u + v`) of a 1 × 1 item or of an edge item's edge midpoint. */
  depth: number;
}

export function newItemView(): ItemView {
  return { u0: 0, v0: 0, ex: 1, ey: 1, f: 0, depth: 0 };
}

/** View u of map tile (x, y) for rotation r on a w × h map (the §4.8 table). */
export function viewU(x: number, y: number, r: Dir, w: number, h: number): number {
  return r === 0 ? x : r === 1 ? h - 1 - y : r === 2 ? w - 1 - x : y;
}

/** View v of map tile (x, y). */
export function viewV(x: number, y: number, r: Dir, w: number, h: number): number {
  return r === 0 ? y : r === 1 ? x : r === 2 ? h - 1 - y : w - 1 - x;
}

/** Fill `out` for `item` drawn at view rotation `r` on a `w` × `h` map. */
export function itemView(out: ItemView, item: Scenery, def: Pick<SceneryDef, 'w' | 'd' | 'edge'>, r: Dir, w: number, h: number): ItemView {
  if (def.edge) {
    const e = (((item.edge < 0 ? 0 : item.edge) + r) % 4) as Dir;
    out.u0 = viewU(item.x, item.y, r, w, h);
    out.v0 = viewV(item.x, item.y, r, w, h);
    out.ex = 1;
    out.ey = 1;
    out.f = e;
    out.depth = out.u0 + out.v0 + (e === 1 || e === 2 ? 1.5 : 0.5);
    return out;
  }
  const odd = item.rotation % 2 === 1;
  const mx = odd ? def.d : def.w;
  const my = odd ? def.w : def.d;
  const x1 = item.x + mx - 1;
  const y1 = item.y + my - 1;
  const ua = viewU(item.x, item.y, r, w, h);
  const ub = viewU(x1, y1, r, w, h);
  const va = viewV(item.x, item.y, r, w, h);
  const vb = viewV(x1, y1, r, w, h);
  out.u0 = ua < ub ? ua : ub;
  out.v0 = va < vb ? va : vb;
  out.ex = r % 2 === 1 ? my : mx;
  out.ey = r % 2 === 1 ? mx : my;
  out.f = ((item.rotation + r) % 4) as Dir;
  out.depth = out.u0 + out.v0 + 1;
  return out;
}
