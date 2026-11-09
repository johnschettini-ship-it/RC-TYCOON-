/**
 * Scenario registry (Phase 5 §4.7). Owner: W3-H. Each scenario lives in `src/data/scenarios/<id>.ts`
 * and is listed here in card order (1–8). Sandbox terrain presets live in `./sandbox.ts`.
 */
import { FADING_FAIRGROUND } from './fading_fairground';
import { FROSTBITE_FALLS } from './frostbite_falls';
import { HARBOR_LIGHTS } from './harbor_lights';
import { MEADOW_START } from './meadow_start';
import { SANDY_SHORES } from './sandy_shores';
import { SKY_HIGH } from './sky_high';
import { SPOOKY_HOLLOW } from './spooky_hollow';
import type { ScenarioDef } from './types';
import { VOLCANO_RIDGE } from './volcano_ridge';

export * from './types';

/** The 8 scenarios in card order. */
export const SCENARIOS: readonly ScenarioDef[] = Object.freeze<ScenarioDef[]>([
  MEADOW_START,
  SANDY_SHORES,
  FROSTBITE_FALLS,
  VOLCANO_RIDGE,
  SPOOKY_HOLLOW,
  HARBOR_LIGHTS,
  FADING_FAIRGROUND,
  SKY_HIGH,
]);

export function getScenarioDef(id: string): ScenarioDef | undefined {
  return SCENARIOS.find((s) => s.id === id);
}
