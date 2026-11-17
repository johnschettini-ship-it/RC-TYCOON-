/**
 * View scope (spec §5.4.2(d), round 3 item 1) and `prepare`'s wants: the park's objects are indexed once per change of
 * its object lists, each with the set groups (combos) it needs, and found again only when the view leaves the rectangle
 * they were found for. Split from look.ts; no logic change.
 */
import type { ViewRect } from '../../terrain';
import { viewAffine, viewPointSX, viewPointSY, type ViewAffine, type ViewRotation } from '../../view';
import type { World } from '../../../sim/types';
import { PathItem } from '../../../sim/map';
import { getSceneryDef } from '../../../data/catalog/scenery';
import { getFlatRideDef } from '../../../data/catalog/flatRides';
import { CARD_SET } from '../cards';
import type { RealKind, SetKey } from '../indexFormat';
import type { LookCore } from './core';
import { carClassesOf, pieceClass } from '../trackClasses';
import { poseTypeOf } from './track';
import type { Combo, ItemRec, RealSets, ScopeObject } from './types';

/**
 * View scope (spec §5.4.2(d)): objects inside the view plus this many screens on each side are wanted. Objects on
 * screen are wanted 'now'; the ones only in the margin 'ahead', at density 2 (owner decision 2026-11-15): they queue behind every
 * set on screen and are the first the ladder drops, so a turn or a full park decodes what is seen first.
 */
const SCOPE_MARGIN = 1;
/**
 * The scoped objects are found for this much more on each side (screens), and reused while the view with its margin
 * stays inside that rectangle and the view's size is within `SCOPE_RESIZE` of the size it was found for.
 */
const SCOPE_SLACK = 0.25;
const SCOPE_RESIZE = 0.2;
/** How often (prepares) the park is scanned for path item kinds (a new kind is also wanted when it is first drawn). */
const PATH_ITEM_SCAN_EVERY = 60;
/** Screen px (zoom 1) above an object's footprint that its picture may reach: rides, stalls; scenery uses its height. */
const RIDE_UP_PX = 420;
const STALL_UP_PX = 120;
const PX_PER_M = 11.31;

const PATH_ITEM_IDS: Record<number, string> = { [PathItem.Bench]: 'bench', [PathItem.Bin]: 'bin', [PathItem.Lamp]: 'lamp' };

export interface LookScope {
  /** Wants the sets the next frame needs, at density `density` (the caller has run `core.beginFrame`). */
  prepare(world: World, rot: ViewRotation, view: ViewRect, density: 2 | 4): void;
  /** The park's objects are indexed again on the next prepare (the game id mapping changed). */
  invalidate(): void;
  stats(): { objects: number; inScope: number; walks: number };
}

export function makeScope(core: LookCore, sets: RealSets): LookScope {
  const { gameRec, colourRec, classRec, recOf, staffRec, resolveAt, twinOf, groundItems, guestItems } = core;
  const combos: Combo[] = [];
  const comboIds = new Map<ItemRec, number[]>();
  function combo(rec: ItemRec, turn: number, everyTurn = false): number {
    let byTurn = comboIds.get(rec);
    if (!byTurn) comboIds.set(rec, (byTurn = []));
    const slot = everyTurn ? 4 : turn & 3;
    let id = byTurn[slot];
    if (id === undefined) {
      id = combos.length;
      combos.push({ rec, turn: turn & 3, everyTurn });
      byTurn[slot] = id;
    }
    return id;
  }
  const gameCombo = (kind: RealKind, defId: string, turn: number, everyTurn = false): number => {
    const rec = gameRec(kind, defId);
    return rec ? combo(rec, turn, everyTurn) : -1;
  };
  let objects: ScopeObject[] = [];
  /** Always wanted: ground (first: its sets decode first, so the ground is laid before the objects), guests, staff, path items. */
  let always: number[] = [];
  let objectSig: unknown[] = [];
  let lastPathScan = -PATH_ITEM_SCAN_EVERY;
  let pathCombos: number[] = [];
  let scopeWalks = 0;
  /** The scoped combos, the rectangle they were found for, its view size and rotation. */
  let scoped: number[] = [];
  let scopedRect = { x0: 0, y0: 0, x1: -1, y1: -1 };
  let scopedSize = { w: 0, h: 0 };
  let scopedRot = -1;
  let scopedObjects = 0;
  let marks = new Uint8Array(0);
  /** The scoped objects with their screen points at `scopedRot`, for the on-screen split. */
  let scopedAt: { o: ScopeObject; sx: number; sy: number }[] = [];
  /** The last split: the combos of the objects on screen and of those only in the margin, for `splitView` and `scoped`. */
  let split: { on: number[]; margin: number[] } = { on: [], margin: [] };
  let splitOf: number[] | null = null;
  const splitView = { x0: NaN, y0: NaN, x1: NaN, y1: NaN };
  let seen = new Uint8Array(0);
  const affine: ViewAffine = viewAffine(0, 1, 1);

  /** What changes when the park's built objects change (not guests): lists, their last ids, track piece counts. */
  function sigOf(world: World): unknown[] {
    const s = world.state;
    let pieces = 0;
    // Ride colours (Task 5): a colour change wants other sets, so the coloured rides are part of the signature.
    let colours = '';
    for (const r of s.rides) {
      if (r.kind === 'track') pieces += s.track.rides[String(r.id)]?.pieces.length ?? 0;
      else if (r.colour != null) colours += `${r.id}:${r.colour},`;
    }
    return [s, s.map, s.rides.length, s.rides.at(-1)?.id, s.stalls.length, s.stalls.at(-1)?.id, s.scenery.length, s.scenery.at(-1)?.id, pieces, s.staff.members.length, colours];
  }

  function indexObjects(world: World): void {
    const s = world.state;
    objects = [];
    const obj = (fx: number, fy: number, z: number, span: number, up: number, a: number, b: number, c = -1): void => {
      if (a < 0 && b < 0 && c < 0) return;
      if (!Number.isFinite(fx) || !Number.isFinite(fy)) return;
      objects.push({ fx, fy, z: Number.isFinite(z) ? z : 0, rx: span * 16 + 16, up: span * 8 + up, down: span * 8 + 16, a, b, c });
    };
    const zAt = (x: number, y: number): number => (s.map.heights[y * s.map.width + x] as number | undefined) ?? 0;
    for (const r of s.rides) {
      if (r.kind === 'track') {
        const pieces = s.track.rides[String(r.id)]?.pieces ?? [];
        if (!pieces.length) continue;
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, top = 0;
        for (const p of pieces) {
          x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x + 1); y1 = Math.max(y1, p.y + 1); top = Math.max(top, p.z);
        }
        // Pieces reach a tile or two past their entry tile; heights are metres.
        x0 -= 2; y0 -= 2; x1 += 2; y1 += 2;
        const ids = trackCombos(r.defId, pieces);
        // One scope object per three combos, all with the ride's bounds.
        for (let i = 0; i < ids.length; i += 3) obj((x0 + x1) / 2, (y0 + y1) / 2, 0, x1 - x0 + y1 - y0, top * PX_PER_M + 64, ids[i] ?? -1, ids[i + 1] ?? -1, ids[i + 2] ?? -1);
        continue;
      }
      const def = getFlatRideDef(r.defId);
      const w = def?.w ?? 3;
      const d = def?.d ?? 3;
      const t = r.rotation ?? 0;
      const rec = gameRec('ride', r.defId);
      const rideCombo = rec ? combo(r.colour != null ? colourRec(rec, r.colour) : rec, t) : -1;
      obj(r.x + w / 2, r.y + d / 2, zAt(r.x, r.y), w + d, RIDE_UP_PX, rideCombo, gameCombo('shadow', r.defId, t));
    }
    for (const st of s.stalls) {
      const t = st.rotation ?? 0;
      obj(st.x + 0.5, st.y + 0.5, zAt(st.x, st.y), 2, STALL_UP_PX, gameCombo('stall', st.defId, t), gameCombo('shadow', st.defId, t));
    }
    for (const sc of s.scenery) {
      const def = getSceneryDef(sc.defId);
      // Scenery turns like `itemView`: an edge item by its edge (0 when unset), any other by its rotation.
      const t = def?.edge ? Math.max(0, sc.edge) : sc.rotation ?? 0;
      const w = def?.w ?? 1;
      const d = def?.d ?? 1;
      obj(sc.x + w / 2, sc.y + d / 2, sc.z ?? zAt(sc.x, sc.y), w + d, (def?.heightM ?? 4) * PX_PER_M + 16, gameCombo('scenery', sc.defId, t), gameCombo('shadow', sc.defId, t));
    }
    always = [];
    for (const item of groundItems) always.push(combo(recOf('ground', item) as ItemRec, 0));
    for (const item of guestItems) always.push(combo(recOf('guest', item) as ItemRec, 0));
    const staffSeen = new Set<string>();
    for (const m of s.staff.members) {
      if (staffSeen.has(m.type)) continue;
      staffSeen.add(m.type);
      const rec = staffRec(m.type);
      if (rec.k2.length || rec.k4.length) always.push(combo(rec, 0));
    }
    if (marks.length < combos.length) marks = new Uint8Array(combos.length * 2);
    scopedRot = -1;
    scopeWalks++;
  }

  /**
   * A track ride's combos (batch 5 Task 2): only what its built pieces use. Rails: one combo per (piece class, piece
   * direction), turned like any object (its set is the heading `(dir + view turn) mod 4`), so a circuit without loops
   * never wants a loop set and only the headings its pieces face are wanted (the next turn's ahead, at density 2).
   * Cars: the pose classes its pieces reach (`rall`). Supports: every saddle heading (small sets). A stage 1 bake (one
   * rail set per heading, read as every class) is wanted at the union of the pieces' headings.
   */
  function trackCombos(defId: string, pieces: readonly { defId: string; dir: number }[]): number[] {
    const out: number[] = [];
    const railRec = gameRec('rail', defId);
    if (railRec) {
      const seen = new Set<string>();
      for (const p of pieces) {
        const cls = pieceClass(p.defId);
        const k = `${cls}/${p.dir & 3}`;
        if (seen.has(k)) continue;
        seen.add(k);
        const id = combo(classRec(railRec, cls), p.dir & 3);
        if (!out.includes(id)) out.push(id);
      }
    }
    const carRec = gameRec('car', defId);
    if (carRec) {
      for (const cls of carClassesOf(poseTypeOf(carRec, defId), new Set(pieces.map((p) => p.defId)))) {
        const id = combo(classRec(carRec, cls), 0);
        if (!out.includes(id)) out.push(id);
      }
    }
    const sup = gameCombo('support', defId, 0, true);
    if (sup >= 0) out.push(sup);
    return out;
  }

  /** Path item kinds in the park (bench, bin, lamp), scanned every `PATH_ITEM_SCAN_EVERY` prepares. */
  function scanPathItems(world: World): void {
    const seen = new Set<number>();
    const pi = world.state.map.pathItem;
    pathCombos = [];
    for (let i = 0; i < pi.length && seen.size < 3; i++) {
      const code = pi[i] as number;
      if (code !== 0 && !seen.has(code)) {
        seen.add(code);
        const id = PATH_ITEM_IDS[code];
        // A path item's shadow is keyed by the side it stands on, which may be any turn.
        if (id) for (const c of [gameCombo('scenery', id, 0), gameCombo('shadow', id, 0, true)]) if (c >= 0) pathCombos.push(c);
      }
    }
    if (marks.length < combos.length) marks = new Uint8Array(combos.length * 2);
  }

  /** The combos of the objects inside `view` plus `SCOPE_MARGIN` screens, reused while the view stays in the found rectangle. */
  function scope(world: World, rot: ViewRotation, view: ViewRect): number[] {
    const vw = view.x1 - view.x0;
    const vh = view.y1 - view.y0;
    const nx0 = view.x0 - vw * SCOPE_MARGIN;
    const ny0 = view.y0 - vh * SCOPE_MARGIN;
    const nx1 = view.x1 + vw * SCOPE_MARGIN;
    const ny1 = view.y1 + vh * SCOPE_MARGIN;
    const fits = scopedRot === rot && nx0 >= scopedRect.x0 && ny0 >= scopedRect.y0 && nx1 <= scopedRect.x1 && ny1 <= scopedRect.y1
      && Math.abs(vw / scopedSize.w - 1) <= SCOPE_RESIZE && Math.abs(vh / scopedSize.h - 1) <= SCOPE_RESIZE;
    if (fits) return scoped;
    const m = SCOPE_MARGIN + SCOPE_SLACK;
    const x0 = view.x0 - vw * m;
    const y0 = view.y0 - vh * m;
    const x1 = view.x1 + vw * m;
    const y1 = view.y1 + vh * m;
    const map = world.state.map;
    viewAffine(rot, map.width, map.height, affine);
    marks.fill(0);
    let n = 0;
    const out: number[] = [];
    scopedAt = [];
    for (const o of objects) {
      const sx = viewPointSX(affine, o.fx, o.fy);
      const sy = viewPointSY(affine, o.fx, o.fy, o.z);
      if (sx + o.rx < x0 || sx - o.rx > x1 || sy + o.down < y0 || sy - o.up > y1) continue;
      n++;
      scopedAt.push({ o, sx, sy });
      const { a, b, c } = o;
      if (a >= 0 && !marks[a]) { marks[a] = 1; out.push(a); }
      if (b >= 0 && !marks[b]) { marks[b] = 1; out.push(b); }
      if (c >= 0 && !marks[c]) { marks[c] = 1; out.push(c); }
    }
    scopeWalks++;
    scoped = out;
    scopedObjects = n;
    scopedRect = { x0, y0, x1, y1 };
    scopedSize = { w: vw, h: vh };
    scopedRot = rot;
    return out;
  }

  /**
   * The scoped combos split into those of objects on screen (`view` itself) and those of objects only in the margin
   * (a combo shared with an object on screen is on screen). Found again only when the view or the scope changes.
   */
  function splitScope(view: ViewRect): { on: number[]; margin: number[] } {
    if (splitOf === scoped && view.x0 === splitView.x0 && view.y0 === splitView.y0 && view.x1 === splitView.x1 && view.y1 === splitView.y1) return split;
    if (seen.length < combos.length) seen = new Uint8Array(combos.length * 2);
    else seen.fill(0);
    const on: number[] = [];
    const margin: number[] = [];
    const inView = (e: { o: ScopeObject; sx: number; sy: number }): boolean =>
      !(e.sx + e.o.rx < view.x0 || e.sx - e.o.rx > view.x1 || e.sy + e.o.down < view.y0 || e.sy - e.o.up > view.y1);
    for (const e of scopedAt) {
      if (!inView(e)) continue;
      for (const c of [e.o.a, e.o.b, e.o.c]) if (c >= 0 && !seen[c]) { seen[c] = 1; on.push(c); }
    }
    for (const e of scopedAt) {
      if (inView(e)) continue;
      for (const c of [e.o.a, e.o.b, e.o.c]) if (c >= 0 && !seen[c]) { seen[c] = 2; margin.push(c); }
    }
    split = { on, margin };
    splitOf = scoped;
    splitView.x0 = view.x0; splitView.y0 = view.y0; splitView.x1 = view.x1; splitView.y1 = view.y1;
    return split;
  }

  return {
    prepare(world, rot, view, density) {
      const sig = sigOf(world);
      if (sig.length !== objectSig.length || sig.some((v, i) => v !== objectSig[i])) {
        objectSig = sig;
        indexObjects(world);
        lastPathScan = -PATH_ITEM_SCAN_EVERY;
      }
      if (core.frameNo - lastPathScan >= PATH_ITEM_SCAN_EVERY) {
        lastPathScan = core.frameNo;
        scanPathItems(world);
      }
      scope(world, rot, view);
      const { on, margin } = splitScope(view);
      const ahead = ((rot + 1) % 4) as ViewRotation;
      const back = ((rot + 3) % 4) as ViewRotation;
      const now = new Set<SetKey>();
      const later = new Set<SetKey>();
      // While a density-4 set is not ready, its density-2 twin is wanted too, first (a quarter of the size, so it
      // decodes first): the object draws from it at once (a turn the other way, a zoom in), and if the budget caps
      // the density, the sets it then needs are already there. Not for ground pieces (they never step down).
      const twins = new Set<SetKey>();
      const addNow = (rec: ItemRec, r: ViewRotation): void => {
        const k = resolveAt(rec, r, density);
        if (k === undefined) return;
        now.add(k);
        if (sets.state(k) === 'ready') return;
        const tw = twinOf(rec, r, k);
        if (tw !== undefined) twins.add(tw);
      };
      /** Pairs (record, ahead turn) whose ahead set `want` adds once every `now` set is known. */
      const aheads: (ItemRec | ViewRotation)[] = [];
      const want = (ids: readonly number[]): void => {
        for (const id of ids) {
          const { rec, everyTurn, turn } = combos[id] as Combo;
          if (everyTurn) {
            for (let r = 0; r < 4; r++) addNow(rec, r as ViewRotation);
            continue;
          }
          addNow(rec, ((turn + rot) % 4) as ViewRotation);
          // The ahead turn at density 2 only (cheap), for the same objects: after a turn they show at once from these
          // sets and sharpen when the turn's density-4 sets land. A set for every turn (rot 'all') is already wanted.
          // Decided once every object's set for this turn is wanted (`aheads` below): a track ride's rail combos turn
          // into each other's headings, so an ahead heading is often one another combo wants now.
          aheads.push(rec, ((turn + ahead) % 4) as ViewRotation);
          // A coloured ride with a set per turn also wants the turn back (counter-clockwise) at density 2, ahead: its
          // set needs a decode and a tint (one at a time, in the shared tint budget), so a turn back would otherwise
          // wait for both (Task 6 bench: +~270 ms on the rides park's last turn). Ahead sets are still dropped first
          // under pressure. A set for every turn (rot 'all') resolves to the one already wanted.
          if (rec.base) {
            const br = ((turn + back) % 4) as ViewRotation;
            const b = resolveAt(rec, br, 2);
            if (b !== undefined && !now.has(b)) later.add(b);
          }
        }
      };
      /**
       * Objects only in the scope's margin (not drawn yet): their turn and the ahead turn, ahead and at density 2 only,
       * like the ahead turn (a quarter of the size: a pan shows them at once and sharpens as their density-4 sets land,
       * and big density-4 margin decodes do not hold the two decode slots when a turn starts).
       */
      const wantMargin = (ids: readonly number[]): void => {
        for (const id of ids) {
          const { rec, everyTurn, turn } = combos[id] as Combo;
          for (const t of everyTurn ? [0, 1, 2, 3] : [turn + rot, turn + ahead]) {
            const k = resolveAt(rec, (t % 4) as ViewRotation, 2);
            if (k !== undefined) later.add(k);
          }
        }
      };
      // Ground first (its sets decode first), then the objects on screen, guests, staff and path items, then the
      // objects in the scope's margin (ahead).
      want(always.slice(0, groundItems.length));
      want(on);
      want(always.slice(groundItems.length));
      want(pathCombos);
      for (let i = 0; i < aheads.length; i += 2) {
        const rec = aheads[i] as ItemRec;
        const ar = aheads[i + 1] as ViewRotation;
        const a = resolveAt(rec, ar, density);
        if (a === undefined || now.has(a)) continue;
        const low = density === 4 ? resolveAt(rec, ar, 2) : a;
        if (low !== undefined) later.add(low);
      }
      wantMargin(margin);
      // The card pictures: one small set, always loaded (src/render/real/cards.ts).
      if (core.has(CARD_SET)) now.add(CARD_SET);
      for (const k of twins) now.delete(k);
      for (const k of [...now, ...twins]) later.delete(k);
      if (twins.size) sets.want([...twins], 'now');
      sets.want([...now], 'now');
      sets.want([...later], 'ahead');
    },

    invalidate() {
      objectSig = [];
    },

    stats() {
      return { objects: objects.length, inScope: scopedObjects, walks: scopeWalks };
    },
  };
}
