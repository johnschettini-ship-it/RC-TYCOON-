/**
 * The queue card's content (queue clarity spec 2026-11-18 §2–3), pure so it can be tested without a page. A tapped
 * queue node shows its ride's name, "Queue: N guests" (`ride.queue.length`, the count the ride panel shows) and that
 * ride to open; a queue no ride owns says "This queue reaches no ride". A ride whose entrance sits on this queue but
 * does not own it is named in a warning. Hints only.
 */
import { t as plural } from '../../data/strings/index';
import { text } from '../../data/strings/en';
import { queueComponent, queueConflicts, type QueueConflict } from '../../sim/pathing/queues';
import type { World } from '../../sim/types';

export interface QueueCard {
  /** The ride that owns the queue, or null. */
  rideId: number | null;
  title: string;
  /** "Queue: N guests", or null for a queue no ride owns. */
  count: string | null;
  /** Warnings, in order. */
  lines: string[];
}

function rideName(world: World, id: number): string {
  return world.state.rides.find((r) => r.id === id)?.name ?? '';
}

/** "The {ride} line touches the {owner} line. Guests in it only go to {owner}". */
export function touchesText(world: World, c: QueueConflict): string {
  return text('queue.warn.touches', { ride: rideName(world, c.rideId), owner: rideName(world, c.ownerId) });
}

/** The card of queue node `node`, or null when `node` is no longer a queue node. */
export function queueCard(world: World, node: number): QueueCard | null {
  const group = queueComponent(world, node);
  if (group.nodes.length === 0) return null;
  const ride = group.owner === null ? undefined : world.state.rides.find((r) => r.id === group.owner);
  if (!ride) return { rideId: null, title: text('queue.card.title'), count: null, lines: [text('queue.card.noRide')] };
  const lines = queueConflicts(world)
    .filter((c) => c.ownerId === ride.id)
    .map((c) => touchesText(world, c));
  return { rideId: ride.id, title: ride.name, count: plural('queue.card.count', { n: ride.queue.length }), lines };
}
