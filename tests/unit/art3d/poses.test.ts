import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { reachedPoses } from '../../../tools/art3d/poses';

describe('reachedPoses', () => {
  it('lists the unique quantised poses of a flat and a 25° up piece, every heading', () => {
    // straight: flat, yaw along each of the 4 headings (32 yaw steps → 0, 8, 16, 24).
    // gentle_up: 2 m up over 4 m = 26.6° → 15° steps: 2.
    expect(reachedPoses('steel_coaster', ['straight', 'gentle_up'])).toEqual([
      { yaw: 0, pitch: 0, roll: 0 },
      { yaw: 0, pitch: 2, roll: 0 },
      { yaw: 8, pitch: 0, roll: 0 },
      { yaw: 8, pitch: 2, roll: 0 },
      { yaw: 16, pitch: 0, roll: 0 },
      { yaw: 16, pitch: 2, roll: 0 },
      { yaw: 24, pitch: 0, roll: 0 },
      { yaw: 24, pitch: 2, roll: 0 },
    ]);
  });
  it('a medium turn reaches every yaw step at pitch 0', () => {
    const p = reachedPoses('steel_coaster', ['turn_medium_right']);
    expect(new Set(p.map((x) => x.yaw)).size).toBe(32);
    expect(p.every((x) => x.pitch === 0 && x.roll === 0)).toBe(true);
  });
  it('rejects pieces the track type cannot use', () => {
    expect(() => reachedPoses('steel_coaster', ['no_such_piece'])).toThrow();
  });
});

describe('one source for pose quantisation (Task 9b)', () => {
  it('the bake uses the game reader\'s quantisePose and steps, with no copy of its own', async () => {
    const bake = await import('../../../tools/art3d/poses');
    const pose = await import('../../../src/render/real/pose');
    const look = await import('../../../src/render/real/look');
    expect(bake.quantisePose).toBe(pose.quantisePose);
    expect(look.quantisePose).toBe(pose.quantisePose);
    expect([look.CAR_YAW_STEPS, look.CAR_TILT_STEPS]).toEqual([pose.CAR_YAW_STEPS, pose.CAR_TILT_STEPS]);
    const src = readFileSync(new URL('../../../tools/art3d/poses.ts', import.meta.url), 'utf8');
    expect(src).not.toMatch(/function quantisePose|Math\.round/);
  });
});
