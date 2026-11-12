/** Phase 8 stage 0 prototype (never merged): the derived-colour memo (spec §5.2, §6.5). */
// It imports nothing, so src/render/palette.ts can call it with no import cycle.

export type DerivedRecord = { out: string; base: string; f: number } | { out: string; a: string; b: string; t: number };

let records: DerivedRecord[] | null = null;

/** Starts recording. Only the generator calls it. */
export function startDerivedMemo(): void {
  records = [];
}

/** Stops recording and returns the records since the start (empty when none ran). */
export function stopDerivedMemo(): readonly DerivedRecord[] {
  const out = records ?? [];
  records = null;
  return out;
}

/** Records `shade(base, f) = out`. Outside a memo it returns at once. */
export function noteDerived(out: string, base: string, f: number): void {
  if (!records) return;
  records.push({ out, base, f });
}

/** Records `mixHex(a, b, t) = out`. Outside a memo it returns at once. */
export function noteMixed(out: string, a: string, b: string, t: number): void {
  if (!records) return;
  records.push({ out, a, b, t });
}
