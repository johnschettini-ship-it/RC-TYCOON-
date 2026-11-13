import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bakeCamera } from '../../../tools/art3d/camera';
import { TILE_M } from '../../../src/data/tuning/track';

// Plain JS build tools without types: import by a computed path so they load as `any`.
const kitDir = new URL('../../../tools/art3d/', import.meta.url);
const load = (rel: string): Promise<any> => import(/* @vite-ignore */ new URL(rel, kitDir).href); // eslint-disable-line @typescript-eslint/no-explicit-any

describe('art3d kit', () => {
  it('builds scenes on the game tile (TILE = TILE_M)', () => {
    const src = readFileSync(new URL('kit.js', kitDir), 'utf8');
    const m = /export const TILE = (\d+(?:\.\d+)?);/.exec(src);
    expect(Number(m?.[1])).toBe(TILE_M);
  });

  it('the three.js camera draws game points where bakeCamera.project says', async () => {
    const THREE = await load('vendor/three-0.160.0.module.min.js');
    const { makeBakeCamera } = await load('bakeView.js');
    const view = { widthPx: 600, heightPx: 500, originPx: [300, 380] as [number, number] };
    for (const rot of [0, 1, 2, 3] as const) {
      for (const density of [2, 4] as const) {
        const cam = bakeCamera(rot, density);
        const { camera, modelScale } = makeBakeCamera(THREE, cam, view);
        for (const [x, y, z] of [[0, 0, 0], [4, 0, 0], [0, 8, 0], [6, -3, 5], [-2, 5, 12]] as const) {
          const p = new THREE.Vector3(x, z, y).multiply(modelScale).project(camera); // NDC
          const sx = ((p.x + 1) / 2) * view.widthPx;
          const sy = ((1 - p.y) / 2) * view.heightPx;
          const want = cam.project(x, y, z);
          expect(sx).toBeCloseTo(view.originPx[0] + want.sx, 3);
          expect(sy).toBeCloseTo(view.originPx[1] + want.sy, 3);
        }
      }
    }
  });
});
