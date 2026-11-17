/**
 * Motion of the new family flat rides of batch A (docs/superpowers/specs/2026-11-17-new-rides-design.md): Dodgem
 * Boats, Mini Pirate Ship, Balloon Wheel, Frog Hopper. Pure and import-free, so today's look
 * (`./familyRides.ts`) and the realistic bake (`tools/art3d/items/familyMotion.js`) pose the rides from the same
 * functions. `t` is the share of one turn (`st.angle`, angle slot / 32); every motion is whole in a turn, so a run
 * (REVOLUTIONS default 2, `src/render/anim.ts`) starts and ends at rest.
 */

const TAU = Math.PI * 2;
const frac = (t: number): number => t - Math.floor(t);

// ------------------------------------------------------------------ Dodgem Boats

/** Round boats on the pond. */
export const BOATS = 6;
/** Orbit radius range round the lighthouse, as a share of the pond's boat ring (0 = inner, 1 = outer). */
export interface BoatPose {
  /** Angle round the pond centre (radians, map u axis = 0). */
  a: number;
  /** Radial share 0 (near the lighthouse) .. 1 (near the fence). */
  r: number;
  /** The boat's own turn (radians). */
  spin: number;
}

/**
 * Boat `i` at turn share `t`: the boats drift round the lighthouse once per turn, and every boat swings in and out
 * twice per turn, neighbours in opposite phase, so they nose up to each other; each boat turns on the spot once
 * (odd boats the other way). Whole frequencies: the pond at t + 1 is the pond at t.
 */
export function boatPose(i: number, t: number): BoatPose {
  const p = frac(t);
  const a = TAU * (p + i / BOATS);
  const r = 0.5 + 0.5 * Math.sin(TAU * (2 * p + (i % 2) * 0.5 + i * 0.05));
  const spin = TAU * (i % 2 ? -p : p) + i;
  return { a, r, spin };
}

// ------------------------------------------------------------------ Mini Pirate Ship

/** Peak swing (radians): a gentle 40 degrees, against the Pendulum Ship's 68. */
export const MINI_SHIP_SWING = (40 * Math.PI) / 180;

/** Swing angle at turn share `t`: one swing to each side per turn. */
export function miniShipTheta(t: number): number {
  return MINI_SHIP_SWING * Math.sin(TAU * frac(t));
}

// ------------------------------------------------------------------ Balloon Wheel

/** Balloon cars on the wheel, in four balloon colours (the pattern repeats every quarter turn). */
export const BALLOON_CARS = 8;

// ------------------------------------------------------------------ Frog Hopper

/**
 * Seat ring height share (0 = boarding, 1 = top) at turn share `t`: four short hops per turn, the middle two the
 * highest; 0 at the start and the end of the turn.
 */
export function frogShare(t: number): number {
  const p = frac(t);
  return Math.abs(Math.sin(4 * Math.PI * p)) * (0.55 + 0.45 * Math.sin(Math.PI * p));
}
