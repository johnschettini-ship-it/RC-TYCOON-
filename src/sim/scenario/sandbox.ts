/**
 * Sandbox maps (Phase 5 §4.5): the terrain style preset plus random features from the sandbox seed, all land owned
 * except a `SANDBOX_BORDER`-tile border, the park entrance in the middle of the south border with a 3-tile path
 * stub, on a flat plaza. Owner: W3-H. Integer math only (Phase 5 §4.2).
 */
import { SANDBOX_TERRAIN_RULES, TERRAIN_STYLE_PRESETS } from '../../data/scenarios/sandbox';
import type { Feature, MapGenSpec } from '../../data/scenarios/types';
import { GROUND_LEVEL } from '../../data/tuning/core';
import { SANDBOX_BORDER } from '../../data/tuning/scenario';
import { rngInt, type RngHolder } from '../rng';
import { hash4 } from './intmath';
import type { SandboxOptions } from './types';

/** The park entrance of a sandbox map of `size`: the middle of the south border ring. */
export function sandboxEntrance(size: number): { x: number; y: number } {
  return { x: Math.floor(size / 2) - 1, y: size - SANDBOX_BORDER };
}

/** The map generator spec for sandbox `options` (size, terrain style, seed). */
export function sandboxMapSpec(options: SandboxOptions): MapGenSpec {
  const size = options.mapSize;
  const preset = TERRAIN_STYLE_PRESETS[options.terrainStyle];
  const rng: RngHolder = { rng: hash4(options.seed, 0x5a4db0c5, 0x7e11, 5) | 0 };
  const { x: ex, y: ey } = sandboxEntrance(size);
  const lo = Math.floor(size / 6);
  const hi = size - 1 - lo;
  const north = Math.floor((size * 3) / 5);
  const features: Feature[] = [];

  if (preset.seaAllEdges) {
    const depthTiles = Math.max(4, Math.floor(size / 8));
    for (const edge of ['N', 'E', 'S', 'W'] as const) features.push({ kind: 'sea', edge, depthTiles, surface: preset.waterLevel });
  }
  for (let k = 0; k < preset.lakes; k++) {
    const radius = rngInt(rng, Math.max(3, Math.floor(size / 20)), Math.max(4, Math.floor(size / 12)));
    features.push({ kind: 'lake', cx: rngInt(rng, lo, hi), cy: rngInt(rng, lo, north), radius, surface: 0 });
  }
  for (let k = 0; k < preset.cones; k++) {
    const radius = rngInt(rng, Math.floor(size / 8), Math.floor(size / 5));
    features.push({ kind: 'cone', cx: rngInt(rng, lo, hi), cy: rngInt(rng, lo, north), radius, peak: rngInt(rng, 10, 20), craterRadius: 0 });
  }
  for (let k = 0; k < preset.rivers; k++) {
    const band = (): number => rngInt(rng, Math.floor(size / 4), Math.floor(size / 2));
    const third = Math.floor(size / 3);
    features.push({
      kind: 'river',
      points: [
        { x: 0, y: band() },
        { x: third, y: band() },
        { x: size - third, y: band() },
        { x: size, y: band() },
      ],
      width: 3,
      depth: 2,
    });
  }
  if (preset.seaAllEdges) {
    // A big island in the middle and a causeway from the entrance to it.
    const half = Math.floor(size / 2);
    features.push({ kind: 'raise', area: { circle: { cx: half, cy: half, radius: Math.floor(size / 4) } }, by: preset.waterLevel + 3, falloff: Math.floor(size / 8) });
    features.push({ kind: 'flatten', rect: { x0: ex - 1, y0: half, x1: ex + 1, y1: size - 10 }, height: preset.plazaHeight });
  }
  features.push({ kind: 'flatten', rect: { x0: ex - 3, y0: size - 9, x1: ex + 3, y1: ey }, height: preset.plazaHeight });
  features.push({ kind: 'prebuilt', commands: [{ type: 'buildPathLine', x0: ex, y0: ey - 1, x1: ex, y1: ey - 3, kind: 'footpath' }] });

  const last = size - 1 - SANDBOX_BORDER;
  return {
    width: size,
    height: size,
    seed: options.seed,
    baseHeight: GROUND_LEVEL,
    noise: preset.noise,
    waterLevel: preset.waterLevel,
    terrainRules: [...SANDBOX_TERRAIN_RULES],
    features,
    park: { owned: [{ x0: SANDBOX_BORDER, y0: SANDBOX_BORDER, x1: last, y1: last }], forSale: [], rightsForSale: [], entrance: { x: ex, y: ey, side: 'S' } },
  };
}
