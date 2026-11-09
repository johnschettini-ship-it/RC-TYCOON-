/**
 * Map cursor state (Phase 6 §4.7, §7). Owner: W4-F. UI state only (never in saves). The cursor layer
 * (`render/a11y/layer.ts`) draws a dashed diamond on `tile`; the HUD shows `describeTile` for it.
 */
export interface MapCursor {
  on: boolean;
  /** Tile index, or −1 before the cursor is placed. */
  tile: number;
}

export const mapCursor: MapCursor = { on: false, tile: -1 };
