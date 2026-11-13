/**
 * The bake camera (phase 8c stage 1): the orthographic camera that renders realistic sprites so they land on the
 * game's own pixels. Pure math, no three.js, so vitest checks it against `src/render/iso.ts` and `src/render/view.ts`.
 *
 * Axes, in metres: x and y are the map axes (tile (x, y) starts at (x·TILE_M, y·TILE_M)), z is up. In three.js
 * (y up) a game point (x, y, z) is (x, z, y); `threeView` gives the camera direction in those axes.
 *
 * The camera looks along yaw 45° + 90°·rot, 30° below the horizon. That makes the 2:1 diamond: a TILE_M tile is
 * TILE_W px across its diagonal, so pxPerMetre = TILE_W / (TILE_M·√2) × density (11.31 px at zoom 1). A true
 * camera then draws a metre of height at pxPerMetre·cos 30° = 9.798 px; the realistic look rounds that to
 * REAL_STEP_PX = 9.8. The bake stretches models up by `heightScale` (1.0002) so heights land exactly on the
 * game's pixels: `project` is the camera applied to (x, y, z·heightScale).
 */
import { REAL_STEP_PX } from '../../src/render/artStyle';
import { TILE_W } from '../../src/render/iso';
import { TILE_M } from '../../src/data/tuning/track';

export type BakeRotation = 0 | 1 | 2 | 3;
export type BakeDensity = 2 | 4;

export interface BakeCamera {
  rot: BakeRotation;
  density: BakeDensity;
  /** Screen px per metre in the picture plane (22.63 at density 2, 45.25 at density 4). */
  pxPerMetre: number;
  yawDeg: number;
  pitchDeg: number;
  /** Vertical stretch of the models so a metre of height is REAL_STEP_PX × density px. */
  heightScale: number;
  /** Game metres → baked px, relative to the point (0, 0, 0); sy grows down the screen. */
  project(xM: number, yM: number, zM: number): { sx: number; sy: number };
}

const PITCH_DEG = 30;

export function bakeCamera(rot: BakeRotation, density: BakeDensity): BakeCamera {
  const yawDeg = 45 + 90 * rot;
  const yaw = (yawDeg * Math.PI) / 180;
  const pitch = (PITCH_DEG * Math.PI) / 180;
  const pxPerMetre = (TILE_W / (TILE_M * Math.SQRT2)) * density;
  const heightScale = (REAL_STEP_PX * density) / (pxPerMetre * Math.cos(pitch));
  // Screen right and "towards the viewer" on the ground, in map axes.
  const rx = Math.cos(yaw);
  const ry = -Math.sin(yaw);
  const fx = Math.sin(yaw);
  const fy = Math.cos(yaw);
  const sinP = Math.sin(pitch);
  const cosP = Math.cos(pitch);
  return {
    rot,
    density,
    pxPerMetre,
    yawDeg,
    pitchDeg: PITCH_DEG,
    heightScale,
    project(xM, yM, zM) {
      return {
        sx: pxPerMetre * (xM * rx + yM * ry),
        sy: pxPerMetre * (sinP * (xM * fx + yM * fy) - cosP * zM * heightScale),
      };
    },
  };
}

/**
 * The camera in three.js axes (y up, game (x, y, z) = three (x, z, y)): `toCamera` is the unit vector from the
 * target towards the camera, `up` the camera's up vector. Place the camera at target + toCamera·distance, call
 * lookAt(target), and scale the model group by (1, heightScale, 1).
 */
export function threeView(cam: Pick<BakeCamera, 'yawDeg' | 'pitchDeg'>): { toCamera: [number, number, number]; up: [number, number, number] } {
  const yaw = (cam.yawDeg * Math.PI) / 180;
  const pitch = (cam.pitchDeg * Math.PI) / 180;
  return {
    toCamera: [Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw)],
    up: [0, 1, 0],
  };
}
