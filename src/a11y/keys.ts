/**
 * Keyboard play keys (Phase 6 §4.7). Owner: W4-F. Neutral stub: uses no key.
 * Contract: `C` toggles the map cursor (state in `./cursor.ts`); while it is on, arrows move it, `Enter` acts as a
 * click at the cursor (through the input controller, so tools behave as with a pointer), `Shift` + arrows extend a
 * path drag, `R` rotates, `Esc` cancels; `?` opens the shortcut list. Keys typed into fields never reach handlers.
 */
import type { KeyHandler } from '../input/keyHandlers';

export const a11yKeys: KeyHandler = {
  keyDown: () => false,
};
