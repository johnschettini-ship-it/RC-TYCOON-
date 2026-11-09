/**
 * Owner: W2-C. Phase 3 stalls and facilities (catalog §3): Pizza Slice, Ice Cream Cart, Cocoa Hut,
 * Balloon Stand, Umbrella Stand, Info Kiosk, First Aid, Cash Machine. Each has its own silhouette and
 * a big kind icon on top so it reads at 0.5× zoom. Anchor and service side as in `../stalls.ts`:
 * the service side faces `rotation` (0 = N, 1 = E, 2 = S, 3 = W); only the S and E faces are visible.
 * Stalls do not animate (the renderer draws frame 0).
 */
import type { Dir } from '../../../sim/map';
import { shade } from '../../palette';
import { box, cone, cylinder, line3, poly3, pyramid, rrect, sx, sy, type Ctx } from '../shapes';
import { TAU, dot, line2, oval, poly2, star } from './kit';

const CX = sx(0.5, 0.5);
const CY = sy(0.5, 0.5, 0);

function shadow(ctx: Ctx): void {
  poly3(ctx, [0.1, 0.1, 0, 0.92, 0.1, 0, 0.92, 0.92, 0, 0.1, 0.92, 0], 'rgba(20,30,20,0.18)');
}

function backService(rotation: Dir): boolean {
  return rotation === 0 || rotation === 3;
}

/** Striped awning sticking out of the service face (edges `a0`–`a1` along the face, from h `top` down to `low`). */
function awning(ctx: Ctx, dir: Dir, roof: string, stripe: string, top = 23, low = 15, a0 = 0.2, a1 = 0.8): void {
  const stripes = 4;
  for (let k = 0; k < stripes; k++) {
    const a = a0 + ((a1 - a0) * k) / stripes;
    const b = a0 + ((a1 - a0) * (k + 1)) / stripes;
    const col = k % 2 ? stripe : roof;
    let pts: number[];
    switch (dir) {
      case 2:
        pts = [a, 0.82, top, b, 0.82, top, b, 1.02, low, a, 1.02, low];
        break;
      case 1:
        pts = [0.82, a, top, 0.82, b, top, 1.02, b, low, 1.02, a, low];
        break;
      case 0:
        pts = [a, 0.18, top, b, 0.18, top, b, -0.02, low, a, -0.02, low];
        break;
      default:
        pts = [0.18, a, top, 0.18, b, top, -0.02, b, low, -0.02, a, low];
    }
    poly3(ctx, pts, col);
  }
}

/** Dark serving window and a counter on a visible service face. */
function counter(ctx: Ctx, dir: Dir, accent: string, lo = 8, hi = 18): void {
  if (dir === 2) {
    poly3(ctx, [0.3, 0.82, lo, 0.7, 0.82, lo, 0.7, 0.82, hi, 0.3, 0.82, hi], '#3a2f2a');
    box(ctx, 0.26, 0.82, 0.74, 0.92, 0, lo, shade(accent, 1.15), accent, shade(accent, 0.75));
  } else if (dir === 1) {
    poly3(ctx, [0.82, 0.3, lo, 0.82, 0.7, lo, 0.82, 0.7, hi, 0.82, 0.3, hi], '#2c2420');
    box(ctx, 0.82, 0.26, 0.92, 0.74, 0, lo, shade(accent, 1.15), accent, shade(accent, 0.75));
  }
}

/** Box body with a coloured base band. */
function body(ctx: Ctx, wall: string, band: string, h = 23, inset = 0.18): void {
  box(ctx, inset, inset, 1 - inset, 1 - inset, 0, h, wall, shade(wall, 0.88), shade(wall, 0.74));
  box(ctx, inset, inset, 1 - inset, 1 - inset, 0, 4, band, shade(band, 0.85), shade(band, 0.7));
}

/** The usual booth: awning, body, counter in the right order for the service side. */
function booth(ctx: Ctx, rotation: Dir, wall: string, band: string, roof: string, stripe: string, accent: string): void {
  shadow(ctx);
  if (backService(rotation)) awning(ctx, rotation, roof, stripe);
  body(ctx, wall, band);
  counter(ctx, rotation, accent);
  if (!backService(rotation)) awning(ctx, rotation, roof, stripe);
}

// ------------------------------------------------------------------ Pizza Slice

function drawPizzaSlice(ctx: Ctx, rotation: Dir): void {
  booth(ctx, rotation, '#fff1d6', '#e8503a', '#e8503a', '#ffffff', '#f5d03b');
  box(ctx, 0.14, 0.14, 0.86, 0.86, 23, 27, '#e8503a', '#c43a2a', '#a8321c');
  // A giant slice standing on the roof, tip down.
  const x = CX;
  const y = CY - 30;
  poly2(ctx, [x - 15, y - 14, x + 15, y - 14, x, y + 14], '#f5c542');
  poly2(ctx, [x - 16, y - 18, x + 16, y - 18, x + 15, y - 12, x - 15, y - 12], '#c9832e');
  for (const [px, py] of [
    [-6, -7],
    [5, -6],
    [0, 2],
  ] as const) {
    dot(ctx, x + px, y + py, 3, '#d8452f');
  }
  dot(ctx, x - 2, y - 2, 1.2, '#5fbf4a');
  dot(ctx, x + 7, y - 10, 1.2, '#5fbf4a');
}

// ------------------------------------------------------------------ Ice Cream Cart

function drawIceCreamCart(ctx: Ctx, rotation: Dir): void {
  shadow(ctx);
  // A cart on two wheels with a parasol and a big cone on top.
  const wheelFront = rotation % 2 === 0;
  const wheel = (u: number, v: number): void => {
    const x = sx(u, v);
    const y = sy(u, v, 6);
    dot(ctx, x, y, 6, '#5b4636');
    dot(ctx, x, y, 3, '#d9d4cc');
  };
  if (wheelFront) wheel(0.2, 0.5);
  else wheel(0.5, 0.2);
  box(ctx, 0.24, 0.24, 0.76, 0.76, 6, 22, '#fde6f0', '#f4bcd3', '#e79bbb');
  box(ctx, 0.24, 0.24, 0.76, 0.76, 6, 9, '#7fd8c8', '#5cc0ae', '#3fa796');
  // Lids of the ice cream tubs.
  for (const [u, v, c] of [
    [0.38, 0.38, '#ffd1e3'],
    [0.62, 0.38, '#bff0dd'],
    [0.38, 0.62, '#fff1b8'],
    [0.62, 0.62, '#e9d1ff'],
  ] as const) {
    oval(ctx, sx(u, v), sy(u, v, 22), 4.5, 2.4, c);
  }
  if (rotation === 2) counter(ctx, 2, '#7fd8c8', 9, 16);
  else if (rotation === 1) counter(ctx, 1, '#7fd8c8', 9, 16);
  if (wheelFront) wheel(0.8, 0.5);
  else wheel(0.5, 0.8);
  // Parasol.
  line3(ctx, 0.5, 0.5, 22, 0.5, 0.5, 42, '#7a5a3a', 1.6);
  cone(ctx, 0.5, 0.5, 0.48, 36, 46, ['#ff9ec4', '#ffffff', '#7fd8c8', '#ffffff'], 12);
  // Cone with two scoops.
  const x = CX;
  const y = CY - 48;
  poly2(ctx, [x - 6, y, x + 6, y, x, y + 12], '#d9a35b');
  line2(ctx, x - 3, y + 2, x + 2, y + 8, '#b47e3c', 1);
  line2(ctx, x + 3, y + 2, x - 2, y + 8, '#b47e3c', 1);
  dot(ctx, x, y - 3, 6.5, '#ff9ec4');
  dot(ctx, x + 1, y - 10, 5.5, '#bff0dd');
  dot(ctx, x + 2, y - 15, 2, '#e8503a');
}

// ------------------------------------------------------------------ Cocoa Hut

function drawCocoaHut(ctx: Ctx, rotation: Dir): void {
  shadow(ctx);
  if (backService(rotation)) awning(ctx, rotation, '#8a4b2a', '#f3d9b0');
  // Log cabin.
  box(ctx, 0.16, 0.16, 0.84, 0.84, 0, 24, '#a86b3c', '#8f5a32', '#7a4a28');
  for (let k = 1; k < 6; k++) {
    const h = k * 4;
    line3(ctx, 0.16, 0.84, h, 0.84, 0.84, h, '#6b3f22', 1);
    line3(ctx, 0.84, 0.16, h, 0.84, 0.84, h, '#5c361d', 1);
  }
  counter(ctx, rotation, '#f3d9b0');
  if (!backService(rotation)) awning(ctx, rotation, '#8a4b2a', '#f3d9b0');
  // Chimney with steam (behind the roof ridge), then a snowy roof.
  box(ctx, 0.25, 0.25, 0.38, 0.38, 24, 44, '#9c9c9c', '#7d7d7d', '#666666');
  for (let k = 0; k < 3; k++) dot(ctx, sx(0.31, 0.31) + k * 3, sy(0.31, 0.31, 47 + k * 5), 2.5 + k, 'rgba(255,255,255,0.85)');
  pyramid(ctx, 0.08, 0.08, 0.92, 0.92, 24, 40, '#5c3a22', '#6b4226', '#4f3019');
  poly3(ctx, [0.08, 0.92, 24, 0.92, 0.92, 24, 0.5, 0.5, 40], '#f4f8ff');
  poly3(ctx, [0.92, 0.08, 24, 0.92, 0.92, 24, 0.5, 0.5, 40], '#dfe8f5');
  poly3(ctx, [0.2, 0.92, 24, 0.8, 0.92, 24, 0.7, 0.8, 27, 0.3, 0.8, 27], '#6b4226');
  // A steaming mug sign.
  const x = CX + 1;
  const y = CY - 46;
  ctx.fillStyle = '#e8503a';
  ctx.beginPath();
  rrect(ctx, x - 7, y - 7, 13, 14, 1, 4);
  ctx.fill();
  ctx.strokeStyle = '#e8503a';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(x + 7, y, 4, -Math.PI / 2, Math.PI / 2);
  ctx.stroke();
  oval(ctx, x - 0.5, y - 7, 6.5, 2, '#6b3f22');
  line2(ctx, x - 3, y - 11, x - 1, y - 16, '#ffffff', 1.6);
  line2(ctx, x + 2, y - 11, x + 4, y - 16, '#ffffff', 1.6);
}

// ------------------------------------------------------------------ Balloon Stand

const BALLOONS: readonly (readonly [number, number, string])[] = [
  [-13, -40, '#e8503a'],
  [-3, -46, '#3d9be0'],
  [9, -42, '#f5d03b'],
  [15, -32, '#2fb39a'],
  [-15, -28, '#8d5ad8'],
  [3, -34, '#ff7aa2'],
];

function drawBalloonStand(ctx: Ctx, rotation: Dir): void {
  shadow(ctx);
  if (backService(rotation)) awning(ctx, rotation, '#d457a8', '#ffe3f3', 16, 10);
  box(ctx, 0.22, 0.22, 0.78, 0.78, 0, 15, '#f8eef4', '#ecd6e3', '#dcbfd0');
  box(ctx, 0.22, 0.22, 0.78, 0.78, 0, 4, '#d457a8', '#b8478f', '#9c3a79');
  counter(ctx, rotation, '#f5d03b', 6, 12);
  if (!backService(rotation)) awning(ctx, rotation, '#d457a8', '#ffe3f3', 16, 10);
  // Strings to a bunch of balloons.
  const hx = CX;
  const hy = CY - 14;
  for (const [bx, by] of BALLOONS) line2(ctx, hx, hy, CX + bx, CY + by + 6, '#5b4636', 0.8);
  for (const [bx, by, c] of BALLOONS) {
    oval(ctx, CX + bx, CY + by, 6, 7, c);
    oval(ctx, CX + bx - 2, CY + by - 3, 1.6, 2.2, 'rgba(255,255,255,0.7)');
    poly2(ctx, [CX + bx - 1.5, CY + by + 7.5, CX + bx + 1.5, CY + by + 7.5, CX + bx, CY + by + 5.5], shade(c, 0.75));
  }
}

// ------------------------------------------------------------------ Umbrella Stand

function drawUmbrellaStand(ctx: Ctx, rotation: Dir): void {
  shadow(ctx);
  body(ctx, '#eef6fa', '#3d9be0', 20, 0.22);
  counter(ctx, rotation, '#f5d03b', 7, 15);
  // Closed umbrellas in a rack by the counter.
  const rackU = rotation === 1 ? 0.88 : 0.3;
  const rackV = rotation === 1 ? 0.3 : 0.88;
  for (let k = 0; k < 3; k++) {
    const u = rackU + (rotation === 1 ? 0 : k * 0.08);
    const v = rackV + (rotation === 1 ? k * 0.08 : 0);
    const x = sx(u, v);
    const y = sy(u, v, 0);
    const c = ['#e8503a', '#f5d03b', '#2fb39a'][k] as string;
    poly2(ctx, [x - 2, y - 16, x + 2, y - 16, x + 0.6, y - 2, x - 0.6, y - 2], c);
    line2(ctx, x, y - 2, x + 1.5, y + 1, '#5b4636', 1);
  }
  // One giant open umbrella as the roof, with a hooked handle on top.
  line3(ctx, 0.5, 0.5, 20, 0.5, 0.5, 34, '#5b4636', 2);
  const colours = ['#3d9be0', '#f5d03b'];
  cone(ctx, 0.5, 0.5, 0.62, 30, 50, colours, 8);
  // Scalloped rim.
  for (let k = 0; k < 8; k++) {
    const a = ((k + 0.5) / 8) * TAU;
    if (Math.cos(a) + Math.sin(a) < -0.3) continue;
    const u = 0.5 + 0.62 * Math.cos(a);
    const v = 0.5 + 0.62 * Math.sin(a);
    dot(ctx, sx(u, v), sy(u, v, 30) + 1, 2.4, k % 2 ? '#3d9be0' : '#f5d03b');
  }
  const tx = CX;
  const ty = sy(0.5, 0.5, 50);
  line2(ctx, tx, ty, tx, ty - 7, '#5b4636', 2);
  ctx.strokeStyle = '#5b4636';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(tx + 3, ty - 7, 3, Math.PI, 0);
  ctx.stroke();
  // Raindrops.
  for (const [dx, dy] of [
    [-20, -44],
    [18, -40],
    [-24, -30],
  ] as const) {
    poly2(ctx, [CX + dx, CY + dy - 4, CX + dx + 2.2, CY + dy + 1, CX + dx - 2.2, CY + dy + 1], '#9bd8f0');
    dot(ctx, CX + dx, CY + dy + 1.2, 2.2, '#9bd8f0');
  }
}

// ------------------------------------------------------------------ Info Kiosk

function drawInfoKiosk(ctx: Ctx, rotation: Dir): void {
  shadow(ctx);
  // Map board on two legs, on the side away from the service window.
  const board = rotation === 1 ? { u: 0.5, v: 0.86, along: 'u' } : { u: 0.86, v: 0.5, along: 'v' };
  const drawBoard = (): void => {
    const half = 0.24;
    const a = board.along === 'u' ? { u: board.u - half, v: board.v } : { u: board.u, v: board.v - half };
    const b = board.along === 'u' ? { u: board.u + half, v: board.v } : { u: board.u, v: board.v + half };
    line3(ctx, a.u, a.v, 0, a.u, a.v, 12, '#5b4636', 1.6);
    line3(ctx, b.u, b.v, 0, b.u, b.v, 12, '#5b4636', 1.6);
    poly3(ctx, [a.u, a.v, 10, b.u, b.v, 10, b.u, b.v, 24, a.u, a.v, 24], '#fffaf0', '#5b4636', 1.2);
    const f = (t: number, h: number): [number, number] => {
      const u = a.u + (b.u - a.u) * t;
      const v = a.v + (b.v - a.v) * t;
      return [sx(u, v), sy(u, v, h)];
    };
    const [x0, y0] = f(0.15, 14);
    const [x1, y1] = f(0.5, 21);
    const [x2, y2] = f(0.8, 15);
    poly2(ctx, [x0, y0, x1, y1, x2, y2], '#9be08f');
    line2(ctx, ...f(0.1, 18), ...f(0.9, 18), '#3d9be0', 1.3);
    dot(ctx, ...f(0.6, 16), 1.6, '#e8503a');
  };
  if (backService(rotation)) awning(ctx, rotation, '#f5d03b', '#fff8dc', 20, 14);
  // Round kiosk with a dome.
  cylinder(ctx, 0.5, 0.5, 0.3, 0, 22, '#3d9be0', '#7cc0f0');
  cylinder(ctx, 0.5, 0.5, 0.305, 0, 4, '#20628a', '#3d9be0');
  const win = rotation === 1 ? { u: 0.8, v: 0.5 } : { u: 0.5, v: 0.8 };
  if (rotation === 1 || rotation === 2) {
    const x = sx(win.u, win.v);
    const y = sy(win.u, win.v, 8);
    ctx.fillStyle = '#20343f';
    ctx.beginPath();
    rrect(ctx, x - 5, y - 10, 10, 10, 3, 0);
    ctx.fill();
  }
  cylinder(ctx, 0.5, 0.5, 0.36, 22, 26, '#f5d03b', '#ffe17a');
  cone(ctx, 0.5, 0.5, 0.34, 26, 36, ['#f5d03b', '#fff8dc'], 10);
  if (!backService(rotation)) awning(ctx, rotation, '#f5d03b', '#fff8dc', 20, 14);
  drawBoard();
  // Big "i" sign.
  const x = CX;
  const y = CY - 48;
  line2(ctx, x, CY - 36, x, y + 9, '#5b4636', 1.6);
  dot(ctx, x, y, 10, '#ffffff');
  dot(ctx, x, y, 8.5, '#3d9be0');
  dot(ctx, x, y - 4.5, 1.8, '#ffffff');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x - 1.4, y - 1.5, 2.8, 7);
}

// ------------------------------------------------------------------ First Aid

function greenCross(ctx: Ctx, x: number, y: number, s: number): void {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x - s * 0.35, y - s, s * 0.7, s * 2);
  ctx.fillRect(x - s, y - s * 0.35, s * 2, s * 0.7);
}

function drawFirstAid(ctx: Ctx, rotation: Dir): void {
  shadow(ctx);
  box(ctx, 0.14, 0.14, 0.86, 0.86, 0, 26, '#fbfdfb', '#e6eee8', '#d2ddd5');
  box(ctx, 0.14, 0.14, 0.86, 0.86, 18, 22, '#2fae5c', '#2a9a52', '#228446');
  // Door on the service face (doors on both visible faces when it faces back).
  const door = (dir: Dir): void => {
    if (dir === 2) poly3(ctx, [0.38, 0.86, 0, 0.62, 0.86, 0, 0.62, 0.86, 15, 0.38, 0.86, 15], '#9fd8b4');
    if (dir === 1) poly3(ctx, [0.86, 0.38, 0, 0.86, 0.62, 0, 0.86, 0.62, 15, 0.86, 0.38, 15], '#86c49e');
  };
  if (backService(rotation)) {
    door(2);
    door(1);
  } else door(rotation);
  // Flat roof with a sign: white cross on green (the ISO safety sign, not the protected red emblem).
  box(ctx, 0.1, 0.1, 0.9, 0.9, 26, 30, '#dfe8e2', '#c8d4cc', '#b4c2b9');
  const x = CX;
  const y = CY - 46;
  line2(ctx, x, CY - 30, x, y + 10, '#5b4636', 1.6);
  ctx.fillStyle = '#2fae5c';
  ctx.beginPath();
  rrect(ctx, x - 11, y - 11, 22, 22, 4);
  ctx.fill();
  greenCross(ctx, x, y, 7.5);
  // Small crosses on the band.
  const bx = sx(0.5, 0.86);
  const by = sy(0.5, 0.86, 20);
  greenCross(ctx, bx, by, 2.2);
  const rx = sx(0.86, 0.5);
  const ry = sy(0.86, 0.5, 20);
  greenCross(ctx, rx, ry, 2.2);
}

// ------------------------------------------------------------------ Cash Machine

function drawCashMachine(ctx: Ctx, rotation: Dir): void {
  shadow(ctx);
  // A slim upright machine with a canopy.
  box(ctx, 0.3, 0.3, 0.7, 0.7, 0, 30, '#30425a', '#263548', '#1d2a3a');
  const face = (dir: Dir): void => {
    if (dir === 2) {
      poly3(ctx, [0.38, 0.7, 17, 0.62, 0.7, 17, 0.62, 0.7, 26, 0.38, 0.7, 26], '#7cd3f0');
      for (let k = 0; k < 3; k++) poly3(ctx, [0.42 + k * 0.06, 0.7, 10, 0.46 + k * 0.06, 0.7, 10, 0.46 + k * 0.06, 0.7, 13, 0.42 + k * 0.06, 0.7, 13], '#d9e2ec');
      poly3(ctx, [0.42, 0.7, 6, 0.58, 0.7, 6, 0.58, 0.7, 7.5, 0.42, 0.7, 7.5], '#0f151d');
    } else if (dir === 1) {
      poly3(ctx, [0.7, 0.38, 17, 0.7, 0.62, 17, 0.7, 0.62, 26, 0.7, 0.38, 26], '#69bcd9');
      for (let k = 0; k < 3; k++) poly3(ctx, [0.7, 0.42 + k * 0.06, 10, 0.7, 0.46 + k * 0.06, 10, 0.7, 0.46 + k * 0.06, 13, 0.7, 0.42 + k * 0.06, 13], '#c7d1dc');
      poly3(ctx, [0.7, 0.42, 6, 0.7, 0.58, 6, 0.7, 0.58, 7.5, 0.7, 0.42, 7.5], '#0f151d');
    }
  };
  face(rotation);
  box(ctx, 0.22, 0.22, 0.78, 0.78, 30, 34, '#2fb39a', '#249986', '#1d7f6f');
  // Gold coin sign with a dollar mark.
  const x = CX;
  const y = CY - 50;
  line2(ctx, x, CY - 34, x, y + 10, '#5b4636', 1.6);
  dot(ctx, x, y, 11, '#c9971c');
  dot(ctx, x, y, 9, '#f5d03b');
  ctx.strokeStyle = '#9c6f10';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y - 2.3, 2.8, 0.2 * Math.PI, 1.5 * Math.PI, true);
  ctx.arc(x, y + 2.3, 2.8, 1.5 * Math.PI, 0.8 * Math.PI);
  ctx.stroke();
  line2(ctx, x, y - 7, x, y + 7, '#9c6f10', 1.4);
  star(ctx, x + 10, y - 9, 3, 1, 4, '#fff3b0');
}

export const STALL_DRAW: Readonly<Record<string, (ctx: Ctx, rotation: Dir) => void>> = {
  pizza_slice: drawPizzaSlice,
  ice_cream_cart: drawIceCreamCart,
  cocoa_hut: drawCocoaHut,
  balloon_stand: drawBalloonStand,
  umbrella_stand: drawUmbrellaStand,
  info_kiosk: drawInfoKiosk,
  first_aid: drawFirstAid,
  cash_machine: drawCashMachine,
};
