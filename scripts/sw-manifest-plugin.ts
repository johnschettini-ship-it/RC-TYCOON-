/**
 * Vite plugin for offline play (Phase 6 §4.10). Owner: W4-G. After the build is written it:
 * 1. computes the build id: a hash of every output file (so any change gives a new id and a new cache name);
 * 2. writes `sw-manifest.json`: the build id, every hashed asset URL, and the other files to precache;
 * 3. stamps the build id into the copied `sw.js`, so the worker's bytes change with every build and the browser
 *    finds the update (a byte-identical worker would never update).
 * No runtime code: the hand-written worker is `public/sw.js`.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import type { Plugin } from 'vite';

export const BUILD_ID_PLACEHOLDER = '__TC_BUILD_ID__';
export const SW_FILE = 'sw.js';
export const SW_MANIFEST_FILE = 'sw-manifest.json';
export const SW_MANIFEST_FORMAT = 'thrills-and-chills-sw-manifest';

export interface SwManifest {
  format: typeof SW_MANIFEST_FORMAT;
  buildId: string;
  /** Hashed build assets (`assets/…`), relative to the scope. Cache first. */
  assets: string[];
  /** Other files to precache (icons, web manifest), relative to the scope. Versioned by the cache name. */
  files: string[];
}

/** Files the worker never precaches: the page (cached by its scope URL), the worker, its manifest, source maps. */
function skipped(path: string): boolean {
  return path === 'index.html' || path === SW_FILE || path === SW_MANIFEST_FILE || path.endsWith('.map');
}

/** Put the build id into the worker source. Throws when the placeholder is missing (a broken worker). */
export function stampServiceWorker(source: string, buildId: string): string {
  if (!source.includes(BUILD_ID_PLACEHOLDER)) throw new Error(`${SW_FILE} has no ${BUILD_ID_PLACEHOLDER} placeholder`);
  if (!/^[A-Za-z0-9]+$/.test(buildId)) throw new Error(`bad build id ${buildId}`);
  return source.split(BUILD_ID_PLACEHOLDER).join(buildId);
}

/** A short hash of every file's path and content, in path order. */
export function computeBuildId(files: ReadonlyArray<{ path: string; content: string | Uint8Array }>): string {
  const h = createHash('sha256');
  for (const f of [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    h.update(f.path);
    h.update('\0');
    h.update(createHash('sha256').update(f.content).digest('hex'));
    h.update('\n');
  }
  return h.digest('hex').slice(0, 16);
}

/** The manifest for the output file list (`/` separators, relative to the output folder). */
export function swManifest(paths: readonly string[], buildId: string, assetsDir = 'assets'): SwManifest {
  const kept = paths.filter((p) => !skipped(p)).sort();
  const prefix = `${assetsDir}/`;
  return {
    format: SW_MANIFEST_FORMAT,
    buildId,
    assets: kept.filter((p) => p.startsWith(prefix)),
    files: kept.filter((p) => !p.startsWith(prefix)),
  };
}

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? listFiles(p) : [p];
  });
}

/** Write `sw-manifest.json` and stamp `sw.js` in a finished output folder. Returns the manifest. */
export function writeOfflineFiles(outDir: string, assetsDir = 'assets'): SwManifest {
  const paths = listFiles(outDir).map((p) => relative(outDir, p).split(sep).join('/'));
  const swPath = join(outDir, SW_FILE);
  const swSource = readFileSync(swPath, 'utf8');
  const hashed = paths.filter((p) => p !== SW_FILE && p !== SW_MANIFEST_FILE && !p.endsWith('.map')).map((p) => ({ path: p, content: readFileSync(join(outDir, p)) }));
  // The worker's own source counts too: a change to the worker alone is a new build.
  const buildId = computeBuildId([...hashed, { path: SW_FILE, content: swSource }]);
  const manifest = swManifest(paths, buildId, assetsDir);
  writeFileSync(join(outDir, SW_MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(swPath, stampServiceWorker(swSource, buildId));
  return manifest;
}

export function swManifestPlugin(): Plugin {
  let outDir = 'dist';
  let assetsDir = 'assets';
  return {
    name: 'tc-sw-manifest',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
      assetsDir = config.build.assetsDir;
    },
    closeBundle() {
      writeOfflineFiles(outDir, assetsDir);
    },
  };
}
