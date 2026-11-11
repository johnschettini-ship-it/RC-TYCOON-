/** Phase 8 stage 0 prototype (never merged): Pixel ground chunks painted on a surface (spec §8.1 item 7). */
import { Content, Terrain, type MapState } from '../../sim/map';
import { STEP_PX } from '../iso';
import { viewCornerHeights, viewSize, viewToMap, viewToMapContinuous, type ViewRotation } from '../view';
import { slotIndex, tone } from './palette';
import { ART_SCALE, BAYER4, type PixelSurface } from './surface';

/**
 * What the ground reads of the terrain env (`TerrainEnv`, `terrain.ts`). Declared here: `terrain.ts` imports this
 * file, so this file imports nothing from it.
 */
export interface GroundEnv {
  seed: number;
}

/** Land outside the park is this many tones darker (§8.1 item 7, §15). */
export const OUTSIDE_TONE_STEPS = 2;

const HW = 32;
const HH = 16;
/** Lattice samples per tile side on a sloped tile: at most half an art pixel apart. */
const LATTICE = 32;
const TWO32 = 4294967296;

/** Unsigned 32-bit hash of three integers (`h3`, `pixel3.py:80-82`, with `Math.imul` mixing). */
export function hash3(a: number, b: number, c: number): number {
  let n = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 2147483647)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return (n ^ (n >>> 16)) >>> 0;
}

/** Value noise in [0, 1): `hash3` at the lattice corners, smoothstep blend (`pixel3.py:83-87`). */
export function vnoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  let fx = x - xi;
  let fy = y - yi;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  // Tuning round (Task 19c): the four `hash3` calls share their products. `Math.imul(x + 1, K)` equals
  // `(Math.imul(x, K) + K) | 0`, and the sum is taken modulo 2^32 as in `hash3`, so every bit is the same.
  const ax = Math.imul(xi | 0, 374761393);
  const by = Math.imul(yi | 0, 668265263);
  const cs = Math.imul(seed | 0, 2147483647);
  const ax1 = (ax + 374761393) | 0;
  const by1 = (by + 668265263) | 0;
  const a = mixHash((ax + by + cs) | 0) / TWO32;
  const b = mixHash((ax1 + by + cs) | 0) / TWO32;
  const c = mixHash((ax + by1 + cs) | 0) / TWO32;
  const d = mixHash((ax1 + by1 + cs) | 0) / TWO32;
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

/** The mixing tail of `hash3` on its summed products. */
function mixHash(n0: number): number {
  const n = Math.imul(n0 ^ (n0 >>> 13), 1274126177);
  return (n ^ (n >>> 16)) >>> 0;
}

// ------------------------------------------------------------------ tile colours

// How a tile top picks its tones: noise with 3 tones (grass), noise with 2 tones (sand, dirt, rock, snow), or
// 2 × 2 slabs with the tones [light slab, slab, joint, edge] (footpath, entrance, queue).
const Kind = { Noise3: 0, Noise2: 1, Slabs: 2 } as const;
type Kind = (typeof Kind)[keyof typeof Kind];

const GRASS_TONES = ['g1', 'g2', 'g3'];
const TWO_TONES: Readonly<Record<number, readonly string[]>> = {
  [Terrain.Sand]: ['s1', 's2'],
  [Terrain.Dirt]: ['w1', 'w2'],
  [Terrain.Rock]: ['n2', 'n3'],
  [Terrain.Snow]: ['e1', 'e2'],
};
const PATH_TONES = ['s1', 's2', 's3', 's4'];
const QUEUE_TONES = ['n2', 'n3', 'n4', 'n5'];

/** Slot of `name` moved `steps` tones, memoised. */
const shifted = new Map<string, number>();
function shiftSlot(name: string, steps: number): number {
  const key = `${name}${steps}`;
  let v = shifted.get(key);
  if (v === undefined) {
    v = slotIndex(tone(name, steps));
    shifted.set(key, v);
  }
  return v;
}

const WATER_SLOT = slotIndex('a2');
const FACE_LEFT = 'w2';
const FACE_RIGHT = 'w3';

function isPathLike(c: number | undefined): boolean {
  return c === Content.Footpath || c === Content.Queue || c === Content.ParkEntrance;
}

/** The tile being painted: what its colour rule needs, set once per tile (no allocation per pixel). */
interface TileRule {
  kind: Kind;
  slots: number[];
  seed: number;
  /** Map tile. */
  x: number;
  y: number;
  /** Edge sides of a slab tile (map directions): the neighbour is not footpath, queue or entrance. */
  edgeN: boolean;
  edgeE: boolean;
  edgeS: boolean;
  edgeW: boolean;
}

const rule: TileRule = { kind: Kind.Noise3, slots: [], seed: 0, x: 0, y: 0, edgeN: false, edgeE: false, edgeS: false, edgeW: false };

/** Grass noise at map point (mx, my) and world art pixel (ax, ay) (`pixel3.py:116-118`). */
function grassValue(mx: number, my: number, ax: number, ay: number, seed: number): number {
  const n = vnoise(mx * 0.42, my * 0.42, seed) * 0.75 + vnoise(mx * 1.9 + 7, my * 1.9 + 3, seed) * 0.25;
  return n + (((BAYER4[(ay & 3) * 4 + (ax & 3)] as number) + 0.5) / 16 - 0.5) * 0.16;
}

/** Slot of the tile top at map point (mx, my), world art pixel (ax, ay). */
function colourAt(mx: number, my: number, ax: number, ay: number): number {
  const t = rule;
  if (t.kind === Kind.Slabs) {
    // `pixel3.py:159-170`: slabs, joints, and the edge toward a tile that is not a path.
    const fx = Math.min(0.999999, Math.max(0, mx - t.x));
    const fy = Math.min(0.999999, Math.max(0, my - t.y));
    let k = hash3(t.x * 2 + Math.floor(fx * 2), t.y * 2 + Math.floor(fy * 2), 5) / TWO32 < 0.22 ? 0 : 1;
    if ((fx * 2) % 1 < 0.13 || (fy * 2) % 1 < 0.13) k = 2;
    if ((t.edgeN && fy < 0.11) || (t.edgeS && 1 - fy < 0.11) || (t.edgeW && fx < 0.11) || (t.edgeE && 1 - fx < 0.11)) k = 3;
    return t.slots[k] as number;
  }
  const v = grassValue(mx, my, ax, ay, t.seed);
  if (t.kind === Kind.Noise3) return t.slots[v < 0.3 ? 0 : v < 0.56 ? 1 : 2] as number;
  // Two tones: the light tone where grass would be g1 or g2.
  return t.slots[v < 0.56 ? 0 : 1] as number;
}

/** Set the rule of map tile `i` (corner heights `c`, view order) for the colour calls that follow. */
function setRule(map: MapState, i: number, c: readonly number[], env: GroundEnv): void {
  const w = map.width;
  const x = i % w;
  const y = (i - x) / w;
  rule.x = x;
  rule.y = y;
  rule.seed = env.seed;
  // Slope light as `paintTile` (`terrain.ts:290-294`): toward the light one tone lighter, away one darker.
  const dzdx = ((c[1] as number) + (c[2] as number) - (c[0] as number) - (c[3] as number)) / 2;
  const dzdy = ((c[2] as number) + (c[3] as number) - (c[0] as number) - (c[1] as number)) / 2;
  const lit = 0.12 * dzdx - 0.06 * dzdy;
  let steps = lit > 0 ? -1 : lit < 0 ? 1 : 0;
  if (map.owned[i] !== 1) steps += OUTSIDE_TONE_STEPS;
  const content = map.content[i];
  let names: readonly string[];
  if (content === Content.Footpath || content === Content.ParkEntrance || content === Content.Queue) {
    rule.kind = Kind.Slabs;
    names = content === Content.Queue ? QUEUE_TONES : PATH_TONES;
    const at = (nx: number, ny: number): number | undefined => (nx < 0 || ny < 0 || nx >= w || ny >= map.height ? undefined : map.content[ny * w + nx]);
    rule.edgeN = !isPathLike(at(x, y - 1));
    rule.edgeS = !isPathLike(at(x, y + 1));
    rule.edgeW = !isPathLike(at(x - 1, y));
    rule.edgeE = !isPathLike(at(x + 1, y));
  } else {
    const two = TWO_TONES[map.terrain[i] as number];
    rule.kind = two ? Kind.Noise2 : Kind.Noise3;
    names = two ?? GRASS_TONES;
  }
  rule.slots.length = names.length;
  for (let k = 0; k < names.length; k++) rule.slots[k] = shiftSlot(names[k] as string, steps);
}

// ------------------------------------------------------------------ walkers

/**
 * Flat top of view tile (u, v) at `hpx` world pixels: each art pixel whose centre lies in the tile top gets the
 * colour of its map point (inverse mapping, `pixel3.py:106-110`). `slot` > 0 paints one slot (water).
 */
function flatTop(s: PixelSurface, u: number, v: number, hpx: number, r: ViewRotation, map: MapState, slot: number): void {
  const x0 = Math.floor((u - v - 1) * HW * ART_SCALE) + s.ox;
  const x1 = Math.ceil((u - v + 1) * HW * ART_SCALE) + s.ox;
  const y0 = Math.floor(((u + v) * HH - hpx) * ART_SCALE) + s.oy;
  const y1 = Math.ceil(((u + v + 2) * HH - hpx) * ART_SCALE) + s.oy;
  const W = map.width;
  const H = map.height;
  for (let py = Math.max(0, y0); py < Math.min(s.h, y1); py++) {
    const ay = py - s.oy;
    const b = ((ay + 0.5) / ART_SCALE + hpx) / HH;
    // Tuning round (Task 19c): only the columns of this row's slice of the diamond, one pixel wider on each side;
    // the exact test below still decides each pixel, so the pixels are the same.
    const aLo = Math.max(2 * u - b, b - 2 * v - 2);
    const aHi = Math.min(2 * u + 2 - b, b - 2 * v);
    if (aLo > aHi) continue;
    const xa = Math.max(0, x0, Math.floor(aLo * HW * ART_SCALE - 0.5) + s.ox - 1);
    const xb = Math.min(s.w, x1, Math.ceil(aHi * HW * ART_SCALE - 0.5) + s.ox + 2);
    for (let px = xa; px < xb; px++) {
      const ax = px - s.ox;
      const a = (ax + 0.5) / ART_SCALE / HW;
      const uu = (a + b) / 2;
      const vv = (b - a) / 2;
      if (uu < u || uu >= u + 1 || vv < v || vv >= v + 1) continue;
      if (slot > 0) {
        s.plot(px, py, slot);
        continue;
      }
      // `viewToMapContinuous` without its object (the same sums).
      const mx = r === 1 ? vv : r === 2 ? W - uu : r === 3 ? W - vv : uu;
      const my = r === 1 ? H - uu : r === 2 ? H - vv : r === 3 ? uu : vv;
      s.plot(px, py, colourAt(mx, my, ax, ay));
    }
  }
}

/**
 * Sloped top of view tile (u, v) with view corner heights `c` (steps): a lattice in tile space, the bilinear height
 * of `terrain.ts:80-82`; each sample is plotted at its art pixel and the pixel below, so steep faces have no holes.
 */
function latticeTop(s: PixelSurface, u: number, v: number, c: readonly number[], r: ViewRotation, map: MapState): void {
  const hN = (c[0] as number) * STEP_PX;
  const hE = (c[1] as number) * STEP_PX;
  const hS = (c[2] as number) * STEP_PX;
  const hW = (c[3] as number) * STEP_PX;
  for (let j = 0; j < LATTICE; j++) {
    const fv = (j + 0.5) / LATTICE;
    for (let k = 0; k < LATTICE; k++) {
      const fu = (k + 0.5) / LATTICE;
      const h = (1 - fu) * (1 - fv) * hN + fu * (1 - fv) * hE + fu * fv * hS + (1 - fu) * fv * hW;
      const ax = Math.floor((u + fu - v - fv) * HW * ART_SCALE);
      const ay = Math.floor(((u + fu + v + fv) * HH - h) * ART_SCALE);
      const m = viewToMapContinuous(u + fu, v + fv, r, map.width, map.height);
      const slot = colourAt(m.x, m.y, ax, ay);
      s.plot(ax + s.ox, ay + s.oy, slot);
      s.plot(ax + s.ox, ay + s.oy + 1, slot);
    }
  }
}

// ------------------------------------------------------------------ faces (copied from `terrain.ts:119-150`)

function fillFace(s: PixelSurface, pts: readonly number[], fill: string): void {
  s.beginPath();
  s.moveTo(pts[0] as number, pts[1] as number);
  s.lineTo(pts[2] as number, pts[3] as number);
  s.lineTo(pts[4] as number, pts[5] as number);
  s.lineTo(pts[6] as number, pts[7] as number);
  s.closePath();
  s.fillStyle = fill;
  s.fill();
}

/** Vertical face on the +u edge (right face) of view tile (u, v) down to `bottomN` at (1, 0) and `bottomW` at (1, 1). */
function faceE(s: PixelSurface, u: number, v: number, hE: number, hS: number, bottomN: number, bottomW: number): void {
  const x0 = (u + 1 - v) * HW;
  const x1 = (u - v) * HW;
  const base0 = (u + 1 + v) * HH;
  const base1 = (u + 1 + v + 1) * HH;
  fillFace(s, [x0, base0 - hE, x1, base1 - hS, x1, base1 - bottomW, x0, base0 - bottomN], FACE_RIGHT);
}

/** Vertical face on the +v edge (left face) of view tile (u, v) down to `bottomW` at (0, 1) and `bottomS` at (1, 1). */
function faceS(s: PixelSurface, u: number, v: number, hW: number, hS: number, bottomW: number, bottomS: number): void {
  const x0 = (u - v - 1) * HW;
  const x1 = (u - v) * HW;
  const base0 = (u + v + 1) * HH;
  const base1 = (u + 1 + v + 1) * HH;
  fillFace(s, [x0, base0 - hW, x1, base1 - hS, x1, base1 - bottomS, x0, base0 - bottomW], FACE_LEFT);
}

// ------------------------------------------------------------------ chunk

const vc: [number, number, number, number] = [0, 0, 0, 0];
const nc: [number, number, number, number] = [0, 0, 0, 0];

function mapIndexAt(map: MapState, u: number, v: number, r: ViewRotation): number {
  const m = viewToMap(u, v, r, map.width, map.height);
  return m.y * map.width + m.x;
}

/** One view tile: faces, top, water (the order of `paintTile`, `terrain.ts:258-325`). */
function paintGroundTile(s: PixelSurface, map: MapState, u: number, v: number, r: ViewRotation, env: GroundEnv): void {
  const vs = viewSize(map, r);
  const i = mapIndexAt(map, u, v, r);
  const c = viewCornerHeights(map, i, r, vc);
  // Face conditions as `terrain.ts:267-287`.
  const hE = c[1] * STEP_PX;
  const hS = c[2] * STEP_PX;
  const hW = c[3] * STEP_PX;
  let nN = 0;
  let nW = 0;
  if (u + 1 < vs.w) {
    const n = viewCornerHeights(map, mapIndexAt(map, u + 1, v, r), r, nc);
    nN = n[0] * STEP_PX;
    nW = n[3] * STEP_PX;
  }
  if (hE > nN || hS > nW) faceE(s, u, v, hE, hS, Math.min(nN, hE), Math.min(nW, hS));
  let sN = 0;
  let sE = 0;
  if (v + 1 < vs.h) {
    const n = viewCornerHeights(map, mapIndexAt(map, u, v + 1, r), r, nc);
    sN = n[0] * STEP_PX;
    sE = n[1] * STEP_PX;
  }
  if (hW > sN || hS > sE) faceS(s, u, v, hW, hS, Math.min(sN, hW), Math.min(sE, hS));

  setRule(map, i, c, env);
  if (c[0] === c[1] && c[1] === c[2] && c[2] === c[3]) flatTop(s, u, v, c[0] * STEP_PX, r, map, 0);
  else latticeTop(s, u, v, c, r, map);

  // Water: opaque a2 at the water level, no shore lines (Prototype decision 6).
  const water = map.water[i] as number;
  if (water > (map.heights[i] as number)) flatTop(s, u, v, water * STEP_PX, r, map, WATER_SLOT);
}

/**
 * Paint the view tiles of `rect` ([u0, u1) × [v0, v1)) back to front onto `s` (world pixels around world (0, 0)).
 * `soft` is accepted and ignored in the prototype (no soft chunks).
 */
export function paintGroundChunk(
  s: PixelSurface,
  map: MapState,
  rect: { u0: number; v0: number; u1: number; v1: number },
  r: ViewRotation,
  env: GroundEnv,
  soft: boolean,
): void {
  void soft;
  for (let d = rect.u0 + rect.v0; d <= rect.u1 + rect.v1 - 2; d++) {
    for (let u = Math.max(rect.u0, d - (rect.v1 - 1)); u <= Math.min(rect.u1 - 1, d - rect.v0); u++) {
      paintGroundTile(s, map, u, d - u, r, env);
    }
  }
}
