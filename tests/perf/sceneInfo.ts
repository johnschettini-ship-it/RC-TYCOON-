/**
 * The Phase 6 §4.6 benchmark scenes (W4-E): what each save in `tests/perf/` holds. No simulation imports, so the
 * Playwright perf run can read it; `./scenes.ts` builds the saves.
 */
export type PerfSceneId = 'build1' | 'build2' | 'phone';

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
  { id: 'build1', file: 'build1-2000-guests.tcsave.json', mapSize: 64, guests: 2_000, trackRides: 10, flatRides: 4, shows: 0, focus: { x: 40, y: 30 } },
  { id: 'build2', file: 'build2-128-3000-guests.tcsave.json', mapSize: 128, guests: 3_000, trackRides: 0, flatRides: 24, shows: 2, focus: { x: 64, y: 64 } },
  { id: 'phone', file: 'phone-800-guests.tcsave.json', mapSize: 64, guests: 800, trackRides: 10, flatRides: 4, shows: 0, focus: { x: 40, y: 30 } },
];

/** Fixed save time so regenerated files only differ when the park does. */
export const SCENE_SAVED_AT = '2026-11-09T00:00:00.000Z';
