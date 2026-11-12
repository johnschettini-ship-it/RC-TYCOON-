/**
 * No mascots in the interface (Task 23, owner decision 2026-11-12): no string names Frost or Spark as a speaker, no tip
 * or tutorial line speaks in a mascot's voice, and no interface module draws a mascot face. Task 24 removed them from
 * the park too: no statue, costume or guest thought names them.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { en } from '../../../src/data/strings/en';

/**
 * Strings that may still say "Frost" or "Spark": they name things in the park, not a speaker of the interface.
 * Each with its reason.
 */
const ALLOWED: Readonly<Record<string, string>> = {
  'content.frost_peaks': 'scenery land name (Frost Peaks)',
  // Task 24: the statues, costumes and guest thoughts of the mascots were removed from the park; no allowance is left
  // for them.
};

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? filesUnder(p) : [p];
  });
}

describe('no mascots in the interface (Task 23)', () => {
  it('no player-facing string names Frost or Spark, except the declared park things', () => {
    const found = Object.entries(en)
      .filter(([k, v]) => /\b(Frost|Spark)\b/.test(v) && !(k in ALLOWED))
      .map(([k, v]) => `${k}: ${v}`);
    expect(found).toEqual([]);
  });

  it('the only allowance left is the land name Frost Peaks (Task 24)', () => {
    expect(Object.keys(ALLOWED)).toEqual(['content.frost_peaks']);
  });

  it('every declared exception still exists (no stale entry)', () => {
    for (const k of Object.keys(ALLOWED)) expect(en[k], k).toMatch(/\b(Frost|Spark)\b/);
  });

  it('tips and tutorial lines do not speak in a speaker’s voice', () => {
    const voiced = Object.entries(en)
      .filter(([k]) => k.startsWith('ui.tip.') || k.startsWith('prog.tutorial.'))
      .filter(([, v]) => /\b(I|I am|My|my|me)\b/.test(v))
      .map(([k, v]) => `${k}: ${v}`);
    expect(voiced).toEqual([]);
  });

  it('the tips setting is labelled Tips, and the tip region is a Tip', () => {
    expect(en['settings.gameplay.mascotTips']).toBe('Tips');
    expect(en['ui.tip.label']).toBe('Tip');
  });

  it('no interface module draws a mascot face; the art module is gone', () => {
    expect(existsSync('src/ui/scenario/mascotArt.ts')).toBe(false);
    const users = filesUnder('src/ui').filter((f) => /mascotCanvas|mascotArt|faceMoods/.test(readFileSync(f, 'utf8')));
    expect(users).toEqual([]);
  });
});
