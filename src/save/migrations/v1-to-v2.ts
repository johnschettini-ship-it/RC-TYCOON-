/**
 * Migration 1 → 2 (Phase 4 §5.1; Phase 5 §5). Owner: integrator. FROZEN once Build 2 ships.
 *
 * 1. Validate the input with the schema 1 validator (`v1/schema.ts`). Failure → the usual load error
 *    ("This save is damaged: …").
 * 2. Keep `water` at its values (0 in every Build 1 park) and `owned` unchanged. Heights are not shifted (master R2).
 * 3. `park.afterDark = false`, `park.landPrice = 15000`, `park.rightsPrice = 6000` (cents).
 * 4. Empty `elevatedPaths` and `scenery`. Path item level 0 everywhere (`map.pathItemLevel`). Guest and staff `z`
 *    from the ground height of their tile (ground level 8 when the tile is −1). Guests are dry (`wetUntilTick = −1`).
 * 4a. `scenario = { kind: 'freePlay', awards: { active: [], history: [] } }`; `monthMetrics` empty for the current
 *    month (Build 1 had no scenarios and kept no samples; documented rule, Phase 5 §5).
 * 5. `schemaVersion = 2`. The codec then runs the full schema 2 checks.
 * 6. Any failure after step 1 shows "This save could not be upgraded" and keeps the current game (codec).
 *
 * Every value written here is a literal, never a tuning constant: later tuning changes must not change what an old
 * save upgrades to.
 */
import { damaged } from '../messages';
import { checkStructureV1 } from '../v1/schema';
import { MigrationError } from './error';

/** Schema 1 state after step 1 (fields this migration reads or writes). */
interface V1State {
  schemaVersion: number;
  tick: number;
  map: { width: number; height: number; heights: Uint8Array; pathItemLevel?: Int32Array };
  park: Record<string, unknown>;
  guests: Array<{ tile: number; z?: number; wetUntilTick?: number }>;
  staff: { members: Array<{ tile: number; z?: number }> };
  [key: string]: unknown;
}

/** Build 1 ground level (master R2). */
const GROUND_LEVEL_V1 = 8;
/** 1 month = 3,600 ticks (master 6.2). */
const TICKS_PER_MONTH_V1 = 3_600;

export function migrateV1toV2(raw: unknown): unknown {
  // 1. Schema 1 validator.
  const problem = checkStructureV1(raw);
  if (problem) throw new MigrationError(damaged(problem));
  const s = raw as V1State;
  const map = s.map;
  const groundZ = (tile: number): number => (tile >= 0 && tile < map.heights.length ? (map.heights[tile] as number) : GROUND_LEVEL_V1);

  // 2. water and owned are kept as they are.

  // 3. Park.
  s.park.afterDark = false;
  s.park.landPrice = 15_000;
  s.park.rightsPrice = 6_000;

  // 4. Elevated paths, scenery, path item levels, guest and staff heights.
  s.elevatedPaths = [];
  s.scenery = [];
  map.pathItemLevel = new Int32Array(map.width * map.height);
  for (const g of s.guests) {
    g.z = groundZ(g.tile);
    g.wetUntilTick = -1;
  }
  for (const m of s.staff.members) m.z = groundZ(m.tile);

  // 4a. Free play with no awards; empty month metrics for the current month.
  s.scenario = { kind: 'freePlay', awards: { active: [], history: [] } };
  s.monthMetrics = {
    monthIndex: Math.floor(s.tick / TICKS_PER_MONTH_V1),
    daySamples: [],
    nightSamples: [],
    thoughtGuests: {},
    guestsSeen: [],
    queueWaitTicks: 0,
    queueWaits: 0,
    brokenRides: [],
  };

  // 5. Version.
  s.schemaVersion = 2;
  return s;
}
