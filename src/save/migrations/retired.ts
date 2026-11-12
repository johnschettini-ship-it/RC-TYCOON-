/**
 * Retired content (Task 24, owner decision 2026-11-12: the Frost and Spark mascots are removed from the park). Owner:
 * integrator. FROZEN once Build 4 ships: later catalogue changes must not change what an old save turns into.
 *
 * Build 1 to Build 3 saves can hold three mascot things that Build 4 no longer has. The save format does not change
 * (schema 3: the same fields and kinds; a Build 4 save is a valid Build 3 save), so the schema version stays 3 and this
 * step is not a version step: the codec runs it on every loaded state after the version migrations (1 → 2 → 3) and
 * before the full schema 3 checks, so a damaged save is still reported as damaged and a partial state is never loaded.
 *
 * 1. A placed Frost Statue or Spark Statue (`statue_frost`, `statue_spark`; 1 × 1, 4 m, $250) becomes the Robot Statue
 *    (`statue_robot`; 1 × 1, 4 m, $240): the same footprint and height and the nearest price of the statues left (the
 *    Boo Statue costs $250 but is 3 m high and spooky). Its id, place, rotation and every other value stay.
 * 2. A performer in the Frost or Spark costume wears Boo, the one costume left (deterministic, the same for both).
 * 3. A stored guest thought with a retired id (`frostCute`, `sparkAwesome`) is dropped, with its repeat cooldown entry.
 *
 * Nothing else is touched. Values are literals, never catalogue lookups. The step reads only what it changes and leaves
 * any shape it does not expect to the checks that follow.
 */

/** Step 1: the retired statue ids and the statue that replaces both. */
export const RETIRED_STATUE = {
  ids: { statue_frost: true, statue_spark: true } as Readonly<Record<string, true>>,
  replacement: 'statue_robot',
} as const;

/** Step 2: the retired costume ids and the costume that replaces both. */
export const RETIRED_COSTUME = {
  ids: { frost: true, spark: true } as Readonly<Record<string, true>>,
  replacement: 'boo',
} as const;

/** Step 3: the retired guest thought ids. */
export const RETIRED_THOUGHTS: ReadonlySet<string> = new Set(['frostCute', 'sparkAwesome']);

type Loose = Record<string, unknown>;

const isObj = (v: unknown): v is Loose => typeof v === 'object' && v !== null && !Array.isArray(v);
const has = (table: Readonly<Record<string, true>>, v: unknown): boolean => typeof v === 'string' && Object.prototype.hasOwnProperty.call(table, v);

/** Applies steps 1–3 in place to a schema 3 state object (already migrated) and returns it. Never throws. */
export function retireMascots(state: unknown): unknown {
  if (!isObj(state)) return state;
  // 1. Statues.
  if (Array.isArray(state.scenery)) {
    for (const sc of state.scenery) if (isObj(sc) && has(RETIRED_STATUE.ids, sc.defId)) sc.defId = RETIRED_STATUE.replacement;
  }
  // 2. Costumes.
  const staff = state.staff;
  if (isObj(staff) && Array.isArray(staff.members)) {
    for (const m of staff.members) if (isObj(m) && has(RETIRED_COSTUME.ids, m.costume)) m.costume = RETIRED_COSTUME.replacement;
  }
  // 3. Thoughts and their cooldowns.
  if (Array.isArray(state.guests)) {
    for (const g of state.guests) {
      if (!isObj(g)) continue;
      if (Array.isArray(g.thoughts) && g.thoughts.some((t) => isObj(t) && typeof t.id === 'string' && RETIRED_THOUGHTS.has(t.id))) {
        g.thoughts = g.thoughts.filter((t) => !(isObj(t) && typeof t.id === 'string' && RETIRED_THOUGHTS.has(t.id)));
      }
      const cd = g.thoughtCooldowns;
      if (isObj(cd)) for (const id of RETIRED_THOUGHTS) if (Object.prototype.hasOwnProperty.call(cd, id)) delete cd[id];
    }
  }
  return state;
}
