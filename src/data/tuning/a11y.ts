/** Accessibility and touch tuning (Phase 6 §4.7, §8). Owner: W4-F. Spec values. */

/** Text scale steps (Settings → Display). Nothing clips at 175% on 1280 × 720 and 375 × 667. */
export const TEXT_SCALES = [100, 125, 150, 175] as const;
/** Long-press time options (Settings → Controls); default 500 ms. */
export const LONG_PRESS_OPTIONS_MS = [400, 500, 700] as const;
/** Drag threshold (Phase 6 §8 raises Phase 1's 6 px to 8 px). */
export const DRAG_THRESHOLD_PX = 8;
/** Touch targets ≥ 44 × 44 CSS px (primary buttons 48), 8 px gaps; focus ring 3 px. */
export const TOUCH_TARGET_PX = 44;
export const PRIMARY_TARGET_PX = 48;
export const TARGET_GAP_PX = 8;
export const FOCUS_RING_PX = 3;
/** Colour-blind safe palette (blue–orange family). */
export const SAFE_PALETTE = ['#0072B2', '#56B4E9', '#E69F00', '#D55E00'] as const;
