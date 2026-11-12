/**
 * Staff sprites (Phase 3, catalog §5 and §7): Groundskeeper, Mechanic, Security Guard, and Performer
 * (plain, or in the Boo costume). Original procedural art drawn around the feet at
 * (0, 0), about guest size; mascots are a little bigger. Deterministic. Owner: W2-B.
 */
import type { Dir } from '../../sim/map';
import { shade } from '../palette';
import type { ArtBounds } from './rides';
import { rrect, type Ctx } from './shapes';

const TAU = Math.PI * 2;

export const STAFF_BOUNDS: ArtBounds = { left: -12, right: 12, top: -30, bottom: 5 };

/** Sprite type codes (frame bits 0–1). */
export const STAFF_TYPE_CODE = { groundskeeper: 0, mechanic: 1, security: 2, performer: 3 } as const;
/** Costume codes (frame bits 2–3): 0 none. Codes 1 and 2 were Frost and Spark (removed with the mascots, Task 24). */
export const COSTUME_CODE = { boo: 3 } as const;

export interface StaffLook {
  /** STAFF_TYPE_CODE value. */
  type: number;
  /** COSTUME_CODE value or 0. */
  costume: number;
  facing: Dir;
  /** 0 standing, 1 and 2 walking steps. */
  walk: number;
  /** 0 idle, 1 and 2 work poses (sweep, wrench, perform). */
  action: number;
}

/** Frame layout: type (2 bits) | costume (2) | walk (2) | action (2). */
export function staffFrame(type: number, costume: number, walk: number, action: number): number {
  return (type & 3) | ((costume & 3) << 2) | ((walk & 3) << 4) | ((action & 3) << 6);
}

export function decodeStaffFrame(frame: number): Omit<StaffLook, 'facing'> {
  return { type: frame & 3, costume: (frame >> 2) & 3, walk: (frame >> 4) & 3, action: (frame >> 6) & 3 };
}

function ellipse(ctx: Ctx, x: number, y: number, rx: number, ry: number, fill: string): void {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
  ctx.fill();
}

function shadow(ctx: Ctx, rx = 4.6): void {
  ellipse(ctx, 0, 0, rx, rx * 0.45, 'rgba(15,25,15,0.3)');
}

function eyes(ctx: Ctx, x: number, y: number, gap: number, r: number): void {
  ellipse(ctx, x - gap, y, r, r * 1.2, '#1b2433');
  ellipse(ctx, x + gap, y, r, r * 1.2, '#1b2433');
}

interface Uniform {
  shirt: string;
  trousers: string;
  hat: 'straw' | 'cap' | 'peaked' | 'top';
  hatColour: string;
}

const UNIFORMS: readonly Uniform[] = [
  { shirt: '#4f9d4a', trousers: '#7a6a45', hat: 'straw', hatColour: '#e8c35a' },
  { shirt: '#3f6fb5', trousers: '#3f6fb5', hat: 'cap', hatColour: '#f39a2b' },
  { shirt: '#26324f', trousers: '#1d2638', hat: 'peaked', hatColour: '#26324f' },
  { shirt: '#d457a8', trousers: '#4f3a7a', hat: 'top', hatColour: '#2b2340' },
];

const SKIN = '#e9b48c';
const HAIR = '#5b3a24';

function human(ctx: Ctx, look: StaffLook): void {
  const u = UNIFORMS[look.type] ?? (UNIFORMS[0] as Uniform);
  const front = look.facing === 1 || look.facing === 2;
  const side = look.facing === 1 || look.facing === 0 ? 1 : -1;
  shadow(ctx);
  // Tools behind the body when facing away.
  if (!front) tool(ctx, look, side);
  const legL = look.walk === 1 ? -1.5 : 0;
  const legR = look.walk === 2 ? -1.5 : 0;
  ctx.fillStyle = u.trousers;
  ctx.fillRect(-3, -6 + legL, 2.4, 6 - legL * 0.5);
  ctx.fillRect(0.6, -6 + legR, 2.4, 6 - legR * 0.5);
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(-3.2, -0.8, 2.8, 1.2);
  ctx.fillRect(0.4, -0.8, 2.8, 1.2);
  // Arms (raised while working).
  ctx.fillStyle = shade(u.shirt, 0.8);
  const armUp = look.action > 0 && look.type !== 0 ? -2.5 : 0;
  ctx.fillRect(-5.2, -11.8 + armUp, 1.7, 5);
  ctx.fillRect(3.5, -11.8 + (look.action === 2 ? armUp : 0), 1.7, 5);
  // Torso.
  ctx.fillStyle = u.shirt;
  ctx.beginPath();
  rrect(ctx, -4.2, -12.8, 8.4, 7.8, 1.8);
  ctx.fill();
  if (look.type === 1) {
    // Mechanic overalls: bib and straps.
    ctx.fillStyle = shade(u.shirt, 1.25);
    ctx.fillRect(-2.4, -11.6, 4.8, 3.6);
  } else if (look.type === 2) {
    // Security: gold badge and belt.
    ctx.fillStyle = '#f2c94c';
    ctx.fillRect(front ? 1 : -2, -11.2, 1.8, 1.8);
    ctx.fillStyle = '#111827';
    ctx.fillRect(-4.2, -6.4, 8.4, 1.2);
  } else if (look.type === 3) {
    // Performer: bright stripes.
    ctx.fillStyle = '#ffd166';
    ctx.fillRect(-4.2, -10.6, 8.4, 1.3);
    ctx.fillRect(-4.2, -8, 8.4, 1.3);
  }
  // Hands.
  ctx.fillStyle = SKIN;
  ctx.fillRect(-5.2, -7.2 + armUp, 1.7, 1.4);
  ctx.fillRect(3.5, -7.2 + (look.action === 2 ? armUp : 0), 1.7, 1.4);
  // Head.
  ellipse(ctx, 0, -15.6, 3.1, 3.1, SKIN);
  if (front) {
    ctx.fillStyle = '#2a1e18';
    ctx.fillRect(side * 0.9 - 1.6, -15.6, 0.9, 0.9);
    ctx.fillRect(side * 0.9 + 0.7, -15.6, 0.9, 0.9);
  } else {
    ellipse(ctx, 0, -15.8, 3.1, 2.9, HAIR);
  }
  hat(ctx, u);
  if (front) tool(ctx, look, side);
}

function hat(ctx: Ctx, u: Uniform): void {
  ctx.fillStyle = u.hatColour;
  switch (u.hat) {
    case 'straw':
      ellipse(ctx, 0, -17.6, 5.6, 1.6, u.hatColour);
      ctx.beginPath();
      rrect(ctx, -2.8, -21, 5.6, 3.6, 1.4, 0);
      ctx.fill();
      ctx.fillStyle = '#4f9d4a';
      ctx.fillRect(-2.8, -18.4, 5.6, 0.9);
      break;
    case 'cap':
      ctx.beginPath();
      ctx.arc(0, -17.4, 3.4, Math.PI, 0);
      ctx.fill();
      ctx.fillRect(-0.5, -17.6, 4.8, 1.1);
      break;
    case 'peaked':
      ctx.beginPath();
      rrect(ctx, -3.6, -20.6, 7.2, 3.4, 1);
      ctx.fill();
      ctx.fillStyle = '#111827';
      ctx.fillRect(-3.8, -17.6, 7.6, 1.1);
      ctx.fillStyle = '#f2c94c';
      ctx.fillRect(-0.8, -19.8, 1.6, 1.6);
      break;
    default:
      ctx.fillRect(-2.6, -24, 5.2, 6);
      ctx.fillRect(-4.4, -18.6, 8.8, 1.2);
      ctx.fillStyle = '#d457a8';
      ctx.fillRect(-2.6, -19.8, 5.2, 1);
  }
}

/** Broom (Groundskeeper) or wrench (Mechanic) in the right hand. */
function tool(ctx: Ctx, look: StaffLook, side: number): void {
  if (look.type === 0) {
    const sweep = look.action === 1 ? -2.5 : look.action === 2 ? 2.5 : 0;
    const hx = 4.3 * side;
    const bx = hx + (3 + sweep) * side;
    ctx.strokeStyle = '#8a5a2b';
    ctx.lineWidth = 1.1;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(hx, -10.5);
    ctx.lineTo(bx, -0.8);
    ctx.stroke();
    ctx.fillStyle = '#d9a441';
    ctx.beginPath();
    ctx.moveTo(bx - 2.2, 0.4);
    ctx.lineTo(bx + 2.2, 0.4);
    ctx.lineTo(bx + 1.2, -2.2);
    ctx.lineTo(bx - 1.2, -2.2);
    ctx.closePath();
    ctx.fill();
  } else if (look.type === 1) {
    const up = look.action > 0 ? -3 : 0;
    const x = 4.4 * side;
    ctx.strokeStyle = '#b8c2cc';
    ctx.lineWidth = 1.3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, -6.6 + up);
    ctx.lineTo(x + 2.2 * side, -10.4 + up);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + 2.6 * side, -11 + up, 1.2, 0, TAU);
    ctx.stroke();
  }
}

// ---------------------------------------------------------------- costumes (original designs)

/** Boo: a small round ghost with a purple glow (catalog §7). Floats a little above the ground. */
function boo(ctx: Ctx, look: StaffLook): void {
  const front = look.facing === 1 || look.facing === 2;
  const float = look.walk === 1 ? -1 : look.walk === 2 ? -2 : -1.5;
  const lift = look.action > 0 ? -1.5 : 0;
  const y0 = float + lift;
  shadow(ctx, 4.4);
  // Purple glow.
  ellipse(ctx, 0, -11 + y0, 9.6, 10.6, 'rgba(155,107,255,0.22)');
  ellipse(ctx, 0, -11 + y0, 7.8, 8.8, 'rgba(155,107,255,0.3)');
  // Body: dome and wavy hem.
  ctx.fillStyle = '#f7f3ff';
  ctx.beginPath();
  ctx.moveTo(-6, -11 + y0);
  ctx.arc(0, -12 + y0, 6, Math.PI, 0);
  ctx.lineTo(6, -3.5 + y0);
  const wave = look.walk === 2 ? 0.8 : 0;
  ctx.quadraticCurveTo(4.5, -1 + y0 - wave, 3, -3.5 + y0);
  ctx.quadraticCurveTo(1.5, -1 + y0 + wave, 0, -3.5 + y0);
  ctx.quadraticCurveTo(-1.5, -1 + y0 - wave, -3, -3.5 + y0);
  ctx.quadraticCurveTo(-4.5, -1 + y0 + wave, -6, -3.5 + y0);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#c9b6ff';
  ctx.lineWidth = 0.7;
  ctx.stroke();
  // Little arms.
  const up = look.action > 0 ? -3 : 0;
  ellipse(ctx, -6.6, -8.5 + y0 + up, 1.6, 1.2, '#f7f3ff');
  ellipse(ctx, 6.6, -8.5 + y0 + (look.action === 2 ? up : 0), 1.6, 1.2, '#f7f3ff');
  if (front) {
    eyes(ctx, 0, -12.6 + y0, 2, 1.1);
    ellipse(ctx, 0, -9.6 + y0, 1.1, 0.8, '#6b4fb8');
    ellipse(ctx, -3.6, -10.4 + y0, 1, 0.6, 'rgba(255,140,190,0.6)');
    ellipse(ctx, 3.6, -10.4 + y0, 1, 0.6, 'rgba(255,140,190,0.6)');
  }
}

export function drawStaffArt(ctx: Ctx, look: StaffLook): void {
  if (look.type === STAFF_TYPE_CODE.performer) {
    if (look.costume === COSTUME_CODE.boo) return boo(ctx, look);
  }
  human(ctx, look);
}
