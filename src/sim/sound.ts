/**
 * Sound cues from the simulation (Phase 6 §2, §4.1–4.2). Owner: integrator (contract).
 *
 * The sim states facts; the audio module (`src/audio/`, W4-A) decides what plays, where, and how loud. Sound events
 * are never saved and the sim never reads them, so they cannot change the state hash. Facts the client already has
 * are not cues: command results (build, path, demolish, error), `message` events (breakdowns), `award` events, and
 * `show` events. Loops (chain lift, rumble, rain, crowd) come from reading `GameState` each frame.
 *
 * | Cue | Emitted by | `entityId` | `value` | SFX (W4-A) |
 * |---|---|---|---|---|
 * | `sale` | a stall sale (`guests/buying.ts`) | stall | price (cents) | `cash_in` |
 * | `rideTicket` | a guest pays to board (`guests/api.ts`) | ride | price (cents) | `cash_in` |
 * | `entranceTicket` | a guest pays the entrance fee (`guests/arrivals.ts`) | −1 | fee (cents) | `cash_in` |
 * | `rideCycleStart` | a flat ride starts running, a train leaves a station | ride | 0 | `ride_bell` |
 * | `trainDrop` | a train with riders finishes a drop > 10 m (W4-D, track) | ride | drop in m | `coaster_cheer` |
 * | `splash` | a boat hits a splashdown or rapids splash (W4-D, track) | ride | 0 | `splash` |
 */
import type { World } from './types';
import type { EntityId } from './units';

export type SoundCue = 'sale' | 'rideTicket' | 'entranceTicket' | 'rideCycleStart' | 'trainDrop' | 'splash';

export const SOUND_CUES: readonly SoundCue[] = ['sale', 'rideTicket', 'entranceTicket', 'rideCycleStart', 'trainDrop', 'splash'];

/**
 * Sound events are dropped while this many events are pending: a client drains every frame, so only headless runs
 * (tests, benchmarks, the worker before a drain) ever reach it.
 */
export const MAX_PENDING_EVENTS_FOR_SOUND = 512;

/** Push a sound cue. `tile` −1 = not on the map. */
export function emitSound(world: World, cue: SoundCue, tile: number, entityId: EntityId, value = 0): void {
  if (world.events.length >= MAX_PENDING_EVENTS_FOR_SOUND) return;
  world.events.push({ type: 'sound', cue, tile, entityId, value });
}
