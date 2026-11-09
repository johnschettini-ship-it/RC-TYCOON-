/**
 * Hourly scenery upkeep (Phase 4 §4.5), run at every hour start (tick order: after the rating, before the Calm and
 * Buzz refresh). Owner: W3-D.
 * Contract: gardens drain 3 per game hour (5 when hot); rain refills every garden to 255; an item that crosses the
 * wilt line (64) calls `markFieldsDirty` for its tiles. Stub: no-op.
 */
import type { World } from '../types';

export function hourlyScenery(_world: World): void {}
