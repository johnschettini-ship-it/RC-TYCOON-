/**
 * Show effects (Phase 6 §4.4 "Rendering (render only, not sim)"). Owner: W4-C. Pure functions of the show plan and the
 * show time `t` (ticks after the start, fractional), drawn in device px with `lighter` so they glow over the night:
 *
 * - Lightshow: 6 beams from the tower top, colours cycling through the theme palette at each sweep, the fan turning
 *   back and forth at 30° per second (odd beams the other way). Reduced motion: still beams that pulse slowly.
 * - Fireworks: rockets with a short trail, then bursts of 40–80 particles with drag, gravity, and fade; a flash at
 *   each burst; at most `MAX_FIREWORK_PARTICLES` particles a frame. Reduced motion: soft glow circles at the burst
 *   points that swell and fade in place (no rockets, no particles).
 *
 * Particle positions are closed-form in `t` (no per-frame state), so pausing, scrubbing, or replaying gives the same
 * picture. The frame loop allocates nothing but the gradients it draws.
 */
import { LIGHTSHOW_BEAMS, MAX_FIREWORK_PARTICLES } from '../../data/tuning/shows';
import { paletteColour } from './palette';
import { hash01 } from './rng';
import { SWEEP_DEG, SWEEP_TICKS, type Rocket, type ShowPlan } from './timeline';

/** The part of a 2D context the effects use (the real canvas, or a recording fake in tests). */
export interface FxCtx {
  globalCompositeOperation: string;
  globalAlpha: number;
  fillStyle: unknown;
  strokeStyle: unknown;
  lineWidth: number;
  save(): void;
  restore(): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  arc(x: number, y: number, r: number, a0: number, a1: number): void;
  fill(): void;
  stroke(): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): { addColorStop(o: number, c: string): void };
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): { addColorStop(o: number, c: string): void };
}

/** What one frame drew (the Playwright reduced-motion check and the perf overlay read it). */
export interface FxStats {
  beams: number;
  rockets: number;
  particles: number;
  flashes: number;
  glows: number;
}

export function emptyFxStats(): FxStats {
  return { beams: 0, rockets: 0, particles: 0, flashes: 0, glows: 0 };
}

export function resetFxStats(s: FxStats): void {
  s.beams = 0;
  s.rockets = 0;
  s.particles = 0;
  s.flashes = 0;
  s.glows = 0;
}

/** Beam length and widths (world px at zoom 1). */
export const BEAM_LENGTH = 560;
const BEAM_HALF_WIDTH_END = 30;
const BEAM_HALF_WIDTH_START = 3;
/** The fan of the 6 beams around straight up (degrees). */
const FAN_DEG = 100;
/** Reduced motion: one slow pulse every 8 s. */
export const PULSE_TICKS = 160;
/** Particles: gravity (world px per tick²), drag rate (per tick), head size (world px), streak length (ticks). */
const GRAVITY = 0.045;
const DRAG = 0.045;
const PARTICLE_PX = 3.2;
const STREAK_TICKS = 4;
/** Sparks are white for their first ticks. */
const HOT_TICKS = 5;
/** Burst flash (ticks, world px). */
const FLASH_TICKS = 7;
const FLASH_RADIUS = 34;
/** Reduced-motion glow: rises over GLOW_IN, holds, fades over GLOW_OUT (ticks); radius in world px. */
export const GLOW_IN = 16;
export const GLOW_OUT = 40;
const GLOW_RADIUS = 58;

const DEG = Math.PI / 180;

/** `rgba()` of a #rrggbb colour. */
export function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a < 0 ? 0 : a > 1 ? 1 : Math.round(a * 1000) / 1000})`;
}

/** Sweep offset (degrees, −30 … +30) of the beam fan at show time `t`: a triangle wave at 30° per second. */
export function sweepOffset(t: number): number {
  const half = SWEEP_DEG / 2;
  const period = 2 * SWEEP_TICKS;
  const p = ((t % period) + period) % period;
  return p < SWEEP_TICKS ? -half + (SWEEP_DEG * p) / SWEEP_TICKS : half - (SWEEP_DEG * (p - SWEEP_TICKS)) / SWEEP_TICKS;
}

/** Angle from straight up (degrees, screen space) of beam `k` at show time `t`; still under reduced motion. */
export function beamAngle(k: number, t: number, reduced: boolean): number {
  const base = -FAN_DEG / 2 + (FAN_DEG * k) / (LIGHTSHOW_BEAMS - 1);
  if (reduced) return base;
  const off = sweepOffset(t);
  return base + (k % 2 === 0 ? off : -off);
}

/** Reduced-motion beam brightness (0.35 … 0.65), one slow pulse every `PULSE_TICKS`. */
export function pulseAlpha(t: number): number {
  return 0.5 + 0.15 * Math.sin((2 * Math.PI * t) / PULSE_TICKS);
}

/**
 * Lightshow beams from the tower top at device (ox, oy); `scale` = device px per world px. Returns beams drawn.
 */
export function drawLightshow(ctx: FxCtx, plan: ShowPlan, palette: readonly string[], t: number, ox: number, oy: number, scale: number, reduced: boolean, stats: FxStats): number {
  if (t < 0 || t >= plan.length) return 0;
  const sweep = Math.floor(t / SWEEP_TICKS);
  // Fade in over the first second, out over the last.
  const edge = Math.min(1, t / 20, (plan.length - t) / 20);
  const alpha = (reduced ? pulseAlpha(t) : 0.62) * edge;
  const len = BEAM_LENGTH * scale;
  const w0 = BEAM_HALF_WIDTH_START * scale;
  const w1 = BEAM_HALF_WIDTH_END * scale;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let k = 0; k < LIGHTSHOW_BEAMS; k++) {
    const a = beamAngle(k, t, reduced) * DEG;
    const dx = Math.sin(a);
    const dy = -Math.cos(a);
    const nx = -dy;
    const ny = dx;
    const colour = paletteColour(palette, reduced ? k : plan.colourStart + sweep * plan.colourStep + k);
    const ex = ox + dx * len;
    const ey = oy + dy * len;
    const g = ctx.createLinearGradient(ox, oy, ex, ey);
    g.addColorStop(0, rgba(colour, alpha));
    g.addColorStop(0.55, rgba(colour, alpha * 0.35));
    g.addColorStop(1, rgba(colour, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(ox + nx * w0, oy + ny * w0);
    ctx.lineTo(ex + nx * w1, ey + ny * w1);
    ctx.lineTo(ex - nx * w1, ey - ny * w1);
    ctx.lineTo(ox - nx * w0, oy - ny * w0);
    ctx.closePath();
    ctx.fill();
    stats.beams++;
  }
  // The lamp head blazes while the beams are on.
  const glow = ctx.createRadialGradient(ox, oy, 0, ox, oy, 16 * scale);
  glow.addColorStop(0, rgba('#ffffff', 0.9 * edge));
  glow.addColorStop(1, rgba(paletteColour(palette, plan.colourStart + sweep * plan.colourStep), 0));
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(ox, oy, 16 * scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  return LIGHTSHOW_BEAMS;
}

/** Rocket position (world px offset from the mouth) at flight fraction p (ease-out climb). */
function rocketAt(k: Rocket, p: number): { x: number; y: number } {
  const e = 1 - (1 - p) * (1 - p);
  return { x: k.dx * p, y: -k.rise * e };
}

/** Distance travelled after `dt` ticks with drag (world px per unit speed). */
function dragDistance(dt: number): number {
  return (1 - Math.exp(-DRAG * dt)) / DRAG;
}

/** Particles alive at show time `t` (before the per-frame cap). */
export function particlesAt(plan: ShowPlan, t: number): number {
  let n = 0;
  for (const k of plan.rockets) {
    const dt = t - k.burstAt;
    if (dt >= 0 && dt < k.life) n += k.count;
  }
  return n;
}

function drawGlowDisc(ctx: FxCtx, x: number, y: number, r: number, colour: string, a: number): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba('#ffffff', a));
  g.addColorStop(0.25, rgba(colour, a * 0.8));
  g.addColorStop(1, rgba(colour, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/** Reduced-motion glow brightness of a burst `dt` ticks after it (0 when gone). */
export function glowAlpha(dt: number, life: number): number {
  if (dt < 0) return 0;
  const hold = life;
  if (dt < GLOW_IN) return (0.55 * dt) / GLOW_IN;
  if (dt < GLOW_IN + hold) return 0.55;
  const out = dt - GLOW_IN - hold;
  return out < GLOW_OUT ? 0.55 * (1 - out / GLOW_OUT) : 0;
}

/**
 * Fireworks from the launcher mouth at device (ox, oy). Returns the particles drawn (never more than
 * `MAX_FIREWORK_PARTICLES`, shared with `budget`: the particles other launchers already drew this frame).
 */
export function drawFireworks(ctx: FxCtx, plan: ShowPlan, palette: readonly string[], t: number, ox: number, oy: number, scale: number, reduced: boolean, stats: FxStats): number {
  if (t < 0) return 0;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  let drawn = 0;
  const size = Math.max(1, PARTICLE_PX * scale);
  for (const k of plan.rockets) {
    if (t < k.launchAt) break;
    const bx = ox + k.dx * scale;
    const by = oy - k.rise * scale;
    const c1 = paletteColour(palette, k.colour);
    if (reduced) {
      const a = glowAlpha(t - k.burstAt, Math.min(k.life, 24));
      if (a <= 0) continue;
      drawGlowDisc(ctx, bx, by, GLOW_RADIUS * scale, c1, a);
      stats.glows++;
      continue;
    }
    if (t < k.burstAt) {
      // Rocket climbing with a short trail.
      const p = (t - k.launchAt) / (k.burstAt - k.launchAt);
      const head = rocketAt(k, p);
      const tail = rocketAt(k, Math.max(0, p - 0.18));
      ctx.strokeStyle = rgba('#ffe7a3', 0.75);
      ctx.lineWidth = Math.max(1, 1.6 * scale);
      ctx.beginPath();
      ctx.moveTo(ox + tail.x * scale, oy + tail.y * scale);
      ctx.lineTo(ox + head.x * scale, oy + head.y * scale);
      ctx.stroke();
      ctx.fillStyle = '#fff6d8';
      ctx.fillRect(ox + head.x * scale - size / 2, oy + head.y * scale - size / 2, size, size);
      stats.rockets++;
      continue;
    }
    const dt = t - k.burstAt;
    if (dt >= k.life) continue;
    if (dt < FLASH_TICKS) {
      drawGlowDisc(ctx, bx, by, FLASH_RADIUS * scale, c1, 0.85 * (1 - dt / FLASH_TICKS));
      stats.flashes++;
    }
    const fade = 1 - dt / k.life;
    const c2 = paletteColour(palette, k.colour2);
    const a = fade * fade * 0.95 + 0.05;
    // Each particle: a short streak from where it was STREAK_TICKS ago, then a bright head.
    const dist = dragDistance(dt) * k.speed * scale;
    const fall = 0.5 * GRAVITY * dt * dt * scale;
    const dt0 = Math.max(0, dt - STREAK_TICKS);
    const dist0 = dragDistance(dt0) * k.speed * scale;
    const fall0 = 0.5 * GRAVITY * dt0 * dt0 * scale;
    ctx.lineWidth = Math.max(1, 1.2 * scale);
    for (let pass = 0; pass < 2; pass++) {
      const colour = pass === 0 ? c1 : c2;
      const start = stats.particles;
      ctx.strokeStyle = rgba(colour, a * 0.7);
      ctx.beginPath();
      for (let i = pass; i < k.count; i += 2) {
        if (stats.particles >= MAX_FIREWORK_PARTICLES) break;
        const ang = (2 * Math.PI * i) / k.count + (hash01(k.seed, i) - 0.5) * 0.35;
        const sp = 0.55 + 0.45 * hash01(k.seed ^ 0x5bd1e995, i);
        const cx = Math.cos(ang) * sp;
        const cy = Math.sin(ang) * sp;
        ctx.moveTo(bx + cx * dist0, by + cy * dist0 + fall0);
        ctx.lineTo(bx + cx * dist, by + cy * dist + fall);
        stats.particles++;
      }
      ctx.stroke();
      const n = stats.particles - start;
      // Young sparks burn white-hot, then take the burst colour.
      ctx.fillStyle = dt < HOT_TICKS ? rgba('#fff8e1', a) : rgba(colour, a);
      for (let i = pass, m = 0; i < k.count && m < n; i += 2, m++) {
        const ang = (2 * Math.PI * i) / k.count + (hash01(k.seed, i) - 0.5) * 0.35;
        const sp = 0.55 + 0.45 * hash01(k.seed ^ 0x5bd1e995, i);
        const x = bx + Math.cos(ang) * dist * sp;
        const y = by + Math.sin(ang) * dist * sp + fall;
        ctx.fillRect(x - size / 2, y - size / 2, size, size);
      }
      drawn += n;
    }
  }
  ctx.restore();
  return drawn;
}
