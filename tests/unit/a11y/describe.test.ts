import { describe, expect, it } from 'vitest';
import { describeTile } from '../../../src/a11y/describe';
import { addGuestDirect, makeTestWorld, placeFootpath, placeQueue, placeRideDirect, placeStallDirect } from '../../helpers/world';
import { Content, Owned, PathItem, Terrain, tileIndex } from '../../../src/sim/map';
import { a11yStrings } from '../../../src/data/strings/a11y';

describe('describeTile (Phase 6 §4.7 tile description)', () => {
  it('matches the spec example: footpath, guests, and the ride next to it', () => {
    const w = makeTestWorld();
    // Carousel at (10, 10), 3 × 3: its footprint covers x 10–12, y 10–12. A footpath on (12, 13) touches its south edge.
    placeRideDirect(w, 'carousel', 10, 10, 0);
    const t = placeFootpath(w, 12, 13);
    addGuestDirect(w, t);
    addGuestDirect(w, t);
    addGuestDirect(w, t);
    expect(describeTile(w, t)).toBe('Tile 12, 13: footpath, 3 guests, next to Carousel');
  });

  it('one guest is singular; an empty owned tile names its ground', () => {
    const w = makeTestWorld();
    const t = placeFootpath(w, 20, 20);
    addGuestDirect(w, t);
    expect(describeTile(w, t)).toBe('Tile 20, 20: footpath, 1 guest');
    const map = w.state.map;
    const g = tileIndex(map, 21, 21);
    expect(map.owned[g]).toBe(Owned.Owned);
    expect(describeTile(w, g)).toBe('Tile 21, 21: grass');
    map.terrain[g] = Terrain.Sand;
    expect(describeTile(w, g)).toBe('Tile 21, 21: sand');
  });

  it('names the building on the tile and does not repeat it as a neighbour', () => {
    const w = makeTestWorld();
    const ride = placeRideDirect(w, 'carousel', 10, 10, 0);
    const t = tileIndex(w.state.map, 11, 11);
    expect(describeTile(w, t)).toBe(`Tile 11, 11: ${ride.name}`);
    const stall = placeStallDirect(w, 'snack_shack', 13, 11, 2);
    // The tile (12, 11) is the carousel; the stall is its east neighbour.
    expect(describeTile(w, tileIndex(w.state.map, 12, 11))).toBe(`Tile 12, 11: ${ride.name}, next to ${stall.name}`);
  });

  it('lists two neighbours with "and" and queue paths and path items by name', () => {
    const w = makeTestWorld();
    const a = placeStallDirect(w, 'snack_shack', 30, 29, 2);
    const b = placeStallDirect(w, 'fizz_stand', 31, 30, 3);
    const q = placeQueue(w, 30, 30);
    w.state.map.pathItem[q] = PathItem.Bench;
    expect(describeTile(w, q)).toBe(`Tile 30, 30: queue path, bench, next to ${a.name} and ${b.name}`);
  });

  it('describes land the park does not own, water, the park entrance, and tiles outside the map', () => {
    const w = makeTestWorld();
    const map = w.state.map;
    const outside = map.owned.findIndex((o) => o === Owned.NotOwned);
    expect(outside).toBeGreaterThanOrEqual(0);
    expect(describeTile(w, outside)).toMatch(/: grass, not owned$/);
    const wet = tileIndex(map, 25, 25);
    map.water[wet] = (map.heights[wet] as number) + 1;
    expect(describeTile(w, wet)).toBe('Tile 25, 25: water');
    expect(map.content[map.entranceTile]).toBe(Content.ParkEntrance);
    expect(describeTile(w, map.entranceTile)).toContain('park entrance');
    expect(describeTile(w, -1)).toBe('Outside the map');
    expect(describeTile(w, map.width * map.height)).toBe('Outside the map');
  });

  it('every a11y string has the a11y prefix and no final period (master R4)', () => {
    for (const [k, v] of Object.entries(a11yStrings)) {
      expect(k.startsWith('a11y.'), k).toBe(true);
      expect(/\.$/.test(v), `${k}: "${v}"`).toBe(false);
    }
  });
});
