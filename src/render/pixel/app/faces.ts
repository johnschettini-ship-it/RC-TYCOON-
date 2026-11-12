/** Phase 8b stage 0b test (never merged): how many one-step face pieces a tile side needs (runtime and tests). */

/**
 * The face of one tile side in height steps: corner tops `topA`, `topB` and the neighbour's bottoms `bottomA`,
 * `bottomB`. Full steps start at the lowest bottom (`from`) and reach the lower top; a cap piece follows when one top
 * is a step higher (1: at the first corner, 2: at the second). The tiles drawn after hide the part below a higher bottom.
 * No face (`steps` 0, `cap` 0) when neither top is above its bottom (stage 0 `paintGroundTile`).
 */
export function faceStack(topA: number, topB: number, bottomA: number, bottomB: number): { from: number; steps: number; cap: 0 | 1 | 2 } {
  const from = Math.min(bottomA, bottomB);
  if (!(topA > bottomA || topB > bottomB)) return { from, steps: 0, cap: 0 };
  const steps = Math.max(0, Math.min(topA, topB) - from);
  const d = topA - topB;
  const cap = d === 1 ? 1 : d === -1 ? 2 : 0;
  return { from, steps, cap };
}
