import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';

const ROOT = resolve(__dirname, '../..');
const SIM = join(ROOT, 'src/sim');
const DATA = join(ROOT, 'src/data');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : [];
  });
}

/** Import specifiers in a TypeScript source (static and dynamic). */
export function importsOf(source: string): string[] {
  const out: string[] = [];
  const re = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) out.push((m[1] ?? m[2]) as string);
  return out;
}

export function violations(file: string, source: string): string[] {
  const bad: string[] = [];
  for (const spec of importsOf(source)) {
    if (!spec.startsWith('.')) {
      bad.push(`${relative(ROOT, file)} imports package "${spec}"`);
      continue;
    }
    const target = resolve(dirname(file), spec);
    if (!target.startsWith(SIM) && !target.startsWith(DATA)) bad.push(`${relative(ROOT, file)} imports "${spec}"`);
  }
  if (/\bMath\.random\s*\(/.test(source)) bad.push(`${relative(ROOT, file)} uses Math.random`);
  if (/\bDate\.now\s*\(/.test(source)) bad.push(`${relative(ROOT, file)} uses Date.now`);
  if (/\b(document|window)\./.test(source)) bad.push(`${relative(ROOT, file)} uses the DOM`);
  return bad;
}

describe('architecture rules (master 5.2)', () => {
  it('sim/ imports only sim/ and data/, and uses no DOM, Date.now, or Math.random', () => {
    const bad = walk(SIM).flatMap((f) => violations(f, readFileSync(f, 'utf8')));
    expect(bad).toEqual([]);
  });

  it('data/ imports only data/', () => {
    const bad = walk(DATA).flatMap((f) =>
      importsOf(readFileSync(f, 'utf8'))
        .filter((s) => !s.startsWith('.') || !resolve(dirname(f), s).startsWith(DATA))
        .map((s) => `${relative(ROOT, f)} imports "${s}"`),
    );
    expect(bad).toEqual([]);
  });

  it('the checker catches a bad import', () => {
    const fake = join(SIM, 'fake.ts');
    expect(violations(fake, "import { x } from '../render/iso';")).toHaveLength(1);
    expect(violations(fake, "import { x } from './map';")).toHaveLength(0);
    expect(violations(fake, 'const r = Math.random();')).toHaveLength(1);
  });
});
