/**
 * The Phase 6 §4.6 benchmark scenes (W4-E): what each save in `tests/perf/` holds. No simulation imports, so the
 * Playwright perf run can read it; `./scenes.ts` builds the saves.
 */
export type PerfSceneId = 'build1' | 'build2' | 'phone' | 'coaster';

export interface PerfSceneInfo {
  id: PerfSceneId;
  /** File name in `tests/perf/`. */
  file: string;
  mapSize: number;
  guests: number;
  trackRides: number;
  flatRides: number;
  shows: number;
  /** Camera for the measurement: map tile at the screen centre (zoom 1). */
  focus: { x: number; y: number };
}

export const PERF_SCENES: readonly PerfSceneInfo[] = [
  { id: 'build1', file: 'build1-2000-guests.tcsave.json', mapSize: 64, guests: 2_000, trackRides: 10, flatRides: 14, shows: 0, focus: { x: 40, y: 30 } },
  { id: 'build2', file: 'build2-128-3000-guests.tcsave.json', mapSize: 128, guests: 3_000, trackRides: 0, flatRides: 24, shows: 2, focus: { x: 64, y: 64 } },
  { id: 'phone', file: 'phone-800-guests.tcsave.json', mapSize: 64, guests: 800, trackRides: 10, flatRides: 14, shows: 0, focus: { x: 40, y: 30 } },
  { id: 'coaster', file: 'coaster-600-guests.tcsave.json', mapSize: 64, guests: 600, trackRides: 1, flatRides: 1, shows: 0, focus: { x: 14, y: 8 } },
];

/**
 * Stage 1 round 3 item 7: the scale park, a synthetic bench scene for the realistic look at full scale: every one of
 * the 18 flat ride types (2 rides each), 5,000 scenery items of the baked kinds, and 3,000 guests on the 128 × 128
 * map. Only the bench runs it (not the Phase 6 perf runs). In the bench, each ride type is drawn from its own copy of
 * a baked ride's sets (alias sets, `src/render/real/aliases.ts`), so 18 types decode and count as 18 would.
 */
export interface ScaleSceneInfo extends Omit<PerfSceneInfo, 'id'> {
  id: 'scale';
  rideTypes: number;
  scenery: number;
}

export const SCALE_SCENE: ScaleSceneInfo = {
  id: 'scale', file: 'scale-18-rides-5000-scenery-3000-guests.tcsave.json', mapSize: 128, guests: 3_000, trackRides: 0, flatRides: 36, shows: 0,
  rideTypes: 18, scenery: 5_000, focus: { x: 64, y: 64 },
};

/** Fixed save time so regenerated files only differ when the park does. */
export const SCENE_SAVED_AT = '2026-11-09T00:00:00.000Z';
