/**
 * What to play for the facts of one frame (Phase 6 §4.2). Owner: W4-A. Pure, so it is unit-tested without audio.
 * Neutral stubs: nothing plays.
 *
 * Sources: sim `sound` events (`src/sim/sound.ts`: sale/tickets → `cash_in`, `rideCycleStart` → `ride_bell`,
 * `trainDrop` → `coaster_cheer`, `splash` → `splash`), `message` events of category `breakdown` → `breakdown`,
 * `award` events → `award` (up for positive, down for negative), `show` events and show state (fireworks and beam
 * sounds follow the render timing of W4-C), and command results (`game.onCommand`: success → `build_place`,
 * `build_path` (max 8/s), `demolish`; failure → `ui_error`). Panel opens and button presses → `ui_open`, `ui_click`.
 */
import type { Command, CommandResult } from '../sim/commands';
import type { SimEvent } from '../sim/types';
import type { SoundRequest } from './types';

export function requestsForEvents(events: readonly SimEvent[]): SoundRequest[] {
  void events;
  return [];
}

export function requestsForCommand(cmd: Command, result: CommandResult): SoundRequest[] {
  void cmd;
  void result;
  return [];
}
