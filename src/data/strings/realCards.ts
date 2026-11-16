/**
 * Realistic card frames (realistic title and cards, Task 3; `src/ui/decks/realAfford.ts`). No final period (master R4).
 * `./en.ts` adds them only in the VITE_ART=real build, so the website's string table is unchanged.
 */
export const realCardsStrings: Record<string, string> = {
  /** The accessible description of a ride or stall card the park cannot pay for (its picture is dimmed). */
  'ui.card.cantAfford': 'Not enough cash',
};
