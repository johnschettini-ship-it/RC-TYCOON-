/**
 * Car pose steps of the realistic look, shared by the game reader (`look.ts`, track layer) and the bake
 * (`tools/art3d/poses.ts`), so both quantise a pose the same way: yaw in 32 steps, pitch and roll in 15° steps
 * (24 per turn), every value wrapped into its range.
 */
export const CAR_YAW_STEPS = 32;
export const CAR_TILT_STEPS = 24;

const step = (rad: number, n: number): number => ((Math.round((rad / (2 * Math.PI)) * n) % n) + n) % n;

/** Quantise a car pose in radians to the baked steps. */
export function quantisePose(yaw: number, pitch: number, roll: number): { yaw: number; pitch: number; roll: number } {
  return { yaw: step(yaw, CAR_YAW_STEPS), pitch: step(pitch, CAR_TILT_STEPS), roll: step(roll, CAR_TILT_STEPS) };
}
