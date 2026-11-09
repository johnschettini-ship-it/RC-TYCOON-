/**
 * Web Audio engine (Phase 6 §4.1). Owner: W4-A. Neutral stub: silent, never creates an `AudioContext`.
 *
 * Contract: graph sources → bus gain (`ui`, `sfx`, `ambience`, `music`) → master gain → `DynamicsCompressorNode` →
 * destination; 24 SFX voices with stealing of the oldest voice of lower or equal priority; 60 ms same-id cooldown;
 * falloff `(max(0, 1 − d / R))²` with `R = 24 / zoom` tiles and a `StereoPannerNode` pan of
 * `clamp(dxScreen / (width / 2), −1, 1) × 0.6`; hidden-tab ramp and suspend. `createContext` is injectable so unit
 * tests use a fake `AudioContext` (Node has none).
 */
import type { AudioEngine } from './types';

export interface EngineOptions {
  /** Makes the `AudioContext` on the first unlock (default: `new AudioContext()`). */
  createContext?: () => BaseAudioContext;
  /** Seed of the audio RNG (thunder timing, cheer voices); never the sim RNG. */
  seed?: number;
}

export function createAudioEngine(opts: EngineOptions = {}): AudioEngine {
  void opts;
  return {
    unlock() {},
    state: () => 'none',
    setVolumes() {},
    play() {},
    update() {},
    setHidden() {},
    musicHost: () => null,
  };
}
