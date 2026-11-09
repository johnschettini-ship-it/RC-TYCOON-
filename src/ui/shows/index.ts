/**
 * After Dark show UI (Phase 6 §4.4, §7). Owner: W4-C. Neutral stub: no toolbar entry, no panel, no toasts.
 *
 * Contract: a picker entry for the 2 show sites (unlocked ones; selects tool `placeShowSite`); the show site panel
 * (`panels.showSite`: schedule hour and minute steppers, every-N-days picker, enabled switch, cost per show, last show
 * watchers, total cost; commands `setShowSchedule`, `setShowEnabled`); `onEvents`: a `show` event with phase
 * `cancelled` toasts "Not enough cash for the show" (`shows.notEnoughCash`).
 */
import type { UiExtension } from '../extensions';

export const showsUi: UiExtension = {};
