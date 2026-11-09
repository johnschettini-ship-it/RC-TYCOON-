/**
 * The automated part of the Build 3 release checklist (Phase 6 §4.11, `scripts/check-release.ts`).
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { distProblems, formatResults, initialLoadBytes, originalityProblems } from '../../../scripts/check-release';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function fakeDist(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'tc-dist-'));
  dirs.push(dir);
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), body);
  }
  return dir;
}

const goodDist = (): Record<string, string> => ({
  'index.html': '<script type="module" src="./assets/index-abc123.js"></script><link rel="stylesheet" href="./assets/index-def456.css">',
  'assets/index-abc123.js': 'console.log(1);'.repeat(50),
  'assets/index-abc123.js.map': '{}',
  'assets/index-def456.css': 'body{}',
  'sw.js': "var BUILD_ID = 'b1';",
  'sw-manifest.json': JSON.stringify({ buildId: 'b1', assets: ['assets/index-abc123.js', 'assets/index-def456.css'], files: [] }),
  'manifest.webmanifest': '{}',
  'icons/icon.svg': '<svg/>',
  'icons/icon-180.png': 'x',
  'icons/icon-192.png': 'x',
  'icons/icon-512.png': 'x',
});

describe('originality scan (checklist item 7)', () => {
  it('flags names of other games and studios, audio, fonts, and images the project did not make', () => {
    const other = ['Park', 'itect'].join('');
    const problems = originalityProblems([
      { path: 'src/a.ts', text: `// like ${other}` },
      { path: 'src/b.ts', text: 'a tycoon-genre game' },
      { path: 'public/sounds/pop.wav', text: null },
      { path: 'public/fonts/x.woff2', text: null },
      { path: 'public/art/ride.png', text: null },
      { path: 'public/icons/icon-192.png', text: null },
      { path: 'docs/screenshots/wave1-park.png', text: null },
    ]);
    expect(problems).toEqual([`src/a.ts: names "${other}"`, 'public/sounds/pop.wav: audio file (all audio is generated in code)', 'public/fonts/x.woff2: font file', 'public/art/ride.png: image not made by the project']);
  });
});

describe('build checks (checklist items 2 and 6)', () => {
  it('a complete build passes', () => {
    expect(distProblems(fakeDist(goodDist()))).toEqual([]);
  });

  it('finds an unlisted asset, an unstamped worker, audio, and missing icons', () => {
    const files = goodDist();
    files['assets/extra-zzz999.js'] = '1';
    files['sw.js'] = "var BUILD_ID = '__TC_BUILD_ID__';";
    files['assets/beep.ogg'] = 'x';
    delete files['icons/icon-512.png'];
    expect(distProblems(fakeDist(files))).toEqual([
      'sw-manifest.json lists 2 assets, the build has 4',
      'sw.js does not carry the build id of sw-manifest.json',
      'assets/beep.ogg: audio file in the build',
      'icons/icon-512.png is missing',
    ]);
  });

  it('measures the gzipped JS and CSS the page loads', () => {
    const n = initialLoadBytes(fakeDist(goodDist()));
    expect(n).toBeGreaterThan(20);
    expect(n).toBeLessThan(200);
  });

  it('prints a Markdown table', () => {
    expect(formatResults([{ item: 8, name: 'License', status: 'owner', detail: 'a | b' }])).toBe('| # | Check | Status | Detail |\n|---|---|---|---|\n| 8 | License | OWNER | a \\| b |');
  });
});
