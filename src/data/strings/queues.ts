/**
 * Queue clarity (spec 2026-11-18 §2–3): the queue card and the queue warnings; path clarity (spec 2026-11-18): the ride
 * reach status. No final period.
 */
export const queueStrings: Record<string, string> = {
  /** Title of the card of a queue that no ride owns. */
  'queue.card.title': 'Queue',
  'queue.card.openRide': 'Open ride',
  'queue.card.noRide': 'This queue reaches no ride',
  /** A ride's entrance sits on a queue a lower-numbered ride claimed first (`queueConflicts`). */
  'queue.warn.touches': 'The {ride} line touches the {owner} line. Guests in it only go to {owner}',
  // Path clarity (spec 2026-11-18 §2–3): can guests reach the ride? First failing step wins.
  'ride.reach.noQueue': 'No queue at the entrance',
  'ride.reach.noFootpath': 'No footpath reaches the queue',
  'ride.reach.closed': 'The ride is closed',
  'ride.reach.ok': 'Guests can reach this ride',
  'ride.reach.showMe': 'Show me',
};
