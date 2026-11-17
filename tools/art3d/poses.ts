/**
 * Car poses a track type reaches (phase 8c stage 1 bake). The bake renders one car picture per reached pose, so the
 * list comes from the real track geometry: `pieceWorldSamples` of each piece, at each of the 4 headings (a piece
 * can be built facing any way, and the view turns add quarter turns too), quantised by the game reader's own
 * `quantisePose` (src/render/real/pose.ts): yaw in 32 steps, pitch and roll in 15° steps (24 per turn).
 * One source with the game since batch 5 Task 2: the reader splits car sets by pose class from the same poses
 * (src/render/real/trackClasses.ts).
 */
import { CAR_TILT_STEPS, CAR_YAW_STEPS, quantisePose } from '../../src/render/real/pose';

export { reachedPoses, type CarPose } from '../../src/render/real/trackClasses';
export { quantisePose };
export const YAW_STEPS = CAR_YAW_STEPS;
export const TILT_STEPS = CAR_TILT_STEPS;
