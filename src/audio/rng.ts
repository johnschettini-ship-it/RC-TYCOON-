/**
 * The audio RNG (Phase 6 §4.1): mulberry32 with its own state, separate from `GameState.rng`. Owner: W4-A. Noise
 * buffers, thunder timing, cheer voices, and firework crackle use it; audio never touches the sim RNG.
 */
import { rngNext, type RngHolder } from '../sim/rng';

export interface AudioRng {
  /** [0, 1). */
  next(): number;
  /** [min, max). */
  range(min: number, max: number): number;
  /** Integer in [min, max], both inclusive. */
  int(min: number, max: number): number;
}

export function createAudioRng(seed: number): AudioRng {
  const holder: RngHolder = { rng: seed | 0 };
  const next = (): number => rngNext(holder);
  return {
    next,
    range: (min, max) => min + (max - min) * next(),
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
  };
}
