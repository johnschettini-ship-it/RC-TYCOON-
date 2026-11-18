import { describe, expect, it } from 'vitest';
import { ALL_TRACK_PIECES, ALL_TRACK_TYPES, getTrackTypeDef, typeBuildsPiece } from '../../../../src/data/track';
import { GROUP_CLASS, TRACK_CLASSES, carClassesOf, carQuadrant, carSetsOf, pieceClass, poseClasses, poseClassOf, poseCode, reachedPoses } from '../../../../src/render/real/trackClasses';
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

  it('car sets by yaw quadrant (fix wave): quadrants centred on the 4 headings, turning with the view', () => {
    // yaw steps 28..3 face +x (quadrant 0), 4..11 face +y (1), 12..19 (2), 20..27 (3)
    expect([28, 31, 0, 3, 4, 11, 12, 19, 20, 27].map(carQuadrant)).toEqual([0, 0, 0, 0, 1, 1, 2, 2, 3, 3]);
    // a view turn adds 8 yaw steps and so one quadrant
    for (let y = 0; y < 32; y++) expect(carQuadrant(y + 8)).toBe((carQuadrant(y) + 1) % 4);
  });

  it('carSetsOf: the (class, world quadrant) pairs a circuit\'s cars can show, per built piece and heading', () => {
    const q = (m: Map<string, Set<number>>) => Object.fromEntries([...m].map(([k, v]) => [k, [...v].sort()]));
    expect(q(carSetsOf('steel_coaster', [{ defId: 'straight', dir: 0 }]))).toEqual({ base: [0] });
    expect(q(carSetsOf('steel_coaster', [{ defId: 'straight', dir: 1 }, { defId: 'station', dir: 3 }]))).toEqual({ base: [1, 3] });
    // a medium turn sweeps a quarter: two quadrants (its end poses, straight along a heading, are base poses)
    expect(q(carSetsOf('steel_coaster', [{ defId: 'turn_medium_right', dir: 0 }]))).toEqual({ base: [0, 1], turn: [0, 1] });
    // the coaster bench circuit (a closed loop) reaches every quadrant of base and turn
    const circuit = [0, 1, 2, 3].flatMap((dir) => [{ defId: 'straight', dir }, { defId: 'turn_medium_right', dir }]);
    expect(q(carSetsOf('steel_coaster', circuit))).toEqual({ base: [0, 1, 2, 3], turn: [0, 1, 2, 3] });
    // a spinning car can face any way: all 4 quadrants, and a flat pose at a yaw only a turn reaches is filed in turn
    expect(q(carSetsOf('spinning_mouse', [{ defId: 'straight', dir: 0 }]))).toEqual({ base: [0, 1, 2, 3], turn: [0, 1, 2, 3] });
  });
});

