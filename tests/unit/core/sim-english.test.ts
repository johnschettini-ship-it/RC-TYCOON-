/** Master R27: the simulation never uses the active UI locale; it returns English text via `englishText`. */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../..');
const SIM = join(ROOT, 'src/sim');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : [];
  });
}

describe('simulation text is locale-independent (R27)', () => {
  it('no file in src/sim imports the locale-aware text() from the string tables', () => {
    const bad = walk(SIM).filter((f) => /import\s*\{[^}]*\btext\b[^}]*\}\s*from\s*'[^']*data\/strings\/en'/.test(readFileSync(f, 'utf8')));
    expect(bad.map((f) => relative(ROOT, f))).toEqual([]);
  });
});
