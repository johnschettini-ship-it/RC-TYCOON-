/**
 * Track colour palette (phase-2 §4.13): 12 original colours the player picks for track, supports, and cars.
 * Indices match `TrackRideData.colours` and the type defaults in `src/data/track/trackTypes.ts`. Owner: W2-A.
 */
export const TRACK_PALETTE: readonly string[] = Object.freeze([
  '#d9383b', // 0 cherry
  '#f08a24', // 1 sunset
  '#f2c230', // 2 lemon
  '#4caf50', // 3 leaf
  '#3d9be0', // 4 sky
  '#22a39a', // 5 lagoon
  '#3f51b5', // 6 royal
  '#7e57c2', // 7 grape
  '#e0569b', // 8 rose
  '#c5ced8', // 9 silver
  '#3b4250', // 10 charcoal
  '#9a6b3f', // 11 timber
]);

/** Colour `i` of the palette (out-of-range indices wrap). */
export function paletteColour(i: number): string {
  const n = TRACK_PALETTE.length;
  return TRACK_PALETTE[(((Math.floor(i) % n) + n) % n)] as string;
}
