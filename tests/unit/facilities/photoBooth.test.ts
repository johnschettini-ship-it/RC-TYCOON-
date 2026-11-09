/**
 * Photo Booth (phase-6-polish.md §4.5, catalog §3): gives a photo (happiness +10, one per guest); the want is ×2 within
 * 6 tiles of a ride exit with excitement ≥ 5.00. Distances are Chebyshev tiles from the booth to the exit gate, like
 * every other "within N tiles" rule (Security, Performers, Boo).
 */
import { describe, expect, it } from 'vitest';
import { getStallDef } from '../../../src/data/catalog';
import { IMPULSE, PHOTO_BOOTH_MIN_EXCITEMENT, PHOTO_BOOTH_RADIUS, PHOTO_BOOTH_WANT } from '../../../src/data/tuning/facilities';
import { applyStallEffects } from '../../../src/sim/guests/buying';
import { guestHooks } from '../../../src/sim/hooks';
import { facilityHooks } from '../../../src/sim/facilities/hooks';
import { impulseChance, stallWantFactor } from '../../../src/sim/facilities/impulse';
import { photoBoothWant } from '../../../src/sim/facilities/photo';
import { tileIndex } from '../../../src/sim/map';
import type { Ride } from '../../../src/sim/rides/types';
import type { World } from '../../../src/sim/types';
import { addGuestDirect, makeTestWorld, placeFootpath, placeRideDirect, placeStallDirect } from '../../helpers/world';

/** A ride whose exit gate sits at (gx, gy) with the given excitement (hundredths). */
function rideWithExit(w: World, gx: number, gy: number, excitement: number): Ride {
  const ride = placeRideDirect(w, 'drop_tower', 40, 40);
  const gate = tileIndex(w.state.map, gx, gy);
  ride.exit = { gate, outside: gate };
  ride.stats = { excitement, intensity: 300, nausea: 100 };
  return ride;
}

describe('Photo Booth want rule', () => {
  it('×2 at exactly 6 tiles from an exit of a ride with excitement 5.00, ×1 at 7 tiles or 4.99', () => {
    expect([PHOTO_BOOTH_RADIUS, PHOTO_BOOTH_MIN_EXCITEMENT, PHOTO_BOOTH_WANT]).toEqual([6, 500, 2]);
    const cases: Array<[number, number, number, number]> = [
      // dx, dy from the booth, excitement, want
      [6, 0, 500, 2],
      [6, 6, 500, 2],
      [-6, 3, 720, 2],
      [7, 0, 500, 1],
      [0, -7, 900, 1],
      [6, 0, 499, 1],
      [1, 1, 0, 1],
    ];
    for (const [dx, dy, exc, want] of cases) {
      const w = makeTestWorld();
      const booth = placeStallDirect(w, 'photo_booth', 20, 20);
      rideWithExit(w, 20 + dx, 20 + dy, exc);
      const g = addGuestDirect(w, booth.serviceTile);
      expect(photoBoothWant(w, g, booth), `${dx},${dy} exc ${exc}`).toBe(want);
    }
  });

  it('only the Photo Booth gets it; a ride without stats (never tested) counts for nothing', () => {
    const w = makeTestWorld();
    const balloons = placeStallDirect(w, 'balloon_stand', 20, 20);
    const booth = placeStallDirect(w, 'photo_booth', 24, 20);
    const ride = rideWithExit(w, 22, 22, 800);
    const g = addGuestDirect(w, balloons.serviceTile);
    expect(photoBoothWant(w, g, balloons)).toBe(1);
    expect(photoBoothWant(w, g, booth)).toBe(2);
    ride.stats = null;
    expect(photoBoothWant(w, g, booth)).toBe(1);
  });

  it('is a stallWant hook of the facilities, so impulse buys and the merged guest hooks see it', () => {
    expect(facilityHooks.stallWant).toEqual([photoBoothWant]);
    expect(guestHooks.stallWant).toContain(photoBoothWant);
    const w = makeTestWorld();
    const booth = placeStallDirect(w, 'photo_booth', 20, 20);
    for (let x = 18; x <= 23; x++) placeFootpath(w, x, 21);
    const g = addGuestDirect(w, booth.serviceTile);
    const before = impulseChance(w, g, booth);
    expect(before).toBeCloseTo(IMPULSE.souvenir!, 12);
    rideWithExit(w, 25, 22, 650);
    expect(stallWantFactor(w, g, booth)).toBe(2);
    expect(impulseChance(w, g, booth)).toBeCloseTo(2 * IMPULSE.souvenir!, 12);
  });

  it('a photo gives happiness +10 and is bought at most once per guest', () => {
    const w = makeTestWorld();
    const booth = placeStallDirect(w, 'photo_booth', 20, 20);
    const g = addGuestDirect(w, booth.serviceTile, { needs: { hunger: 40, thirst: 40, bladder: 20, energy: 230, happiness: 150, nausea: 0 } });
    const def = getStallDef('photo_booth')!;
    applyStallEffects(w, g, def);
    expect(g.needs.happiness).toBe(160);
    expect(g.items.photo).toBe(true);
    expect(impulseChance(w, g, booth)).toBe(0);
  });
});
