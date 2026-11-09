/**
 * Map generator, terrain part (Phase 5 §4.2 steps 1–6). Owner: W3-H. Pure: spec in, arrays out; no world, no RNG.
 *
 * Model. Smooth land lives on a corner (vertex) grid of (w + 1) × (h + 1) heights shared by neighbouring tiles.
 * Cliffs live in a per-tile `offset` that moves all 4 corners of a tile (master R18: `cliff` features and
 * `raise` / `lower` with `falloff: 0`). Tile corners = vertex height + tile offset, then the Phase 4 §4.1 normalize
 * rule gives `heights` and `slope`.
 *
 * Slope pass (step 4): vertices locked by `flatten` keep their height; every other vertex is first clamped into the
 * slopes the locked ones allow (height within its tile distance of each locked vertex), then raised until no
 * vertex is more than 1 step below a neighbour (8 neighbours, so the 4 corners of a tile differ by at most 1).
 * Raising, not lowering, keeps peaks, plateaus, and rims at their given heights. Passes repeat until nothing
 * changes (at most `MAX_SLOPE_PASSES`, else generation fails). Cliff offsets are outside the pass.
 *
 * Determinism rule: integer math only (`+ − × /`, `Math.floor`, `Math.round`, `Math.imul`). Distances are in
 * 1/16 tile from an integer square root.
 */
import type { Feature, MapGenSpec, Point, Rect, Side } from '../../data/scenarios/types';
import { TERRAIN_NAMES } from '../../data/scenarios/terrainNames';
import { MAX_HEIGHT_STEPS } from '../../data/tuning/core';
import { CRATER_DEPTH, LAKE_EXTRA_DEPTH, MAX_SLOPE_PASSES } from '../../data/tuning/scenario';
import { ceilDiv, isqrt, roundDiv } from './intmath';
import { fractalNoise, noiseDelta } from './noise';

/** A scenario or sandbox map that breaks a generator rule. A build-time error for scenario data (Phase 5 §4.2). */
export class GenerationError extends Error {}

export interface TerrainResult {
  width: number;
  height: number;
  heights: Uint8Array;
  slope: Uint8Array;
  water: Uint8Array;
  terrain: Uint8Array;
  /** Cliff offset of each tile (steps). Neighbours with equal offsets share their corners exactly. */
  offset: Int32Array;
  /** Slope passes until nothing changed. */
  passes: number;
}

type WaterSource =
  | { kind: 'level'; surface: number }
  | { kind: 'lake'; cx: number; cy: number; radius: number; surface: number }
  | { kind: 'river'; points: readonly Point[]; width: number; depth: number }
  | { kind: 'sea'; edge: Side; depthTiles: number; surface: number };

interface Field {
  w: number;
  h: number;
  /** Vertex grid width (w + 1). */
  vw: number;
  vh: number;
  base: number;
  v: Int32Array;
  locked: Uint8Array;
  offset: Int32Array;
  water: WaterSource[];
}

const SUB = 16; // distances in 1/16 tile

function fail(message: string): never {
  throw new GenerationError(message);
}

function checkInt(label: string, ...values: number[]): void {
  for (const v of values) if (!Number.isInteger(v)) fail(`${label} needs whole numbers`);
}

/** Distance in 1/16 tile for integer deltas. */
function dist16(dx: number, dy: number): number {
  return isqrt(SUB * SUB * (dx * dx + dy * dy));
}

/** Squared distance × 256 from (px, py) to segment a–b (all integers), floored. */
function segDist2x256(px: number, py: number, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const qx = px - a.x;
  const qy = py - a.y;
  const len2 = dx * dx + dy * dy;
  const dot = qx * dx + qy * dy;
  if (len2 === 0 || dot <= 0) return SUB * SUB * (qx * qx + qy * qy);
  if (dot >= len2) {
    const rx = px - b.x;
    const ry = py - b.y;
    return SUB * SUB * (rx * rx + ry * ry);
  }
  const cross = qx * dy - qy * dx;
  return Math.floor((SUB * SUB * cross * cross) / len2);
}

/** Exact test: is the point (px, py) within `r` of segment a–b? (Doubled coordinates keep tile centres integer.) */
function segWithin(px: number, py: number, a: Point, b: Point, r: number): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const qx = px - a.x;
  const qy = py - a.y;
  const len2 = dx * dx + dy * dy;
  const dot = qx * dx + qy * dy;
  if (len2 === 0 || dot <= 0) return qx * qx + qy * qy <= r * r;
  if (dot >= len2) {
    const rx = px - b.x;
    const ry = py - b.y;
    return rx * rx + ry * ry <= r * r;
  }
  const cross = qx * dy - qy * dx;
  return cross * cross <= r * r * len2;
}

function vertexIndex(f: Field, x: number, y: number): number {
  return y * f.vw + x;
}

/** Distance in 1/16 tile from vertex (x, y) to the area (0 inside). Rect tiles x0..x1 span corners x0..x1 + 1. */
function areaDist16(area: { rect: Rect } | { circle: { cx: number; cy: number; radius: number } }, x: number, y: number): number {
  if ('rect' in area) {
    const r = area.rect;
    const dx = x < r.x0 ? r.x0 - x : x > r.x1 + 1 ? x - r.x1 - 1 : 0;
    const dy = y < r.y0 ? r.y0 - y : y > r.y1 + 1 ? y - r.y1 - 1 : 0;
    return dist16(dx, dy);
  }
  const c = area.circle;
  return Math.max(0, dist16(x - c.cx, y - c.cy) - c.radius * SUB);
}

/** Is the centre of tile (x, y) inside the area? */
function tileInArea(area: { rect: Rect } | { circle: { cx: number; cy: number; radius: number } }, x: number, y: number): boolean {
  if ('rect' in area) {
    const r = area.rect;
    return x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
  }
  const c = area.circle;
  const dx = 2 * x + 1 - 2 * c.cx;
  const dy = 2 * y + 1 - 2 * c.cy;
  return dx * dx + dy * dy <= 4 * c.radius * c.radius;
}

function forTiles(f: Field, fn: (x: number, y: number, t: number) => void): void {
  for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) fn(x, y, y * f.w + x);
}

function forVertices(f: Field, fn: (x: number, y: number, i: number) => void): void {
  for (let y = 0; y < f.vh; y++) for (let x = 0; x < f.vw; x++) fn(x, y, y * f.vw + x);
}

/** Distance (in vertices, along the map axis) from a vertex row or column to the sea edge. */
function seaEdgeDistance(f: Field, edge: Side, x: number, y: number): number {
  if (edge === 'N') return y;
  if (edge === 'S') return f.h - y;
  if (edge === 'W') return x;
  return f.w - x;
}

function applyFeature(f: Field, feature: Feature): void {
  const base = f.base;
  switch (feature.kind) {
    case 'raise':
    case 'lower': {
      const { area, by, falloff } = feature;
      checkInt(feature.kind, by, falloff, ...('rect' in area ? [area.rect.x0, area.rect.y0, area.rect.x1, area.rect.y1] : [area.circle.cx, area.circle.cy, area.circle.radius]));
      if (falloff < 0) fail(`${feature.kind} needs a falloff of 0 or more`);
      const sign = feature.kind === 'raise' ? 1 : -1;
      if (falloff === 0) {
        forTiles(f, (x, y, t) => {
          if (tileInArea(area, x, y)) f.offset[t] = (f.offset[t] as number) + sign * by;
        });
        return;
      }
      const span = falloff * SUB;
      forVertices(f, (x, y, i) => {
        const d = areaDist16(area, x, y);
        if (d >= span) return;
        const amount = d === 0 ? by : roundDiv(by * (span - d), span);
        f.v[i] = (f.v[i] as number) + sign * amount;
      });
      return;
    }
    case 'flatten': {
      const { rect, height } = feature;
      checkInt('flatten', rect.x0, rect.y0, rect.x1, rect.y1, height);
      for (let y = Math.max(0, rect.y0); y <= Math.min(f.h - 1, rect.y1); y++) {
        for (let x = Math.max(0, rect.x0); x <= Math.min(f.w - 1, rect.x1); x++) f.offset[y * f.w + x] = 0;
      }
      for (let y = Math.max(0, rect.y0); y <= Math.min(f.vh - 1, rect.y1 + 1); y++) {
        for (let x = Math.max(0, rect.x0); x <= Math.min(f.vw - 1, rect.x1 + 1); x++) {
          const i = vertexIndex(f, x, y);
          f.v[i] = base + height;
          f.locked[i] = 1;
        }
      }
      return;
    }
    case 'cone': {
      const { cx, cy, radius, peak, craterRadius } = feature;
      checkInt('cone', cx, cy, radius, peak, craterRadius);
      if (radius <= 0 || craterRadius < 0 || craterRadius >= radius) fail('cone needs 0 ≤ craterRadius < radius');
      const r16 = radius * SUB;
      const c16 = craterRadius * SUB;
      forVertices(f, (x, y, i) => {
        const d = dist16(x - cx, y - cy);
        if (d > r16) return;
        const h = d < c16 ? peak - CRATER_DEPTH : roundDiv(peak * (r16 - d), r16 - c16);
        f.v[i] = Math.max(f.v[i] as number, base + h);
      });
      return;
    }
    case 'cliff': {
      const { from, to, height } = feature;
      checkInt('cliff', from.x, from.y, to.x, to.y, height);
      const dx = 2 * (to.x - from.x);
      const dy = 2 * (to.y - from.y);
      const len2 = dx * dx + dy * dy;
      if (len2 === 0) fail('cliff needs two different points');
      forTiles(f, (x, y, t) => {
        const qx = 2 * x + 1 - 2 * from.x;
        const qy = 2 * y + 1 - 2 * from.y;
        const cross = dx * qy - dy * qx;
        const dot = dx * qx + dy * qy;
        if (cross < 0 && dot >= 0 && dot <= len2) f.offset[t] = (f.offset[t] as number) + height;
      });
      return;
    }
    case 'lake': {
      const { cx, cy, radius, surface } = feature;
      checkInt('lake', cx, cy, radius, surface);
      if (radius <= 0) fail('lake needs a radius above 0');
      const r16 = radius * SUB;
      forVertices(f, (x, y, i) => {
        const d = dist16(x - cx, y - cy);
        if (d > r16) return;
        const depth = 1 + Math.floor((LAKE_EXTRA_DEPTH * (r16 - d)) / r16);
        f.v[i] = Math.min(f.v[i] as number, base + surface - depth);
      });
      f.water.push({ kind: 'lake', cx, cy, radius, surface: base + surface });
      return;
    }
    case 'river': {
      const { points, width, depth } = feature;
      if (points.length < 2) fail('river needs at least 2 points');
      for (const p of points) checkInt('river', p.x, p.y);
      checkInt('river', width, depth);
      if (width < 1) fail('river needs a width of 1 or more');
      if (depth < 2) fail('river needs a depth of 2 or more to hold water');
      const half16 = width * (SUB / 2);
      forVertices(f, (x, y, i) => {
        let best = Number.MAX_SAFE_INTEGER;
        for (let k = 0; k + 1 < points.length; k++) best = Math.min(best, segDist2x256(x, y, points[k] as Point, points[k + 1] as Point));
        const d = isqrt(best);
        const lowerBy = d <= half16 ? depth : depth - ceilDiv(d - half16, SUB);
        if (lowerBy > 0) f.v[i] = (f.v[i] as number) - lowerBy;
      });
      f.water.push({ kind: 'river', points, width, depth });
      return;
    }
    case 'sea': {
      const { edge, depthTiles, surface } = feature;
      checkInt('sea', depthTiles, surface);
      if (depthTiles < 1) fail('sea needs a depth of 1 tile or more');
      forVertices(f, (x, y, i) => {
        const e = seaEdgeDistance(f, edge, x, y);
        const limit = e <= depthTiles ? surface - 1 - Math.floor((depthTiles - e) / 2) : surface + (e - depthTiles);
        f.v[i] = Math.min(f.v[i] as number, base + limit);
      });
      f.water.push({ kind: 'sea', edge, depthTiles, surface: base + surface });
      return;
    }
    default:
      return; // content features run later (step 8)
  }
}

/** Repeat raster sweeps of `step` (forward with W, NW, N, NE; backward with E, SE, S, SW) until stable. */
function sweep(f: Field, step: (i: number, j: number) => boolean, skip: (i: number) => boolean): number {
  const { vw, vh } = f;
  let passes = 0;
  for (;;) {
    passes++;
    if (passes > MAX_SLOPE_PASSES) fail(`the slope pass did not settle in ${MAX_SLOPE_PASSES} passes`);
    let changed = false;
    for (let y = 0; y < vh; y++) {
      for (let x = 0; x < vw; x++) {
        const i = y * vw + x;
        if (skip(i)) continue;
        if (x > 0 && step(i, i - 1)) changed = true;
        if (y > 0) {
          if (x > 0 && step(i, i - vw - 1)) changed = true;
          if (step(i, i - vw)) changed = true;
          if (x + 1 < vw && step(i, i - vw + 1)) changed = true;
        }
      }
    }
    for (let y = vh - 1; y >= 0; y--) {
      for (let x = vw - 1; x >= 0; x--) {
        const i = y * vw + x;
        if (skip(i)) continue;
        if (x + 1 < vw && step(i, i + 1)) changed = true;
        if (y + 1 < vh) {
          if (x + 1 < vw && step(i, i + vw + 1)) changed = true;
          if (step(i, i + vw)) changed = true;
          if (x > 0 && step(i, i + vw - 1)) changed = true;
        }
      }
    }
    if (!changed) return passes;
  }
}

/** a[i] = max(a[i], value); true when it changed. */
function raiseTo(a: Int32Array, i: number, value: number): boolean {
  if (value <= (a[i] as number)) return false;
  a[i] = value;
  return true;
}

/** a[i] = min(a[i], value); true when it changed. */
function lowerTo(a: Int32Array, i: number, value: number): boolean {
  if (value >= (a[i] as number)) return false;
  a[i] = value;
  return true;
}

/** Step 4. Returns the number of raise passes. */
function slopePass(f: Field): number {
  const n = f.v.length;
  const { v, locked } = f;
  const never = (): boolean => false;
  let anyLocked = false;
  for (let i = 0; i < n; i++) if (locked[i]) anyLocked = true;
  if (anyLocked) {
    const BIG = 1 << 20;
    const hi = new Int32Array(n);
    const lo = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      hi[i] = locked[i] ? (v[i] as number) : BIG;
      lo[i] = locked[i] ? (v[i] as number) : -BIG;
    }
    // hi: the highest each corner may be under the slopes down from the locked corners; lo: the lowest.
    sweep(f, (i, j) => lowerTo(hi, i, (hi[j] as number) + 1), never);
    sweep(f, (i, j) => raiseTo(lo, i, (lo[j] as number) - 1), never);
    for (let i = 0; i < n; i++) {
      const value = v[i] as number;
      if (locked[i]) {
        if ((lo[i] as number) > value || (hi[i] as number) < value) fail('two flatten areas are too close for a slope between them');
      } else {
        v[i] = Math.min(hi[i] as number, Math.max(lo[i] as number, value));
      }
    }
  }
  return sweep(f, (i, j) => raiseTo(v, i, (v[j] as number) - 1), (i) => locked[i] === 1);
}

function clampHeight(h: number): number {
  return Math.min(MAX_HEIGHT_STEPS, Math.max(0, h));
}

function tileHas(src: WaterSource, f: Field, x: number, y: number): boolean {
  switch (src.kind) {
    case 'level':
      return true;
    case 'lake': {
      const dx = 2 * x + 1 - 2 * src.cx;
      const dy = 2 * y + 1 - 2 * src.cy;
      return dx * dx + dy * dy <= 4 * src.radius * src.radius;
    }
    case 'sea': {
      const e2 = src.edge === 'N' ? 2 * y + 1 : src.edge === 'S' ? 2 * f.h - 2 * y - 1 : src.edge === 'W' ? 2 * x + 1 : 2 * f.w - 2 * x - 1;
      return e2 <= 2 * src.depthTiles;
    }
    case 'river': {
      for (let k = 0; k + 1 < src.points.length; k++) {
        const a = src.points[k] as Point;
        const b = src.points[k + 1] as Point;
        if (segWithin(2 * x + 1, 2 * y + 1, { x: 2 * a.x, y: 2 * a.y }, { x: 2 * b.x, y: 2 * b.y }, src.width)) return true;
      }
      return false;
    }
  }
}

/** Chebyshev distance (tiles) from each tile to the nearest wet tile; large where there is no water. */
function waterDistance(w: number, h: number, wet: Uint8Array): Int32Array {
  const BIG = 1 << 20;
  const d = new Int32Array(w * h);
  for (let i = 0; i < d.length; i++) d[i] = wet[i] ? 0 : BIG;
  const relax = (i: number, j: number): void => {
    if ((d[j] as number) + 1 < (d[i] as number)) d[i] = (d[j] as number) + 1;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (x > 0) relax(i, i - 1);
      if (y > 0) {
        if (x > 0) relax(i, i - w - 1);
        relax(i, i - w);
        if (x + 1 < w) relax(i, i - w + 1);
      }
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (x + 1 < w) relax(i, i + 1);
      if (y + 1 < h) {
        if (x + 1 < w) relax(i, i + w + 1);
        relax(i, i + w);
        if (x > 0) relax(i, i + w - 1);
      }
    }
  }
  return d;
}

/** Steps 1–6 of the generator for `spec`. Throws `GenerationError` for data that breaks a rule. */
export function generateTerrain(spec: MapGenSpec): TerrainResult {
  const { width: w, height: h, baseHeight: base, noise } = spec;
  checkInt('map', w, h, base, spec.waterLevel, noise.amplitude, noise.octaves);
  if (w < 1 || h < 1) fail('the map needs a size of at least 1 × 1');
  if (base < 0 || base > MAX_HEIGHT_STEPS) fail('baseHeight must be 0–63');
  const terrainCodes = spec.terrainRules.map((r) => {
    const code = TERRAIN_NAMES.indexOf(r.terrain);
    if (code < 0) fail(`unknown terrain ${String(r.terrain)}`);
    return code;
  });

  const vw = w + 1;
  const vh = h + 1;
  const f: Field = { w, h, vw, vh, base, v: new Int32Array(vw * vh), locked: new Uint8Array(vw * vh), offset: new Int32Array(w * h), water: [] };

  // Steps 1–2: base height plus value noise on every corner.
  forVertices(f, (x, y, i) => {
    f.v[i] = base + (noise.amplitude > 0 ? noiseDelta(noise.amplitude, fractalNoise(spec.seed, x, y, noise.scale, noise.octaves)) : 0);
  });
  if (spec.waterLevel > 0) f.water.push({ kind: 'level', surface: base + spec.waterLevel });

  // Step 3: terrain features in list order.
  for (const feature of spec.features) applyFeature(f, feature);

  // Step 4: slope pass.
  const passes = slopePass(f);

  // Normalize every tile from its corners (Phase 4 §4.1).
  const heights = new Uint8Array(w * h);
  const slope = new Uint8Array(w * h);
  forTiles(f, (x, y, t) => {
    const off = f.offset[t] as number;
    const c0 = clampHeight((f.v[y * vw + x] as number) + off);
    const c1 = clampHeight((f.v[y * vw + x + 1] as number) + off);
    const c2 = clampHeight((f.v[(y + 1) * vw + x + 1] as number) + off);
    const c3 = clampHeight((f.v[(y + 1) * vw + x] as number) + off);
    const m = Math.min(c0, c1, c2, c3);
    if (Math.max(c0, c1, c2, c3) > m + 1) fail(`tile ${x},${y} is steeper than 1 step after the slope pass`);
    const bits = (c0 > m ? 1 : 0) | (c1 > m ? 2 : 0) | (c2 > m ? 4 : 0) | (c3 > m ? 8 : 0);
    heights[t] = bits === 15 ? m + 1 : m;
    slope[t] = bits === 15 ? 0 : bits;
  });

  // Step 5: water from the level, lakes, rivers, and seas. A tile is wet when the surface is above its base.
  const water = new Uint8Array(w * h);
  const wet = new Uint8Array(w * h);
  forTiles(f, (x, y, t) => {
    const low = heights[t] as number;
    let surface = 0;
    for (const src of f.water) {
      if (!tileHas(src, f, x, y)) continue;
      surface = Math.max(surface, src.kind === 'river' ? low + src.depth - 1 : src.surface);
    }
    if (surface > low) {
      water[t] = Math.min(MAX_HEIGHT_STEPS, surface);
      wet[t] = 1;
    }
  });

  // Step 6: terrain types, first matching rule; heights relative to the base (master R19).
  const terrain = new Uint8Array(w * h);
  const near = spec.terrainRules.some((r) => r.nearWater !== undefined) ? waterDistance(w, h, wet) : null;
  forTiles(f, (_x, _y, t) => {
    const rel = (heights[t] as number) - base;
    for (let k = 0; k < spec.terrainRules.length; k++) {
      const r = spec.terrainRules[k]!;
      if (r.minHeight !== undefined && rel < r.minHeight) continue;
      if (r.maxHeight !== undefined && rel > r.maxHeight) continue;
      if (r.nearWater !== undefined && (near as Int32Array)[t]! > r.nearWater) continue;
      terrain[t] = terrainCodes[k] as number;
      return;
    }
  });

  return { width: w, height: h, heights, slope, water, terrain, offset: f.offset, passes };
}
