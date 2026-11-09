/**
 * Canvas 2D renderer (Phase 0 §4.8, Phase 1 §7). Owner: W1-A.
 * Frame: background → terrain chunks → depth-sorted objects (fence, entrance, rides, stalls, guests)
 * → overlays (drag, highlight, selection, ghosts) → dev overlay.
 * All drawing happens in device pixels with integer-rounded destinations so slices do not seam.
 */
import { getFlatRideDef } from '../data/catalog/flatRides';
import { getStallDef } from '../data/catalog/stalls';
import { extent, footprintTiles, stallServiceTile } from '../sim/footprint';
import { Content, type Dir, type MapState } from '../sim/map';
import type { Guest } from '../sim/guests/types';
import type { World } from '../sim/types';
import { GHOST_FRAME_INVALID, GHOST_FRAME_VALID, rideFrameFor } from './anim';
import { clampCameraToMap, zoomBucket, type ZoomBucket } from './camera';
import { footprintColumns, Layer, packDepth, pointDepth, sortIndex, sortKey, tileDepth, type ColumnTile } from './depth';
import { entranceOuterDir, fenceEdgeDepth, fenceSegments, type FenceSegment } from './fence';
import { guestPosition, type GuestPos } from './guestPos';
import { cornerHeights, STEP_PX, TILE_H, TILE_W, tileToScreen } from './iso';
import { mix32, SHIRT_COLOURS, SKY, tintStep } from './palette';
import { createQueueWalker, queueSlot } from './queue';
import type { Sprite } from './spriteCache';
import { guestFrame, guestSpriteKey, SpriteBank } from './sprites/bank';
import { drawGhostIcon } from './sprites/props';
import { drawRideArt, rideArtBounds, type ArtBounds } from './sprites/rides';
import { drawStallArt, stallArtBounds } from './sprites/stalls';
import { TerrainLayer, grassShade, type ViewRect } from './terrain';
import type { Camera, Renderer, ToolState } from './types';

const HW = TILE_W / 2;
const HH = TILE_H / 2;

const KIND_FENCE = 1;
const KIND_ARCH = 2;
const KIND_RIDE = 3;
const KIND_STALL = 4;
const KIND_GUEST = 5;

/** Struct-of-arrays draw list; grows by doubling, never shrinks, so frames do not allocate. */
class DrawList {
  n = 0;
  kind = new Uint8Array(1024);
  ref = new Int32Array(1024);
  sub = new Int32Array(1024);
  ax = new Float64Array(1024);
  ay = new Float64Array(1024);
  skey = new Float64Array(1024);
  keys = new Float64Array(1024);

  private grow(): void {
    const cap = this.kind.length * 2;
    const g = <T extends Uint8Array | Int32Array | Float64Array>(a: T, make: (n: number) => T): T => {
      const b = make(cap);
      b.set(a);
      return b;
    };
    this.kind = g(this.kind, (n) => new Uint8Array(n));
    this.ref = g(this.ref, (n) => new Int32Array(n));
    this.sub = g(this.sub, (n) => new Int32Array(n));
    this.ax = g(this.ax, (n) => new Float64Array(n));
    this.ay = g(this.ay, (n) => new Float64Array(n));
    this.skey = g(this.skey, (n) => new Float64Array(n));
    this.keys = g(this.keys, (n) => new Float64Array(n));
  }

  push(kind: number, ref: number, sub: number, ax: number, ay: number, skey: number, depth: number, z: number, layer: number): void {
    if (this.n === this.kind.length) this.grow();
    const i = this.n++;
    this.kind[i] = kind;
    this.ref[i] = ref;
    this.sub[i] = sub;
    this.ax[i] = ax;
    this.ay[i] = ay;
    this.skey[i] = skey;
    this.keys[i] = sortKey(packDepth(depth, z, layer), i);
  }

  sort(): void {
    this.keys.subarray(0, this.n).sort();
  }
}

function findGuestIndex(guests: readonly Guest[], id: number): number {
  let lo = 0;
  let hi = guests.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const v = (guests[mid] as Guest).id;
    if (v === id) return mid;
    if (v < id) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}

function dirBetween(w: number, from: number, to: number): Dir {
  const fx = from % w;
  const tx = to % w;
  if (tx > fx) return 1;
  if (tx < fx) return 3;
  return to > from ? 2 : 0;
}

function debugEnabled(): boolean {
  try {
    return typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug');
  } catch {
    return false;
  }
}

export function createCanvasRenderer(canvas: HTMLCanvasElement): Renderer {
  // Opaque: every frame clears to the sky colour first.
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Canvas 2D is not available');
  let cssW = 1;
  let cssH = 1;
  let dpr = 1;

  const bank = new SpriteBank();
  const terrain = new TerrainLayer();
  const list = new DrawList();
  const walker = createQueueWalker(64 * 64);
  const chain: number[] = [];
  const pos: GuestPos = { fx: 0, fy: 0, z: 0, tile: -1 };
  const columnsMemo = new Map<number, ColumnTile[]>();
  let rideSprites: Array<Sprite | null> = [];
  let rideEy = new Int32Array(64);

  let fence: FenceSegment[] = [];
  let fenceVersion = -1;
  let outerDir: Dir | -1 = -1;

  // Per-guest queue placement for this frame (indexed like state.guests).
  let qStamp = new Uint32Array(256);
  let qfx = new Float64Array(256);
  let qfy = new Float64Array(256);
  let qz = new Float64Array(256);
  let qdir = new Uint8Array(256);
  let frameNo = 0;

  // Frame-local camera transform (device px = world px × scale + off).
  let scale = 1;
  let offX = 0;
  let offY = 0;
  let bucket: ZoomBucket = 1;
  const view: ViewRect = { x0: 0, y0: 0, x1: 0, y1: 0 };

  const debug = debugEnabled();
  let lastFrameAt = 0;
  let fpsAvg = 60;
  let msAvg = 0;
  let lastZoom = '';
  let lastCamX = '';

  const devX = (wx: number): number => wx * scale + offX;
  const devY = (wy: number): number => wy * scale + offY;

  function columnsFor(ex: number, ey: number): ColumnTile[] {
    const k = ex * 1024 + ey;
    let c = columnsMemo.get(k);
    if (!c) {
      c = footprintColumns(ex, ey);
      columnsMemo.set(k, c);
    }
    return c;
  }

  function blit(sp: Sprite, wx: number, wy: number): void {
    const f = scale / sp.scale;
    const x0 = Math.round(devX(wx) - sp.ox * f);
    const y0 = Math.round(devY(wy) - sp.oy * f);
    const x1 = Math.round(devX(wx) + (sp.w - sp.ox) * f);
    const y1 = Math.round(devY(wy) + (sp.h - sp.oy) * f);
    (ctx as CanvasRenderingContext2D).drawImage(sp.image, x0, y0, x1 - x0, y1 - y0);
  }

  /** Draw the vertical strip [colL, colR) (world x) of a sprite anchored at (ax, ay). */
  function blitColumn(sp: Sprite, ax: number, ay: number, colL: number, colR: number): void {
    const f = scale / sp.scale;
    const dx0 = Math.round(devX(colL));
    const dx1 = Math.round(devX(colR));
    if (dx1 <= dx0) return;
    let s0 = sp.ox + (colL - ax) * sp.scale;
    let s1 = sp.ox + (colR - ax) * sp.scale;
    if (s0 < 0) s0 = 0;
    if (s1 > sp.w) s1 = sp.w;
    if (s1 <= s0) return;
    const y0 = Math.round(devY(ay) - sp.oy * f);
    const y1 = Math.round(devY(ay) + (sp.h - sp.oy) * f);
    (ctx as CanvasRenderingContext2D).drawImage(sp.image, s0, 0, s1 - s0, sp.h, dx0, y0, dx1 - dx0, y1 - y0);
  }

  function inView(l: number, t: number, r: number, b: number): boolean {
    return r >= view.x0 && l <= view.x1 && b >= view.y0 && t <= view.y1;
  }

  function ensureGuestScratch(n: number): void {
    if (qStamp.length >= n) return;
    let cap = qStamp.length;
    while (cap < n) cap *= 2;
    qStamp = new Uint32Array(cap);
    qfx = new Float64Array(cap);
    qfy = new Float64Array(cap);
    qz = new Float64Array(cap);
    qdir = new Uint8Array(cap);
  }

  // ------------------------------------------------------------------ collection

  function collectFence(map: MapState): void {
    const w = map.width;
    for (let k = 0; k < fence.length; k++) {
      const seg = fence[k] as FenceSegment;
      const x = seg.tile % w;
      const y = (seg.tile - x) / w;
      const z = map.heights[seg.tile] as number;
      const ax = (x - y) * HW;
      const ay = (x + y) * HH - z * STEP_PX;
      if (!inView(ax - HW - 2, ay - 18, ax + HW + 2, ay + TILE_H + 2)) continue;
      list.push(KIND_FENCE, k, seg.dir, ax, ay, 0, fenceEdgeDepth(map, seg.tile, seg.dir), z, Layer.Object);
    }
  }

  function collectEntrance(map: MapState): void {
    const e = map.entranceTile;
    if (e < 0 || map.content[e] !== Content.ParkEntrance) return;
    const w = map.width;
    const x = e % w;
    const y = (e - x) / w;
    const z = map.heights[e] as number;
    const ax = (x - y) * HW;
    const ay = (x + y) * HH - z * STEP_PX;
    if (!inView(ax - 40, ay - 90, ax + 40, ay + 40)) return;
    list.push(KIND_ARCH, 0, 0, ax, ay, 0, x + y + 0.6, z, Layer.Object);
    list.push(KIND_ARCH, 0, 1, ax, ay, 0, x + y + 1.4, z, Layer.Object);
  }

  function collectRides(world: World): void {
    const s = world.state;
    const map = s.map;
    const rides = s.rides;
    if (rideSprites.length < rides.length) {
      rideSprites = new Array<Sprite | null>(rides.length * 2).fill(null);
      rideEy = new Int32Array(rides.length * 2);
    }
    for (let ri = 0; ri < rides.length; ri++) {
      rideSprites[ri] = null;
      const r = rides[ri]!;
      if (r.kind !== 'flat') continue;
      const def = getFlatRideDef(r.defId);
      const w = def?.w ?? 1;
      const d = def?.d ?? 1;
      const { ex, ey } = extent(w, d, r.rotation);
      const oi = r.y * map.width + r.x;
      const z = (map.heights[oi] as number | undefined) ?? 0;
      const ax = (r.x - r.y) * HW;
      const ay = (r.x + r.y) * HH - z * STEP_PX;
      const b = rideArtBounds(r.defId, w, d, r.rotation);
      rideEy[ri] = ey;
      if (!inView(ax + b.left, ay + b.top, ax + b.right, ay + b.bottom)) continue;
      const frame = def ? rideFrameFor(r, def) : 0;
      rideSprites[ri] = bank.ride(r.defId, w, d, r.rotation, frame, bucket);
      const cols = columnsFor(ex, ey);
      const left = ax - ey * HW;
      for (let k = 0; k < cols.length; k++) {
        const colL = left + k * HW;
        if (colL + HW < view.x0 || colL > view.x1) continue;
        const c = cols[k] as ColumnTile;
        list.push(KIND_RIDE, ri, k, ax, ay, 0, tileDepth(r.x + c.dx, r.y + c.dy), z, Layer.Object);
      }
    }
  }

  function collectStalls(world: World): void {
    const s = world.state;
    const map = s.map;
    const b = stallArtBounds();
    for (let si = 0; si < s.stalls.length; si++) {
      const st = s.stalls[si]!;
      const z = (map.heights[st.y * map.width + st.x] as number | undefined) ?? 0;
      const ax = (st.x - st.y) * HW;
      const ay = (st.x + st.y) * HH - z * STEP_PX;
      if (!inView(ax + b.left, ay + b.top, ax + b.right, ay + b.bottom)) continue;
      list.push(KIND_STALL, si, 0, ax, ay, 0, tileDepth(st.x, st.y), z, Layer.Object);
    }
  }

  /** Place queueing guests on their ride's queue tiles (4 per tile from the entrance outward). */
  function placeQueues(world: World): void {
    const s = world.state;
    const map = s.map;
    const w = map.width;
    for (const r of s.rides) {
      if (r.queue.length === 0 || !r.entrance) continue;
      walker.chain(map, r.entrance.outside, chain);
      if (chain.length === 0) continue;
      for (let k = 0; k < r.queue.length; k++) {
        const gi = findGuestIndex(s.guests, r.queue[k] as number);
        if (gi < 0) continue;
        queueSlot(map, chain, r.entrance.gate, k, pos);
        qStamp[gi] = frameNo;
        qfx[gi] = pos.fx;
        qfy[gi] = pos.fy;
        qz[gi] = pos.z;
        const j = Math.min(Math.floor(k / 4), chain.length - 1);
        const front = j === 0 ? r.entrance.gate : (chain[j - 1] as number);
        qdir[gi] = dirBetween(w, chain[j] as number, front);
      }
    }
  }

  function collectGuests(world: World, tool: ToolState, alpha: number): void {
    const s = world.state;
    const map = s.map;
    const guests = s.guests;
    const tint = tool.overlay === 'temperament';
    const w = map.width;
    for (let gi = 0; gi < guests.length; gi++) {
      const g = guests[gi]!;
      if (g.state === 'riding' || g.tile < 0) continue;
      let fx: number;
      let fy: number;
      let z: number;
      let facing: Dir;
      let walk = 0;
      if (qStamp[gi] === frameNo) {
        fx = qfx[gi] as number;
        fy = qfy[gi] as number;
        z = qz[gi] as number;
        facing = (qdir[gi] as number) as Dir;
      } else {
        guestPosition(map, g, alpha, pos);
        fx = pos.fx;
        fy = pos.fy;
        z = pos.z;
        if (g.nextTile >= 0 && g.nextTile !== g.tile) {
          facing = dirBetween(w, g.tile, g.nextTile);
          walk = 1 + ((Math.floor((g.progress + alpha) / 5) + g.id) & 1);
        } else {
          facing = g.dir;
        }
      }
      const ax = (fx - fy) * HW;
      const ay = (fx + fy) * HH - z * STEP_PX;
      if (ax < view.x0 - 10 || ax > view.x1 + 10 || ay < view.y0 - 6 || ay > view.y1 + 24) continue;
      const m = mix32(g.id);
      const colour = tint ? tintStep(g.temperament) : m % SHIRT_COLOURS.length;
      const frame = guestFrame(colour, walk, (m >>> 8) & 3, tint);
      list.push(KIND_GUEST, gi, facing | (frame << 2), ax, ay, guestSpriteKey(facing, frame, bucket), pointDepth(fx, fy), z, Layer.Guest);
    }
  }

  // ------------------------------------------------------------------ drawing

  function drawList(world: World): void {
    const s = world.state;
    for (let k = 0; k < list.n; k++) {
      const i = sortIndex(list.keys[k] as number);
      const ax = list.ax[i] as number;
      const ay = list.ay[i] as number;
      switch (list.kind[i]) {
        case KIND_GUEST: {
          const sub = list.sub[i] as number;
          blit(bank.guest(list.skey[i] as number, (sub & 3) as Dir, sub >> 2, bucket), ax, ay);
          break;
        }
        case KIND_RIDE: {
          const ri = list.ref[i] as number;
          const sp = rideSprites[ri];
          if (!sp) break;
          const colL = ax - (rideEy[ri] as number) * HW + (list.sub[i] as number) * HW;
          blitColumn(sp, ax, ay, colL, colL + HW);
          break;
        }
        case KIND_STALL: {
          const st = s.stalls[list.ref[i] as number];
          if (st) blit(bank.stall(st.defId, st.rotation, 0, bucket), ax, ay);
          break;
        }
        case KIND_FENCE:
          blit(bank.fence((list.sub[i] as number) as Dir, bucket), ax, ay);
          break;
        case KIND_ARCH:
          blit(bank.entrance((list.sub[i] as number) as 0 | 1, outerDir, bucket), ax, ay);
          break;
      }
    }
  }

  /** Path a tile's top face (with slope) in device pixels. */
  function tilePath(map: MapState, i: number, inset = 0): void {
    const c = ctx as CanvasRenderingContext2D;
    const w = map.width;
    const x = i % w;
    const y = (i - x) / w;
    const h = cornerHeights(map, i);
    const pt = (u: number, v: number, z: number): void => {
      const p = tileToScreen(x + u, y + v, z);
      c.lineTo(devX(p.sx), devY(p.sy));
    };
    c.beginPath();
    const a = inset;
    const b = 1 - inset;
    const p0 = tileToScreen(x + a, y + a, h[0]);
    c.moveTo(devX(p0.sx), devY(p0.sy));
    pt(b, a, h[1]);
    pt(b, b, h[2]);
    pt(a, b, h[3]);
    c.closePath();
  }

  function outlineTiles(map: MapState, tiles: readonly number[], fill: string | null, stroke: string, width: number): void {
    const c = ctx as CanvasRenderingContext2D;
    const n = map.width * map.height;
    for (const t of tiles) {
      if (t < 0 || t >= n) continue;
      tilePath(map, t, 0.02);
      if (fill) {
        c.fillStyle = fill;
        c.fill();
      }
      c.strokeStyle = stroke;
      c.lineWidth = width;
      c.stroke();
    }
  }

  function dragColours(tool: ToolState): { fill: string; stroke: string } {
    switch (tool.tool) {
      case 'footpath':
        return { fill: 'rgba(220,199,156,0.75)', stroke: '#fff4d6' };
      case 'queue':
        return { fill: 'rgba(169,192,210,0.8)', stroke: '#e8f4ff' };
      case 'demolish':
        return { fill: 'rgba(229,72,77,0.45)', stroke: '#ffb3b5' };
      case 'patrol':
        return { fill: 'rgba(124,92,255,0.4)', stroke: '#d6ccff' };
      default:
        return { fill: 'rgba(255,255,255,0.3)', stroke: '#ffffff' };
    }
  }

  function drawGhost(world: World, tool: ToolState): void {
    const g = tool.ghost;
    if (!g) return;
    const map = world.state.map;
    const w = map.width;
    const n = w * map.height;
    if (g.tile < 0 || g.tile >= n) return;
    const x = g.tile % w;
    const y = (g.tile - x) / w;
    const z = map.heights[g.tile] as number;
    const ax = (x - y) * HW;
    const ay = (x + y) * HH - z * STEP_PX;
    const fill = g.valid ? 'rgba(70,205,95,0.35)' : 'rgba(235,60,60,0.4)';
    const stroke = g.valid ? '#7dff9a' : '#ff8a8a';
    const frame = g.valid ? GHOST_FRAME_VALID : GHOST_FRAME_INVALID;
    const c = ctx as CanvasRenderingContext2D;
    let top = ay - 40;
    if (g.kind === 'ride') {
      const def = getFlatRideDef(g.defId);
      const fw = def?.w ?? 1;
      const fd = def?.d ?? 1;
      const tiles = footprintTiles(map, x, y, fw, fd, g.rotation);
      if (tiles) outlineTiles(map, tiles, fill, stroke, Math.max(1, scale));
      const sp = bank.ride(g.defId, fw, fd, g.rotation, frame, bucket);
      c.globalAlpha = 0.85;
      blit(sp, ax, ay);
      c.globalAlpha = 1;
      top = ay + rideArtBounds(g.defId, fw, fd, g.rotation).top + 10;
      const { ex, ey } = extent(fw, fd, g.rotation);
      drawGhostIcon(c, devX(ax + ((ex - ey) * HW) / 2), devY(top), g.valid, Math.max(8, 12 * Math.min(1.5, scale)));
      return;
    }
    if (g.kind === 'stall') {
      outlineTiles(map, [g.tile], fill, stroke, Math.max(1, scale));
      const service = stallServiceTile(map, x, y, g.rotation);
      if (service >= 0) {
        c.setLineDash([4, 3]);
        outlineTiles(map, [service], null, 'rgba(255,255,255,0.85)', Math.max(1, scale));
        c.setLineDash([]);
      }
      c.globalAlpha = 0.85;
      blit(bank.stall(g.defId, g.rotation, frame, bucket), ax, ay);
      c.globalAlpha = 1;
      top = ay + stallArtBounds().top + 4;
      drawGhostIcon(c, devX(ax), devY(top), g.valid, Math.max(8, 12 * Math.min(1.5, scale)));
      return;
    }
    // Other ghosts (path items, track pieces, stations): tile highlight and icon.
    outlineTiles(map, [g.tile], fill, stroke, Math.max(1, scale));
    drawGhostIcon(c, devX(ax), devY(ay - 6), g.valid, Math.max(8, 10 * Math.min(1.5, scale)));
  }

  function drawSelection(world: World, tool: ToolState, alpha: number): void {
    const sel = tool.selectedEntity;
    if (!sel) return;
    const s = world.state;
    const map = s.map;
    const c = ctx as CanvasRenderingContext2D;
    if (sel.kind === 'guest') {
      const gi = findGuestIndex(s.guests, sel.id);
      if (gi < 0) return;
      const g = s.guests[gi]!;
      if (g.state === 'riding') return;
      let fx: number;
      let fy: number;
      let z: number;
      if (qStamp[gi] === frameNo) {
        fx = qfx[gi] as number;
        fy = qfy[gi] as number;
        z = qz[gi] as number;
      } else {
        guestPosition(map, g, alpha, pos);
        fx = pos.fx;
        fy = pos.fy;
        z = pos.z;
      }
      const p = tileToScreen(fx, fy, z);
      const x = devX(p.sx);
      const y = devY(p.sy);
      const k = scale;
      c.strokeStyle = '#ffffff';
      c.lineWidth = Math.max(1.5, 2 * k);
      c.beginPath();
      c.ellipse(x, y, 8 * k, 4 * k, 0, 0, Math.PI * 2);
      c.stroke();
      c.fillStyle = '#ffe066';
      c.beginPath();
      c.moveTo(x, y - 22 * k);
      c.lineTo(x - 4 * k, y - 28 * k);
      c.lineTo(x + 4 * k, y - 28 * k);
      c.closePath();
      c.fill();
      return;
    }
    if (sel.kind === 'ride') {
      const r = s.rides.find((q) => q.id === sel.id);
      if (!r || r.kind !== 'flat') return;
      const def = getFlatRideDef(r.defId);
      const tiles = footprintTiles(map, r.x, r.y, def?.w ?? 1, def?.d ?? 1, r.rotation);
      if (tiles) outlineTiles(map, tiles, 'rgba(255,255,255,0.12)', '#ffffff', Math.max(1, 1.5 * scale));
      return;
    }
    if (sel.kind === 'stall') {
      const st = s.stalls.find((q) => q.id === sel.id);
      if (st) outlineTiles(map, [st.y * map.width + st.x], 'rgba(255,255,255,0.12)', '#ffffff', Math.max(1, 1.5 * scale));
    }
  }

  const single: number[] = [0];

  function drawOverlays(world: World, tool: ToolState, alpha: number): void {
    const map = world.state.map;
    if (tool.drag && tool.drag.tiles.length > 0) {
      const col = dragColours(tool);
      outlineTiles(map, tool.drag.tiles, col.fill, col.stroke, Math.max(1, scale));
    }
    drawSelection(world, tool, alpha);
    if (tool.selectedTile !== null) {
      single[0] = tool.selectedTile;
      outlineTiles(map, single, null, '#ffffff', Math.max(1.5, 2 * scale));
    }
    if (tool.hoverTile !== null && !tool.ghost) {
      single[0] = tool.hoverTile;
      if (tool.tool === 'demolish') outlineTiles(map, single, 'rgba(229,72,77,0.35)', '#ff8a8a', Math.max(1, 1.5 * scale));
      else outlineTiles(map, single, 'rgba(255,224,102,0.22)', '#ffe066', Math.max(1, 1.5 * scale));
    }
    drawGhost(world, tool);
  }

  function drawDebug(world: World, drawn: number): void {
    const c = ctx as CanvasRenderingContext2D;
    c.save();
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = 'rgba(0,0,0,0.6)';
    c.fillRect(cssW - 210, 52, 200, 66);
    c.fillStyle = '#e8f4ff';
    c.font = '12px ui-monospace, monospace';
    c.fillText(`fps ${fpsAvg.toFixed(0)}  draw ${msAvg.toFixed(2)} ms`, cssW - 200, 70);
    c.fillText(`objects ${list.n}  chunks ${drawn}`, cssW - 200, 88);
    c.fillText(`guests ${world.state.guests.length}  sprites ${bank.cache.size}`, cssW - 200, 106);
    c.restore();
  }

  return {
    resize(w, h, d) {
      cssW = Math.max(1, w);
      cssH = Math.max(1, h);
      dpr = d > 0 ? d : 1;
      canvas.width = Math.max(1, Math.round(cssW * dpr));
      canvas.height = Math.max(1, Math.round(cssH * dpr));
    },

    draw(world: World, cam: Camera, tool: ToolState, alpha: number) {
      const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
      const s = world.state;
      const map = s.map;
      frameNo = (frameNo + 1) >>> 0 || 1;
      clampCameraToMap(cam, map);
      scale = cam.zoom * dpr;
      bucket = zoomBucket(scale);
      offX = canvas.width / 2 - cam.centerX * scale;
      offY = canvas.height / 2 - cam.centerY * scale;
      view.x0 = cam.centerX - cssW / 2 / cam.zoom;
      view.x1 = cam.centerX + cssW / 2 / cam.zoom;
      view.y0 = cam.centerY - cssH / 2 / cam.zoom;
      view.y1 = cam.centerY + cssH / 2 / cam.zoom;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.imageSmoothingEnabled = true;
      ctx.fillStyle = SKY;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Terrain.
      terrain.sync(map);
      const env = { seed: s.seed, rides: s.rides, stalls: s.stalls };
      const chunks = terrain.draw(ctx, map, env, view, bucket, scale, offX, offY);

      // Objects.
      if (fenceVersion !== terrain.tracker.version) {
        fence = fenceSegments(map, fence);
        outerDir = entranceOuterDir(map);
        fenceVersion = terrain.tracker.version;
      }
      bank.beginFrame();
      ensureGuestScratch(s.guests.length);
      list.n = 0;
      collectFence(map);
      collectEntrance(map);
      collectRides(world);
      collectStalls(world);
      placeQueues(world);
      collectGuests(world, tool, alpha);
      list.sort();
      drawList(world);

      drawOverlays(world, tool, alpha);
      bank.cache.trim();

      const zoomStr = cam.zoom.toFixed(3);
      const camXStr = cam.centerX.toFixed(1);
      if (zoomStr !== lastZoom) {
        canvas.dataset.zoom = zoomStr;
        lastZoom = zoomStr;
      }
      if (camXStr !== lastCamX) {
        canvas.dataset.cameraX = camXStr;
        lastCamX = camXStr;
      }

      if (t0) {
        const t1 = performance.now();
        msAvg = msAvg * 0.9 + (t1 - t0) * 0.1;
        if (lastFrameAt) {
          const dt = t1 - lastFrameAt;
          if (dt > 0) fpsAvg = fpsAvg * 0.9 + (1000 / dt) * 0.1;
        }
        lastFrameAt = t1;
      }
      if (debug) drawDebug(world, chunks);
    },
  };
}

// ------------------------------------------------------------------ previews

/**
 * Sprite preview for UI pickers: the real sprite of `defId` (flat ride or stall; anything else gets
 * the generic fallback), fitted into a w × h box in the context's current coordinate space.
 */
export function drawPreview(ctx: CanvasRenderingContext2D, defId: string, w: number, h: number): void {
  const ride = getFlatRideDef(defId);
  const stall = ride ? undefined : getStallDef(defId);
  let fw = 1;
  let fd = 1;
  let bounds: ArtBounds;
  if (ride) {
    fw = ride.w;
    fd = ride.d;
    bounds = rideArtBounds(defId, fw, fd, 0);
  } else if (stall) {
    bounds = stallArtBounds();
  } else {
    fw = 2;
    fd = 2;
    bounds = rideArtBounds(defId, fw, fd, 0);
  }
  const pad = Math.min(w, h) * 0.06;
  const bw = bounds.right - bounds.left;
  const bh = bounds.bottom - bounds.top;
  const k = Math.max(0.01, Math.min((w - 2 * pad) / bw, (h - 2 * pad) / bh));
  ctx.save();
  ctx.clearRect(0, 0, w, h);
  ctx.translate((w - bw * k) / 2 - bounds.left * k, (h - bh * k) / 2 - bounds.top * k);
  ctx.scale(k, k);
  // Ground under the footprint.
  for (let y = 0; y < (stall ? 1 : fd); y++) {
    for (let x = 0; x < (stall ? 1 : fw); x++) {
      ctx.beginPath();
      ctx.moveTo((x - y) * HW, (x + y) * HH);
      ctx.lineTo((x - y) * HW + HW, (x + y) * HH + HH);
      ctx.lineTo((x - y) * HW, (x + y) * HH + TILE_H);
      ctx.lineTo((x - y) * HW - HW, (x + y) * HH + HH);
      ctx.closePath();
      ctx.fillStyle = grassShade(0, x, y) ? '#64b049' : '#6dbb4f';
      ctx.fill();
    }
  }
  if (stall) drawStallArt(ctx, defId, 2);
  else drawRideArt(ctx, defId, fw, fd, { rotation: 0, angle: 0, swing: 0, occupancy: 0 });
  ctx.restore();
}
