// The bake's tint mask coverage floors (tools/art3d/maskFloors.mjs): one floor per car class (Task 3 review P2).
import { describe, expect, it } from 'vitest';
import { TRACK_CLASSES } from '../../../src/render/real/trackClasses';
import { trackGeometry } from '../../../tools/art3d/bakeNode';
import { MASK_COVERAGE_FLOOR, MASK_COVERAGE_MEASURED, coverageKind, floorOf } from '../../../tools/art3d/maskFloors';

describe('mask coverage floors', () => {
  it('every car class the steel coaster bakes has its own floor, next to its measured share', () => {
    for (const c of trackGeometry('steel_coaster').classes) {
      expect(MASK_COVERAGE_MEASURED, c.cls).toHaveProperty(`car~${c.cls}`);
      expect(MASK_COVERAGE_FLOOR[`car~${c.cls}`], c.cls).toBe(floorOf(MASK_COVERAGE_MEASURED[`car~${c.cls}`]!));
    }
  });

  it('the floors are the measured share less 5 %, rounded down; the stage 1 kinds keep theirs', () => {
    expect(MASK_COVERAGE_FLOOR).toMatchObject({ rail: 0.84, car: 0.53, support: 0.67, guest: 0.19 });
    for (const k of Object.keys(MASK_COVERAGE_FLOOR).filter((x) => x.startsWith('car~'))) expect(MASK_COVERAGE_FLOOR[k], k).toBe(floorOf(MASK_COVERAGE_MEASURED[k]!));
    expect(MASK_COVERAGE_FLOOR).toMatchObject({ 'car~base': 0.53, 'car~turn': 0.53, 'car~bank': 0.49, 'car~loop': 0.47, 'car~cork': 0.49, 'car~helix': 0.5 });
    expect(MASK_COVERAGE_FLOOR).not.toHaveProperty('carRolled');
  });

  it('a car class set is measured against its own class floor; a class not measured yet and other kinds against their kind', () => {
    expect(coverageKind({ kind: 'car', item: 'steel_coaster~loop' })).toBe('car~loop');
    expect(coverageKind({ kind: 'car', item: 'steel_coaster~base' })).toBe('car~base');
    expect(coverageKind({ kind: 'car', item: 'log_flume~water' })).toBe('car');
    expect(coverageKind({ kind: 'car', item: 'steel_coaster' })).toBe('car');
    expect(coverageKind({ kind: 'rail', item: 'steel_coaster~loop' })).toBe('rail');
    expect(TRACK_CLASSES.filter((c) => `car~${c}` in MASK_COVERAGE_FLOOR)).toEqual(['base', 'turn', 'bank', 'loop', 'cork', 'helix']);
  });
});
