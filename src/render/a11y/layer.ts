/**
 * Map cursor (Phase 6 §4.7, §7): a dashed diamond on the cursor tile (`src/a11y/cursor.ts`), drawn in
 * `drawOverlay` under view rotation. Owner: W4-F. Neutral stub: draws nothing.
 */
import type { WorldLayer } from '../layers';

export function createA11yLayer(): WorldLayer {
  return { name: 'a11y', kinds: [] };
}
