/** Phase 8b stage 0b test (never merged): Vite plugin that builds the art sheets in app mode and serves `virtual:tc-art`. */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { runnerImport, type Plugin, type ResolvedConfig } from 'vite';
import type { ArtReport, KeyRow, SheetBuild } from './build';

const VIRTUAL = 'virtual:tc-art';
const RESOLVED = `\0${VIRTUAL}`;
const ENTRY = '/tools/sheets/entry.ts';
/** Bumped when the cache layout changes. */
const CACHE_FORMAT = 'tc-sheets-1';

interface EntryModule {
  build(opts?: { coarseOnly?: boolean }): SheetBuild;
}

/** Cache record next to the files: everything of a `SheetBuild` but the bytes. */
interface CacheMeta {
  format: string;
  paths: string[];
  packs: SheetBuild['packs'];
  report: ArtReport;
  keys: Record<string, KeyRow[]>;
}

/** Bench saves (Test decision 18): output name → source under `tests/perf/`. */
const BENCH: ReadonlyArray<[string, string]> = [
  ['bench/build1.json', 'tests/perf/build1-2000-guests.tcsave.json'],
  ['bench/build2.json', 'tests/perf/build2-128-3000-guests.tcsave.json'],
  ['bench/phone.json', 'tests/perf/phone-800-guests.tcsave.json'],
  ['bench/cases.json', 'tests/perf/cases-0b.tcsave.json'],
];

const MB = 1024 * 1024;
const mb = (b: number): string => (b / MB).toFixed(2);

/** The cache key: SHA-256 of the cache format and every module file the entry loads (path and content). */
function cacheKey(root: string, deps: readonly string[]): string {
  const h = createHash('sha256').update(CACHE_FORMAT);
  // Fix round 1 (I3): runnerImport's dependency list leaves out the entry module itself; the plugin is hashed too.
  const all = [...deps.map((d) => resolve(root, d.split('?')[0] as string)), resolve(root, 'tools/sheets/entry.ts'), resolve(root, 'tools/sheets/plugin.ts')];
  const files = [...new Set(all)].filter((p) => existsSync(p)).sort();
  for (const p of files) h.update(relative(root, p).split(sep).join('/')).update('\0').update(readFileSync(p)).update('\n');
  return h.digest('hex');
}

/** Loads the catalogue through the runner; paints only on a cache miss. */
async function loadSheets(root: string, log: (line: string) => void): Promise<SheetBuild & { cached: boolean; ms: number }> {
  const t0 = performance.now();
  const { module, dependencies } = await runnerImport<EntryModule>(ENTRY, { configFile: false, root, logLevel: 'error', define: { __TC_APP__: 'true' } });
  const key = cacheKey(root, dependencies);
  const cacheDir = join(root, 'node_modules', '.cache', 'tc-sheets');
  const metaPath = join(cacheDir, `${key}.json`);
  const filesDir = join(cacheDir, key);
  if (existsSync(metaPath)) {
    const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as CacheMeta;
    if (meta.format === CACHE_FORMAT && meta.paths.every((p) => existsSync(join(filesDir, p)))) {
      const files = meta.paths.map((p) => ({ path: p, bytes: new Uint8Array(readFileSync(join(filesDir, p))) }));
      const ms = Math.round(performance.now() - t0);
      log(`cache hit ${key.slice(0, 12)} in ${ms} ms`);
      return { files, packs: meta.packs, report: meta.report, keys: meta.keys, cached: true, ms };
    }
  }
  log(`cache miss ${key.slice(0, 12)}: painting`);
  const built = module.build();
  rmSync(filesDir, { recursive: true, force: true });
  for (const f of built.files) {
    const p = join(filesDir, f.path);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, f.bytes);
  }
  const meta: CacheMeta = { format: CACHE_FORMAT, paths: built.files.map((f) => f.path), packs: built.packs, report: built.report, keys: built.keys };
  writeFileSync(metaPath, JSON.stringify(meta));
  return { ...built, cached: false, ms: Math.round(performance.now() - t0) };
}

/** Report and key rows to the folders the caller names (`TC_ART_REPORT`, `TC_ART_KEYS`). */
function writeOutputs(b: SheetBuild): void {
  const reportPath = process.env.TC_ART_REPORT;
  if (reportPath) {
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, `${JSON.stringify(b.report, null, 2)}\n`);
  }
  const keysDir = process.env.TC_ART_KEYS;
  if (keysDir) {
    mkdirSync(keysDir, { recursive: true });
    for (const [pack, rows] of Object.entries(b.keys)) writeFileSync(join(keysDir, `${pack}.json`), JSON.stringify(rows));
  }
}

/**
 * App mode (`--mode app`): builds the sheets once per run (disk cache in `node_modules/.cache/tc-sheets/`), emits them
 * as assets (dev server: serves them from memory), and with `VITE_BENCH=1` also the bench saves. `virtual:tc-art`
 * exports `packs` (index URLs relative to `base`) and `report`. Web mode: `packs = []`, `report = null`, no files.
 */
export function sheetsPlugin(): Plugin {
  let config: ResolvedConfig;
  let app = false;
  let pending: Promise<SheetBuild> | null = null;
  const log = (line: string): void => config.logger.info(`[tc-sheets] ${line}`);
  const sheets = (): Promise<SheetBuild> => {
    pending ??= loadSheets(config.root, log).then((b) => {
      for (const [name, p] of Object.entries(b.report.packs)) {
        log(`${name}: ${p.pictures} pictures, ${p.unique} unique, ${p.sheets} sheets, png ${mb(p.pngBytes)} MB, decoded ${mb(p.decodedBytes)} MB`);
      }
      log(
        `total png ${mb(b.report.totalPngBytes)} MB; app art full ${mb(b.report.appArtBytesFull)} MB, coarse only ${mb(b.report.appArtBytesCoarseOnly)} MB; ` +
          `paint build ${b.report.buildMs} ms; this run ${b.ms} ms (${b.cached ? 'cached' : 'painted'})`,
      );
      writeOutputs(b);
      return b;
    });
    return pending;
  };
  return {
    name: 'tc-sheets',
    configResolved(c) {
      config = c;
      app = c.mode === 'app';
    },
    resolveId(id) {
      return id === VIRTUAL ? RESOLVED : null;
    },
    async load(id) {
      if (id !== RESOLVED) return null;
      if (!app) return 'export const packs = [];\nexport const report = null;\n';
      const b = await sheets();
      const packs = b.packs.map((p) => ({ name: p.name, url: p.index, hash: p.hash }));
      return `export const packs = ${JSON.stringify(packs)};\nexport const report = ${JSON.stringify(b.report)};\n`;
    },
    async buildStart() {
      if (!app || config.command !== 'build') return;
      const b = await sheets();
      for (const f of b.files) this.emitFile({ type: 'asset', fileName: f.path, source: f.bytes });
      if (process.env.VITE_BENCH === '1') {
        for (const [fileName, src] of BENCH) {
          const p = join(config.root, src);
          if (existsSync(p)) this.emitFile({ type: 'asset', fileName, source: readFileSync(p) });
        }
      }
    },
    configureServer(server) {
      if (!app) return;
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0] as string;
        const base = config.base.startsWith('/') ? config.base : '/';
        if (!url.startsWith(`${base}art/`)) return next();
        const path = url.slice(base.length);
        sheets().then(
          (b) => {
            const f = b.files.find((x) => x.path === path);
            if (!f) return next();
            res.setHeader('Content-Type', path.endsWith('.png') ? 'image/png' : 'application/octet-stream');
            res.end(Buffer.from(f.bytes));
          },
          (err: unknown) => next(err),
        );
      });
    },
  };
}

/** App mode: no service worker (the app ships its files); deletes the copied `sw.js` from the output folder. */
export function dropWorker(): Plugin {
  let outDir = '';
  return {
    name: 'tc-drop-worker',
    apply: 'build',
    configResolved(c) {
      outDir = resolve(c.root, c.build.outDir);
    },
    closeBundle() {
      rmSync(join(outDir, 'sw.js'), { force: true });
    },
  };
}
