/**
 * Phase 3 render layer (Owner: W2-B), called by the canvas renderer at fixed points of its frame:
 * - ground decals: litter and mess at hashed sub-positions (after terrain, before objects)
 * - depth-sorted objects: staff (interpolated like guests) and path items (bench, bin fill, lamp, broken look)
 * - bench sitters: seat positions for guests in the `sitting` state
 * - weather screen overlay (rain, storm) driven by `state.management.weather`
 * - overlays: the selected staff member's patrol area and ring, spanner and storm markers over rides,
 *   the path item ghost
 * Frame loops write into reused records and typed arrays: no allocation per object.
 * View rotation (Phase 4 §4.8, W3-G): positions go through the frame's view table (`begin(…, va)`), depth sorts by
 * u + v, and facings, bench sides, and item sides turn by r.
 */
import { BIN_CAPACITY, STAFF } from '../../data/catalog/people';
import { getFlatRideDef } from '../../data/catalog/flatRides';
import type { StaffType } from '../../data/catalog/types';
import { extent } from '../../sim/footprint';
import { PathItem, type Dir, type MapState } from '../../sim/map';
import type { Staff } from '../../sim/staff/types';
import type { World } from '../../sim/types';
import type { ZoomBucket } from '../camera';
import { Layer, viewPointDepth } from '../depth';
import { walkerHeights, type GuestPos } from '../guestPos';
import { STEP_PX, TILE_H, TILE_W } from '../iso';
import { mix32 } from '../palette';
import { pathJoinMask } from '../paths';
import type { Sprite } from '../spriteCache';
import { DECAL_MESS, decalSpriteKey, pathItemSpriteKey, staffSpriteKey, type SpriteBank } from '../sprites/bank';
import { binFillLevel, pathItemFrame } from '../sprites/litter';
import { rideArtBounds } from '../sprites/rides';
import { COSTUME_CODE, STAFF_TYPE_CODE, staffFrame } from '../sprites/staff';
import type { ViewRect } from '../terrain';
import type { ToolState } from '../types';
import { displayPrefs } from '../../a11y/prefs';
import { viewAffine, viewCornerHeights, viewDir, viewPointSX, viewPointSY, viewSpriteRotation, viewTileSX, viewTileSY, viewTileU, viewTileV, type ViewAffine } from '../view';
import { litterSlot, messSlot, type DecalSlot } from './litter';
import { pathItemPlacement, type ItemPlacement } from './pathItemPos';
import { staffPosition, type StaffPos } from './staffPos';
import { patrolOverlayStaffId, pathItemAction, toolOptions } from './toolOptions';

const HW = TILE_W / 2;
const HH = TILE_H / 2;
const TAU = Math.PI * 2;

/** Draw-list kinds this layer owns (the renderer uses 1–5). */
export const KIND_STAFF = 6;
export const KIND_PATH_ITEM = 7;

/** The renderer's draw list (struct of arrays); this layer only pushes into it. */
export interface DrawSink {
  push(kind: number, ref: number, sub: number, ax: number, ay: number, skey: number, depth: number, z: number, layer: number): void;
}

const TICKS_PER_TILE: Readonly<Record<StaffType, number>> = {
  groundskeeper: STAFF.find((d) => d.id === 'groundskeeper')?.ticksPerTile ?? 12,
  mechanic: STAFF.find((d) => d.id === 'mechanic')?.ticksPerTile ?? 10,
  security: STAFF.find((d) => d.id === 'security')?.ticksPerTile ?? 10,
  performer: STAFF.find((d) => d.id === 'performer')?.ticksPerTile ?? 14,
};

/** Seat offsets along a bench (2 seats, BENCH_SEATS). */
const SEAT_ALONG = [-0.1, 0.1] as const;

/** Rain streaks per screen at most. */
const RAIN_MAX = 240;
const REF_AREA = 1280 * 800;

function dirBetween(w: number, from: number, to: number): Dir {
  const fx = from % w;
  const tx = to % w;
  if (tx > fx) return 1;
  if (tx < fx) return 3;
  return to > from ? 2 : 0;
}

/** Height (steps) of the ground at local (u, v) of tile i: bilinear over the slope corners. */
function surfaceZ(map: MapState, i: number, u: number, v: number): number {
  const h = map.heights[i] as number;
  const s = map.slope[i] as number;
  if (s === 0) return h;
  const hN = h + (s & 1 ? 1 : 0);
  const hE = h + (s & 2 ? 1 : 0);
  const hS = h + (s & 4 ? 1 : 0);
  const hW = h + (s & 8 ? 1 : 0);
  return (1 - u) * (1 - v) * hN + u * (1 - v) * hE + u * v * hS + (1 - u) * v * hW;
}

function working(s: Staff): boolean {
  return s.state !== 'walking';
}

export class ManagementLayer {
  private scale = 1;
  private offX = 0;
  private offY = 0;
  private dpr = 1;
  private bucket: ZoomBucket = 1;
  private view: ViewRect = { x0: 0, y0: 0, x1: 0, y1: 0 };
  private readonly slot: DecalSlot = { u: 0, v: 0, variant: 0, flip: 0 };
  private readonly spos: StaffPos = { fx: 0, fy: 0, z: 0 };
  private readonly place: ItemPlacement = { u: 0, v: 0, alongX: true, side: 0 };
  private frameNo = 0;
  private sitStamp = new Uint32Array(256);
  private sfx = new Float64Array(256);
  private sfy = new Float64Array(256);
  private sz = new Float64Array(256);
  private sdir = new Uint8Array(256);
  private readonly rain = new Float32Array(RAIN_MAX * 3);
  /** The frame's view table (rotation 0 until `begin` sets it). */
  private va: ViewAffine = viewAffine(0, 1, 1);
  private readonly corners: [number, number, number, number] = [0, 0, 0, 0];
  /** Phase 6 §4.7: reduced motion (W4-F's display prefs: the setting, else the system preference). */
  private get reducedMotion(): boolean {
    return displayPrefs().reducedMotion;
  }

  constructor(
    private readonly bank: SpriteBank,
    private readonly blit: (sp: Sprite, wx: number, wy: number) => void,
  ) {
    for (let k = 0; k < RAIN_MAX; k++) {
      const h = mix32(k * 2654435761 + 97);
      this.rain[k * 3] = (h & 0xffff) / 0xffff;
      this.rain[k * 3 + 1] = (h >>> 16) / 0xffff;
      this.rain[k * 3 + 2] = 0.7 + ((mix32(h) & 0xff) / 0xff) * 0.6;
    }
  }

  /** Frame transform: device px = world px × scale + off; `va`: the view table of this frame (rotation 0 when left out). */
  begin(scale: number, offX: number, offY: number, dpr: number, bucket: ZoomBucket, view: ViewRect, va?: ViewAffine): void {
    if (va) this.va = va;
    this.scale = scale;
    this.offX = offX;
    this.offY = offY;
    this.dpr = dpr;
    this.bucket = bucket;
    this.view = view;
    this.frameNo = (this.frameNo + 1) >>> 0 || 1;
  }

  private inView(l: number, t: number, r: number, b: number): boolean {
    const v = this.view;
    return r >= v.x0 && l <= v.x1 && b >= v.y0 && t <= v.y1;
  }

  // ------------------------------------------------------------------ ground decals

  /** Litter and mess on visible tiles, at deterministic hashed sub-positions (Phase 3 §4.3). */
  drawGround(world: World): void {
    const map = world.state.map;
    const { litter, mess } = map;
    const w = map.width;
    const n = w * map.height;
    const slot = this.slot;
    const bucket = this.bucket;
    for (let i = 0; i < n; i++) {
      const nl = litter[i] as number;
      const nm = mess[i] as number;
      if (nl === 0 && nm === 0) continue;
      const x = i % w;
      const y = (i - x) / w;
      const z0 = map.heights[i] as number;
      const ax = viewTileSX(this.va, x, y);
      const ay = viewTileSY(this.va, x, y, z0);
      if (!this.inView(ax - HW, ay - 12, ax + HW, ay + TILE_H + 4)) continue;
      for (let k = 0; k < nm; k++) {
        messSlot(i, k, slot);
        const fx = x + slot.u;
        const fy = y + slot.v;
        const frame = DECAL_MESS + slot.variant;
        const sp = this.bank.decal(decalSpriteKey(frame, slot.flip, bucket), frame, slot.flip, bucket);
        this.blit(sp, viewPointSX(this.va, fx, fy), viewPointSY(this.va, fx, fy, surfaceZ(map, i, slot.u, slot.v)));
      }
      for (let k = 0; k < nl; k++) {
        litterSlot(i, k, slot);
        const fx = x + slot.u;
        const fy = y + slot.v;
        const sp = this.bank.decal(decalSpriteKey(slot.variant, slot.flip, bucket), slot.variant, slot.flip, bucket);
        this.blit(sp, viewPointSX(this.va, fx, fy), viewPointSY(this.va, fx, fy, surfaceZ(map, i, slot.u, slot.v)));
      }
    }
  }

  // ------------------------------------------------------------------ objects

  private ensureSitScratch(n: number): void {
    if (this.sitStamp.length >= n) return;
    let cap = this.sitStamp.length;
    while (cap < n) cap *= 2;
    this.sitStamp = new Uint32Array(cap);
    this.sfx = new Float64Array(cap);
    this.sfy = new Float64Array(cap);
    this.sz = new Float64Array(cap);
    this.sdir = new Uint8Array(cap);
  }

  /** Push staff and path items into the draw list, and place bench sitters for this frame. */
  collect(world: World, alpha: number, sink: DrawSink): void {
    this.collectPathItems(world, sink);
    this.collectStaff(world, alpha, sink);
    this.placeSitters(world);
  }

  private collectPathItems(world: World, sink: DrawSink): void {
    const s = world.state;
    const map = s.map;
    const items = map.pathItem;
    const w = map.width;
    const n = w * map.height;
    const p = this.place;
    for (let i = 0; i < n; i++) {
      const code = items[i] as number;
      if (code === PathItem.None) continue;
      const x = i % w;
      const y = (i - x) / w;
      const z0 = map.heights[i] as number;
      const cx = viewTileSX(this.va, x, y);
      const cy = viewTileSY(this.va, x, y, z0);
      if (!this.inView(cx - HW, cy - 34, cx + HW, cy + TILE_H + 8)) continue;
      pathItemPlacement(pathJoinMask(map, i, s.rides, s.stalls), p);
      const fx = x + p.u;
      const fy = y + p.v;
      const z = surfaceZ(map, i, p.u, p.v);
      const broken = ((map.pathItemFlags[i] as number) & 1) !== 0;
      const fill = code === PathItem.Bin ? binFillLevel(map.binFill[i] as number, BIN_CAPACITY) : 0;
      const frame = pathItemFrame(code, viewDir(p.side, this.va.r), fill, broken);
      const va = this.va;
      sink.push(KIND_PATH_ITEM, i, frame, viewPointSX(va, fx, fy), viewPointSY(va, fx, fy, z), pathItemSpriteKey(frame, this.bucket), viewPointDepth(fx, fy, va), z, Layer.Object);
    }
  }

  private collectStaff(world: World, alpha: number, sink: DrawSink): void {
    const s = world.state;
    const map = s.map;
    const heights = walkerHeights(world);
    const members = s.staff.members;
    const w = map.width;
    const pos = this.spos;
    const tick = s.tick;
    for (let si = 0; si < members.length; si++) {
      const m = members[si] as Staff;
      if (m.tile < 0) continue;
      const tpt = TICKS_PER_TILE[m.type];
      staffPosition(map, m, tpt, alpha, pos, heights);
      const ax = viewPointSX(this.va, pos.fx, pos.fy);
      const ay = viewPointSY(this.va, pos.fx, pos.fy, pos.z);
      if (ax < this.view.x0 - 14 || ax > this.view.x1 + 14 || ay < this.view.y0 - 6 || ay > this.view.y1 + 32) continue;
      let facing: Dir = m.dir;
      let walk = 0;
      if (m.nextTile >= 0 && m.nextTile !== m.tile) {
        facing = dirBetween(w, m.tile, m.nextTile);
        walk = 1 + ((Math.floor((m.progress + alpha) / 5) + m.id) & 1);
      }
      const action = working(m) ? 1 + (((tick >> 3) + m.id) & 1) : 0;
      const costume = m.type === 'performer' && m.costume ? COSTUME_CODE[m.costume] : 0;
      const frame = staffFrame(STAFF_TYPE_CODE[m.type], costume, walk, action);
      const vf = viewDir(facing, this.va.r);
      sink.push(KIND_STAFF, si, vf | (frame << 2), ax, ay, staffSpriteKey(vf, frame, this.bucket), viewPointDepth(pos.fx, pos.fy, this.va), pos.z, Layer.Guest);
    }
  }

  /** Seat positions for guests sitting on benches (2 seats per bench, in sitter order). */
  private placeSitters(world: World): void {
    const s = world.state;
    const sitters = s.staff.benchSitters;
    if (sitters.length === 0) return;
    const guests = s.guests;
    this.ensureSitScratch(guests.length);
    const map = s.map;
    const w = map.width;
    const p = this.place;
    for (let k = 0; k < sitters.length; k++) {
      const st = sitters[k] as { guestId: number; tile: number };
      const gi = findIndexById(guests, st.guestId);
      if (gi < 0) continue;
      let seat = 0;
      for (let j = 0; j < k; j++) if ((sitters[j] as { tile: number }).tile === st.tile) seat++;
      const t = st.tile;
      const x = t % w;
      const y = (t - x) / w;
      pathItemPlacement(pathJoinMask(map, t, s.rides, s.stalls), p);
      const along = SEAT_ALONG[seat & 1] as number;
      // A little in front of the backrest, toward the path.
      const out = p.side === 0 || p.side === 3 ? 0.02 : -0.02;
      const u = p.alongX ? p.u + along : p.u + out;
      const v = p.alongX ? p.v + out : p.v + along;
      this.sitStamp[gi] = this.frameNo;
      this.sfx[gi] = x + u;
      this.sfy[gi] = y + v;
      this.sz[gi] = surfaceZ(map, t, Math.min(1, Math.max(0, u)), Math.min(1, Math.max(0, v)));
      this.sdir[gi] = (p.side + 2) & 3;
    }
  }

  /** If guest `gi` sits on a bench this frame, write its seat into `out` and return its facing; else −1. */
  sitter(gi: number, out: GuestPos): number {
    if (gi >= this.sitStamp.length || this.sitStamp[gi] !== this.frameNo) return -1;
    out.fx = this.sfx[gi] as number;
    out.fy = this.sfy[gi] as number;
    out.z = this.sz[gi] as number;
    return this.sdir[gi] as number;
  }

  drawEntry(kind: number, sub: number, ax: number, ay: number, skey: number): void {
    if (kind === KIND_STAFF) {
      this.blit(this.bank.staff(skey, (sub & 3) as Dir, sub >> 2, this.bucket), ax, ay);
    } else if (kind === KIND_PATH_ITEM) {
      this.blit(this.bank.pathItem(skey, sub, this.bucket), ax, ay);
    }
  }

  // ------------------------------------------------------------------ weather

  /** Rain or storm streaks and a light tint, in device pixels (Phase 3 §4.9). Cheap: one path, one stroke. */
  drawWeather(ctx: CanvasRenderingContext2D, world: World, width: number, height: number, alpha: number): void {
    const w = world.state.management.weather.current;
    let tint: string | null = null;
    if (w === 'cloudy') tint = 'rgba(70,80,95,0.10)';
    else if (w === 'rain') tint = 'rgba(40,55,85,0.18)';
    else if (w === 'storm') tint = 'rgba(18,22,45,0.34)';
    else if (w === 'cold') tint = 'rgba(180,220,255,0.10)';
    else if (w === 'hot') tint = 'rgba(255,190,90,0.07)';
    if (!tint) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, width, height);
    if (w !== 'rain' && w !== 'storm') return;
    const storm = w === 'storm';
    const t = this.reducedMotion ? 0 : world.state.tick + alpha;
    const d = this.dpr;
    const fall = (storm ? 44 : 32) * d;
    const drift = (storm ? 13 : 5) * d;
    const len = (storm ? 20 : 14) * d;
    const count = Math.min(RAIN_MAX, Math.round(((storm ? 200 : 110) * (width * height)) / (REF_AREA * d * d)));
    const spanX = width + len;
    const spanY = height + len;
    const dx = (drift / fall) * len;
    ctx.beginPath();
    for (let k = 0; k < count; k++) {
      const sx = this.rain[k * 3] as number;
      const sy = this.rain[k * 3 + 1] as number;
      const sp = this.rain[k * 3 + 2] as number;
      const x = ((sx * spanX + t * drift * sp) % spanX) - len * 0.5;
      const y = ((sy * spanY + t * fall * sp) % spanY) - len;
      ctx.moveTo(x, y);
      ctx.lineTo(x - dx, y - len);
    }
    ctx.strokeStyle = storm ? 'rgba(200,215,255,0.5)' : 'rgba(190,215,255,0.42)';
    ctx.lineWidth = Math.max(1, d);
    ctx.stroke();
    if (storm && !this.reducedMotion) {
      // A short flash now and then, from the tick (deterministic).
      const beat = Math.floor(world.state.tick / 12);
      if (mix32(beat * 7919) % 23 === 0 && world.state.tick % 12 < 3) {
        ctx.fillStyle = 'rgba(235,240,255,0.22)';
        ctx.fillRect(0, 0, width, height);
      }
    }
  }

  // ------------------------------------------------------------------ overlays

  private dx(wx: number): number {
    return wx * this.scale + this.offX;
  }

  private dy(wy: number): number {
    return wy * this.scale + this.offY;
  }

  /** Patrol area of the selected staff member, its ring, ride markers, and the path item ghost. */
  drawOverlays(ctx: CanvasRenderingContext2D, world: World, tool: ToolState, alpha: number): void {
    this.drawPatrol(ctx, world, tool, alpha);
    this.drawRideMarkers(ctx, world, alpha);
    this.drawItemGhost(ctx, world, tool);
  }

  /** Map tile `i`'s top face as seen in the view (view corners N, E, S, W). */
  private tileDiamond(ctx: CanvasRenderingContext2D, map: MapState, i: number): void {
    const w = map.width;
    const x = i % w;
    const y = (i - x) / w;
    const u = viewTileU(this.va, x, y);
    const v = viewTileV(this.va, x, y);
    const c = viewCornerHeights(map, i, this.va.r, this.corners);
    ctx.moveTo(this.dx((u - v) * HW), this.dy((u + v) * HH - c[0] * STEP_PX));
    ctx.lineTo(this.dx((u + 1 - v) * HW), this.dy((u + 1 + v) * HH - c[1] * STEP_PX));
    ctx.lineTo(this.dx((u - v) * HW), this.dy((u + v + 2) * HH - c[2] * STEP_PX));
    ctx.lineTo(this.dx((u - v - 1) * HW), this.dy((u + v + 1) * HH - c[3] * STEP_PX));
    ctx.closePath();
  }

  private drawPatrol(ctx: CanvasRenderingContext2D, world: World, tool: ToolState, alpha: number): void {
    const id = patrolOverlayStaffId(tool);
    if (id < 0) return;
    const s = world.state;
    const members = s.staff.members;
    const mi = findIndexById(members, id);
    if (mi < 0) return;
    const m = members[mi] as Staff;
    const map = s.map;
    const patrol = m.patrol;
    if (patrol) {
      const w = map.width;
      const n = w * map.height;
      ctx.beginPath();
      for (let b = 0; b < patrol.length; b++) {
        const byte = patrol[b] as number;
        if (byte === 0) continue;
        for (let bit = 0; bit < 8; bit++) {
          if (((byte >> bit) & 1) === 0) continue;
          const i = b * 8 + bit;
          if (i >= n) break;
          const x = i % w;
          const y = (i - x) / w;
          const ax = viewTileSX(this.va, x, y);
          const ay = viewTileSY(this.va, x, y, map.heights[i] as number);
          if (!this.inView(ax - HW, ay - 8, ax + HW, ay + TILE_H + 8)) continue;
          this.tileDiamond(ctx, map, i);
        }
      }
      ctx.fillStyle = 'rgba(124,92,255,0.26)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(214,204,255,0.9)';
      ctx.lineWidth = Math.max(1, this.scale);
      ctx.stroke();
    }
    // Ring and marker on the staff member.
    staffPosition(map, m, TICKS_PER_TILE[m.type], alpha, this.spos, walkerHeights(world));
    const x = this.dx(viewPointSX(this.va, this.spos.fx, this.spos.fy));
    const y = this.dy(viewPointSY(this.va, this.spos.fx, this.spos.fy, this.spos.z));
    const k = this.scale;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(1.5, 2 * k);
    ctx.beginPath();
    ctx.ellipse(x, y, 9 * k, 4.5 * k, 0, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = '#b9a6ff';
    ctx.beginPath();
    ctx.moveTo(x, y - 30 * k);
    ctx.lineTo(x - 4 * k, y - 36 * k);
    ctx.lineTo(x + 4 * k, y - 36 * k);
    ctx.closePath();
    ctx.fill();
  }

  /** Spanner over broken rides, a storm cloud over rides held for the storm (Phase 3 §7.1). */
  private drawRideMarkers(ctx: CanvasRenderingContext2D, world: World, alpha: number): void {
    const s = world.state;
    const map = s.map;
    const t = this.reducedMotion ? 0 : s.tick + alpha;
    for (const r of s.rides) {
      if (r.status !== 'broken' && r.status !== 'stormHold') continue;
      const oi = r.y * map.width + r.x;
      const z = (map.heights[oi] as number | undefined) ?? 0;
      const va = this.va;
      let wx = viewTileSX(va, r.x, r.y);
      let wy = viewTileSY(va, r.x, r.y, z);
      if (r.kind === 'flat') {
        const def = getFlatRideDef(r.defId);
        const fw = def?.w ?? 1;
        const fd = def?.d ?? 1;
        const { ex, ey } = extent(fw, fd, r.rotation);
        // Over the middle of the footprint as seen in the view, above the art.
        const cx = r.x + ex / 2;
        const cy = r.y + ey / 2;
        wx = viewPointSX(va, cx, cy);
        const vrot = viewSpriteRotation(r.rotation, va.r);
        const eu = va.r & 1 ? ey : ex;
        const ev = va.r & 1 ? ex : ey;
        // Footprint top corner (view) = centre less half the view extents.
        wy = viewPointSY(va, cx, cy, z) - ((eu + ev) * HH) / 2 + rideArtBounds(r.defId, fw, fd, vrot).top - 4;
      } else {
        wy -= 52;
      }
      if (!this.inView(wx - 30, wy - 40, wx + 30, wy + 20)) continue;
      const bob = Math.sin(t / 7 + r.id) * 2;
      const rad = Math.max(9, 12 * Math.min(1.6, this.scale));
      const x = this.dx(wx);
      const y = this.dy(wy) - rad + bob * this.scale;
      this.marker(ctx, x, y, rad, r.status === 'broken');
    }
  }

  private marker(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, broken: boolean): void {
    ctx.fillStyle = broken ? '#f2b84b' : '#6b6fd9';
    ctx.strokeStyle = '#1b2433';
    ctx.lineWidth = Math.max(1.2, r * 0.14);
    // Pin: circle and a point below.
    ctx.beginPath();
    ctx.moveTo(x - r * 0.45, y + r * 0.8);
    ctx.lineTo(x, y + r * 1.45);
    ctx.lineTo(x + r * 0.45, y + r * 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.lineCap = 'round';
    if (broken) {
      // Spanner.
      ctx.strokeStyle = '#1b2433';
      ctx.lineWidth = Math.max(2, r * 0.26);
      ctx.beginPath();
      ctx.moveTo(x - r * 0.45, y + r * 0.45);
      ctx.lineTo(x + r * 0.12, y - r * 0.12);
      ctx.stroke();
      ctx.lineWidth = Math.max(1.6, r * 0.2);
      ctx.beginPath();
      ctx.arc(x + r * 0.28, y - r * 0.28, r * 0.3, Math.PI * 0.95, Math.PI * 2.55);
      ctx.stroke();
    } else {
      // Cloud with a small bolt.
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x - r * 0.32, y - r * 0.02, r * 0.3, 0, TAU);
      ctx.arc(x + r * 0.05, y - r * 0.22, r * 0.36, 0, TAU);
      ctx.arc(x + r * 0.4, y + r * 0.02, r * 0.27, 0, TAU);
      ctx.fill();
      ctx.fillRect(x - r * 0.32, y - r * 0.02, r * 0.72, r * 0.3);
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.moveTo(x + r * 0.05, y + r * 0.2);
      ctx.lineTo(x - r * 0.15, y + r * 0.62);
      ctx.lineTo(x + r * 0.05, y + r * 0.55);
      ctx.lineTo(x - r * 0.05, y + r * 0.85);
      ctx.lineTo(x + r * 0.22, y + r * 0.42);
      ctx.lineTo(x + r * 0.04, y + r * 0.48);
      ctx.closePath();
      ctx.fill();
    }
  }

  /** Path item ghost: the item itself, see-through, where a tap would place it. */
  private drawItemGhost(ctx: CanvasRenderingContext2D, world: World, tool: ToolState): void {
    const g = tool.ghost;
    if (!g || g.kind !== 'pathItem') return;
    const a = pathItemAction(tool);
    if (a !== 'bench' && a !== 'bin' && a !== 'lamp') return;
    const s = world.state;
    const map = s.map;
    const n = map.width * map.height;
    if (g.tile < 0 || g.tile >= n) return;
    const x = g.tile % map.width;
    const y = (g.tile - x) / map.width;
    const p = this.place;
    pathItemPlacement(pathJoinMask(map, g.tile, s.rides, s.stalls), p);
    const code = a === 'bench' ? PathItem.Bench : a === 'bin' ? PathItem.Bin : PathItem.Lamp;
    const frame = pathItemFrame(code, viewDir(p.side, this.va.r), 0, false);
    const fx = x + p.u;
    const fy = y + p.v;
    const z = surfaceZ(map, g.tile, p.u, p.v);
    ctx.globalAlpha = g.valid ? 0.75 : 0.4;
    this.blit(this.bank.pathItem(pathItemSpriteKey(frame, this.bucket), frame, this.bucket), viewPointSX(this.va, fx, fy), viewPointSY(this.va, fx, fy, z));
    ctx.globalAlpha = 1;
  }

  /** Patrol stroke colours: paint (violet) or erase (red). */
  strokeColours(tool: ToolState): { fill: string; stroke: string } {
    const o = toolOptions(tool);
    return (o.strokeMode ?? o.patrolMode) === 'erase' ? ERASE_COLOURS : PAINT_COLOURS;
  }
}

const PAINT_COLOURS = { fill: 'rgba(124,92,255,0.4)', stroke: '#d6ccff' };
const ERASE_COLOURS = { fill: 'rgba(229,72,77,0.4)', stroke: '#ffb3b5' };

function findIndexById(list: ReadonlyArray<{ id: number }>, id: number): number {
  let lo = 0;
  let hi = list.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const v = (list[mid] as { id: number }).id;
    if (v === id) return mid;
    if (v < id) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}
