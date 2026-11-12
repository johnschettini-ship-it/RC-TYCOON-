/** Phase 8b stage 0b test (never merged): one picture of the catalogue (its pack, group, index key and painter). */
import type { Picture } from '../picture';

export interface PictureSpec {
  /** Pack name (one index and its sheets). */
  pack: string;
  /** Packing group: a group never shares a sheet with another group. */
  group: string;
  /** Kind code (`K_*` of `src/render/artHook.ts`). */
  kind: number;
  /** Index key within the kind. */
  key: number;
  /** Paints the picture (needs `installSurfaceArt()`). */
  paint(): Picture;
  /** The game call for the B1 compare (sprite bank method and its arguments without the bucket), or null for new keys. */
  ref: [method: string, ...args: Array<string | number>] | null;
}

export type Catalogue = Iterable<PictureSpec>;
