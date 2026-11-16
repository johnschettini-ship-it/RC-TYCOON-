/** Flat ride colour swatches: the options the panel shows (the DOM itself is covered by tests/e2e/ride-colour.spec.ts). */
import { describe, expect, it } from 'vitest';
import { RIDE_COLOUR_CHOICES } from '../../../src/data/catalog/flatRides';
import { en } from '../../../src/data/strings/en';
import { TRACK_PALETTE } from '../../../src/render/track/colours';
import { rideColourOptions } from '../../../src/ui/panels/ride';

describe('rideColourOptions', () => {
  const options = rideColourOptions();

  it('is Original first, then the six palette choices in order', () => {
    expect(options).toHaveLength(7);
    expect(options.map((o) => o.colour)).toEqual([null, ...RIDE_COLOUR_CHOICES]);
    expect(options[0]?.hex).toBeNull();
    expect(options.slice(1).map((o) => o.hex)).toEqual(RIDE_COLOUR_CHOICES.map((i) => TRACK_PALETTE[i]));
  });

  it('names read "Ride colour: <colour>"', () => {
    expect(options.map((o) => o.label)).toEqual([
      'Ride colour: Original',
      'Ride colour: Cherry',
      'Ride colour: Sunset',
      'Ride colour: Lemon',
      'Ride colour: Leaf',
      'Ride colour: Sky',
      'Ride colour: Grape',
    ]);
  });

  it('has the row label string', () => {
    expect(en['ui.ride.colour']).toBe('Colour');
  });
});
