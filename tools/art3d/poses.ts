/**
 * Car poses a track type reaches (phase 8c stage 1 bake). The bake renders one car picture per reached pose, so the
 * list comes from the real track geometry: `pieceWorldSamples` of each piece, at each of the 4 headings (a piece
 * can be built facing any way, and the view turns add quarter turns too), quantised by the game reader's own
 * `quantisePose` (src/render/real/pose.ts): yaw in 32 steps, pitch and roll in 15° steps (24 per turn).
 * One source with the game since batch 5 Task 2: the reader splits car sets by pose class from the same poses
 * (src/render/real/trackClasses.ts).
 */
import { CAR_TILT_STEPS, CAR_YAW_STEPS, quantisePose } from '../../src/render/real/pose';
import { reachedPoses, type CarPose } from '../../src/render/real/trackClasses';
import { getTrackTypeDef } from '../../src/data/track';

export { reachedPoses, type CarPose };
export { quantisePose };
export const YAW_STEPS = CAR_YAW_STEPS;
export const TILT_STEPS = CAR_TILT_STEPS;

/** Car styles whose train has a front car (a loco or a cab leads it): their cars bake a `front` variant of every pose. */
export const FRONT_CAR_STYLES: readonly string[] = ['loco', 'monorail'];

/** Whether a track type's train has a front car (`render.car` in FRONT_CAR_STYLES). */
export function hasFrontCar(typeId: string): boolean {
  const t = getTrackTypeDef(typeId);
  if (!t) throw new Error(`hasFrontCar: unknown track type '${typeId}'`);
  return FRONT_CAR_STYLES.includes(t.render.car);
}

/**
 * The car poses a type bakes on `pieceIds`: its reached poses, or for a spinning type (`vehicle.spins`) every reached
 * (pitch, roll) at all 32 yaws (the car spins about its own axis whatever way the track runs). Sorted by pose code.
 * A spun yaw no piece reaches has no pose class of its own: the game and the bake file it under `base`
 * (trackClasses.ts poseClassOf).
 */
export function carPoses(typeId: string, pieceIds: readonly string[]): CarPose[] {
  const t = getTrackTypeDef(typeId);
  if (!t) throw new Error(`carPoses: unknown track type '${typeId}'`);
  const reached = reachedPoses(typeId, pieceIds);
  if (!t.vehicle.spins) return reached;
  const tilts = [...new Set(reached.map((p) => p.pitch * TILT_STEPS + p.roll))].sort((a, b) => a - b);
  const out: CarPose[] = [];
  for (let yaw = 0; yaw < YAW_STEPS; yaw++) for (const k of tilts) out.push({ yaw, pitch: Math.floor(k / TILT_STEPS), roll: k % TILT_STEPS });
  return out;
}
