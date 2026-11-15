import { existsSync, readdirSync, readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { FLAT_RIDES } from '../../../src/data/catalog';
import { REAL_FALLBACK } from '../../../src/render/real/fallbacks';
import { itemSpec } from '../../../tools/art3d/catalog';

// Plain JS build tools without types: import by a computed path so they load as `any`.
/** The baked items the stage 1 reader (Task 7 fallbacks.ts) maps game ids to. */
const REAL_FALLBACK_IDS = ['carousel', 'swing_tower', 'big_wheel', 'snack_shack', 'oak_round', 'pine_tall', 'birch_silver', 'willow', 'shrub_round', 'boulder', 'lamp_globe', 'bunting_pole', 'bench', 'bin', 'steel_coaster', 'teacup_twirl', 'rocket_rounds', 'kiddie_cars', 'merry_mill', 'observation_tower', 'drop_tower', 'gyro_globe', 'spiral_slide', 'pendulum_ship', 'magic_carpet', 'flip_arm', 'bumper_cars', 'mirror_maze', 'haunted_manor', 'thunder_disc'];
const dir = new URL('../../../tools/art3d/', import.meta.url);
const load = (rel: string): Promise<any> => import(/* @vite-ignore */ new URL(rel, dir).href); // eslint-disable-line @typescript-eslint/no-explicit-any

describe('stage 1 bake list', () => {
  it('every item has its module, its files and a bake entry in items/index.js', async () => {
    const { ITEM_LIST, SHARED } = await load('items/registry.js');
    const index = readFileSync(new URL('items/index.js', dir), 'utf8');
    for (const it of ITEM_LIST) {
      for (const f of [...SHARED, it.file, ...(it.deps ?? [])]) expect(existsSync(new URL(f, dir)), `${it.id}: ${f}`).toBe(true);
      expect(index).toMatch(new RegExp(`import ${it.id} from '\\./${it.file.replace('items/', '')}'`));
    }
  });
  it('catalogue items resolve to a footprint and height', async () => {
    const { ITEM_LIST } = await load('items/registry.js');
    for (const it of ITEM_LIST.filter((x: { catalog?: unknown }) => x.catalog)) {
      const s = itemSpec(it.catalog[0], it.catalog[1]);
      expect(s.footprintTiles.every((n) => n >= 1)).toBe(true);
      expect(s.heightM).toBeGreaterThan(0);
    }
  });
  it('bakes every item the stage 1 reader maps to', async () => {
    const { ITEM_LIST } = await load('items/registry.js');
    const ids = new Set(ITEM_LIST.map((x: { id: string }) => x.id));
    for (const id of REAL_FALLBACK_IDS) expect(ids.has(id), id).toBe(true);
  });
});

describe('batch 1 flat rides', () => {
  const BAKED_RIDES = ['carousel', 'swing_tower', 'big_wheel', 'teacup_twirl', 'rocket_rounds', 'kiddie_cars', 'merry_mill', 'observation_tower', 'drop_tower', 'gyro_globe', 'spiral_slide', 'pendulum_ship', 'magic_carpet', 'flip_arm', 'bumper_cars', 'mirror_maze', 'haunted_manor', 'thunder_disc'];
  it('every baked ride is in the registry and is its own baked item (not a stand-in)', async () => {
    const { ITEM_LIST } = await load('items/registry.js');
    const ids = new Set(ITEM_LIST.map((x: { id: string }) => x.id));
    for (const id of BAKED_RIDES) {
      expect(ids.has(id), id).toBe(true);
      expect(REAL_FALLBACK[id], id).toBe(id);
    }
  });
  it('every baked ride has its own card picture', async () => {
    const { CARD_ITEMS } = await load('items/registry.js');
    for (const id of BAKED_RIDES) expect(CARD_ITEMS.some((c: { id: string; kind: string }) => c.id === id && c.kind === 'ride'), id).toBe(true);
  });
  it('every flat ride in the game is baked (batch 1 covers all of FLAT_RIDES)', () => {
    expect(FLAT_RIDES.map((r) => r.id).sort()).toEqual([...BAKED_RIDES].sort());
  });
});

// The cache key hashes SHARED + an item's file + its deps (bake.mjs): a code file an item imports but the registry
// does not list would not re-bake the item when it changes (a stale picture). Follow each item module's relative
// imports, transitively, inside tools/art3d and src, and require every file reached to be listed.
describe('cache key covers the code an item is built from', () => {
  const root = new URL('../../../', import.meta.url);
  const inTree = (u: URL) => u.href.startsWith(new URL('tools/art3d/', root).href) || u.href.startsWith(new URL('src/', root).href);
  const resolve = (spec: string, from: URL): URL | null => {
    const base = new URL(spec, from);
    for (const ext of ['', '.ts', '.js', '/index.ts', '/index.js']) {
      const u = new URL(base.href + ext);
      if (existsSync(u) && !u.pathname.endsWith('/')) {
        try { readFileSync(u); return u; } catch { /* a directory */ }
      }
    }
    return null;
  };
  // Runtime imports only (`import type` is erased and cannot change a picture), read from the syntax tree: a regex
  // comment strip took `items/*.js` inside a line comment of items/common.js for a block comment and swallowed the
  // file's imports (re-review N1).
  const importsOf = (u: URL): string[] => {
    const text = readFileSync(u, 'utf8');
    const sf = ts.createSourceFile(u.pathname, text, ts.ScriptTarget.Latest, false, /\.ts$/.test(u.pathname) ? ts.ScriptKind.TS : ts.ScriptKind.JS);
    const out: string[] = [];
    const add = (n: ts.Node | undefined): void => { if (n && ts.isStringLiteral(n) && n.text.startsWith('.')) out.push(n.text); };
    const visit = (n: ts.Node): void => {
      if (ts.isImportDeclaration(n)) { if (!n.importClause?.isTypeOnly) add(n.moduleSpecifier); }
      else if (ts.isExportDeclaration(n)) { if (!n.isTypeOnly) add(n.moduleSpecifier); }
      else if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword) add(n.arguments[0]);
      ts.forEachChild(n, visit);
    };
    visit(sf);
    return out;
  };
  /** One-line relative runtime imports and re-exports, counted line by line with no comment handling: a floor for `importsOf`. */
  const naiveImportCount = (u: URL): number =>
    readFileSync(u, 'utf8').split('\n').filter((l) => /^\s*(?:import|export)\s+(?!type\s)[^;'"]*?from\s*['"]\.|^\s*import\s*['"]\./.test(l)).length;

  it('reads every import of items/common.js, whose first line comment holds `/*` (N1)', () => {
    const common = new URL('items/common.js', dir);
    expect(readFileSync(common, 'utf8').split('\n')[0]).toContain('/*');
    expect(importsOf(common)).toEqual(expect.arrayContaining(['../kit.js', './rideKeys.js', '../../../src/render/real/indexFormat']));
  });

  it('finds no fewer imports in any bake module than a line-by-line count does', () => {
    const walk = (d: URL): URL[] => readdirSync(d, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? (e.name === 'vendor' ? [] : walk(new URL(`${e.name}/`, d))) : /\.(js|ts|mjs)$/.test(e.name) ? [new URL(e.name, d)] : []);
    const files = walk(dir);
    expect(files.length).toBeGreaterThan(30);
    for (const f of files) expect(importsOf(f).length, f.pathname.replace(root.pathname, '')).toBeGreaterThanOrEqual(naiveImportCount(f));
  });

  it('items/index.js imports exactly the ITEM_LIST modules (N2)', async () => {
    const { ITEM_LIST } = await load('items/registry.js');
    const index = new URL('items/index.js', dir);
    const got = importsOf(index).map((s) => new URL(s, index).href).sort();
    const want = ITEM_LIST.map((it: { file: string }) => new URL(it.file, dir).href).sort();
    expect(got).toEqual([...new Set(want)].sort());
  });

  // Files not followed further, each with the reason its own imports cannot change a picture and the names taken
  // from it. `listed`: the file itself is in SHARED or deps (its own text can change a picture).
  const LEAF_USE: Record<string, { why: string; names: string[]; listed: boolean }> = {
    'tools/art3d/items/index.js': {
      why: 'the dispatch table: bakePage.ts runs ITEMS[id] for the item it bakes, and each item module is keyed in its own entry (the first test here checks the table imports every module)',
      names: ['ITEMS'],
      listed: false,
    },
    'src/render/scenery/sprites.ts': {
      listed: true,
      why: 'items/scenery.js takes only sceneryFrame from it, a pure function of SCENERY_FRAME in the same file; the rest of its import graph is the canvas sprite drawing the bake never calls',
      names: ['sceneryFrame'],
    },
  };

  it('every relative import reached from each item module is in SHARED or the item\'s deps', async () => {
    const { ITEM_LIST, SHARED } = await load('items/registry.js');
    const missing = new Set<string>();
    for (const it of ITEM_LIST) {
      const listed = new Set([...SHARED, it.file, ...(it.deps ?? [])].map((f: string) => new URL(f, dir).href));
      const seen = new Set<string>();
      // the item's module, and the SHARED code every bake runs (bakePage.ts, the kit, the camera)
      const todo = [it.file, ...SHARED].filter((f: string) => /\.(js|ts|mjs)$/.test(f) && !f.startsWith('vendor/')).map((f: string) => new URL(f, dir));
      while (todo.length) {
        const u = todo.pop()!;
        if (seen.has(u.href)) continue;
        seen.add(u.href);
        for (const spec of importsOf(u)) {
          const r = resolve(spec, u);
          expect(r, `${it.id}: ${spec} from ${u.pathname} resolves`).not.toBeNull();
          if (!r || !inTree(r)) continue;
          const leaf = LEAF_USE[r.pathname.replace(root.pathname, '')];
          if (leaf && !leaf.listed) continue;
          if (!listed.has(r.href)) missing.add(`${it.id}: ${r.pathname.replace(root.pathname, '')} (imported by ${u.pathname.replace(root.pathname, '')})`);
          if (LEAF_USE[r.pathname.replace(root.pathname, '')]) continue;
          todo.push(r);
        }
      }
      expect(seen.size, it.id).toBeGreaterThan(1);
    }
    expect([...missing], 'not in SHARED or the item\'s deps').toEqual([]);
  });

  it('a file not followed (LEAF_USE) is only used for the names its reason gives', () => {
    const users = ITEM_FILES_IMPORTING_LEAVES();
    for (const [leaf, { why, names }] of Object.entries(LEAF_USE)) {
      expect(why.trim().length, leaf).toBeGreaterThan(0);
      const imports = users.filter((u) => u.leaf === leaf);
      expect(imports.length, `${leaf} is imported by a bake module`).toBeGreaterThan(0);
      for (const u of imports) expect(u.names, `${u.from} imports from ${leaf}`).toEqual(names);
    }
    // sceneryFrame reads nothing but SCENERY_FRAME
    const sprites = readFileSync(new URL('src/render/scenery/sprites.ts', root), 'utf8');
    const body = sprites.slice(sprites.indexOf('export function sceneryFrame'), sprites.indexOf('\n}\n', sprites.indexOf('export function sceneryFrame')));
    expect(body.replace(/SCENERY_FRAME\.\w+/g, '').match(/[A-Z_]{3,}|\w+\(/g) ?? [], 'sceneryFrame calls or reads nothing else').toEqual(['sceneryFrame(']);
  });

  /** Every import, in a tools/art3d module, of a LEAF_USE file: which names it takes. */
  function ITEM_FILES_IMPORTING_LEAVES(): { from: string; leaf: string; names: string[] }[] {
    const out: { from: string; leaf: string; names: string[] }[] = [];
    const walk = (d: URL) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        if (e.isDirectory()) { if (e.name !== 'vendor') walk(new URL(`${e.name}/`, d)); continue; }
        if (!/\.(js|ts|mjs)$/.test(e.name)) continue;
        const u = new URL(e.name, d);
        for (const m of readFileSync(u, 'utf8').matchAll(/import\s*\{([^}]*)\}\s*from\s*['"](\.[^'"]+)['"]/g)) {
          const r = resolve(m[2] as string, u);
          if (!r) continue;
          const leaf = r.pathname.replace(root.pathname, '');
          if (LEAF_USE[leaf]) out.push({ from: u.pathname.replace(root.pathname, ''), leaf, names: (m[1] as string).split(',').map((x) => x.trim()).filter((x) => x && !x.startsWith('type ')) });
        }
      }
    };
    walk(dir);
    return out;
  }
});
