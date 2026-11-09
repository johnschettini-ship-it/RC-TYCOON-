/**
 * Global key handlers (Wave 4.0 contract). Owner: integrator. `input/index.ts` asks each handler, in order, after
 * the track builder's keys and before the key map (`./keyboard.ts`), so Build 3 cards add keys from their own folders:
 * - `a11yKeys` (W4-F, `src/a11y/keys.ts`): `C` map cursor, arrows / `Enter` / `Shift` + arrows while the cursor is
 *   on, `?` shortcut list. All Phase 1 shortcuts stay (a handler returns false for keys it does not use).
 * - `perfKeys` (W4-E, `src/perf/keys.ts`): `F3` performance overlay.
 * Handlers are pure input logic over `Game` (no DOM); a handler that used the key returns true.
 */
import type { Game } from '../game';
import { a11yKeys } from '../a11y/keys';
import { perfKeys } from '../perf/keys';

export interface KeyHandler {
  /** `key` is `KeyboardEvent.key`; `repeat` for held keys. Return true when used (the event's default is prevented). */
  keyDown(game: Game, key: string, mods: { shift: boolean; repeat: boolean }): boolean;
  keyUp?(game: Game, key: string): void;
}

export const KEY_HANDLERS: readonly KeyHandler[] = [a11yKeys, perfKeys];
