/**
 * After Dark park setting (Phase 4 §4.7, §6). Owner: W3-F.
 *
 * Contract for `setAfterDark { on }`: sets `park.afterDark`. Fails with a reason when the scenario forbids it
 * (`afterDark: 'forced'` or `'off'` in the scenario definition, Phase 5 §4.1 — ask `afterDarkLocked(state)` in
 * `scenario/api.ts`). Turning it on with `litShare < 0.5` returns the warning "Guests dislike dark paths. Build lamps".
 * Free; no ledger line. Stub: returns "Not implemented yet" and changes nothing.
 */
import { notImplemented, type AfterDarkCommand, type HandlerMap } from '../commands/types';

export const afterDarkHandlers: HandlerMap<AfterDarkCommand> = {
  setAfterDark: notImplemented,
};
