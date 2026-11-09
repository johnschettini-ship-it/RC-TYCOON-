import { describe, expect, it } from 'vitest';
import { forgetEntityInMessages, notify, pruneMessages, unreadCount } from '../../../src/sim/notifications';
import { executeCommand } from '../../../src/sim/commands';
import { MESSAGE_MAX } from '../../../src/data/tuning/management';
import { TICKS_PER_HOUR } from '../../../src/data/tuning/core';
import { addGuestDirect, makeTestWorld, placeRideDirect } from '../../helpers/world';

describe('message log (Phase 3 §4.14)', () => {
  it('notify appends a message with ascending ids and emits a message event', () => {
    const w = makeTestWorld();
    notify(w, 'research', 'msg.research.newRide', { params: { name: 'Drop Tower' } });
    notify(w, 'breakdown', 'msg.x', { tile: 77, entityId: 5 });
    const [a, b] = w.state.management.messages;
    expect(a).toEqual({ id: 1, tick: w.state.tick, category: 'research', textId: 'msg.research.newRide', params: { name: 'Drop Tower' }, tile: -1, entityId: -1 });
    expect(b).toEqual({ id: 2, tick: w.state.tick, category: 'breakdown', textId: 'msg.x', tile: 77, entityId: 5 });
    expect(w.state.management.nextMessageId).toBe(3);
    expect(w.events).toEqual([
      { type: 'message', category: 'research', textId: 'msg.research.newRide', params: { name: 'Drop Tower' }, tile: -1, entityId: -1 },
      { type: 'message', category: 'breakdown', textId: 'msg.x', tile: 77, entityId: 5 },
    ]);
  });

  it('pruneMessages keeps the newest MESSAGE_MAX', () => {
    const w = makeTestWorld();
    for (let i = 0; i < MESSAGE_MAX + 5; i++) notify(w, 'park', `m${i}`);
    pruneMessages(w);
    const msgs = w.state.management.messages;
    expect(msgs).toHaveLength(MESSAGE_MAX);
    expect(msgs[0]?.id).toBe(6);
    expect(msgs[msgs.length - 1]?.id).toBe(MESSAGE_MAX + 5);
  });

  it('counts unread messages and markMessagesRead moves the marker (never back)', () => {
    const w = makeTestWorld();
    for (let i = 0; i < 4; i++) notify(w, 'park', `m${i}`);
    expect(unreadCount(w)).toBe(4);
    expect(executeCommand(w, { type: 'markMessagesRead', upToId: 3 })).toEqual({ ok: true, cost: 0, warnings: [] });
    expect(w.state.management.messagesReadUpTo).toBe(3);
    expect(unreadCount(w)).toBe(1);
    executeCommand(w, { type: 'markMessagesRead', upToId: 1 });
    expect(w.state.management.messagesReadUpTo).toBe(3);
    executeCommand(w, { type: 'markMessagesRead', upToId: 999 });
    expect(w.state.management.messagesReadUpTo).toBe(4);
    expect(unreadCount(w)).toBe(0);
  });

  it('clears a message target when its entity is removed', () => {
    const w = makeTestWorld();
    const ride = placeRideDirect(w, 'carousel', 10, 10);
    notify(w, 'breakdown', 'msg.b', { tile: 650, entityId: ride.id });
    notify(w, 'park', 'msg.p', { entityId: 999 });
    forgetEntityInMessages(w, ride.id);
    expect(w.state.management.messages[0]?.entityId).toBe(-1);
    expect(w.state.management.messages[0]?.tile).toBe(650);
  });

  it('the hour-start sweep clears targets that point to no live entity', () => {
    const w = makeTestWorld();
    const ride = placeRideDirect(w, 'carousel', 10, 10);
    const guest = addGuestDirect(w, 650);
    notify(w, 'breakdown', 'msg.b', { entityId: ride.id });
    notify(w, 'park', 'msg.g', { entityId: guest.id });
    notify(w, 'park', 'msg.dead', { entityId: 999 });
    w.state.tick = 10 * TICKS_PER_HOUR + 1;
    pruneMessages(w);
    expect(w.state.management.messages.map((m) => m.entityId)).toEqual([ride.id, guest.id, 999]);
    w.state.tick = 11 * TICKS_PER_HOUR;
    pruneMessages(w);
    expect(w.state.management.messages.map((m) => m.entityId)).toEqual([ride.id, guest.id, -1]);
  });
});
