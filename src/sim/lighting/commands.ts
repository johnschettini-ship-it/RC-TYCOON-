/**
 * After Dark park setting (Phase 4 §4.7, §6). Owner: W3-F.
 *
 * `setAfterDark { on }`: sets `park.afterDark`. Fails with the scenario's reason when the scenario forbids a change
 * (`afterDark: 'forced'` or `'off'`, Phase 5 §4.1 — `afterDarkLocked(state)` in `scenario/api.ts`). In a sandbox the
 * switch is the sandbox's live After Dark option (Phase 5 §4.5), so `options.afterDark` changes with it, exactly as
 * `setSandboxOption { key: 'afterDark' }` does. Turning it on (from off) with `litShare < 0.5` returns the warning
 * "Guests dislike dark paths. Build lamps", which the UI shows as a toast. Free; no ledger line. The light map does
 * not depend on the setting, so nothing else changes.
 */
import { englishText } from '../../data/strings/en';
import { AFTER_DARK_WARN_LIT_SHARE } from '../../data/tuning/night';
import { fail, ok, type AfterDarkCommand, type HandlerMap } from '../commands/types';
import { afterDarkLocked } from '../scenario/api';
import { setSandboxLiveOption } from '../scenario/options';
import type { World } from '../types';
import { litShare } from './api';

/**
 * Switch After Dark (the scenario lock already checked). Returns the command warnings: the dark-path warning when it
 * turns on with `litShare < 0.5`. Shared by `setAfterDark` and the sandbox's `setSandboxOption`.
 */
export function switchAfterDark(world: World, on: boolean): string[] {
  const turningOn = on && !world.state.park.afterDark;
  if (world.state.scenario.kind === 'sandbox') setSandboxLiveOption(world, 'afterDark', on);
  else world.state.park.afterDark = on;
  return turningOn && litShare(world) < AFTER_DARK_WARN_LIT_SHARE ? [englishText('night.warnDarkPaths')] : [];
}

export const afterDarkHandlers: HandlerMap<AfterDarkCommand> = {
  setAfterDark(world, cmd) {
    const locked = afterDarkLocked(world.state);
    if (locked !== null) return fail(locked);
    return ok(0, switchAfterDark(world, cmd.on));
  },
};
