import type { Cents } from '../units';

/** Park slice. Owner: W1-E (economy/rating) except `name` (commands). */
export interface ParkState {
  name: string;
  cash: Cents;
  entranceFee: Cents;
  open: boolean;
  /** 0–1000. */
  rating: number;
  /** Guests who turned away at the gate because the fee was too high (all time). */
  turnedAway: number;
  /** Final happiness (0–255) of the last 200 guests who left. */
  recentLeavers: number[];
  /** Fractional arrivals carried between ticks, in thousandths of a guest. */
  arrivalCarry: number;
  guestsArrivedTotal: number;
  /** Phase 4 §4.7: After Dark on (night effects). New Build 2 parks: on; migrated Build 1 parks: off. Owner: W3-F. */
  afterDark: boolean;
  /** Phase 4 §4.9: price per tile of land for sale (state 2) and of construction rights (state 4). Owner: W3-G. */
  landPrice: Cents;
  rightsPrice: Cents;
}

/** Master rule R7. All neutral in Build 1. Phase 5 changes them. */
export interface Modifiers {
  arrivals: number;
  priceTolerance: number;
  happinessDecay: number;
  researchSpeed: number;
  breakdownChance: number;
  loanInterest: number;
  ratingBonus: number;
}

export function neutralModifiers(): Modifiers {
  return {
    arrivals: 1,
    priceTolerance: 1,
    happinessDecay: 1,
    researchSpeed: 1,
    breakdownChance: 1,
    loanInterest: 1,
    ratingBonus: 0,
  };
}
