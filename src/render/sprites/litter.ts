/**
 * Path items (bench, bin with fill level, lamp; broken look) and ground decals (litter, mess).
 * Original procedural art, deterministic. Path items are drawn around their base centre at (0, 0)
 * in local tile units (see `shapes.ts`); decals around their ground point. Owner: W2-B.
 */
import type { ArtBounds } from './rides';
import { box, cylinder, line3, poly3, type Ctx } from './shapes';

const TAU = Math.PI * 2;

export const PATH_ITEM_BOUNDS: ArtBounds = { left: -16, right: 16, top: -32, bottom: 8 };
export const LITTER_BOUNDS: ArtBounds = { left: -9, right: 9, top: -7, bottom: 6 };
export const MESS_BOUNDS: ArtBounds = { left: -11, right: 11, top: -6, bottom: 6 };

/** Path item codes match `PathItem` in `sim/map.ts`. */
export const ITEM_BENCH = 1;
export const ITEM_BIN = 2;
export const ITEM_LAMP = 3;

/** Bin fill shown in 4 steps: empty, some, mostly, full. */
export function binFillLevel(fill: number, capacity: number): number {
  if (fill <= 0) return 0;
  if (fill >= capacity) return 3;
  return fill * 3 < capacity * 2 ? 1 : 2;
}

/** Frame layout: item code (2 bits) | side (2) | fill level (2) | broken (1). */
export function pathItemFrame(code: number, side: number, fillLevel: number, broken: boolean): number {
  return (code & 3) | ((side & 3) << 2) | ((fillLevel & 3) << 4) | (broken ? 64 : 0);
}

function crack(ctx: Ctx, x: number, y: number, s: number): void {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x - 2.2 * s, y - 2.4 * s);
  ctx.lineTo(x - 0.4 * s, y - 0.6 * s);
  ctx.lineTo(x - 1.2 * s, y + 0.6 * s);
  ctx.lineTo(x + 1.4 * s, y + 2.6 * s);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.2 * s;
  ctx.stroke();
  ctx.strokeStyle = '#1b1b1b';
  ctx.lineWidth = 1.1 * s;
  ctx.stroke();
}

// ---------------------------------------------------------------- bench

/** Bench at an edge `side` (0 N, 1 E, 2 S, 3 W): seat along the edge, backrest on the edge side. */
function bench(ctx: Ctx, side: number, broken: boolean): void {
  const alongX = side === 0 || side === 2;
  const wood = broken ? '#8e6a48' : '#c98a4b';
  const woodTop = broken ? '#a8835f' : '#e0a764';
  const woodDark = broken ? '#6a4b30' : '#8a5a2b';
  const metal = '#3a3f47';
  // Local frame: a = along the bench, b = across (toward the backrest is −b for N/W, +b for S/E).
  const back = side === 0 || side === 3 ? -1 : 1;
  const P = (a: number, b: number): [number, number] => (alongX ? [a, b] : [b, a]);
  const boxAB = (a0: number, a1: number, b0: number, b1: number, h0: number, h1: number, top: string, l: string, r: string): void => {
    const [u0, v0] = P(Math.min(a0, a1), Math.min(b0, b1));
    const [u1, v1] = P(Math.max(a0, a1), Math.max(b0, b1));
    box(ctx, Math.min(u0, u1), Math.min(v0, v1), Math.max(u0, u1), Math.max(v0, v1), h0, h1, top, l, r);
  };
  const backrest = (): void => {
    boxAB(-0.2, 0.2, back * 0.05, back * 0.08, 5, 11, woodTop, wood, woodDark);
    if (!broken) boxAB(-0.2, 0.2, back * 0.05, back * 0.08, 7.6, 8.2, woodDark, woodDark, woodDark);
  };
  // Shadow.
  const [su, sv] = P(0.22, 0.09);
  poly3(ctx, [-su, -sv, 0, su, -sv, 0, su, sv, 0, -su, sv, 0], 'rgba(15,25,15,0.22)');
  if (back < 0) backrest();
  // Legs.
  for (const a of [-0.16, 0.14]) boxAB(a, a + 0.03, -0.05, 0.05, 0, 4.5, metal, metal, metal);
  if (broken) {
    // Split seat: one half dropped and tilted.
    boxAB(-0.2, -0.01, -0.05, 0.05, 4, 5.2, woodTop, wood, woodDark);
    const [a0u, a0v] = P(0.01, -0.05);
    const [a1u, a1v] = P(0.2, -0.05);
    const [b1u, b1v] = P(0.2, 0.05);
    const [b0u, b0v] = P(0.01, 0.05);
    poly3(ctx, [a0u, a0v, 5, a1u, a1v, 1.5, b1u, b1v, 1.5, b0u, b0v, 5], woodTop, woodDark, 0.6);
  } else {
    boxAB(-0.2, 0.2, -0.05, 0.05, 4, 5.2, woodTop, wood, woodDark);
  }
  if (back > 0) backrest();
  if (broken) crack(ctx, 0, -8, 1);
}

// ---------------------------------------------------------------- bin

const LITTER_BITS = ['#e8503a', '#f5d03b', '#ffffff', '#3d9be0', '#7cc04b'];

function bin(ctx: Ctx, level: number, broken: boolean): void {
  const side = broken ? '#6f7d73' : '#3e8e5a';
  const top = broken ? '#58645b' : '#2c6b42';
  ctx.fillStyle = 'rgba(15,25,15,0.25)';
  ctx.beginPath();
  ctx.ellipse(0, 0, 6, 3, 0, 0, TAU);
  ctx.fill();
  cylinder(ctx, 0, 0, 0.085, 0, 10, side, top);
  // Rim band.
  cylinder(ctx, 0, 0, 0.09, 8.6, 10, broken ? '#8a968d' : '#58b077', top);
  // Litter inside, shown above the rim as the bin fills.
  if (level > 0) {
    const heap = level === 1 ? 0 : level === 2 ? 1.6 : 3.6;
    const rx = level === 1 ? 2.6 : 3.4;
    ctx.fillStyle = '#7a6a55';
    ctx.beginPath();
    ctx.ellipse(0, -10 - heap * 0.4, rx, 1.6 + heap * 0.3, 0, 0, TAU);
    ctx.fill();
    const n = level === 1 ? 2 : level === 2 ? 4 : 6;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU;
      ctx.fillStyle = LITTER_BITS[k % LITTER_BITS.length] as string;
      ctx.fillRect(Math.cos(a) * rx * 0.6 - 0.8, -10.6 - heap * 0.6 + Math.sin(a) * 0.9 - (k % 2) * heap * 0.4, 1.7, 1.3);
    }
    if (level === 3) {
      // Overflowing: bits on the ground.
      ctx.fillStyle = '#f5d03b';
      ctx.fillRect(5.2, -1.2, 1.8, 1.2);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-6.6, 0.2, 1.6, 1.1);
    }
  }
  if (broken) {
    // Dented, with the lid knocked off beside it.
    ctx.fillStyle = '#8a968d';
    ctx.beginPath();
    ctx.ellipse(7, 1.6, 3.4, 1.4, 0.3, 0, TAU);
    ctx.fill();
    crack(ctx, -1, -5, 0.9);
  }
}

// ---------------------------------------------------------------- lamp

function lamp(ctx: Ctx, broken: boolean): void {
  ctx.fillStyle = 'rgba(15,25,15,0.25)';
  ctx.beginPath();
  ctx.ellipse(0, 0, 4, 2, 0, 0, TAU);
  ctx.fill();
  cylinder(ctx, 0, 0, 0.04, 0, 2, '#2c3138', '#3a3f47');
  line3(ctx, 0, 0, 2, 0, 0, 22, '#3a3f47', 1.4);
  box(ctx, -0.04, -0.04, 0.04, 0.04, 22, 26, '#2c3138', broken ? '#4b4f55' : '#ffe27a', broken ? '#3b3f45' : '#f5c84b');
  box(ctx, -0.05, -0.05, 0.05, 0.05, 26, 27, '#2c3138', '#2c3138', '#2c3138');
  if (broken) crack(ctx, 0, -24, 0.8);
}

export function drawPathItemArt(ctx: Ctx, code: number, side: number, fillLevel: number, broken: boolean): void {
  if (code === ITEM_BENCH) bench(ctx, side, broken);
  else if (code === ITEM_BIN) bin(ctx, fillLevel, broken);
  else if (code === ITEM_LAMP) lamp(ctx, broken);
}

// ---------------------------------------------------------------- decals

/** Litter variant 0 cup, 1 wrapper, 2 can, 3 napkin. `flip` mirrors it. */
export function drawLitterArt(ctx: Ctx, variant: number, flip: number): void {
  // Drawn 1.6× so a single item still reads at 0.5× zoom.
  ctx.scale(flip ? -1.6 : 1.6, 1.6);
  ctx.fillStyle = 'rgba(15,25,15,0.25)';
  ctx.beginPath();
  ctx.ellipse(0.3, 0.6, 2.8, 1.2, 0, 0, TAU);
  ctx.fill();
  switch (variant & 3) {
    case 0:
      // Cup on its side.
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(-2.4, -1.2);
      ctx.lineTo(2, -0.6);
      ctx.lineTo(2, 1);
      ctx.lineTo(-2.4, 0.8);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#e8503a';
      ctx.fillRect(-0.6, -1, 1.2, 1.9);
      break;
    case 1:
      // Crumpled wrapper.
      ctx.fillStyle = '#f5d03b';
      ctx.beginPath();
      ctx.moveTo(-2, -0.8);
      ctx.lineTo(-0.4, -1.6);
      ctx.lineTo(1.8, -0.6);
      ctx.lineTo(1.2, 1.2);
      ctx.lineTo(-1.4, 1);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#d9472b';
      ctx.fillRect(-0.6, -0.4, 1.4, 0.7);
      break;
    case 2:
      // Can.
      ctx.fillStyle = '#3d9be0';
      ctx.fillRect(-1.8, -0.9, 3.4, 1.8);
      ctx.fillStyle = '#c9d6e3';
      ctx.fillRect(1.4, -0.9, 0.8, 1.8);
      break;
    default:
      // Napkin.
      ctx.fillStyle = '#f2f2f2';
      ctx.beginPath();
      ctx.moveTo(-1.8, -0.4);
      ctx.lineTo(0, -1.4);
      ctx.lineTo(2, -0.2);
      ctx.lineTo(0.6, 1.2);
      ctx.lineTo(-1.2, 0.9);
      ctx.closePath();
      ctx.fill();
  }
}

/** A sick-guest mess: a greenish puddle with darker spots. */
export function drawMessArt(ctx: Ctx, variant: number, flip: number): void {
  if (flip) ctx.scale(-1, 1);
  ctx.fillStyle = 'rgba(156,180,74,0.85)';
  ctx.beginPath();
  ctx.ellipse(0, 0, 7, 3.4, variant ? 0.2 : -0.1, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(4.6, 1.4, 2.8, 1.4, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(110,128,40,0.9)';
  ctx.beginPath();
  ctx.ellipse(-2, -0.4, 1.4, 0.8, 0, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(1.6, 0.6, 1.1, 0.6, 0, 0, TAU);
  ctx.fill();
}
