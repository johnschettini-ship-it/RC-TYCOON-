/**
 * Title-to-play bridge, part 4: the shared style tokens of the realistic-only stylesheet (`src/styles/realBridge.css`):
 * the values the design lists, the name's letter colours at least 4.5:1 against their brown outline, every text colour
 * at least 4.5:1 on the cream paper, the button's ink text on the blue, and the title name reading the same tokens.
 * The website never has the stylesheet: only the realistic boot imports it.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../../../src/styles/realBridge.css', import.meta.url), 'utf8');
const view = readFileSync(new URL('../../../src/ui/titleScreen/real/view.ts', import.meta.url), 'utf8');
const token = (name: string): string => {
  const m = new RegExp(`${name}:\\s*(#[0-9a-f]{6})`).exec(css);
  if (!m?.[1]) throw new Error(`no ${name}`);
  return m[1];
};
const lum = (hex: string): number => {
  const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * (v[0] ?? 0) + 0.7152 * (v[1] ?? 0) + 0.0722 * (v[2] ?? 0);
};
const ratio = (a: string, b: string): number => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);

describe('the bridge style tokens', () => {
  it('are the design values', () => {
    expect(token('--tc-cream')).toBe('#f6ecd8');
    expect(token('--tc-coral')).toBe('#d9614a');
    expect(token('--tc-title-y')).toBe('#ffd970');
    expect(token('--tc-title-c')).toBe('#ff9f7a');
    expect(token('--tc-title-b')).toBe('#9fe0ea');
  });
  it('text contrast: the letters on their outline, the brown texts on cream, ink on the button', () => {
    for (const t of ['--tc-title-y', '--tc-title-c', '--tc-title-b']) expect(ratio(token(t), token('--tc-outline')), t).toBeGreaterThanOrEqual(4.5);
    expect(ratio(token('--tc-brown'), token('--tc-cream'))).toBeGreaterThanOrEqual(4.5);
    expect(ratio('#7a4631', token('--tc-cream'))).toBeGreaterThanOrEqual(4.5);
    expect(css).toContain('color: #7a4631');
    expect(ratio('#1f2340', token('--tc-go'))).toBeGreaterThanOrEqual(4.5);
  });
  it('the welcome card, the goal panel and the title name use them', () => {
    expect(css).toMatch(/\.tc-welcome \{[^}]*var\(--tc-cream\)[^}]*var\(--tc-coral\)/s);
    expect(css).toMatch(/\.tc-goal \{[^}]*var\(--tc-cream\)[^}]*var\(--tc-coral\)/s);
    for (const t of ['--tc-title-y', '--tc-title-c', '--tc-title-b']) expect(view).toContain(`var(${t},`);
  });
});
