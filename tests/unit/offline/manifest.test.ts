/**
 * `sw-manifest.json` (Phase 6 §4.10, §9): the build id and every hashed asset URL of the build. Checked on a real
 * `vite build` of the game into a temporary folder.
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build } from 'vite';
import { BUILD_ID_PLACEHOLDER, computeBuildId, stampServiceWorker, swManifest, type SwManifest } from '../../../scripts/sw-manifest-plugin';

const ROOT = resolve(__dirname, '../../..');

function listFiles(root: string, dir = root): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? listFiles(root, p) : [relative(root, p).split(sep).join('/')];
  });
}

describe('manifest helpers', () => {
  it('lists hashed assets and other files, never the page, the worker, its manifest, or source maps', () => {
    const m = swManifest(['index.html', 'sw.js', 'sw-manifest.json', 'assets/index-a.js', 'assets/index-a.js.map', 'assets/index-b.css', 'icons/icon.svg', 'manifest.webmanifest'], 'abc');
    expect(m).toEqual({ format: 'thrills-and-chills-sw-manifest', buildId: 'abc', assets: ['assets/index-a.js', 'assets/index-b.css'], files: ['icons/icon.svg', 'manifest.webmanifest'] });
  });

  it('the build id changes with any file and not with the order', () => {
    const a = computeBuildId([{ path: 'x', content: '1' }, { path: 'y', content: '2' }]);
    expect(computeBuildId([{ path: 'y', content: '2' }, { path: 'x', content: '1' }])).toBe(a);
    expect(computeBuildId([{ path: 'x', content: '1' }, { path: 'y', content: '3' }])).not.toBe(a);
    expect(computeBuildId([{ path: 'x', content: '1' }, { path: 'z', content: '2' }])).not.toBe(a);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
  });

  it('stamps the worker and refuses a worker without the placeholder', () => {
    expect(stampServiceWorker(`var id = '${BUILD_ID_PLACEHOLDER}';`, 'abc123')).toBe("var id = 'abc123';");
    expect(() => stampServiceWorker('var id = 1;', 'abc')).toThrow(/placeholder/);
    expect(() => stampServiceWorker(`'${BUILD_ID_PLACEHOLDER}'`, "a'b")).toThrow(/build id/);
  });
});

describe('a real build', () => {
  let out = '';
  let manifest: SwManifest;
  let files: string[] = [];

  beforeAll(async () => {
    out = mkdtempSync(join(tmpdir(), 'tc-build-'));
    await build({ root: ROOT, configFile: join(ROOT, 'vite.config.ts'), logLevel: 'silent', build: { outDir: out, emptyOutDir: true } });
    files = listFiles(out);
    manifest = JSON.parse(readFileSync(join(out, 'sw-manifest.json'), 'utf8')) as SwManifest;
  }, 120_000);

  afterAll(() => {
    if (out) rmSync(out, { recursive: true, force: true });
  });

  it('sw-manifest.json lists every hashed asset of the build', () => {
    const hashed = files.filter((f) => f.startsWith('assets/') && !f.endsWith('.map')).sort();
    expect(hashed.length).toBeGreaterThanOrEqual(2);
    for (const f of hashed) expect(f).toMatch(/-[A-Za-z0-9_-]{6,}\.(js|css|woff2)$/);
    expect(manifest.assets).toEqual(hashed);
    // The bundled font (Phase 7 §4.9) is in the offline cache list.
    expect(manifest.assets.filter((f) => /^assets\/fredoka-latin(-ext)?-wght-normal-[A-Za-z0-9_-]{6,}\.woff2$/.test(f))).toHaveLength(2);
    expect(manifest.format).toBe('thrills-and-chills-sw-manifest');
  });

  it('every asset the page loads is precached', () => {
    const html = readFileSync(join(out, 'index.html'), 'utf8');
    const refs = [...html.matchAll(/(?:src|href)="\.?\/?([^"]+)"/g)].map((m) => m[1] as string).filter((r) => !r.startsWith('http') && !r.startsWith('data:'));
    expect(refs.length).toBeGreaterThan(0);
    for (const r of refs) expect([...manifest.assets, ...manifest.files], r).toContain(r);
  });

  it('the worker carries the same build id and no placeholder', () => {
    const sw = readFileSync(join(out, 'sw.js'), 'utf8');
    expect(sw).not.toContain(BUILD_ID_PLACEHOLDER);
    expect(sw).toContain(`'${manifest.buildId}'`);
  });

  it('ships the web manifest and the icons, and no audio files', () => {
    expect(files).toEqual(expect.arrayContaining(['manifest.webmanifest', 'icons/icon.svg', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png']));
    expect(manifest.files).toEqual(expect.arrayContaining(['manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png']));
    expect(files.filter((f) => /\.(mp3|ogg|wav|m4a|aac|flac|opus)$/i.test(f))).toEqual([]);
  });
});
