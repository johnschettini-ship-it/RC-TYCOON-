/**
 * Alias sets for the bench's scale park (stage 1 round 3 item 7). Stage 1 bakes 3 flat rides; the scale park builds
 * all 18 flat ride types. So that each type is decoded and counted on its own, as 18 baked types would be, the bench
 * index gets, per game ride type, a copy of a baked ride's ride and shadow sets under its own item
 * (`<baked item>@<game id>`): distinct set keys, the same files (read once, decoded once per alias set). The look draws
 * a game ride type from its alias only while the scale park runs (`RealLook.setItemMap`); every other park keeps the
 * normal mapping (`./fallbacks.ts`). Only the VITE_ART=real build's bench uses this.
 */
import { setKey, type RealIndex, type RealSetEntry } from './indexFormat';

/** The baked flat rides the aliases copy, in turn. */
export const ALIAS_SOURCES = ['carousel', 'swing_tower', 'big_wheel'] as const;

/** Game ride id → alias item, for `RealLook.setItemMap`: the i-th id copies `ALIAS_SOURCES[i % 3]`. */
export function aliasItemMap(rideIds: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  rideIds.forEach((id, i) => {
    out[id] = `${ALIAS_SOURCES[i % ALIAS_SOURCES.length]}@${id}`;
  });
  return out;
}

/** The frame key `k` of a set of item `from`, re-keyed for item `to` (ride and shadow frame keys start with the item). */
function rekey(k: string, from: string, to: string): string {
  if (k === from) return to;
  return k.startsWith(`${from}:`) ? to + k.slice(from.length) : k;
}

/**
 * `index` with the alias sets of `itemMap` (from `aliasItemMap`) added: for each alias, a copy of every ride and shadow
 * set of its baked item. The index's byte totals are unchanged (they describe the bake).
 */
export function withAliasSets(index: RealIndex, itemMap: Readonly<Record<string, string>>): RealIndex {
  const extra: RealSetEntry[] = [];
  for (const alias of new Set(Object.values(itemMap))) {
    const from = alias.slice(0, alias.indexOf('@'));
    for (const e of index.sets) {
      if (e.item !== from || (e.kind !== 'ride' && e.kind !== 'shadow')) continue;
      const frames: RealSetEntry['frames'] = {};
      for (const [k, f] of Object.entries(e.frames)) frames[rekey(k, from, alias)] = f;
      extra.push({ ...e, key: setKey(e.kind, alias, e.density, e.rot), item: alias, frames });
    }
  }
  return { ...index, sets: [...index.sets, ...extra] };
}
