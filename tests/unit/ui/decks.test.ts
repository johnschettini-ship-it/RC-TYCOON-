// tests/unit/ui/decks.test.ts
import { describe, expect, it } from 'vitest';
import { makeTestWorld } from '../../helpers/world';
import { toolbarEntries } from '../../../src/ui/extensions';
import { defaultToolState } from '../../../src/render/types';
import {
  DECK_ORDER, OLD_TOOL_IDS, RIDE_ZONES, STALL_ZONES, TOOL_PLACE, handSignature, heldCardId, orderToolCards, rideCards, sortCards,
  stallCards, zonesPresent, type CardSpec, type OldToolId,
} from '../../../src/ui/decks/model';

const card = (id: string, zone: string, cost: number, name = id): CardSpec => ({ id, kind: 'flat', zone, cost, name });

describe('deck model (Phase 7 §4.4, §4.5)', () => {
  it('the 21 old tools each have one place', () => {
    expect(OLD_TOOL_IDS).toHaveLength(21);
    expect(Object.keys(TOOL_PLACE).sort()).toEqual([...OLD_TOOL_IDS].sort());
    expect(TOOL_PLACE.inspect).toEqual({ place: 'inspectDefault' });
    expect(TOOL_PLACE.rides).toEqual({ place: 'deckButton', deck: 'rides' });
    expect(TOOL_PLACE.footpath).toEqual({ place: 'toolCard', deck: 'paths' });
    expect(TOOL_PLACE.demolish).toEqual({ place: 'demolishButton' });
    expect(TOOL_PLACE.temperament).toEqual({ place: 'moodBar' });
    expect(TOOL_PLACE.messages).toEqual({ place: 'controls' });
    expect(TOOL_PLACE.menu).toEqual({ place: 'controls' });
  });
  it('each extension toolbar entry names the deck of the table', () => {
    const entries = toolbarEntries();
    expect(entries.map((e) => e.id).sort()).toEqual(['buyLand', 'land', 'overlays', 'scenery', 'shows', 'water']);
    for (const e of entries) expect(TOOL_PLACE[e.id as OldToolId]).toEqual({ place: 'toolCard', deck: e.deck });
  });
  it('deck order and tool card order', () => {
    expect(DECK_ORDER).toEqual(['rides', 'stalls', 'paths', 'scenery', 'manage']);
    const ids = (deck: Parameters<typeof orderToolCards>[0], list: string[]) => orderToolCards(deck, list.map((id) => ({ id }))).map((c) => c.id);
    expect(ids('scenery', ['land', 'water', 'scenery', 'buyLand'])).toEqual(['scenery', 'land', 'water', 'buyLand']);
    expect(ids('manage', ['overlays', 'park', 'new', 'staff'])).toEqual(['staff', 'park', 'overlays', 'new']);
  });
  it('cards sort by zone, then cost, then name', () => {
    const sorted = sortCards([card('d', 'thrill', 100), card('c', 'chill', 300), card('b', 'chill', 200, 'Zed'), card('a', 'chill', 200, 'Alp'), card('e', 'family', 50)], RIDE_ZONES);
    expect(sorted.map((c) => c.id)).toEqual(['a', 'b', 'c', 'e', 'd']);
  });
  it('zones with no card are not listed', () => {
    expect(zonesPresent([card('x', 'thrill', 1), card('y', 'chill', 1)], RIDE_ZONES)).toEqual(['chill', 'thrill']);
    expect(zonesPresent([], STALL_ZONES)).toEqual([]);
  });
  it('the start catalog gives sorted ride and stall cards', () => {
    const w = makeTestWorld();
    const rides = rideCards(w);
    expect(rides).toEqual(sortCards(rides, RIDE_ZONES));
    expect(rides.find((c) => c.id === 'carousel')).toMatchObject({ kind: 'flat', zone: 'family', cost: 120_000 });
    expect(rides.some((c) => c.kind === 'track')).toBe(true);
    const stalls = stallCards(w);
    expect(stalls).toEqual(sortCards(stalls, STALL_ZONES));
    expect(stalls.every((c) => c.kind === 'stall')).toBe(true);
    expect(handSignature(w)).toBe([...rides, ...stalls].map((c) => c.id).join(','));
  });
  it('the held card comes from the tool state', () => {
    const t = defaultToolState();
    expect(heldCardId(t)).toBeNull();
    t.tool = 'placeRide';
    t.defId = 'carousel';
    expect(heldCardId(t)).toBe('carousel');
    t.tool = 'footpath';
    expect(heldCardId(t)).toBeNull();
  });
});
