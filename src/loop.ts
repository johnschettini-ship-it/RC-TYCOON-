/** Fixed-step loop math (Phase 0 §4.6). Owner: integrator. */
import { MAX_TICKS_PER_FRAME, TICKS_PER_SECOND } from './data/tuning/core';

export type Speed = 0 | 1 | 2 | 4;

/**
 * Advance the accumulator by `elapsedMs` at `speed`. Returns ticks to run now.
 * At most MAX_TICKS_PER_FRAME per call; extra time is dropped so game time slows instead of jumping.
 */
export function advance(accMs: number, elapsedMs: number, speed: Speed): { ticks: number; accMs: number } {
  if (speed === 0) return { ticks: 0, accMs: 0 };
  const tickMs = 1000 / (TICKS_PER_SECOND * speed);
  let acc = accMs + Math.max(0, elapsedMs);
  let ticks = Math.floor(acc / tickMs);
  if (ticks > MAX_TICKS_PER_FRAME) {
    ticks = MAX_TICKS_PER_FRAME;
    acc = 0;
  } else {
    acc -= ticks * tickMs;
  }
  return { ticks, accMs: acc };
}

/** Interpolation factor in [0, 1) for rendering between ticks. */
export function alphaOf(accMs: number, speed: Speed): number {
  if (speed === 0) return 0;
  const tickMs = 1000 / (TICKS_PER_SECOND * speed);
  return Math.min(0.999, accMs / tickMs);
}
