/** Map sizes and land purchase (Phase 4 §4.9, §8). Owner: W3-G. Money is integer cents. */
export const MAP_SIZES = [64, 96, 128, 192, 256] as const;
export type MapSize = (typeof MAP_SIZES)[number];
export const MAP_SIZE_DEFAULT: MapSize = 96;
/** Per-park prices stored in `park.landPrice` / `park.rightsPrice` (migrated Build 1 parks get these too). */
export const LAND_PRICE = 15_000; // $150 per tile
export const RIGHTS_PRICE = 6_000; // $60 per tile
/** Free-play layout: owned centre square of min(48, size − 8) tiles; the outer 4 tiles are not owned. */
export const FREE_PLAY_OWNED_MAX = 48;
export const FREE_PLAY_BORDER = 4;
/** Construction rights (state 3): track and elevated paths may pass with zMin ≥ ground + 3. */
export const RIGHTS_MIN_CLEARANCE = 3;
