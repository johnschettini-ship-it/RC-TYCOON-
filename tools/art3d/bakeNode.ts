/**
 * Node side of the stage 1 bake, bundled by bake.mjs (rolldown) so the driver can use the game's TypeScript modules:
 * catalogue footprints and heights (itemSpec), the cache key (contentHash), the coaster's track geometry and car
 * poses, and the index validator.
 */
import { itemSpec, contentHash, type ItemKind } from './catalog';
import { checkIndex } from './checkIndex';
import { reachedPoses } from './poses';
import { pieceWorldSamples } from '../../src/sim/rides/track/api';
import { pieceWorldTiles } from '../../src/sim/rides/track/geometry';
import { getTrackPieceDef } from '../../src/data/track';

export { itemSpec, contentHash, checkIndex, reachedPoses };
export type { ItemKind };

/** Per piece and heading (0-3): rail samples and the piece's tiles, for a piece entering tile (0, 0) at height 0. */
export function trackGeometry(pieceIds: string[]): Record<string, { special: string | null; dirs: unknown[] }> {
  const out: Record<string, { special: string | null; dirs: unknown[] }> = {};
  for (const id of pieceIds) {
    const def = getTrackPieceDef(id);
    if (!def) throw new Error(`trackGeometry: unknown piece ${id}`);
    const dirs: unknown[] = [];
    for (let dir = 0; dir < 4; dir++) {
      const piece = { defId: id, x: 0, y: 0, z: 0, dir: dir as 0 | 1 | 2 | 3, chain: false, brakeSpeed: null, cost: 0 };
      const s = pieceWorldSamples(piece);
      dirs.push({
        n: s.n, x: [...s.x], y: [...s.y], z: [...s.z], yaw: [...s.yaw], pitch: [...s.pitch], bankSin: [...s.bankSin], bankCos: [...s.bankCos],
        tiles: pieceWorldTiles(piece),
      });
    }
    out[id] = { special: def.special ?? null, dirs };
  }
  return out;
}
