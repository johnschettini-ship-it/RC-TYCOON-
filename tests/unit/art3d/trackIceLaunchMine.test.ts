// Batch 5 Task 7: the bobsled run, the launch coaster and the mine train on the track kit. One table row per type: the
// bake list, the reader's map, the style spec (its numbers and the game's render row it draws), the bake input and
// which rail frames go on masked sheets.
import { describe, expect, it } from 'vitest';
import { getTrackPieceDef, getTrackTypeDef } from '../../../src/data/track';
import { REAL_FALLBACK } from '../../../src/render/real/fallbacks';
import { SUPPORT_TOP_BELOW_RAIL } from '../../../src/render/real/supportStack';
import { trackGeometry } from '../../../tools/art3d/bakeNode';
import { UNTINTED_GROUPS } from '../../../tools/art3d/checkIndex';
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
    expect(SPEC.groundHoldOut).toBe(false); // shot without the hold-out ground, which cut drops and pitched cars
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
  it('the launch car (tall dark seat backs, white stripes) is measured against its own floor per class', () => {
    for (const c of trackGeometry('launch_coaster').classes.filter((x) => x.poses.length)) {
      const k = `car~${c.cls}@launch_coaster`;
      expect(coverageKind({ kind: 'car', item: `launch_coaster~${c.cls}` }), c.cls).toBe(k);
      expect(MASK_COVERAGE_FLOOR[k], k).toBe(floorOf(MASK_COVERAGE_MEASURED[k]!));
    }
  });
});
