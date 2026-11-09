import { describe, expect, it } from 'vitest';
import { messagesNewestFirst, locateTarget, messageIcon, messageLine, unreadIds } from '../../../../src/ui/management/messages';
import type { Message } from '../../../../src/sim/management/types';
import { notify } from '../../../../src/sim/notifications';
import { executeCommand } from '../../../../src/sim/commands';
import { tileIndex } from '../../../../src/sim/map';
import { addGuestDirect, makeTestWorld, placeFootpath, placeRideDirect, placeStallDirect } from '../../../helpers/world';

const msg = (id: number, tick: number, extra: Partial<Message> = {}): Message => ({ id, tick, category: 'park', textId: 'msg.noMechanic', tile: -1, entityId: -1, ...extra });

describe('message list order', () => {
  it('shows the newest first (highest id), without changing the log', () => {
    const log = [msg(1, 10), msg(2, 10), msg(3, 50), msg(4, 40)];
    expect(messagesNewestFirst(log).map((m) => m.id)).toEqual([4, 3, 2, 1]);
    expect(log.map((m) => m.id)).toEqual([1, 2, 3, 4]);
  });

  it('marks ids above the read marker as unread', () => {
    expect([...unreadIds([msg(1, 0), msg(2, 0), msg(3, 0)], 1)]).toEqual([2, 3]);
  });

  it('text comes from the string table with params, with no final period (R4)', () => {
    const line = messageLine(msg(1, 0, { category: 'breakdown', textId: 'msg.breakdown', params: { ride: 'Carousel', type: 'stopped' } }));
    expect(line).toBe('Carousel has broken down');
  });

  it('every category has an icon', () => {
    for (const c of ['breakdown', 'research', 'weather', 'finance', 'staff', 'marketing', 'park'] as const) expect(messageIcon(c)).toBeTruthy();
  });
});

describe('message locate target (Phase 3 §4.14)', () => {
  it('a breakdown locates its ride: camera tile and ride panel', () => {
    const world = makeTestWorld();
    const ride = placeRideDirect(world, 'carousel', 10, 10, 0);
    const service = ride.exit?.outside ?? -1;
    notify(world, 'breakdown', 'msg.breakdown', { params: { ride: ride.name }, tile: service, entityId: ride.id });
    const m = world.state.management.messages[0] as Message;
    expect(locateTarget(world, m)).toEqual({ tile: service, panel: { kind: 'ride', id: ride.id } });
  });

  it('a removed entity falls back to the message tile; no tile and no entity → only the log', () => {
    const world = makeTestWorld();
    expect(locateTarget(world, msg(1, 0, { entityId: 999, tile: 77 }))).toEqual({ tile: 77, panel: null });
    expect(locateTarget(world, msg(1, 0))).toBeNull();
  });

  it('a stall, a guest, and a staff member open their own panels at their tiles', () => {
    const world = makeTestWorld();
    const stall = placeStallDirect(world, 'snack_shack', 20, 20, 2);
    expect(locateTarget(world, msg(1, 0, { entityId: stall.id }))).toEqual({ tile: tileIndex(world.state.map, 20, 20), panel: { kind: 'stall', id: stall.id } });
    const path = placeFootpath(world, 25, 25);
    const g = addGuestDirect(world, path);
    expect(locateTarget(world, msg(2, 0, { entityId: g.id }))).toEqual({ tile: path, panel: { kind: 'guest', id: g.id } });
    const hired = executeCommand(world, { type: 'hireStaff', staffType: 'mechanic' });
    const staffId = hired.ok ? (hired.id as number) : -1;
    const tile = world.state.staff.members[0]?.tile;
    expect(locateTarget(world, msg(3, 0, { entityId: staffId }))).toEqual({ tile, panel: { kind: 'staff', id: staffId } });
  });

  it('a research message opens the build picker at its item', () => {
    const world = makeTestWorld();
    expect(locateTarget(world, msg(1, 0, { category: 'research', textId: 'msg.research.newRide', params: { itemId: 'spiral_slide', name: 'Spiral Slide' } }))).toEqual({
      tile: null,
      panel: { kind: 'ridePicker', defId: 'spiral_slide' },
    });
    expect(locateTarget(world, msg(2, 0, { category: 'research', textId: 'msg.research.newStall', params: { itemId: 'ice_cream_cart', name: 'Ice Cream Cart' } }))).toEqual({
      tile: null,
      panel: { kind: 'stallPicker', defId: 'ice_cream_cart' },
    });
  });
});
