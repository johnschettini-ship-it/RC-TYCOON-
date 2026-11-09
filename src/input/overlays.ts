/**
 * Overlay cycling (Phase 4 §7): None → Calm → Buzz → Light → Temperament (`OVERLAY_CYCLE`), on `V` (master R21).
 * Owner: W3-E, who also owns the overlay chip row and legend in the UI (`src/ui/overlays`).
 */
import { OVERLAY_CYCLE, type OverlayId, type ToolState } from '../render/types';

/** Next overlay in the cycle. From an overlay outside the cycle (patrol, litter, reliability) it starts at Calm. */
export function cycleOverlay(tool: ToolState): void {
  const k = OVERLAY_CYCLE.indexOf(tool.overlay);
  tool.overlay = (k < 0 ? OVERLAY_CYCLE[1] : OVERLAY_CYCLE[(k + 1) % OVERLAY_CYCLE.length]) as OverlayId;
}

/** Choose an overlay directly (chip row). */
export function setOverlay(tool: ToolState, overlay: OverlayId): void {
  tool.overlay = overlay;
}
