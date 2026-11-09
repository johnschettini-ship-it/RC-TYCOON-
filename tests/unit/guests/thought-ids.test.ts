/**
 * Master R5: one thought, one id, one text. Every system raises thoughts through the guest module's
 * `addThought` with ids from `THOUGHT` (Phase 5 counts thoughts by id).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { en } from '../../../src/data/strings/en';
import { guestStrings } from '../../../src/data/strings/guests';
import { THOUGHT } from '../../../src/sim/guests/thoughts';

const ROOT = resolve(__dirname, '../../..');
const SIM = join(ROOT, 'src/sim');
const THOUGHT_MODULE = 'src/sim/guests/thoughts.ts';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : [];
  });
}

/** Writes to a guest's thought list or thought cooldowns (what a thought helper does). */
const THOUGHT_WRITES = [
  /\bthoughts\s*\.\s*(?:push|unshift|splice)\s*\(/,
  /\bthoughts\s*\[[^\]]*\]\s*=(?!=)/,
  /\bthoughtCooldowns\s*\[[^\]]*\]\s*=(?!=)/,
];

function writesThoughts(source: string): boolean {
  return THOUGHT_WRITES.some((re) => re.test(source));
}

describe('thought ids (master R5)', () => {
  it('every THOUGHT id has English text', () => {
    for (const id of Object.values(THOUGHT)) {
      expect(en[id], id).toBeTypeOf('string');
      expect(en[id], id).not.toBe('');
    }
  });

  it('the guest thought table holds exactly the THOUGHT ids', () => {
    expect(Object.keys(guestStrings).sort()).toEqual([...new Set(Object.values(THOUGHT))].sort());
  });

  it('no thought text appears under two different ids anywhere in en', () => {
    const idsByText = new Map<string, string[]>();
    for (const [id, t] of Object.entries(en)) idsByText.set(t, [...(idsByText.get(t) ?? []), id]);
    for (const id of Object.values(THOUGHT)) {
      expect(idsByText.get(en[id] as string), `text of "${id}"`).toEqual([id]);
    }
  });

  it('no old namespaced thought ids are left in en', () => {
    expect(Object.keys(en).filter((id) => id.startsWith('thought.'))).toEqual([]);
  });
});

describe('one thought writer (master R5)', () => {
  it(`only ${THOUGHT_MODULE} writes guest thoughts in src/sim`, () => {
    const writers = walk(SIM)
      .filter((f) => writesThoughts(readFileSync(f, 'utf8')))
      .map((f) => relative(ROOT, f).split('\\').join('/'));
    expect(writers).toEqual([THOUGHT_MODULE]);
  });

  it('the scan catches a local thought helper', () => {
    expect(writesThoughts('guest.thoughts.push({ id, tick });')).toBe(true);
    expect(writesThoughts('g.thoughts.splice(0, 1, t);')).toBe(true);
    expect(writesThoughts('guest.thoughtCooldowns[id] = tick;')).toBe(true);
    expect(writesThoughts('for (const t of guest.thoughts) n++;')).toBe(false);
    expect(writesThoughts('const last = guest.thoughtCooldowns[id] ?? 0;')).toBe(false);
  });
});
