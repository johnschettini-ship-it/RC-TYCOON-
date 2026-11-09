/**
 * Small procedural sprites: guests, fence segments, the park entrance arch, ghost icons. Owner: W1-A.
 */
import type { Dir } from '../../sim/map';
import { shade } from '../palette';
import type { ArtBounds } from './rides';
import { box, cylinder, line3, poly3, rrect, sx, sy, type Ctx } from './shapes';

const TAU = Math.PI * 2;

// ---------------------------------------------------------------- guests

/** Guest art is drawn around the feet at (0, 0); about 10 × 16 px at zoom 1. */
export const GUEST_BOUNDS: ArtBounds = { left: -8, right: 8, top: -20, bottom: 5 };

export interface GuestLook {
  shirt: string;
  skin: string;
  hair: string;
  /** 0 = N, 1 = E, 2 = S, 3 = W (map direction the guest faces). */
  facing: Dir;
  /** 0 standing, 1 and 2 walking steps. */
  walk: number;
  /** Temperament ring colour, or null. */
  ring: string | null;
}

export function drawGuestArt(ctx: Ctx, g: GuestLook): void {
  if (g.ring) {
    ctx.strokeStyle = g.ring;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(0, 0, 6.2, 3, 0, 0, TAU);
    ctx.stroke();
  } else {
    ctx.fillStyle = 'rgba(15,25,15,0.28)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 4.2, 1.9, 0, 0, TAU);
    ctx.fill();
  }
  // Screen-left facings (S, W) lean left; screen-right (N, E) lean right.
  const side = g.facing === 1 || g.facing === 0 ? 1 : -1;
  const front = g.facing === 1 || g.facing === 2;
  const legL = g.walk === 1 ? -1.5 : 0;
  const legR = g.walk === 2 ? -1.5 : 0;
  ctx.fillStyle = '#2f3b55';
  ctx.fillRect(-3, -6 + legL, 2.4, 6 - legL * 0.5);
  ctx.fillRect(0.6, -6 + legR, 2.4, 6 - legR * 0.5);
  // Torso and arms.
  ctx.fillStyle = shade(g.shirt, 0.8);
  ctx.fillRect(-5, -11.5, 1.6, 5);
  ctx.fillRect(3.4, -11.5, 1.6, 5);
  ctx.fillStyle = g.shirt;
  ctx.beginPath();
  rrect(ctx, -4, -12.5, 8, 7.5, 1.8);
  ctx.fill();
  ctx.fillStyle = g.skin;
  ctx.fillRect(-5, -6.8, 1.6, 1.4);
  ctx.fillRect(3.4, -6.8, 1.6, 1.4);
  // Head.
  ctx.beginPath();
  ctx.arc(0, -15.2, 3.1, 0, TAU);
  ctx.fill();
  ctx.fillStyle = g.hair;
  ctx.beginPath();
  if (front) {
    ctx.arc(0, -15.9, 3.15, Math.PI * 1.02, Math.PI * 1.98);
    ctx.fill();
    ctx.fillStyle = '#2a1e18';
    ctx.fillRect(side * 0.9 - 1.6, -15.2, 0.9, 0.9);
    ctx.fillRect(side * 0.9 + 0.7, -15.2, 0.9, 0.9);
  } else {
    ctx.arc(0, -15.4, 3.2, 0, TAU);
    ctx.fill();
  }
}

// ---------------------------------------------------------------- fence

/** Fence segment art for edge `dir` of a tile; anchor = the tile's top corner. */
export function fenceBounds(): ArtBounds {
  return { left: -34, right: 34, top: -20, bottom: 36 };
}

/** Edge endpoints in local tile coordinates. */
export function edgeEnds(dir: Dir): [number, number, number, number] {
  switch (dir) {
    case 0:
      return [0, 0, 1, 0];
    case 1:
      return [1, 0, 1, 1];
    case 2:
      return [0, 1, 1, 1];
    default:
      return [0, 0, 0, 1];
  }
}

export function drawFenceArt(ctx: Ctx, dir: Dir): void {
  const [u0, v0, u1, v1] = edgeEnds(dir);
  const post = '#7b5a3a';
  const rail = '#efe4c8';
  // Rails with a dark under-edge so they read on grass.
  for (const h of [5, 10.5]) {
    line3(ctx, u0, v0, h - 1.2, u1, v1, h - 1.2, '#8f7a55', 2.2);
    line3(ctx, u0, v0, h, u1, v1, h, rail, 2.2);
  }
  for (const t of [0, 0.5, 1]) {
    const u = u0 + (u1 - u0) * t;
    const v = v0 + (v1 - v0) * t;
    line3(ctx, u, v, 0, u, v, 14, post, 2.6);
    ctx.fillStyle = shade(post, 1.3);
    ctx.fillRect(sx(u, v) - 1.3, sy(u, v, 14) - 1, 2.6, 1.6);
  }
}

// ---------------------------------------------------------------- park entrance

export function entranceBounds(): ArtBounds {
  return { left: -40, right: 40, top: 16 - 86, bottom: 40 };
}

/**
 * Park entrance arch on the entrance tile. Part 0 = back pillar, beam, and sign; part 1 = front pillar.
 * The beam spans across the way in: along x when the park outside is N or S, else along y.
 */
export function drawEntranceArt(ctx: Ctx, part: 0 | 1, outerDir: Dir | -1): void {
  const alongX = outerDir === 0 || outerDir === 2 || outerDir === -1;
  const at = (t: number, s: number): [number, number] => (alongX ? [t, s] : [s, t]);
  const pillar = (t: number): void => {
    const [u, v] = at(t, 0.5);
    const r = 0.1;
    box(ctx, u - r, v - r, u + r, v + r, 0, 50, '#fff3d6', '#f0e2bf', '#d8c69c');
    for (let k = 0; k < 3; k++) {
      const h = 6 + k * 14;
      box(ctx, u - r - 0.005, v - r - 0.005, u + r + 0.005, v + r + 0.005, h, h + 6, '#e8503a', '#3fa7d6', '#2d84ad');
    }
    cylinder(ctx, u, v, 0.13, 50, 54, '#f5d03b', '#ffe27a');
  };
  if (part === 1) {
    pillar(0.9);
    return;
  }
  pillar(0.1);
  // Beam: warm half (Thrill) and cool half (Chill).
  const [a0u, a0v] = at(0.02, 0.42);
  const [amu, amv] = at(0.5, 0.58);
  const [b0u, b0v] = at(0.5, 0.42);
  const [b1u, b1v] = at(0.98, 0.58);
  box(ctx, Math.min(a0u, amu), Math.min(a0v, amv), Math.max(a0u, amu), Math.max(a0v, amv), 40, 56, '#ffb36b', '#f0643a', '#c4552c');
  box(ctx, Math.min(b0u, b1u), Math.min(b0v, b1v), Math.max(b0u, b1u), Math.max(b0v, b1v), 40, 56, '#9bd8f0', '#3fa7d6', '#2d84ad');
  // Emblems: a flame (Thrill) and a snow star (Chill).
  const [fu, fv] = at(0.1, 0.5);
  const fx = sx(fu, fv);
  const fy = sy(fu, fv, 66);
  ctx.fillStyle = '#f0643a';
  ctx.beginPath();
  ctx.arc(fx, fy, 8, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#ffd166';
  ctx.beginPath();
  ctx.moveTo(fx, fy - 6);
  ctx.quadraticCurveTo(fx + 5, fy + 1, fx, fy + 5);
  ctx.quadraticCurveTo(fx - 5, fy + 1, fx, fy - 6);
  ctx.fill();
  const [cu, cv] = at(0.9, 0.5);
  const cx = sx(cu, cv);
  const cy = sy(cu, cv, 66);
  ctx.fillStyle = '#3fa7d6';
  ctx.beginPath();
  ctx.arc(cx, cy, 8, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI;
    ctx.moveTo(cx - 5 * Math.cos(a), cy - 5 * Math.sin(a));
    ctx.lineTo(cx + 5 * Math.cos(a), cy + 5 * Math.sin(a));
  }
  ctx.stroke();
  // Centre flag pole with a Thrill pennant and a Chill pennant.
  const [mu, mv] = at(0.5, 0.5);
  line3(ctx, mu, mv, 56, mu, mv, 80, '#5b4636', 1.4);
  const du = alongX ? 0.22 : 0;
  const dv = alongX ? 0 : 0.22;
  poly3(ctx, [mu, mv, 80, mu - du, mv - dv, 76, mu, mv, 72], '#f0643a');
  poly3(ctx, [mu, mv, 80, mu + du, mv + dv, 76, mu, mv, 72], '#3fa7d6');
}

// ---------------------------------------------------------------- ghost icons

/** Check (valid) or cross (invalid) badge, drawn in device pixels at (x, y). */
export function drawGhostIcon(ctx: Ctx, x: number, y: number, valid: boolean, r: number): void {
  ctx.save();
  ctx.fillStyle = valid ? '#2f9e44' : '#d9363e';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(1.5, r * 0.18);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.lineWidth = Math.max(2, r * 0.28);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  if (valid) {
    ctx.moveTo(x - r * 0.45, y + r * 0.02);
    ctx.lineTo(x - r * 0.1, y + r * 0.38);
    ctx.lineTo(x + r * 0.48, y - r * 0.35);
  } else {
    const k = r * 0.38;
    ctx.moveTo(x - k, y - k);
    ctx.lineTo(x + k, y + k);
    ctx.moveTo(x + k, y - k);
    ctx.lineTo(x - k, y + k);
  }
  ctx.stroke();
  ctx.restore();
}
