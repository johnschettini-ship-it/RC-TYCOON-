/**
 * The bake cache key of one item (S8 warm bake): SHA-256 over the contents of every file its pictures are built from
 * (contentHash) and the full computed input the page receives (catalogue spec, track geometry, car poses) plus the
 * densities. Anything that changes a picture changes the key, without a hand-kept list of data dependencies.
 */
import { createHash } from 'node:crypto';
import { contentHash } from './catalog';

export function cacheKey(files: string[], input: unknown, densities: readonly number[]): string {
  return createHash('sha256').update(contentHash(files)).update(JSON.stringify({ input, densities })).digest('hex');
}
