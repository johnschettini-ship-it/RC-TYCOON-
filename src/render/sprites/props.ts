/**
 * Small procedural sprites: guests, fence segments, the park entrance arch, ghost icons. Owner: W1-A (Build 3: W4-F
 * for the temperament rings and the ghost icons, Phase 6 §4.7: colour is never the only signal).
 */
import type { Dir } from '../../sim/map';
import { GHOST_INVALID, GHOST_VALID, TINT_STEPS, shade } from '../palette';
import type { ArtBounds } from './rides';
import { box, cylinder, line3, poly3, rrect, sx, sy, type Ctx } from './shapes';

const TAU = Math.PI * 2;

// ---------------------------------------------------------------- guests

/** Guest art is drawn around the feet at (0, 0); about 10 × 16 px at zoom 1. */
export const GUEST_BOUNDS: ArtBounds = { left: -8, right: 8, top: -20, bottom: 5 };
/** Bounds of a guest with a held item: the balloon floats above the head, the umbrella spreads wider. */
export const GUEST_ITEM_BOUNDS: ArtBounds = { left: -13, right: 13, top: -40, bottom: 5 };

/** Balloon and umbrella colours (bright, readable on grass and paths). */
export const ITEM_COLOURS: readonly string[] = Object.freeze(['#e5484d', '#f5b82e', '#3e9ce6', '#8e5cd9', '#30a46c', '#ff7eb6']);

export interface GuestLook {
  shirt: string;
  skin: string;
  hair: string;
  /** 0 = N, 1 = E, 2 = S, 3 = W (map direction the guest faces). */
  facing: Dir;
  /** 0 standing, 1 and 2 walking steps, 3 sitting (on a bench, Phase 3). */
  walk: number;
  /** Temperament ring colour, or null. */
  ring: string | null;
  /**
   * Temperament tint step of the ring (0 = Chill … `TINT_STEPS − 1` = Thrill), or −1 without a ring. Phase 6 §4.7
   * (W4-F): Chill guests get a full ring, Thrill guests a notched ring, so colour is not the only signal.
   */
  ringStep?: number;
  /** Balloon colour while the guest holds a balloon, or null. */
  balloon?: string | null;
  /** Open umbrella colour (shown in rain and storms), or null. */
  umbrella?: string | null;
}

/**
 * Hand that holds an item, in art x: the screen-right hand for front facings (E, S), the screen-left hand
 * for back facings (N, W), so the item stays on the near side of the body.
 */
function itemHandX(facing: Dir): number {
  return facing === 1 || facing === 2 ? 4.2 : -4.2;
}

/**
 * A balloon on a string from the hand, floating above the head; `walk` sways it a little. With an open
 * umbrella in the item hand, the balloon goes to the other hand so it does not cross the canopy.
 */
function drawBalloon(ctx: Ctx, colour: string, facing: Dir, walk: number, otherHand: boolean): void {
  const hx = otherHand ? -itemHandX(facing) : itemHandX(facing);
  const sway = walk === 1 ? -0.8 : walk === 2 ? 0.8 : 0;
  const bx = hx * 1.25 + sway;
  const by = -31;
  ctx.strokeStyle = 'rgba(70,70,70,0.85)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(hx, -6.4);
  ctx.quadraticCurveTo(hx + 1.6, -17, bx, by + 5.2);
  ctx.stroke();
  ctx.fillStyle = shade(colour, 0.75);
  ctx.beginPath();
  ctx.moveTo(bx - 0.9, by + 6.2);
  ctx.lineTo(bx + 0.9, by + 6.2);
  ctx.lineTo(bx, by + 4.6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.ellipse(bx, by, 4.1, 5, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.ellipse(bx - 1.4, by - 1.9, 1.1, 1.6, -0.5, 0, TAU);
  ctx.fill();
}

/** An open umbrella: the shaft from the hand and a scalloped canopy over the head, with ribs and a tip. */
function drawUmbrella(ctx: Ctx, colour: string, facing: Dir): void {
  const hx = itemHandX(facing);
  const cx = hx * 0.35;
  const cy = -22.5;
  const rx = 10.5;
  const ry = 6.2;
  ctx.strokeStyle = '#3b3b3b';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(hx, -6.4);
  ctx.lineTo(cx, cy);
  ctx.stroke();
  // Canopy: the upper half of an ellipse, closed by 4 shallow scallops.
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, Math.PI, TAU);
  const n = 4;
  for (let k = n - 1; k >= 0; k--) {
    const x0 = cx - rx + ((k + 1) * 2 * rx) / n;
    const x1 = cx - rx + (k * 2 * rx) / n;
    ctx.quadraticCurveTo((x0 + x1) / 2, cy - 1.6, x1, cy);
  }
  ctx.closePath();
  ctx.fill();
  // Alternate panels a shade darker, and ribs from the tip.
  ctx.fillStyle = shade(colour, 0.8);
  for (let k = 1; k < n; k += 2) {
    const x0 = cx - rx + (k * 2 * rx) / n;
    const x1 = cx - rx + ((k + 1) * 2 * rx) / n;
    ctx.beginPath();
    ctx.moveTo(cx, cy - ry);
    ctx.lineTo(x0, cy);
    ctx.quadraticCurveTo((x0 + x1) / 2, cy - 1.6, x1, cy);
    ctx.closePath();
    ctx.fill();
  }
  ctx.strokeStyle = shade(colour, 0.6);
  ctx.lineWidth = 0.4;
  ctx.beginPath();
  for (let k = 0; k <= n; k++) {
    ctx.moveTo(cx, cy - ry);
    ctx.lineTo(cx - rx + (k * 2 * rx) / n, cy);
  }
  ctx.stroke();
  ctx.fillStyle = '#3b3b3b';
  ctx.fillRect(cx - 0.4, cy - ry - 1.6, 0.8, 1.7);
}

/** Thrill guests (last tint step, T ≥ 65) get a notched ring; Chill and Family guests a full ring. */
export function ringNotched(step: number | undefined): boolean {
  return step !== undefined && step >= TINT_STEPS - 1;
}

/** Notches in a Thrill ring: the ring is drawn as this many arcs with gaps between them. */
export const RING_NOTCHES = 6;

export function drawGuestArt(ctx: Ctx, g: GuestLook): void {
  if (g.ring) {
    ctx.strokeStyle = g.ring;
    ctx.lineWidth = 1.6;
    if (ringNotched(g.ringStep)) {
      // Notched ring (Phase 6 §4.7): RING_NOTCHES arcs, each 2/3 of its share of the circle.
      const share = TAU / RING_NOTCHES;
      for (let k = 0; k < RING_NOTCHES; k++) {
        ctx.beginPath();
        ctx.ellipse(0, 0, 6.2, 3, 0, k * share, k * share + share * 0.62);
        ctx.stroke();
      }
    } else {
      ctx.beginPath();
      ctx.ellipse(0, 0, 6.2, 3, 0, 0, TAU);
      ctx.stroke();
    }
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
  if (g.walk === 3) {
    // Sitting: knees forward at seat height, the body a little lower.
    ctx.translate(0, 1.5);
    ctx.fillRect(-3, -7, 2.4, 2.2);
    ctx.fillRect(0.6, -7, 2.4, 2.2);
    ctx.fillRect(-3, -5, 2.4, 3.5);
    ctx.fillRect(0.6, -5, 2.4, 3.5);
  } else {
    ctx.fillRect(-3, -6 + legL, 2.4, 6 - legL * 0.5);
    ctx.fillRect(0.6, -6 + legR, 2.4, 6 - legR * 0.5);
  }
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
  // Held items (Phase 3 §4.10): drawn last so they sit in front of the body and over the head.
  if (g.umbrella) drawUmbrella(ctx, g.umbrella, g.facing);
  if (g.balloon) drawBalloon(ctx, g.balloon, g.facing, g.walk, !!g.umbrella);
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
  // Colour-blind safe (Phase 6 §4.7): blue check, vermillion cross; the shape carries the meaning too.
  ctx.fillStyle = valid ? GHOST_VALID : GHOST_INVALID;
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
