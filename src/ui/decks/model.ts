/**
 * Deck model (Phase 7 §4.4, §4.5): where each old toolbar tool goes, how tool cards are ordered, and how ride and
 * stall cards are listed and sorted. Pure: no DOM access, so it runs in Node.
 */
import { FLAT_RIDES, STALLS, getFlatRideDef, getStallDef, getTrackRideDef } from '../../data/catalog';
import type { ResearchCategory } from '../../data/catalog/types';
import { getResearchItem } from '../../data/research';
import { text } from '../../data/strings/en';
import type { ToolState } from '../../render/types';
import { trackToolOf } from '../../render/track/toolState';
import { contentInfo, isUnlocked } from '../../sim/research/api';
import { pickNextResearch, scenarioResearchSkip } from '../../sim/research/update';
import type { World } from '../../sim/types';
import { contentName } from '../contentName';
import { progressPercent } from '../management/research';
import { minStationTiles, pickableTrackTypes, stationCost } from '../track/builder';

export type DeckId = 'rides' | 'stalls' | 'paths' | 'scenery' | 'manage';

export const DECK_ORDER: readonly DeckId[] = ['rides', 'stalls', 'paths', 'scenery', 'manage'];

export const OLD_TOOL_IDS = [
  'inspect', 'footpath', 'queue', 'rides', 'stalls', 'pathItems', 'demolish', 'staff', 'research', 'marketing', 'finance',
  'park', 'messages', 'temperament', 'menu', 'land', 'water', 'scenery', 'overlays', 'shows', 'buyLand',
] as const;
export type OldToolId = (typeof OLD_TOOL_IDS)[number];

export type ToolPlace =
  | { place: 'inspectDefault' }
  | { place: 'deckButton'; deck: DeckId }
  | { place: 'toolCard'; deck: DeckId }
  | { place: 'demolishButton' }
  | { place: 'controls' }
  | { place: 'moodBar' };

const card = (deck: DeckId): ToolPlace => ({ place: 'toolCard', deck });

export const TOOL_PLACE: Readonly<Record<OldToolId, ToolPlace>> = {
  inspect: { place: 'inspectDefault' },
  footpath: card('paths'),
  queue: card('paths'),
  rides: { place: 'deckButton', deck: 'rides' },
  stalls: { place: 'deckButton', deck: 'stalls' },
  pathItems: card('paths'),
  demolish: { place: 'demolishButton' },
  staff: card('manage'),
  research: card('manage'),
  marketing: card('manage'),
  finance: card('manage'),
  park: card('manage'),
  messages: { place: 'controls' },
  temperament: { place: 'moodBar' },
  menu: { place: 'controls' },
  land: card('scenery'),
  water: card('scenery'),
  scenery: card('scenery'),
  overlays: card('manage'),
  shows: card('rides'),
  buyLand: card('scenery'),
};

export const TOOL_CARD_ORDER: Readonly<Record<DeckId, readonly string[]>> = {
  rides: ['shows'],
  stalls: [],
  paths: ['footpath', 'queue', 'pathItems'],
  scenery: ['scenery', 'land', 'water', 'buyLand'],
  manage: ['staff', 'research', 'marketing', 'finance', 'park', 'overlays'],
};

/** Orders tool cards by `TOOL_CARD_ORDER`; ids not in the list go last, in input order. */
export function orderToolCards<T extends { id: string }>(deck: DeckId, cards: readonly T[]): T[] {
  const order = TOOL_CARD_ORDER[deck];
  const rank = (id: string): number => {
    const i = order.indexOf(id);
    return i < 0 ? order.length : i;
  };
  return cards.map((c, i) => ({ c, i })).sort((a, b) => rank(a.c.id) - rank(b.c.id) || a.i - b.i).map((x) => x.c);
}

export const RIDE_ZONES: readonly string[] = ['chill', 'family', 'thrill'];
export const STALL_ZONES: readonly string[] = ['food', 'drink', 'toilet', 'souvenir', 'info', 'facility'];

export interface CardSpec {
  id: string;
  kind: 'flat' | 'track' | 'stall';
  zone: string;
  cost: number;
  name: string;
}

/** Zone order, then cost, then name (plain string order). A zone not in `zones` goes last. */
export function sortCards(cards: readonly CardSpec[], zones: readonly string[]): CardSpec[] {
  const rank = (z: string): number => {
    const i = zones.indexOf(z);
    return i < 0 ? zones.length : i;
  };
  return [...cards].sort((a, b) => rank(a.zone) - rank(b.zone) || a.cost - b.cost || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** The zones, in order, that hold at least one card. */
export function zonesPresent(cards: readonly CardSpec[], zones: readonly string[]): string[] {
  return zones.filter((z) => cards.some((c) => c.zone === z));
}

/** Unlocked flat rides and pickable track types, sorted. */
export function rideCards(world: World): CardSpec[] {
  const flat: CardSpec[] = FLAT_RIDES.filter((d) => isUnlocked(world, d.id)).map((d) => ({
    id: d.id, kind: 'flat', zone: d.tag, cost: d.buildCost, name: contentName(d.id),
  }));
  const track: CardSpec[] = pickableTrackTypes(world).map((t) => ({
    id: t.id,
    kind: 'track',
    zone: getTrackRideDef(t.id)?.tag ?? 'thrill',
    cost: stationCost(t, minStationTiles(t, t.vehicle.defaultCars)),
    name: contentName(t.id),
  }));
  return sortCards([...flat, ...track], RIDE_ZONES);
}

/** Unlocked stalls, sorted. */
export function stallCards(world: World): CardSpec[] {
  return sortCards(
    STALLS.filter((d) => isUnlocked(world, d.id)).map((d) => ({ id: d.id, kind: 'stall' as const, zone: d.kind, cost: d.buildCost, name: contentName(d.id) })),
    STALL_ZONES,
  );
}

/** Locked preview cards (owner, 2026-11-17): at most this many per deck, so the hand stays short. */
export const LOCKED_CARDS_MAX = 6;

/** A ride or stall that research has not unlocked yet, shown greyed after the unlocked cards. */
export interface LockedCardSpec extends CardSpec {
  category: ResearchCategory;
  /** Research is working on this item now. */
  current: boolean;
  /** Whole percent of the current item's progress (0 for the others). */
  percent: number;
}

/**
 * The research items in the order research will unlock them: the item in progress, then each next pick
 * (`pickNextResearch`: focused categories first, then the default order). Items the scenario hides or unlocked at start
 * are left out, so a run where research unlocks nothing (sandbox "All items unlocked", a scenario that allows no
 * research) gives none.
 */
export function researchQueue(world: World): string[] {
  const r = world.state.management.research;
  const skip = scenarioResearchSkip(world);
  const done = [...r.unlocked];
  const out: string[] = [];
  if (r.current !== null && getResearchItem(r.current) && !done.includes(r.current) && !skip(r.current)) {
    out.push(r.current);
    done.push(r.current);
  }
  const sim = { ...r, unlocked: done };
  for (let next = pickNextResearch(sim, skip); next !== null; next = pickNextResearch(sim, skip)) {
    out.push(next);
    done.push(next);
  }
  return out;
}

/** The card of a locked research item, or null for an item no ride or stall card shows (scenery, show sites). */
function lockedSpec(world: World, id: string): LockedCardSpec | null {
  const item = getResearchItem(id);
  const kind = contentInfo(id)?.kind;
  if (!item || isUnlocked(world, id)) return null;
  const r = world.state.management.research;
  const current = r.current === id;
  const percent = current ? progressPercent(r.progress, item.cost) : 0;
  const base = { category: item.category, current, percent, cost: 0, name: contentName(id) };
  if (kind === 'flatRide') return { ...base, id, kind: 'flat', zone: getFlatRideDef(id)?.tag ?? 'thrill' };
  if (kind === 'trackRide') return { ...base, id, kind: 'track', zone: getTrackRideDef(id)?.tag ?? 'thrill' };
  if (kind === 'stall') return { ...base, id, kind: 'stall', zone: getStallDef(id)?.kind ?? 'food' };
  return null;
}

/** The next `LOCKED_CARDS_MAX` locked rides (Rides deck) or stalls (Stalls deck), in research order; none elsewhere. */
export function lockedCards(world: World, deck: DeckId): LockedCardSpec[] {
  if (deck !== 'rides' && deck !== 'stalls') return [];
  const out: LockedCardSpec[] = [];
  for (const id of researchQueue(world)) {
    const spec = lockedSpec(world, id);
    if (!spec || (deck === 'stalls') !== (spec.kind === 'stall')) continue;
    out.push(spec);
    if (out.length === LOCKED_CARDS_MAX) break;
  }
  return out;
}

/** The accessible name of a locked card: "<name>, locked, unlocks with research". */
export function lockedCardLabel(name: string): string {
  return text('ui.card.locked', { name });
}

/**
 * The ids of the ride and stall cards, then of the locked cards (the current one marked), joined: changes when a card
 * appears or goes, or research moves to another item. Progress alone does not change it (the hand updates the bar).
 */
export function handSignature(world: World): string {
  const locked = [...lockedCards(world, 'rides'), ...lockedCards(world, 'stalls')].map((c) => (c.current ? `${c.id}*` : c.id));
  return `${[...rideCards(world), ...stallCards(world)].map((c) => c.id).join(',')}|${locked.join(',')}`;
}

/** The card the tool holds: a ride or stall def, or the track type while the track tool places its station. */
export function heldCardId(tool: ToolState): string | null {
  if (tool.tool === 'placeRide' || tool.tool === 'placeStall') return tool.defId;
  if (tool.tool === 'track') {
    const st = trackToolOf(tool);
    return st.phase === 'station' ? st.typeId : null;
  }
  return null;
}
