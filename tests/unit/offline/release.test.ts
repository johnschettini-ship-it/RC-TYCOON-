/**
 * The automated part of the release checklist (Phase 6 §4.11, `scripts/check-release.ts`), Build 4 (4.0.0).
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { auditOwnerItems, auditRows, distProblems, doneWhenProblems, formatResults, initialLoadBytes, originalityProblems, RELEASE_VERSION } from '../../../scripts/check-release';

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

describe('the two vendored Fredoka files (Phase 7 §4.9; ruling I)', () => {
  const latin = 'fredoka-latin-wght-normal';
  const ext = 'fredoka-latin-ext-wght-normal';

  it('the repository files pass at their exact sizes; any other font file, or another size, fails', () => {
    expect(
      originalityProblems([
        { path: `src/assets/fonts/fredoka/${latin}.woff2`, text: null, bytes: 29_732 },
        { path: `src/assets/fonts/fredoka/${ext}.woff2`, text: null, bytes: 4_576 },
      ]),
    ).toEqual([]);
    expect(
      originalityProblems([
        { path: `src/assets/fonts/fredoka/${latin}.woff2`, text: null, bytes: 29_733 },
        { path: `src/assets/fonts/fredoka/${ext}.woff2`, text: null },
        { path: 'src/assets/fonts/fredoka/fredoka-bold.woff2', text: null, bytes: 4_576 },
        { path: `public/fonts/${latin}.woff2`, text: null, bytes: 29_732 },
        { path: `src/assets/fonts/fredoka/${latin}.ttf`, text: null, bytes: 29_732 },
      ]),
    ).toEqual([
      `src/assets/fonts/fredoka/${latin}.woff2: font file`,
      `src/assets/fonts/fredoka/${ext}.woff2: font file`,
      'src/assets/fonts/fredoka/fredoka-bold.woff2: font file',
      `public/fonts/${latin}.woff2: font file`,
      `src/assets/fonts/fredoka/${latin}.ttf: font file`,
    ]);
  });

  it('the built assets pass at their exact sizes; any other font file in the build fails', () => {
    const files: Record<string, string> = { ...goodDist(), [`assets/${latin}-DM6njrJ3.woff2`]: 'x'.repeat(29_732), [`assets/${ext}-CYrqKuxd.woff2`]: 'x'.repeat(4_576) };
    files['sw-manifest.json'] = JSON.stringify({ buildId: 'b1', assets: Object.keys(files).filter((f) => f.startsWith('assets/') && !f.endsWith('.map')).sort(), files: [] });
    expect(distProblems(fakeDist(files))).toEqual([]);

    const bad: Record<string, string> = { ...goodDist(), [`assets/${latin}-DM6njrJ3.woff2`]: 'x'.repeat(29_000), 'assets/other-font-AbCdEf12.woff2': 'x'.repeat(4_576), 'assets/fredoka-AbCdEf12.ttf': 'x' };
    bad['sw-manifest.json'] = JSON.stringify({ buildId: 'b1', assets: Object.keys(bad).filter((f) => f.startsWith('assets/') && !f.endsWith('.map')).sort(), files: [] });
    expect(distProblems(fakeDist(bad))).toEqual([
      'assets/fredoka-AbCdEf12.ttf: font file in the build',
      `assets/${latin}-DM6njrJ3.woff2: font file in the build`,
      'assets/other-font-AbCdEf12.woff2: font file in the build',
    ]);
  });
});

describe('release version', () => {
  it('is 4.0.0 and matches package.json', () => {
    expect(RELEASE_VERSION).toBe('4.0.0');
    const pkg = JSON.parse(readFileSync(join(__dirname, '../../../package.json'), 'utf8')) as { version: string };
    expect(pkg.version).toBe(RELEASE_VERSION);
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

describe('done-when rows and acceptance audits (checklist item 1)', () => {
  const table = (status: string): string =>
    ['# Checklist', '', '## Phase 6 done when', '', '| Done-when item (Phase 6 §10) | How | Card | Status |', '|---|---|---|---|', `| Shows run. | tests | W4-C | ${status} |`, '', '## Manual browser check', '| 1 | x | PENDING |'].join('\n');
  const audit = '# Audit\n\n**Result: 9 lines — 7 PASS, 2 GAP.**\n';

  it('passes when every row is decided and both audits have a result line', () => {
    expect(doneWhenProblems(table('PASS'), { 'a.md': audit, 'b.md': audit })).toEqual([]);
  });

  it('flags a PENDING row (only in the done-when table), a missing audit, and an audit without a result', () => {
    expect(doneWhenProblems(table('PENDING (gate)'), { 'a.md': null, 'b.md': '# Audit' })).toEqual(['still PENDING: Shows run.', 'a.md is missing', 'b.md has no result line']);
    expect(doneWhenProblems('# nothing', {})).toEqual(['the checklist has no "Phase 6 done when" table']);
  });

  const auditWith = (result: string): string =>
    ['# Audit', '', '**Result: 2 lines.**', '', '| # | Done when (§11) | Result | Evidence |', '|---|---|---|---|', '| 7.1 | Tests pass | PASS | `npm test` |', `| 7.2 | The owner has accepted the screenshots | ${result} | not yet \\| later |`, '', 'After the table.'].join('\n');

  it('reads the rows of an audit\'s Done when table', () => {
    expect(auditRows(auditWith('OPEN'))).toEqual([
      { id: '7.1', line: 'Tests pass', result: 'PASS' },
      { id: '7.2', line: 'The owner has accepted the screenshots', result: 'OPEN' },
    ]);
  });

  it('an OPEN or GAP audit line is an owner item, not a problem', () => {
    for (const result of ['OPEN', 'GAP']) {
      expect(doneWhenProblems(table('PASS'), { 'docs/b-acceptance.md': auditWith(result) })).toEqual([]);
      expect(auditOwnerItems({ 'docs/b-acceptance.md': auditWith(result) })).toEqual([
        { name: `Owner: The owner has accepted the screenshots (b-acceptance.md 7.2, ${result})`, path: 'docs/b-acceptance.md' },
      ]);
    }
    expect(auditOwnerItems({ 'a.md': auditWith('PASS'), 'b.md': null })).toEqual([]);
  });

  it('a FAIL or PENDING audit line is a problem', () => {
    expect(doneWhenProblems(table('PASS'), { 'b.md': auditWith('FAIL') })).toEqual(['b.md 7.2 is FAIL: The owner has accepted the screenshots']);
    expect(doneWhenProblems(table('PASS'), { 'b.md': auditWith('PENDING') })).toEqual(['b.md 7.2 is PENDING: The owner has accepted the screenshots']);
    expect(auditOwnerItems({ 'b.md': auditWith('FAIL') })).toEqual([]);
  });

  it('the repository checklist and audits pass', () => {
    const read = (p: string): string => readFileSync(join(__dirname, '../../..', p), 'utf8');
    const audits = ['build-2', 'build-3', 'build-4'].map((b) => `docs/superpowers/specs/thrills-and-chills/${b}-acceptance.md`);
    expect(doneWhenProblems(read('docs/release/build-3-checklist.md'), Object.fromEntries(audits.map((p) => [p, read(p)])))).toEqual([]);
    // The open owner acceptance of Build 4 (7.10) is listed as an owner item.
    expect(auditOwnerItems(Object.fromEntries(audits.map((p) => [p, read(p)]))).map((o) => o.name)).toContainEqual(expect.stringMatching(/^Owner: The owner has looked at screenshots .* \(build-4-acceptance\.md 7\.10, OPEN\)$/));
  });
});
