import { readFileSync } from 'node:fs';
// Batch 5 Task 7: the bobsled run, the launch coaster and the mine train on the track kit. One table row per type: the
// bake list, the reader's map, the style spec (its numbers and the game's render row it draws), the bake input and
// which rail frames go on masked sheets.
import { describe, expect, it } from 'vitest';
import { getTrackPieceDef, getTrackTypeDef } from '../../../src/data/track';
import { REAL_FALLBACK } from '../../../src/render/real/fallbacks';
import { SUPPORT_TOP_BELOW_RAIL } from '../../../src/render/real/supportStack';
import { trackGeometry } from '../../../tools/art3d/bakeNode';
import { UNTINTED_GROUPS, checkIndex, trackComplete } from '../../../tools/art3d/checkIndex';
import type { RealFrame, RealIndex, RealSetEntry } from '../../../src/render/real/indexFormat';
import { railSplitClass } from '../../../src/render/real/trackClasses';
import { typePieces } from '../../../tools/art3d/sizeReport';
import { MASK_COVERAGE_FLOOR, MASK_COVERAGE_MEASURED, coverageKind, floorOf } from '../../../tools/art3d/maskFloors';

const dir = new URL('../../../tools/art3d/', import.meta.url);
const load = (rel: string): Promise<any> => import(/* @vite-ignore */ new URL(rel, dir).href); // eslint-disable-line @typescript-eslint/no-explicit-any

interface RailFrame { piece: string; key: string; alpha: boolean }

/**
 * `masked`: every rail frame has untinted parts (the bobsled's ice, the mine train's timber sleepers and stringers),
 * so every piece sits on a masked sheet; else only the UNTINTED_GROUPS pieces do (the launch piece's motors among them).
 * `signature`: the piece the type is recognised by, which must be in its bake input. `maskedPieces`: pieces with untinted
 * parts of their own (the launch piece's motors), on masked sheets whatever the type's other pieces do.
 */
const TYPES = [
  { type: 'bobsled_run', masked: true, signature: 'helix_left_down', maskedPieces: [] },
  { type: 'launch_coaster', masked: false, signature: 'launch', maskedPieces: ['launch', 'station', 'brakes', 'block_brake'] },
  { type: 'mine_train', masked: true, signature: 'helix_right_down', maskedPieces: [] },
] as const;

describe.each(TYPES)('$type on the track kit', ({ type, masked, signature, maskedPieces }) => {
  it('is in the bake list with its own module and a track card, and the reader draws it as itself', async () => {
    const { TRACK_TYPES, CARD_ITEMS, ITEM_LIST } = await load('items/registry.js');
    expect(TRACK_TYPES).toContainEqual({ type, file: `items/${type}.js` });
    expect(ITEM_LIST.find((x: { id: string }) => x.id === type)?.track).toEqual({ type });
    expect(CARD_ITEMS).toContainEqual({ id: type, kind: 'track' });
    expect(REAL_FALLBACK[type]).toBe(type);
  });

  it('its style spec is the module\'s, names the game\'s render row and resolves on the kit', async () => {
    const { SPEC } = await load(`items/${type}.js`);
    const { TRACK_SPECS, trackSpecOf } = await load('items/trackSpecs.js');
    const { stylesOf } = await load('items/trackKit.js');
    expect(TRACK_SPECS[type]).toBe(SPEC);
    expect(trackSpecOf(type)).toBe(SPEC);
    expect(SPEC.item).toBe(type);
    const r = getTrackTypeDef(type)!.render;
    expect(SPEC.look).toEqual({ rail: r.rail, supports: r.supports, car: r.car });
    const st = stylesOf(SPEC);
    for (const k of ['rail', 'supports', 'car'] as const) expect(st[k], k).toBeTruthy();
    expect(typeof st.rail.build).toBe('function');
    expect(typeof st.rail.trough).toBe('function'); // the kit shoots a chain trough for every chainable piece
    expect(typeof st.supports.piece).toBe('function');
    expect(typeof st.car.build).toBe('function');
    expect(SPEC.supportTopBelowRail).toBe(SUPPORT_TOP_BELOW_RAIL);
    expect(SPEC.straddleHalfM).toBeGreaterThan(0.5);
    for (const c of Object.values(SPEC.colours)) expect(c).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('its bake input holds every piece it builds, the signature piece among them, cut by runs only at vertical loops', () => {
    const t = trackGeometry(type);
    expect(Object.keys(t.pieces).sort()).toEqual(typePieces(type).sort());
    expect(Object.keys(t.pieces)).toContain(signature);
    for (const [id, pc] of Object.entries(t.pieces)) expect(pc.dirs.some((d) => d.tiles.some((q) => q.runs)), id).toBe(id.startsWith('vertical_loop'));
  });

  it(masked ? 'every rail frame goes on a masked sheet' : 'rail frames go on alpha sheets except pieces with untinted parts', async () => {
    const { railFrames } = await load('items/trackKeys.js');
    const frames: RailFrame[] = railFrames(trackGeometry(type));
    expect(frames.length).toBeGreaterThan(0);
    for (const f of frames) expect(f.alpha, f.key).toBe(!masked && !UNTINTED_GROUPS.includes(getTrackPieceDef(f.piece)!.group));
    for (const id of maskedPieces as readonly string[]) expect(frames.filter((f) => f.piece === id).every((f) => !f.alpha), id).toBe(true);
    if (!masked) expect([...new Set(frames.filter((f) => !f.alpha).map((f) => f.piece))].sort()).toEqual([...maskedPieces].sort());
  });
});

describe('mask coverage floors of a type with untinted parts by design', () => {
  it('the bobsled\'s rails (ice lining) are measured against their own floor, next to their measured share', () => {
    expect(coverageKind({ kind: 'rail', item: 'bobsled_run~helix' })).toBe('rail@bobsled_run');
    expect(MASK_COVERAGE_FLOOR['rail@bobsled_run']).toBe(floorOf(MASK_COVERAGE_MEASURED['rail@bobsled_run']!));
    // other types and kinds keep the shared floors
    expect(coverageKind({ kind: 'rail', item: 'steel_coaster~helix' })).toBe('rail');
    expect(coverageKind({ kind: 'car', item: 'bobsled_run~bank' })).toBe('car~bank');
  });
  it.each(['launch_coaster', 'mine_train'])('the %s car is measured against its own floor per class', (type) => {
    for (const c of trackGeometry(type).classes.filter((x) => x.poses.length)) {
      const k = `car~${c.cls}@${type}`;
      expect(coverageKind({ kind: 'car', item: `${type}~${c.cls}` }), c.cls).toBe(k);
      expect(MASK_COVERAGE_FLOOR[k], k).toBe(floorOf(MASK_COVERAGE_MEASURED[k]!));
    }
  });
  it('the mine train\'s rails (timber sleepers and stringers) are measured against their own floor', () => {
    expect(coverageKind({ kind: 'rail', item: 'mine_train~base' })).toBe('rail@mine_train');
    expect(MASK_COVERAGE_FLOOR['rail@mine_train']).toBe(floorOf(MASK_COVERAGE_MEASURED['rail@mine_train']!));
  });
});

describe('rail sets split in halves (coordinator decision: masked helix sets over the 8 MiB per-set rule)', () => {
  /** A fake index holding exactly the frames the kit's plan shoots (rail sets by `set`, cars by class and quadrant). */
  async function planIndex(type: string, drop?: (key: string, item: string) => boolean): Promise<RealIndex> {
    const { railFrames, carFrames, classItem } = await load('items/trackKeys.js');
    const fr: RealFrame = { sheet: 'a.webp', sx: 0, sy: 0, w: 1, h: 1, ox: 0, oy: 0 };
    const sets = new Map<string, RealSetEntry>();
    const add = (kind: 'rail' | 'car', item: string, d: 2 | 4, rot: 0 | 1 | 2 | 3, key: string): void => {
      if (drop?.(key, item)) return;
      const k = `${kind}:${item}:d${d}:r${rot}`;
      if (!sets.has(k)) sets.set(k, { key: k as RealSetEntry['key'], kind, item, density: d, rot, sheets: [{ file: 'a.webp', w: 1, h: 1 }], frames: {} });
      sets.get(k)!.frames[key] = fr;
    };
    const t = trackGeometry(type);
    for (const d of [2, 4] as const) {
      for (const f of railFrames(t)) for (const k of [f.key, f.shadow, ...(f.chain ? [f.chain] : [])]) add('rail', classItem(type, f.set), d, f.heading, k);
      for (const f of carFrames(t)) add('car', classItem(type, f.set), d, f.q, f.key);
    }
    return { format: 'real/1', pxPerMetreZoom1: 11.31, stepPxPerMetre: 9.8, densities: [2, 4], sets: [...sets.values()], bytes: { compressed: 0, decodedByDensity: { 2: 0, 4: 0 } } };
  }

  it.each(['bobsled_run', 'mine_train'])('%s bakes its helix rails in two halves, by railSplitClass; other classes whole', async (type) => {
    const { railFrames } = await load('items/trackKeys.js');
    const frames = railFrames(trackGeometry(type));
    for (const f of frames) expect(f.set, f.key).toBe(f.cls === 'helix' ? railSplitClass(f.piece) : f.cls);
    expect(new Set(frames.filter((f: { cls: string }) => f.cls === 'helix').map((f: { set: string }) => f.set))).toEqual(new Set(['helix.0', 'helix.1']));
  });

  it('a type with no split (launch coaster) keeps every class whole', async () => {
    const { railFrames } = await load('items/trackKeys.js');
    for (const f of railFrames(trackGeometry('launch_coaster'))) expect(f.set).toBe(f.cls);
  });

  it.each(['bobsled_run', 'mine_train', 'launch_coaster', 'steel_coaster'])('%s: the kit\'s frame plan is exactly what TRACK_COMPLETE wants; a half missing a frame fails', async (type) => {
    expect(trackComplete(await planIndex(type))).toEqual([]);
    if (type === 'launch_coaster' || type === 'steel_coaster') return; // no rail halves
    const p = trackComplete(await planIndex(type, (key, item) => item.endsWith('~helix.1') && key === 'helix_left_down:t0'));
    expect(p.some((x) => x.startsWith(`TRACK_COMPLETE rail:${type}~helix.1`))).toBe(true);
  });

  it('a split class name is a known class; a class in both layouts (whole and halves) is a problem', async () => {
    const ix = await planIndex('bobsled_run');
    expect(checkIndex(ix, new Set(['a.webp'])).filter((x) => /unknown track class/.test(x))).toEqual([]);
    const both = await planIndex('bobsled_run');
    const half = both.sets.find((s) => s.item === 'bobsled_run~helix.0' && s.density === 4 && s.rot === 0)!;
    both.sets.push({ ...half, key: 'rail:bobsled_run~helix:d4:r0' as RealSetEntry['key'], item: 'bobsled_run~helix' });
    expect(trackComplete(both).some((x) => /both layouts/.test(x) && x.includes('helix'))).toBe(true);
    const bad = await planIndex('bobsled_run');
    bad.sets.push({ ...half, key: 'rail:bobsled_run~helix.7:d4:r0' as RealSetEntry['key'], item: 'bobsled_run~helix.7' });
    expect(checkIndex(bad, new Set(['a.webp'])).some((x) => /unknown track class 'helix.7'/.test(x))).toBe(true);
  });
});

// The hold-out ground (P1, found in Task 7): it sat at y = 0 and hid whatever lay under it and was drawn after it,
// cutting the lower half of descending pieces and pitched cars (the steel car at y8:p3 lost its front). The kit now
// drops it under each shot's lowest point; a model wholly above y = 0 keeps it where it was.
describe('the hold-out ground never cuts a track model (every type)', () => {
  it('a pitched car (steel y8:p3) and a descending piece get the ground under their lowest point; a model above y = 0 keeps it at -0.002', async () => {
    const T = await load('vendor/three-0.160.0.module.min.js');
    const { poseCar, holdOutY, GROUND_Y } = await load('items/trackKit.js');
    expect(GROUND_Y).toBe(-0.002);
    const car = new T.Group();
    const body = new T.Mesh(new T.BoxGeometry(1.3, 0.8, 2.1));
    body.position.y = 0.3;
    car.add(body);
    poseCar(car, { yaw: 8, pitch: 3, roll: 0 });
    const min = new T.Box3().setFromObject(car).min.y;
    expect(min).toBeLessThan(-0.3); // the nose dips well under the rail line
    expect(holdOutY(min)).toBeLessThan(min);
    expect(holdOutY(0.25)).toBe(GROUND_Y);
    expect(holdOutY(-6.4)).toBeLessThan(-6.4); // a steep drop's lowest rail
  });
  it('the kit sets the ground under every rail and car shot, for every type (no per-type flag)', () => {
    const src = readFileSync(new URL('items/trackKit.js', dir), 'utf8');
    expect(src).not.toMatch(/groundHoldOut/);
    expect(src.match(/bs\.ground\.position\.y = holdOutY\(/g)?.length).toBe(2); // rails, cars
    for (const t of ['bobsled_run', 'launch_coaster', 'mine_train', 'steel_coaster']) expect(readFileSync(new URL(`items/${t}.js`, dir), 'utf8')).not.toMatch(/groundHoldOut/);
  });
});

describe('car sets split in halves by roll (steel and launch cork cars once uncut)', () => {
  it.each(['steel_coaster', 'launch_coaster'])('%s bakes its cork cars in roll halves, each quadrant split near evenly; other car classes whole', async (type) => {
    const { carFrames } = await load('items/trackKeys.js');
    const { carSplitClass } = await import('../../../src/render/real/trackClasses');
    const frames = carFrames(trackGeometry(type));
    for (const f of frames) expect(f.set, f.key).toBe(f.cls === 'cork' ? carSplitClass('cork', f.pose.yaw, f.pose.roll) : f.cls);
    for (const q of [0, 1, 2, 3]) {
      const n = (h: string) => frames.filter((f: { set: string; q: number }) => f.set === h && f.q === q).length;
      expect(Math.abs(n('cork.0') - n('cork.1')), `q${q}`).toBeLessThanOrEqual(n('cork.0') / 4); // neither half holds most
    }
  });
  it('a car frame missing from its half fails TRACK_COMPLETE; a split car class is known; floors read the class of a half', async () => {
    const { carFrames, classItem } = await load('items/trackKeys.js');
    const f = carFrames(trackGeometry('steel_coaster')).find((x: { cls: string }) => x.cls === 'cork');
    expect(coverageKind({ kind: 'car', item: `steel_coaster~${f.set}` })).toBe('car~cork');
    const fr: RealFrame = { sheet: 'a.webp', sx: 0, sy: 0, w: 1, h: 1, ox: 0, oy: 0 };
    const set: RealSetEntry = { key: `car:${classItem('steel_coaster', f.set)}:d4:r${f.q}` as RealSetEntry['key'], kind: 'car', item: classItem('steel_coaster', f.set), density: 4, rot: f.q, sheets: [{ file: 'a.webp', w: 1, h: 1, mask: 'm.png' }, { file: 'm.png', w: 1, h: 1 }], frames: { other: fr } };
    const ix: RealIndex = { format: 'real/1', pxPerMetreZoom1: 11.31, stepPxPerMetre: 9.8, densities: [4], sets: [set], bytes: { compressed: 0, decodedByDensity: { 2: 0, 4: 0 } } };
    expect(checkIndex(ix, new Set(['a.webp', 'm.png'])).filter((x) => /unknown track class/.test(x))).toEqual([]);
    expect(trackComplete(ix).some((x) => x.includes(`car:steel_coaster~${f.set} d4 r${f.q}`) && x.includes(f.key))).toBe(true);
  });
});

describe('chain troughs only where the type can chain a piece', () => {
  it('the launch coaster (chain: false) bakes no chain trough; TRACK_COMPLETE wants none; chain types keep theirs', async () => {
    const { railFrames } = await load('items/trackKeys.js');
    expect(railFrames(trackGeometry('launch_coaster')).filter((f: { chain: string | null }) => f.chain)).toEqual([]);
    for (const t of ['steel_coaster', 'bobsled_run', 'mine_train']) expect(railFrames(trackGeometry(t)).some((f: { chain: string | null }) => f.chain), t).toBe(true);
    const src = readFileSync(new URL('checkIndex.ts', dir), 'utf8');
    expect(src).toMatch(/getTrackTypeDef\(type\)\?\.chain/);
  });
});

describe('track card supports', () => {
  it('every part of a card\'s support stack faces the track, as the game stacks them (the mine trestle\'s legs stand across it)', async () => {
    const { cardSupportStacks } = await load('items/cards.js');
    const { SPEC } = await load('items/mine_train.js');
    const { cardInput } = await import('../../../tools/art3d/bakeNode');
    const scene = cardInput([]).tracks.mine_train!;
    const stacks = cardSupportStacks(scene, SPEC);
    expect(stacks.length).toBeGreaterThan(0);
    expect(stacks.some((st: { heading: number }) => st.heading !== 0)).toBe(true);
    for (const st of stacks) for (const p of st.parts) expect(p.heading, `${p.part} at ${st.heading}`).toBe(st.heading);
  });
});

// Size room (after batch 5 Tasks 6-7): the spinning mouse's `base` car sets were 7.85-7.96 MiB per quadrant at d4, its
// cars spun to all 32 yaws; split by yaw parity (trackClasses.ts CAR_SPLIT_AXIS) each half holds 4 of a quadrant's 8 yaws.
describe('spinning mouse base cars split in halves by yaw parity', () => {
  it('bakes its base cars in yaw halves, each quadrant split evenly; its turn cars whole', async () => {
    const { carFrames } = await load('items/trackKeys.js');
    const { carSplitClass } = await import('../../../src/render/real/trackClasses');
    const frames = carFrames(trackGeometry('spinning_mouse'));
    for (const f of frames) expect(f.set, f.key).toBe(f.cls === 'base' ? carSplitClass('base', f.pose.yaw, f.pose.roll) : f.cls);
    for (const q of [0, 1, 2, 3]) {
      const n = (h: string) => frames.filter((f: { set: string; q: number }) => f.set === h && f.q === q).length;
      expect(n('base.0'), `q${q}`).toBeGreaterThan(0);
      expect(Math.abs(n('base.0') - n('base.1')), `q${q}`).toBeLessThanOrEqual(n('base.0') / 8);
    }
  });
  it('a split that splits nothing fails the bake input (a non-spinning type\'s base cars face the headings: even yaws only)', () => {
    expect(() => trackGeometry('steel_coaster', { straddleHalfM: 0.6, splitCarClasses: ['base'] })).toThrow(/splits \d+ \/ 0/);
  });
  it('TRACK_COMPLETE refuses a class baked both whole and in halves, and a half without its pair', async () => {
    const { carFrames, classItem } = await load('items/trackKeys.js');
    const geo = trackGeometry('spinning_mouse');
    const frames = carFrames(geo);
    const fr: RealFrame = { sheet: 'a.webp', sx: 0, sy: 0, w: 1, h: 1, ox: 0, oy: 0 };
    const setOf = (item: string, q: 0 | 1 | 2 | 3, keys: string[]): RealSetEntry => ({ key: `car:${item}:d4:r${q}` as RealSetEntry['key'], kind: 'car', item, density: 4, rot: q, sheets: [{ file: 'a.webp', w: 1, h: 1, mask: 'm.png' }, { file: 'm.png', w: 1, h: 1 }], frames: Object.fromEntries(keys.map((k) => [k, fr])) });
    const sets = (items: (f: { set: string; cls: string }) => string[]): RealSetEntry[] => {
      const by = new Map<string, string[]>();
      for (const f of frames) for (const it of items(f)) { const k = `${it}|${f.q}`; by.set(k, [...(by.get(k) ?? []), f.key]); }
      return [...by].map(([k, keys]) => { const [it, q] = k.split('|'); return setOf(it!, Number(q) as 0 | 1 | 2 | 3, keys); });
    };
    const ix = (s: RealSetEntry[]): RealIndex => ({ format: 'real/1', pxPerMetreZoom1: 11.31, stepPxPerMetre: 9.8, densities: [4], sets: s, bytes: { compressed: 0, decodedByDensity: { 2: 0, 4: 0 } } });
    const carProblems = (s: RealSetEntry[]): string[] => trackComplete(ix(s)).filter((x) => x.includes('car'));
    // halves only: complete
    expect(carProblems(sets((f) => [classItem('spinning_mouse', f.set)]))).toEqual([]);
    // whole and halves together
    const mixed = carProblems(sets((f) => (f.cls === 'base' ? [classItem('spinning_mouse', f.set), classItem('spinning_mouse', 'base')] : [classItem('spinning_mouse', f.set)])));
    expect(mixed.some((x) => /car:spinning_mouse~base: car sets in both layouts/.test(x))).toBe(true);
    // half 0 alone (its pair's frames nowhere): the odd yaws are missing
    const half = carProblems(sets((f) => (f.set === 'base.1' ? [] : [classItem('spinning_mouse', f.set)])));
    expect(half.some((x) => /frame\(s\) missing/.test(x))).toBe(true);
    expect(half).toContain('TRACK_COMPLETE car:spinning_mouse~base.0: a half without its pair (spinning_mouse~base.1)');
  });
});
