/**
 * After Dark park setting (Phase 4 §4.7, §6). Owner: W3-F.
 *
 * `setAfterDark { on }`: sets `park.afterDark`. Fails with the scenario's reason when the scenario forbids a change
 * (`afterDark: 'forced'` or `'off'`, Phase 5 §4.1 — `afterDarkLocked(state)` in `scenario/api.ts`). Turning it on
 * (from off) with `litShare < 0.5` returns the warning "Guests dislike dark paths. Build lamps", which the UI shows
 * as a toast. Free; no ledger line. The light map does not depend on the setting, so nothing else changes.
 */
import { text } from '../../data/strings/en';
import { AFTER_DARK_WARN_LIT_SHARE } from '../../data/tuning/night';
import { fail, ok, type AfterDarkCommand, type HandlerMap } from '../commands/types';
import { afterDarkLocked } from '../scenario/api';
import { litShare } from './api';

export const afterDarkHandlers: HandlerMap<AfterDarkCommand> = {
  setAfterDark(world, cmd) {
    const park = world.state.park;
    const locked = afterDarkLocked(world.state);
    if (locked !== null) return fail(locked);
    const turningOn = cmd.on && !park.afterDark;
    park.afterDark = cmd.on;
    if (turningOn && litShare(world) < AFTER_DARK_WARN_LIT_SHARE) return ok(0, [text('night.warnDarkPaths')]);
    return ok(0, []);
  },
};
