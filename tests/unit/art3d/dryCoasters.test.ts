// Batch 5 Task 6: the junior coaster, the wooden coaster and the spinning mouse on the track kit. Each is a style spec
// (tools/art3d/items/<type>.js) baked by trackKit.js bakeTrackType; these tests hold what the bake cannot show by
// itself: that each type is registered everywhere the bake and the reader look, that its numbers live in its own spec
// (not the steel ones), and that its models join up (supports reach the track, lattice bents stack, rails sit on the
// gauge the type's look draws).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getTrackTypeDef } from '../../../src/data/track';
import { REAL_FALLBACK } from '../../../src/render/real/fallbacks';
import { SUPPORT_TOP_BELOW_RAIL } from '../../../src/render/real/supportStack';
import { LOOKS } from '../../../src/render/track/paint';
import { trackGeometry } from '../../../tools/art3d/bakeNode';
import { trackBudget } from '../../../tools/art3d/trackBudget';

const dir = new URL('../../../tools/art3d/', import.meta.url);
const load = (rel: string): Promise<any> => import(/* @vite-ignore */ new URL(rel, dir).href); // eslint-disable-line @typescript-eslint/no-explicit-any

const T6: readonly string[] = ['junior_coaster', 'wooden_coaster', 'spinning_mouse'];

/** A stand-in kit: plain materials by name (the kit's textures need a canvas). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fakeKit(): Promise<any> {
  const T = await load('vendor/three-0.160.0.module.min.js');
  const mats = new Map<string, unknown>();
  return { T, K: { mat: new Proxy({}, { get: (_o, k: string) => mats.get(k) ?? (mats.set(k, new T.MeshBasicMaterial()), mats.get(k)) }) } };
}

/** World-space bounding box of an object's meshes (three.js axes: y up), optionally only the meshes `keep` accepts. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function bbox(T: any, o: any, keep: (m: any) => boolean = () => true) {
  o.updateMatrixWorld(true);
  const box = new T.Box3();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  o.traverse((m: any) => { if (m.isMesh && keep(m)) box.expandByObject(m); });
  return box;
}

describe('batch 5 Task 6 types are baked', () => {
  it('each is a track item with its module, card, spec, index entry, and the reader maps it to itself', async () => {
    const { TRACK_TYPES, CARD_ITEMS, ITEM_LIST } = await load('items/registry.js');
    const { TRACK_SPECS } = await load('items/trackSpecs.js');
    const index = readFileSync(new URL('items/index.js', dir), 'utf8');
    for (const id of T6) {
      expect(TRACK_TYPES.map((t: { type: string }) => t.type), id).toContain(id);
      expect(CARD_ITEMS.some((c: { id: string; kind: string }) => c.id === id && c.kind === 'track'), id).toBe(true);
      expect(ITEM_LIST.find((x: { id: string }) => x.id === id)?.track, id).toEqual({ type: id });
      expect(index, id).toMatch(new RegExp(`import ${id} from '\\./${id}\\.js'`));
      const { SPEC } = await load(`items/${id}.js`);
      expect(TRACK_SPECS[id], id).toBe(SPEC);
      expect(SPEC.item, id).toBe(id);
      expect(REAL_FALLBACK[id], id).toBe(id);
    }
  });

  it('none of them has loop, corkscrew or helix pieces: each has the 3 MB rule', () => {
    for (const id of T6) expect(trackBudget(id).compressedMax, id).toBe(3_000_000);
  });
});

describe('each type\'s numbers live in its own spec', () => {
  it('support offset is the game\'s; straddle is the type\'s own width; the bake input reads it', async () => {
    const steel = (await load('items/steel_coaster.js')).SPEC;
    for (const id of T6) {
      const { SPEC } = await load(`items/${id}.js`);
      expect(SPEC.supportTopBelowRail, id).toBe(SUPPORT_TOP_BELOW_RAIL);
      expect(typeof SPEC.straddleHalfM, id).toBe('number');
      expect(trackGeometry(id)).toEqual(trackGeometry(id, SPEC));
      // its own rail and support style objects, not the steel names
      expect(SPEC.rail, id).not.toBe(steel.rail);
      expect(SPEC.car, id).not.toBe(steel.car);
    }
  });

  it('gauges follow today\'s looks: junior at gauge 1.0 and the wooden coaster at the steel 1.2, scaled as the steel kit is', async () => {
    const { RAIL_STYLES } = await load('items/trackKit.js');
    // the kit's steel half gauge (0.5) stands for today's steel gauge (1.2): the same scale for the others
    const scale = RAIL_STYLES.steel.gauge / LOOKS.steel.gauge;
    // half gauges in the kit's scale: junior at today's 1.0, wooden at today's 1.2, the mouse narrower than the junior
    const want: Record<string, (g: number) => void> = {
      junior_coaster: (g) => expect(g).toBeCloseTo(1.0 * scale, 2),
      wooden_coaster: (g) => expect(g).toBeCloseTo(LOOKS.wood.gauge * scale, 2),
      spinning_mouse: (g) => expect(g).toBeLessThan(1.0 * scale - 0.01),
    };
    for (const id of T6) want[id]!((await load(`items/${id}.js`)).SPEC.rail.gauge);
  });

  it('the junior\'s spine is thinner than the steel coaster\'s', async () => {
    const { T, K } = await fakeKit();
    const { railModel, RAIL_STYLES } = await load('items/trackKit.js');
    const junior = (await load('items/junior_coaster.js')).SPEC;
    const s = trackGeometry('junior_coaster').pieces.straight!.dirs[0]!;
    const depth = (style: unknown) => { const rail = new T.MeshBasicMaterial(); const b = bbox(T, railModel(K, s, null, { rail }, style)); return b.max.y - b.min.y; };
    expect(depth(junior.rail)).toBeLessThan(depth(RAIL_STYLES.steel) - 0.05);
  });
});

describe('models join up', () => {
  it('the support top, stacked SUPPORT_TOP_BELOW_RAIL under the rail line, reaches into the underside of a straight', async () => {
    const { T, K } = await fakeKit();
    const { railModel, supportPiece } = await load('items/trackKit.js');
    for (const id of T6) {
      const { SPEC } = await load(`items/${id}.js`);
      const s = trackGeometry(id).pieces.straight!.dirs[0]!;
      const rail = new T.MeshBasicMaterial();
      const r = bbox(T, railModel(K, s, null, { rail }, SPEC.rail)); // y = 0 is the rail line (piece built at z 0)
      const sup = new T.MeshBasicMaterial();
      const top = supportPiece(K, 'top', 0, sup, SPEC.supports);
      top.position.y = -SPEC.supportTopBelowRail;
      const t = bbox(T, top);
      expect(t.max.y, `${id}: the top reaches the track`).toBeGreaterThanOrEqual(r.min.y + 0.02);
      expect(t.max.y, `${id}: and stops under the rails`).toBeLessThan(-0.15);
    }
  });

  it('wooden lattice bents: a 1 m segment\'s bracing runs leg to leg within its metre, so stacked segments line up', async () => {
    const { T, K } = await fakeKit();
    const { supportPiece, SEG_H } = await load('items/trackKit.js');
    const { SPEC } = await load('items/wooden_coaster.js');
    for (const t of [0, 1]) {
      const mat = new T.MeshBasicMaterial();
      const seg = supportPiece(K, 'seg', t, mat, SPEC.supports);
      const all = bbox(T, seg);
      expect(all.max.y).toBeCloseTo(SEG_H, 3);
      expect(all.min.y).toBeCloseTo(0, 3);
      // two legs across the track (z at t = 0, x at t = 1), the bracing between them
      const across = t === 0 ? 'z' : 'x';
      const along = t === 0 ? 'x' : 'z';
      expect(all.max[across] - all.min[across]).toBeGreaterThan(1.4);
      expect(all.max[along] - all.min[along]).toBeLessThan(0.4);
      // every brace lies in [0, 1] m: what is above 1 m is only the legs' overlap
      seg.updateMatrixWorld(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const braces: any[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      seg.traverse((m: any) => { if (m.isMesh && m.userData.brace) braces.push(m); });
      expect(braces.length).toBeGreaterThan(0);
      for (const b of braces) { const bb = new T.Box3().setFromObject(b); expect(bb.min.y).toBeGreaterThanOrEqual(-1e-6); expect(bb.max.y).toBeLessThanOrEqual(1 + 1e-6); }
    }
  });

  it('the game rows the specs are drawn from: the mouse spins, the junior has its own car, the wooden coaster lattice supports', () => {
    expect(getTrackTypeDef('spinning_mouse')!.vehicle.spins).toBe(true);
    expect(getTrackTypeDef('junior_coaster')!.render.car).toBe('junior');
    expect(getTrackTypeDef('wooden_coaster')!.render.supports).toBe('lattice');
  });
});
