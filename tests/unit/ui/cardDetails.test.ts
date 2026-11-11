// tests/unit/ui/cardDetails.test.ts
import { describe, expect, it } from 'vitest';
import { makeTestWorld } from '../../helpers/world';
import { getFlatRideDef, getTrackRideDef, STALLS } from '../../../src/data/catalog';
import { text } from '../../../src/data/strings/en';
import { defaultToolState } from '../../../src/render/types';
import { trackToolOf } from '../../../src/render/track/toolState';
import { cardDetailRows, heldCard } from '../../../src/ui/panels/cardDetails';
import { formatMoney, formatPrice } from '../../../src/ui/format';
import { minStationTiles, pickableTrackTypes, stationCost } from '../../../src/ui/track/builder';

describe('card details (Phase 7 §4.7)', () => {
  it('a flat ride shows seats, ratings, ticket, running cost, and size', () => {
    const def = getFlatRideDef('carousel')!;
    expect(cardDetailRows({ id: 'carousel', kind: 'flat', zone: 'family', cost: def.buildCost, name: 'Carousel' })).toEqual([
      { labelId: 'ui.details.seats', value: '16' },
      { labelId: 'ui.stat.excitement', value: '2.50' },
      { labelId: 'ui.stat.intensity', value: '1.00' },
      { labelId: 'ui.stat.nausea', value: '0.50' },
      { labelId: 'ui.details.ticket', value: '$2.00' },
      { labelId: 'ui.details.running', value: formatMoney(def.runningCostMonthly) },
      { labelId: 'ui.details.size', value: text('ui.details.sizeValue', { w: def.w, d: def.d }) },
    ]);
  });
  it('a stall shows its kind, its price, and its running cost', () => {
    const def = STALLS[0]!;
    expect(cardDetailRows({ id: def.id, kind: 'stall', zone: def.kind, cost: def.buildCost, name: def.name }).map((r) => r.value)).toEqual([
      text(`ui.kind.${def.kind}`), formatPrice(def.defaultPrice), formatMoney(def.runningCostMonthly),
    ]);
  });
  it('a track ride shows four rows', () => {
    const type = pickableTrackTypes(makeTestWorld())[0]!;
    const cat = getTrackRideDef(type.id)!;
    const cost = stationCost(type, minStationTiles(type, type.vehicle.defaultCars));
    const rows = cardDetailRows({ id: type.id, kind: 'track', zone: cat.tag, cost, name: cat.name });
    // Each row is a string of the old track card: its id, and its complete text as the value.
    expect(rows).toEqual([
      { labelId: `ui.track.drive.${cat.drive}`, value: text(`ui.track.drive.${cat.drive}`) },
      { labelId: 'ui.track.maxHeight', value: text('ui.track.maxHeight', { n: type.maxHeightM }) },
      { labelId: 'ui.track.seats', value: text('ui.track.seats', { n: type.vehicle.seatsPerCar }) },
      { labelId: 'ui.track.from', value: text('ui.track.from', { cost: formatMoney(cost) }) },
    ]);
    for (const r of rows) expect(r.value, r.labelId).not.toMatch(/[{}]|^ui\./);
    expect(rows[1]!.value).toBe(`Up to ${type.maxHeightM} m high`);
    expect(rows[2]!.value).toBe(`${type.vehicle.seatsPerCar} seats per car`);
  });
  it('an id that is not in the catalog has no rows', () => {
    expect(cardDetailRows({ id: 'no_such_ride', kind: 'flat', zone: 'family', cost: 0, name: '' })).toEqual([]);
  });
  it('the held card is the card of the id that the tool holds', () => {
    const game = { tool: defaultToolState(), world: makeTestWorld() };
    expect(heldCard(game)).toBeNull();
    game.tool.tool = 'placeRide';
    game.tool.defId = 'carousel';
    expect(heldCard(game)).toMatchObject({ id: 'carousel', kind: 'flat', zone: 'family', cost: 120_000 });
    game.tool.tool = 'placeStall';
    game.tool.defId = 'snack_shack';
    expect(heldCard(game)).toMatchObject({ id: 'snack_shack', kind: 'stall', zone: 'food' });
    // An id with no card in the hand (a ride id while the stall tool is active).
    game.tool.defId = 'carousel';
    expect(heldCard(game)).toBeNull();
    const type = pickableTrackTypes(game.world)[0]!;
    game.tool.tool = 'track';
    trackToolOf(game.tool).typeId = type.id;
    trackToolOf(game.tool).phase = 'station';
    expect(heldCard(game)).toMatchObject({ id: type.id, kind: 'track' });
    trackToolOf(game.tool).phase = 'pieces';
    expect(heldCard(game)).toBeNull();
  });
});
