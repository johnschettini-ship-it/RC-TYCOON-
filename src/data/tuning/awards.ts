/** Monthly awards (Phase 5 §4.10, §8). Owner: W3-I. */
export const AWARD_MIN_GUESTS_POSITIVE = 100;
export const AWARD_MIN_GUESTS_NEGATIVE = 50;
export const AWARD_ARRIVALS_POSITIVE = 1.1;
export const AWARD_ARRIVALS_NEGATIVE = 0.9;
export const AWARD_RATING_POSITIVE = 20;
export const AWARD_RATING_NEGATIVE = -20;
export const AWARD_ARRIVALS_CLAMP = [0.7, 1.3] as const;
export const AWARD_RATING_CLAMP = [-60, 60] as const;
