/** Performance tuning and budgets (Phase 6 §4.6, §8). Owner: W4-E. Starting values; budgets are spec values. */

/** Sprite cache byte budget (`width × height × 4` per canvas; terrain chunks count): phone / desktop. */
export const SPRITE_CACHE_BUDGET_MB = { phone: 64, desktop: 192 } as const;
/** Phone: at most 3 zoom buckets and a render scale of at most 2× device pixels. */
export const PHONE_MAX_ZOOM_BUCKETS = 3;
export const PHONE_MAX_RENDER_SCALE = 2;
/** A device counts as a phone with `pointer: coarse`, or `navigator.deviceMemory ≤ 4` when present. */
export const PHONE_DEVICE_MEMORY_GB = 4;

/** Guest level of detail: below this zoom guests draw as small rectangles batched by colour. */
export const GUEST_LOD_ZOOM = 0.5;

/** Budgets (Phase 6 §4.6 table). */
export const BUDGET_DESKTOP_FRAME_P95_MS = 20;
export const BUDGET_DESKTOP_TICK_P95_MS = 4;
export const BUDGET_PHONE_FRAME_P95_MS = 40;
export const BUDGET_HEAP_MB = { phone: 150, desktop: 250 } as const;
export const BUDGET_INITIAL_LOAD_KB_GZIP = 400;

/** Worker rule: adopt when desktop tick p95 > 4 ms or main-thread long tasks (> 50 ms) occur more than once per 10 s. */
export const WORKER_LONG_TASK_MS = 50;
export const WORKER_LONG_TASKS_PER_10S = 1;
/** PixiJS rule: phone p95 frame > 40 ms in 2 of 3 runs and ≥ 50% of frame time in canvas drawing. */
export const PIXI_RUNS_FAILING = 2;
export const PIXI_DRAW_SHARE = 0.5;
