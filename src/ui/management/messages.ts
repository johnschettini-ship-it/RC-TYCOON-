/** Message log view model (Phase 3 §4.14): order, unread state, text, icons, locate targets. Owner: W2-B. Pure. */
import { getFlatRideDef } from '../../data/catalog';
import { text } from '../../data/strings/en';
import { localizeContentParams } from '../contentName';
import { contentInfo } from '../../sim/research/api';
import type { Message, MessageCategory } from '../../sim/management/types';
import type { World } from '../../sim/types';
import type { EntityId } from '../../sim/units';
import type { MgmtIconName } from './icons';

/** The fields a log entry and a `message` event share. */
export type MessageLike = Pick<Message, 'category' | 'textId' | 'params' | 'tile' | 'entityId'>;

/** Newest first (highest id). Returns a new array; the log keeps its order. */
export function messagesNewestFirst(messages: readonly Message[]): Message[] {
  return [...messages].sort((a, b) => b.id - a.id);
}

/** Ids above the read marker. */
export function unreadIds(messages: readonly Message[], readUpTo: number): Set<number> {
  const out = new Set<number>();
  for (const m of messages) if (m.id > readUpTo) out.add(m.id);
  return out;
}

export function messageLine(m: MessageLike): string {
  return text(m.textId, localizeContentParams(m.params));
}

const CATEGORY_ICONS: Readonly<Record<MessageCategory, MgmtIconName>> = {
  breakdown: 'wrench',
  research: 'research',
  weather: 'weather_storm',
  finance: 'coin',
  staff: 'staff',
  marketing: 'marketing',
  park: 'flag',
};

export function messageIcon(category: MessageCategory): MgmtIconName {
  return CATEGORY_ICONS[category];
}

export type LocatePanel =
  | { kind: 'ride' | 'stall' | 'guest' | 'staff'; id: EntityId }
  | { kind: 'ridePicker' | 'stallPicker'; defId: string };

export interface LocateTarget {
  /** Tile to centre the camera on, or null to leave the camera. */
  tile: number | null;
  /** Panel to open, or null. */
  panel: LocatePanel | null;
}

function findById<T extends { id: number }>(list: readonly T[], id: number): T | undefined {
  let lo = 0;
  let hi = list.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const v = list[mid] as T;
    if (v.id === id) return v;
    if (v.id < id) lo = mid + 1;
    else hi = mid - 1;
  }
  return undefined;
}

/**
 * Where a tap on a message goes: the target entity's tile and panel; else the message tile;
 * a research message opens the build picker at its item. Null: the message only opens the log.
 */
export function locateTarget(world: World, m: MessageLike): LocateTarget | null {
  const s = world.state;
  const w = s.map.width;
  const id = m.entityId;
  if (id >= 0) {
    const ride = findById(s.rides, id);
    if (ride) {
      let tile = m.tile;
      if (tile < 0) {
        const def = getFlatRideDef(ride.defId);
        tile = (ride.y + Math.floor((def?.d ?? 1) / 2)) * w + ride.x + Math.floor((def?.w ?? 1) / 2);
      }
      return { tile, panel: { kind: 'ride', id } };
    }
    const stall = findById(s.stalls, id);
    if (stall) return { tile: m.tile >= 0 ? m.tile : stall.y * w + stall.x, panel: { kind: 'stall', id } };
    const guest = findById(s.guests, id);
    if (guest && guest.tile >= 0) return { tile: guest.tile, panel: { kind: 'guest', id } };
    const staff = findById(s.staff.members, id);
    if (staff) return { tile: staff.tile, panel: { kind: 'staff', id } };
  }
  const itemId = m.params?.itemId;
  if (m.category === 'research' && typeof itemId === 'string') {
    const info = contentInfo(itemId);
    if (info && (info.kind === 'flatRide' || info.kind === 'trackRide' || info.kind === 'stall')) {
      return { tile: null, panel: { kind: info.kind === 'stall' ? 'stallPicker' : 'ridePicker', defId: itemId } };
    }
  }
  if (m.tile >= 0 && m.tile < s.map.width * s.map.height) return { tile: m.tile, panel: null };
  return null;
}
