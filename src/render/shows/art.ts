/**
 * Show site art (Phase 6 §4.5, original procedural drawings). Owner: W4-C. Local coordinates as in
 * `../sprites/shapes.ts`: (u, v) in tiles from the footprint's view-origin top corner, `h` in world px (8 px = 1 m).
 * `facing` is the sprite rotation `(rotation + view rotation) mod 4`; both sites are square, so it only turns the
 * details (the tower's door and booth, the launcher's tube rack and safety rail).
 *
 * - Lightshow Tower (2 × 2): a concrete plinth with a door and a control booth, a tapered steel lattice mast, and a
 *   lamp head with six coloured lenses at `TOWER_TOP_PX`.
 * - Fireworks Launcher (1 × 1): a low pad with a striped safety rail, a rack of nine mortar tubes leaning to the
 *   front, and a crate of shells.
 */
import type { Dir } from '../../sim/map';
import { box, cylinder, disc, poly3, sx, sy, type Ctx } from '../sprites/shapes';
import type { ArtBounds } from '../sprites/rides';

/** Height (world px above the ground) of the tower's lamp head: the beams start here. */
export const TOWER_TOP_PX = 92;
/** Height of the launcher's tube mouths: rockets start here. */
export const LAUNCHER_MOUTH_PX = 26;

const LENS = ['#ffd166', '#ef476f', '#06d6a0', '#4cc9f0', '#f78c6b', '#c77dff'];

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (s: number): number => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f)));
  return `#${((c(16) << 16) | (c(8) << 8) | c(0)).toString(16).padStart(6, '0')}`;
}

function dot(ctx: Ctx, x: number, y: number, r: number, fill: string): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

export function showArtBounds(defId: string): ArtBounds {
  if (defId === 'lightshow_tower') return { left: -68, right: 68, top: 32 - TOWER_TOP_PX - 24, bottom: 70 };
  return { left: -36, right: 36, top: 16 - LAUNCHER_MOUTH_PX - 14, bottom: 36 };
}

/** A tapered square mast between half-widths r0 (at h0) and r1 (at h1) around (c, c): the two front faces. */
function mast(ctx: Ctx, c: number, r0: number, r1: number, h0: number, h1: number, steel: string): void {
  const left = [c - r0, c + r0, h0, c + r0, c + r0, h0, c + r1, c + r1, h1, c - r1, c + r1, h1];
  const right = [c + r0, c - r0, h0, c + r0, c + r0, h0, c + r1, c + r1, h1, c + r1, c - r1, h1];
  poly3(ctx, left, shade(steel, 0.55));
  poly3(ctx, right, shade(steel, 0.42));
  // Lattice: cross braces on both faces.
  ctx.lineWidth = 1.1;
  ctx.strokeStyle = shade(steel, 1.25);
  const steps = 6;
  for (let k = 0; k < steps; k++) {
    const ha = h0 + ((h1 - h0) * k) / steps;
    const hb = h0 + ((h1 - h0) * (k + 1)) / steps;
    const ra = r0 + ((r1 - r0) * k) / steps;
    const rb = r0 + ((r1 - r0) * (k + 1)) / steps;
    ctx.beginPath();
    ctx.moveTo(sx(c - ra, c + ra), sy(c - ra, c + ra, ha));
    ctx.lineTo(sx(c + rb, c + rb), sy(c + rb, c + rb, hb));
    ctx.moveTo(sx(c + ra, c + ra), sy(c + ra, c + ra, ha));
    ctx.lineTo(sx(c - rb, c + rb), sy(c - rb, c + rb, hb));
    ctx.moveTo(sx(c + ra, c - ra), sy(c + ra, c - ra, ha));
    ctx.lineTo(sx(c + rb, c + rb), sy(c + rb, c + rb, hb));
    ctx.moveTo(sx(c + ra, c + ra), sy(c + ra, c + ra, ha));
    ctx.lineTo(sx(c + rb, c - rb), sy(c + rb, c - rb, hb));
    ctx.stroke();
  }
  // Corner legs.
  ctx.strokeStyle = shade(steel, 1.45);
  ctx.lineWidth = 1.6;
  for (const [a, b] of [
    [-1, 1],
    [1, 1],
    [1, -1],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(sx(c + a * r0, c + b * r0), sy(c + a * r0, c + b * r0, h0));
    ctx.lineTo(sx(c + a * r1, c + b * r1), sy(c + a * r1, c + b * r1, h1));
    ctx.stroke();
  }
}

function drawTower(ctx: Ctx, facing: Dir): void {
  // Ground shadow and plinth.
  disc(ctx, 1, 1, 0.95, 0, 'rgba(15,20,35,0.25)');
  box(ctx, 0.12, 0.12, 1.88, 1.88, 0, 7, '#8a94a6', '#6c7689', '#566073');
  // Gold trim along the plinth top.
  poly3(ctx, [0.12, 1.88, 7, 1.88, 1.88, 7, 1.88, 1.88, 5.5, 0.12, 1.88, 5.5], '#e0b04a');
  poly3(ctx, [1.88, 0.12, 7, 1.88, 1.88, 7, 1.88, 1.88, 5.5, 1.88, 0.12, 5.5], '#c4943a');
  // Door on the front face (visible when the front faces the viewer), booth at the back otherwise.
  if (facing === 2) poly3(ctx, [0.85, 1.88, 0.5, 1.15, 1.88, 0.5, 1.15, 1.88, 5, 0.85, 1.88, 5], '#2d3446');
  else if (facing === 1) poly3(ctx, [1.88, 0.85, 0.5, 1.88, 1.15, 0.5, 1.88, 1.15, 5, 1.88, 0.85, 5], '#2d3446');
  const bu = facing === 0 || facing === 1 ? 0.25 : 1.3;
  const bv = facing === 0 || facing === 3 ? 0.25 : 1.3;
  if (facing === 0 || facing === 3) {
    box(ctx, bu, bv, bu + 0.45, bv + 0.45, 7, 19, '#f2e6c9', '#c9bda1', '#b3a88d');
    poly3(ctx, [bu + 0.08, bv + 0.45, 12, bu + 0.37, bv + 0.45, 12, bu + 0.37, bv + 0.45, 16, bu + 0.08, bv + 0.45, 16], '#5fb4d9');
  }
  // Lattice mast.
  mast(ctx, 1, 0.42, 0.16, 7, TOWER_TOP_PX - 10, '#5c6f8f');
  // Lamp head: a drum with six lenses and a dome.
  cylinder(ctx, 1, 1, 0.3, TOWER_TOP_PX - 10, TOWER_TOP_PX - 1, '#3b4459', '#4f5a73');
  const cx = sx(1, 1);
  const cy = sy(1, 1, TOWER_TOP_PX - 5);
  for (let k = 0; k < 6; k++) {
    const a = Math.PI * (0.15 + (0.7 * k) / 5);
    dot(ctx, cx + Math.cos(a) * 11.5, cy + Math.sin(a) * 2.6, 2.4, LENS[k] as string);
  }
  disc(ctx, 1, 1, 0.22, TOWER_TOP_PX, '#d9dee8');
  dot(ctx, cx, sy(1, 1, TOWER_TOP_PX + 4), 2.2, '#f7f1d6');
  // A pennant on the dome.
  ctx.strokeStyle = '#d9dee8';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx, sy(1, 1, TOWER_TOP_PX + 4));
  ctx.lineTo(cx, sy(1, 1, TOWER_TOP_PX + 14));
  ctx.stroke();
  const side = facing === 1 || facing === 0 ? 1 : -1;
  ctx.beginPath();
  ctx.moveTo(cx, sy(1, 1, TOWER_TOP_PX + 14));
  ctx.lineTo(cx + 9 * side, sy(1, 1, TOWER_TOP_PX + 11.5));
  ctx.lineTo(cx, sy(1, 1, TOWER_TOP_PX + 9));
  ctx.closePath();
  ctx.fillStyle = '#ef476f';
  ctx.fill();
}

function drawLauncher(ctx: Ctx, facing: Dir): void {
  disc(ctx, 0.5, 0.5, 0.48, 0, 'rgba(15,20,35,0.25)');
  box(ctx, 0.08, 0.08, 0.92, 0.92, 0, 4, '#9aa3ad', '#7b848f', '#666f7a');
  // Striped safety rail on the two front edges.
  for (let k = 0; k < 6; k++) {
    const a = 0.08 + (0.84 * k) / 6;
    const b = a + 0.84 / 6;
    const c = k % 2 === 0 ? '#ef476f' : '#fff3e0';
    poly3(ctx, [a, 0.92, 4, b, 0.92, 4, b, 0.92, 8, a, 0.92, 8], c);
    poly3(ctx, [0.92, a, 4, 0.92, b, 4, 0.92, b, 8, 0.92, a, 8], shade(c === '#ef476f' ? c : '#e8dcc8', 0.92));
  }
  // Crate of shells in a back corner.
  const cu = facing === 0 || facing === 1 ? 0.62 : 0.18;
  const cv = facing === 2 || facing === 1 ? 0.18 : 0.62;
  box(ctx, cu, cv, cu + 0.22, cv + 0.22, 4, 10, '#c98b4a', '#a96f37', '#8f5d2e');
  // Rack and tubes leaning to the front.
  box(ctx, 0.3, 0.3, 0.7, 0.7, 4, 10, '#4a5266', '#3a4152', '#2f3644');
  const lean = facing === 1 || facing === 0 ? 2.2 : -2.2;
  const tubes: Array<[number, number]> = [];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) tubes.push([0.37 + i * 0.13, 0.37 + j * 0.13]);
  tubes.sort((p, q) => p[0] + p[1] - (q[0] + q[1]));
  for (const [u, v] of tubes) {
    const x0 = sx(u, v);
    const y0 = sy(u, v, 10);
    const y1 = sy(u, v, LAUNCHER_MOUTH_PX);
    ctx.beginPath();
    ctx.moveTo(x0 - 2.3, y0);
    ctx.lineTo(x0 + 2.3, y0);
    ctx.lineTo(x0 + 2.3 + lean, y1);
    ctx.lineTo(x0 - 2.3 + lean, y1);
    ctx.closePath();
    ctx.fillStyle = '#2b3140';
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x0 + lean, y1, 2.3, 1.2, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#11141b';
    ctx.fill();
    ctx.strokeStyle = '#7d8799';
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }
}

/** Draw a show site at sprite rotation `facing` (anchor = the footprint's view-origin top corner). */
export function drawShowSiteArt(ctx: Ctx, defId: string, facing: Dir): void {
  if (defId === 'lightshow_tower') drawTower(ctx, facing);
  else drawLauncher(ctx, facing);
}
