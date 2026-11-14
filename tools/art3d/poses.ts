/**
 * Car poses a track type reaches (phase 8c stage 1 bake). The bake renders one car picture per reached pose, so the
 * list comes from the real track geometry: `pieceWorldSamples` of each piece, at each of the 4 headings (a piece
 * can be built facing any way, and the view turns add quarter turns too), quantised by the game reader's own
 * `quantisePose` (src/render/real/pose.ts): yaw in 32 steps, pitch and roll in 15° steps (24 per turn).
 */
import { getTrackPieceDef, getTrackTypeDef } from '../../src/data/track';
import { pieceWorldSamples } from '../../src/sim/rides/track/api';
import { CAR_TILT_STEPS, CAR_YAW_STEPS, quantisePose } from '../../src/render/real/pose';

export interface CarPose { yaw: number; pitch: number; roll: number }

export { quantisePose };
export const YAW_STEPS = CAR_YAW_STEPS;
export const TILT_STEPS = CAR_TILT_STEPS;

/** Unique quantised poses of `pieceIds` on `trackType`, sorted by yaw, pitch, roll. */
export function reachedPoses(trackType: string, pieceIds: string[]): CarPose[] {
  const type = getTrackTypeDef(trackType);
  if (!type) throw new Error(`reachedPoses: unknown track type '${trackType}'`);
  const seen = new Map<number, CarPose>();
  for (const id of pieceIds) {
    const def = getTrackPieceDef(id);
    if (!def || def.set !== type.pieceSet || type.excludePieces.includes(id)) throw new Error(`reachedPoses: '${trackType}' has no piece '${id}'`);
    for (let dir = 0; dir < 4; dir++) {
      const s = pieceWorldSamples({ defId: id, x: 0, y: 0, z: 0, dir: dir as 0 | 1 | 2 | 3, chain: false, brakeSpeed: null, cost: 0 });
      for (let k = 0; k < s.n; k++) {
        const p = quantisePose(s.yaw[k] as number, s.pitch[k] as number, Math.atan2(s.bankSin[k] as number, s.bankCos[k] as number));
        seen.set((p.yaw * TILT_STEPS + p.pitch) * TILT_STEPS + p.roll, p);
      }
    }
  }
  return [...seen.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]);
}
