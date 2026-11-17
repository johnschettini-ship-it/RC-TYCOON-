import { describe, expect, it } from 'vitest';
import { ALL_TRACK_PIECES, ALL_TRACK_TYPES, getTrackTypeDef, typeBuildsPiece } from '../../../../src/data/track';
import { GROUP_CLASS, TRACK_CLASSES, carClassesOf, pieceClass, poseClasses, poseClassOf, poseCode, reachedPoses } from '../../../../src/render/real/trackClasses';
import { reachedPoses as bakeReachedPoses } from '../../../../tools/art3d/poses';

describe('track classes (batch 5 Task 2)', () => {
  it('rail classes by piece group, as the plan lists them', () => {
    expect(GROUP_CLASS).toEqual({ S: 'base', St: 'base', G: 'base', X: 'base', Br: 'base', BB: 'base', Ts: 'turn', Tm: 'turn', B: 'bank', L: 'loop', Cs: 'cork', Hx: 'helix', Sp: 'spooky', W: 'water', Ln: 'launch' });
    expect(TRACK_CLASSES.slice(0, 6)).toEqual(['base', 'turn', 'bank', 'loop', 'cork', 'helix']);
    for (const p of ALL_TRACK_PIECES) expect(TRACK_CLASSES).toContain(pieceClass(p.id));
    expect([pieceClass('station'), pieceClass('steep_up'), pieceClass('turn_medium_left'), pieceClass('vertical_loop_right'), pieceClass('banked_turn_medium_left')]).toEqual(['base', 'base', 'turn', 'loop', 'bank']);
  });

  it('a pose belongs to the first class (base → turn → bank → loop → cork → helix) that reaches it; every reached pose has one', () => {
    for (const t of ALL_TRACK_TYPES) {
      const m = poseClasses(t.id);
      const pieces = ALL_TRACK_PIECES.filter((p) => typeBuildsPiece(t, p));
      expect(m.size, t.id).toBe(reachedPoses(t.id, pieces.map((p) => p.id)).length);
      // base poses are exactly the base pieces' poses
      const base = reachedPoses(t.id, pieces.filter((p) => GROUP_CLASS[p.group] === 'base').map((p) => p.id)).map((p) => poseCode(p.yaw, p.pitch, p.roll));
      expect([...m].filter(([, c]) => c === 'base').map(([k]) => k).sort((a, b) => a - b), t.id).toEqual(base);
    }
    const steel = poseClasses('steel_coaster');
    const count = (c: string): number => [...steel.values()].filter((x) => x === c).length;
    // The plan's measure (2026-11-17): 472 steel poses; the loop and helix classes add their own.
    expect(steel.size).toBe(472);
    expect(count('loop')).toBeGreaterThan(0);
    expect(count('helix')).toBeGreaterThan(0);
    expect(poseClassOf('steel_coaster', poseCode(0, 0, 0))).toBe('base');
    // a pose nothing reaches is looked up in base
    expect(poseClassOf('steel_coaster', poseCode(3, 11, 7))).toBe('base');
  });

  it('the bake and the game list the same poses (one source)', () => {
    expect(bakeReachedPoses).toBe(reachedPoses);
  });

  it('the coaster bench circuit needs the base and turn car classes only', () => {
    const pieces = ['station', 'flat_to_gentle_up', 'gentle_up', 'gentle_to_steep_up', 'steep_up', 'steep_to_gentle_up', 'gentle_up_to_flat', 'block_brake', 'straight', 'turn_medium_right',
      'flat_to_gentle_down', 'gentle_down', 'gentle_to_steep_down', 'steep_down', 'steep_to_gentle_down', 'gentle_down_to_flat', 'brakes'];
    expect([...carClassesOf('steel_coaster', pieces)].sort()).toEqual(['base', 'turn']);
    expect([...carClassesOf('steel_coaster', ['vertical_loop_left'])]).toContain('loop');
  });

  it('every track type resolves its pose classes (the Water Coaster\'s also-pieces included)', () => {
    expect(getTrackTypeDef('water_coaster')!.alsoPieces.length).toBeGreaterThan(0);
    for (const t of ALL_TRACK_TYPES) expect(poseClasses(t.id).size, t.id).toBeGreaterThan(0);
  });
});
