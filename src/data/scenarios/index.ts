/**
 * Scenario registry (Phase 5 §4.7). Owner: W3-H. Each scenario lives in `src/data/scenarios/<id>.ts`
 * and is listed here in card order (1–8). The tutorial map and sandbox presets live beside them.
 */
import type { ScenarioDef } from './types';

export * from './types';

/** The 8 scenarios in card order. Empty until W3-H adds them. */
export const SCENARIOS: readonly ScenarioDef[] = Object.freeze<ScenarioDef[]>([]);

export function getScenarioDef(id: string): ScenarioDef | undefined {
  return SCENARIOS.find((s) => s.id === id);
}
