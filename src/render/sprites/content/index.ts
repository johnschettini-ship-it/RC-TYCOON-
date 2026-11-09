/**
 * Owner: W2-C, W4-D. Art registry for the research content: Phase 3 (10 flat rides, 8 stalls) and Phase 6 (4 flat
 * rides, 3 stalls).
 * `rides.ts` and `stalls.ts` look ids up here before their generic fallback.
 * Entries are plain objects so tests can watch the draw calls.
 */
import type { Dir } from '../../../sim/map';
import type { RideArtState } from '../rides';
import type { Ctx } from '../shapes';
import { drawBumperCars, drawHauntedManor, drawMirrorMaze, drawObservationTower, drawRocketRounds, drawSpiralSlide } from './gentleRides';
import { STALL_DRAW } from './stalls';
import { drawGyroGlobe, drawKiddieCars, drawMagicCarpet, drawMerryMill } from './phase6Rides';
import { drawDropTower, drawFlipArm, drawPendulumShip, drawThunderDisc } from './thrillRides';

export interface ContentRideArt {
  /** Highest art point above the footprint centre (world px), for `rideArtBounds`. */
  height: number;
  /** Draw with the anchor at (0, 0); `ex` × `ey` is the map extent at this rotation. */
  draw(ctx: Ctx, ex: number, ey: number, st: RideArtState): void;
}

export interface ContentStallArt {
  draw(ctx: Ctx, rotation: Dir): void;
}

function ride(height: number, draw: ContentRideArt['draw']): ContentRideArt {
  return { height, draw };
}

export const CONTENT_RIDE_ART: Readonly<Record<string, ContentRideArt>> = {
  bumper_cars: ride(106, drawBumperCars),
  rocket_rounds: ride(84, drawRocketRounds),
  spiral_slide: ride(114, drawSpiralSlide),
  observation_tower: ride(200, drawObservationTower),
  mirror_maze: ride(82, drawMirrorMaze),
  haunted_manor: ride(116, drawHauntedManor),
  pendulum_ship: ride(142, drawPendulumShip),
  thunder_disc: ride(106, drawThunderDisc),
  drop_tower: ride(208, drawDropTower),
  flip_arm: ride(136, drawFlipArm),
  // Phase 6 (W4-D).
  magic_carpet: ride(132, drawMagicCarpet),
  kiddie_cars: ride(78, drawKiddieCars),
  merry_mill: ride(116, drawMerryMill),
  gyro_globe: ride(148, drawGyroGlobe),
};

export const CONTENT_STALL_ART: Readonly<Record<string, ContentStallArt>> = Object.fromEntries(
  Object.entries(STALL_DRAW).map(([id, draw]) => [id, { draw }]),
);
