/** Phase 7 interface tuning: mood lean, hand and tip timing, card gestures. */
export const LEAN_BALANCE_POINTS = 10;
export const MOOD_UPDATE_MS = 500;
export const HAND_REFRESH_MS = 500;
export const TIP_CHECK_MS = 2000;
export const TIP_MIN_GUESTS = 20;
export const TIP_GAP_POINTS = 15;
export const CARD_DRAG_PX = 8;
export const CARD_LIFT_PX = 12;

/** Path step builder (touch controls spec §3): a held Turn left / Forward / Turn right repeats after this long… */
export const STEP_HOLD_MS = 400;
/** …then once every this many ms while it is held. */
export const STEP_REPEAT_MS = 300;
