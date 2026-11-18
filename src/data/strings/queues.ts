/** Queue clarity (spec 2026-11-18 §2–3): the queue card and the queue warnings. Owner: queue clarity. No final period. */
export const queueStrings: Record<string, string> = {
  /** Title of the card of a queue that no ride owns. */
  'queue.card.title': 'Queue',
  'queue.card.openRide': 'Open ride',
  'queue.card.noRide': 'This queue reaches no ride',
  /** A ride's entrance sits on a queue a lower-numbered ride claimed first (`queueConflicts`). */
  'queue.warn.touches': 'The {ride} line touches the {owner} line. Guests in it only go to {owner}',
};
