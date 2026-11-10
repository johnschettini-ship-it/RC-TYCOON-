import { describe, expect, it } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../../..');
const read = (p: string): string => readFileSync(resolve(root, p), 'utf8');
const STYLE_MODULES = ['src/ui/scenery/style.ts', 'src/ui/shows/style.ts', 'src/ui/scenario/styles.ts', 'src/ui/overlays/index.ts', 'src/ui/land/index.ts', 'src/ui/perf/index.ts', 'src/ui/offline/index.ts'];
const OLD_DARK = ['#12202e', '#1f3347', '#29425a', '#345270', '#3e5d7b', '#0e1925', '#0d1b28'];

describe('look (Phase 7 §4.9)', () => {
  it('main.css has no colour literal', () => {
    const css = read('src/styles/main.css');
    expect(css.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g) ?? []).toEqual([]);
    expect(css).toContain("@import './tokens.css';");
  });
  it('no file keeps a colour or a token name of the old dark look', () => {
    for (const f of ['src/styles/main.css', 'src/styles/tokens.css', ...STYLE_MODULES]) {
      const s = read(f).toLowerCase();
      for (const c of OLD_DARK) expect(s.includes(c), `${f} has ${c}`).toBe(false);
      expect(/var\(--(panel|panel-2|panel-3|line|panel-text|muted|bg)\)/.test(s), `${f} uses an old token`).toBe(false);
    }
  });
  it('tokens.css has the spec values', () => {
    const t = read('src/styles/tokens.css');
    for (const line of ['--ink: #1f2340;', '--surface: #ffffff;', '--surface-2: #eef0f7;', '--muted-ink: #4d5170;', '--gold: #ffc12e;', '--accent-chill: #56b4e9;', '--accent-family: #2fb38a;', '--accent-thrill: #e69f00;', '--danger-text: #b34700;']) {
      expect(t.includes(line), line).toBe(true);
    }
  });
  it('the font files and the licence are in the repository', () => {
    expect(statSync(resolve(root, 'src/assets/fonts/fredoka/fredoka-latin-wght-normal.woff2')).size).toBe(29732);
    expect(statSync(resolve(root, 'src/assets/fonts/fredoka/fredoka-latin-ext-wght-normal.woff2')).size).toBe(4576);
    expect(read('src/assets/fonts/fredoka/LICENSE')).toContain('SIL Open Font License, Version 1.1');
  });
});
