/** Paths on slopes and elevated paths (Phase 4 §4.2, §8). Owner: W3-B. Money is integer cents. */
export const PATH_HEADROOM = 3; // m: every path occupies [z, z + 3)
export const ELEVATED_PATH_MAX_ABOVE_GROUND = 20; // m above the ground
export const ELEVATED_PATH_COST = { footpath: 1_000, queue: 1_200 } as const; // $10 / $12
export const ELEVATED_SUPPORT_COST_PER_M = 200; // $2 per m of support
export const RAMP_SPEED_UP = 0.75;
export const RAMP_SPEED_DOWN = 1.1;
/** Tracks over paths: lowest rail ≥ 4 m above the path (master R17). */
export const TRACK_PATH_CLEARANCE = 4;
