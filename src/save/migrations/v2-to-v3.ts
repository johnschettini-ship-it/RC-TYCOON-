/**
 * Migration 2 → 3 (Phase 6 §5). Owner: integrator. FROZEN once Build 3 ships.
 *
 * 1. Validate the input with the frozen schema 2 validator (`v2/schema.ts`). Failure → the usual load error
 *    ("This save is damaged: …") when the save itself is schema 2; inside a 1 → 2 → 3 chain the codec reports it as
 *    "This save could not be upgraded" (the 1 → 2 step produced it).
 * 2. `shows = []` (no show sites existed before Build 3).
 * 3. Ledger: every month keeps its `shows` line. Phase 6 §5 says "add `shows: 0` to every existing ledger month";
 *    the category has existed since Build 1 (schema 1 and 2 saves always carry `shows: 0`, a true value), and the
 *    frozen check in step 1 proves it is present, so nothing is written.
 * 4. Guests: `showTarget = −1` (nobody heads for a show) and `items.photo = false` (no Photo Booth existed). These
 *    are true values for Build 2 parks, like `wetUntilTick = −1` in 1 → 2 (Phase 6 §5 "guests stay unchanged":
 *    every Build 2 field keeps its value).
 * 5. `schemaVersion = 3`. The codec then runs the full schema 3 checks.
 * 6. Any failure after step 1 shows "This save could not be upgraded" and keeps the current game (codec).
 *
 * Every value written here is a literal, never a tuning constant: later tuning changes must not change what an old
 * save upgrades to. Settings and progress are not in saves (Phase 6 §5).
 */
import { damaged } from '../messages';
import { checkStructureV2 } from '../v2/schema';
import { MigrationError } from './error';

/** Schema 2 state after step 1 (fields this migration reads or writes). */
interface V2State {
  schemaVersion: number;
  guests: Array<{ items: Record<string, unknown>; showTarget?: number }>;
  [key: string]: unknown;
}

export function migrateV2toV3(raw: unknown): unknown {
  // 1. Schema 2 validator.
  const problem = checkStructureV2(raw);
  if (problem) throw new MigrationError(damaged(problem));
  const s = raw as V2State;

  // 2. Show sites.
  s.shows = [];

  // 3. Ledger `shows` lines are kept (present since Build 1; see the header).

  // 4. Guests.
  for (const g of s.guests) {
    g.showTarget = -1;
    g.items.photo = false;
  }

  // 5. Version.
  s.schemaVersion = 3;
  return s;
}
