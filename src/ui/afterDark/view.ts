/** After Dark switch text and state for the park panel (Phase 4 §7). Owner: W3-F. Pure. */
import { text } from '../../data/strings/en';
import type { GameState } from '../../sim/types';

export interface AfterDarkView {
  /** Visible switch text, also its accessible name. */
  label: string;
  pressed: boolean;
  /** The scenario fixes the setting (Phase 5 §4.1 `afterDark: 'forced'` or `'off'`). */
  disabled: boolean;
  help: string;
  /** "64%" of footpath tiles lit. */
  litPaths: string;
}

export function afterDarkView(state: GameState, litShare: number, locked: string | null): AfterDarkView {
  const on = state.park.afterDark;
  return {
    label: text(on ? 'night.switchOn' : 'night.switchOff'),
    pressed: on,
    disabled: locked !== null,
    help: locked ?? text(on ? 'night.help' : 'night.helpOff'),
    litPaths: text('night.litPathsValue', { percent: Math.round(Math.max(0, Math.min(1, litShare)) * 100) }),
  };
}
