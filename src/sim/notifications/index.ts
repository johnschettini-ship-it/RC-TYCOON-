/** Owner: W1-I. Message log (Phase 3 §4.14). */
import { MESSAGE_MAX } from '../../data/tuning/management';
import { emit } from '../events';
import type { Message, MessageCategory } from '../management/types';
import { isHourStart } from '../time';
import type { World } from '../types';
import type { EntityId } from '../units';

/** Append a message to the log and emit a `message` event for toasts. */
export function notify(
  world: World,
  category: MessageCategory,
  textId: string,
  opts: { params?: Record<string, string | number>; tile?: number; entityId?: EntityId } = {},
): void {
  const m = world.state.management;
  const tile = opts.tile ?? -1;
  const entityId = opts.entityId ?? -1;
  const msg: Message =
    opts.params === undefined
      ? { id: m.nextMessageId, tick: world.state.tick, category, textId, tile, entityId }
      : { id: m.nextMessageId, tick: world.state.tick, category, textId, params: { ...opts.params }, tile, entityId };
  m.nextMessageId += 1;
  m.messages.push(msg);
  emit(
    world,
    opts.params === undefined
      ? { type: 'message', category, textId, tile, entityId }
      : { type: 'message', category, textId, params: { ...opts.params }, tile, entityId },
  );
}

/**
 * Every tick (tick order R13): keep the newest `MESSAGE_MAX` messages.
 * At hour starts also clear entity targets that point to no live entity (§5 integrity rule).
 */
export function pruneMessages(world: World): void {
  const m = world.state.management;
  if (m.messages.length > MESSAGE_MAX) m.messages.splice(0, m.messages.length - MESSAGE_MAX);
  if (isHourStart(world.state.tick)) sweepDeadTargets(world);
}

/** Number of messages newer than `messagesReadUpTo` (unread badge). */
export function unreadCount(world: World): number {
  const upTo = world.state.management.messagesReadUpTo;
  let n = 0;
  for (const msg of world.state.management.messages) if (msg.id > upTo) n++;
  return n;
}

/** Move the read marker forward to `upToId` (clamped to the newest id). Never moves back. */
export function markMessagesRead(world: World, upToId: number): void {
  const m = world.state.management;
  const newest = m.nextMessageId - 1;
  const target = Math.min(Math.floor(upToId), newest);
  if (target > m.messagesReadUpTo) m.messagesReadUpTo = target;
}

/** An entity was removed: messages keep their tile but lose the entity target. */
export function forgetEntityInMessages(world: World, entityId: EntityId): void {
  for (const msg of world.state.management.messages) if (msg.entityId === entityId) msg.entityId = -1;
}

/** Ids of every live entity a message may target (rides, stalls, staff, guests). */
export function liveEntityIds(world: World): Set<EntityId> {
  const s = world.state;
  const ids = new Set<EntityId>();
  for (const r of s.rides) ids.add(r.id);
  for (const st of s.stalls) ids.add(st.id);
  for (const g of s.guests) ids.add(g.id);
  for (const st of s.staff.members) ids.add(st.id);
  return ids;
}

function sweepDeadTargets(world: World): void {
  const msgs = world.state.management.messages;
  if (!msgs.some((msg) => msg.entityId !== -1)) return;
  const live = liveEntityIds(world);
  for (const msg of msgs) if (msg.entityId !== -1 && !live.has(msg.entityId)) msg.entityId = -1;
}
