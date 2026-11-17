import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contentHash, itemSpec } from '../../../tools/art3d/catalog';
import { CONTENT_RIDE_ART } from '../../../src/render/sprites/content';
import { FLAT_RIDES, SCENERY, STALLS } from '../../../src/data/catalog';

describe('itemSpec', () => {
  it('reads catalogue footprints', () => expect(itemSpec('ride', 'carousel').footprintTiles).toEqual([3, 3]));

  it('reads the footprint of every flat ride and gives it a positive height', () => {
    for (const r of FLAT_RIDES) {
      const s = itemSpec('ride', r.id);
      expect(s.footprintTiles).toEqual([r.w, r.d]);
      expect(s.heightM).toBeGreaterThan(0);
    }
  });

  // Today's drawn height in px (HEIGHTS in src/render/sprites/rides.ts, CONTENT_RIDE_ART in sprites/content/index.ts).
  const TODAY_PX: Record<string, number> = {
    carousel: 100, big_wheel: 118, swing_tower: 146, teacup_twirl: 50,
    bumper_cars: 106, rocket_rounds: 84, spiral_slide: 114, observation_tower: 200, mirror_maze: 82, haunted_manor: 116,
    pendulum_ship: 142, thunder_disc: 106, drop_tower: 208, flip_arm: 136,
    magic_carpet: 132, kiddie_cars: 78, merry_mill: 116, gyro_globe: 148,
    // New rides batch B (2026-11-17).
    chair_swing_twist: 112, spin_wheel_drop: 96, loop_swing: 128, carousel_deluxe: 112, station_show: 80,
  };
  // The px / 8 rule is a starting value. A ride may deviate (a realistic height) with a one-line reason here.
  const HEIGHT_EXCEPTIONS: Record<string, { m: number; why: string }> = {
    carousel: { m: 8, why: 'baked in stage 1 and seen by the owner; the rule gives 12.5' },
    swing_tower: { m: 18, why: 'baked in stage 1 and seen by the owner; 146 / 8 = 18.25 is a tie, the rule rounds up to 18.5' },
    big_wheel: { m: 15, why: 'baked in stage 1 and seen by the owner (equals the rule)' },
    kiddie_cars: { m: 7, why: 'a children\'s car ride: canopy peak 5.9 m, gold ball on a short mast at 7 m; today\'s 78 px flag mast (9.75 m) is drawn tall' },
    merry_mill: { m: 11.5, why: '4.8 m sails on a 6.8 m hub top out at 11.6 m, so the lowest gondola boards at the deck; 14.5 m would need sails reaching past the footprint' },
    observation_tower: { m: 32, why: 'a ring cabin for 8 needs a real mast to be worth the ride: 32 m, under the 37 m RIDE_UP_PX margin at density 4; the rule gives 25' },
    gyro_globe: { m: 14, why: 'a realistic gimbal stands its 10.6 m outer ring on a short turntable pedestal, not on a 6 m column; the rule gives 18.5' },
    pendulum_ship: { m: 13, why: 'real proportions in the 12 x 20 m footprint: 10 m axle, 7.4 m arms, 68 deg swing; the bow finial peaks at 13 m (today\'s 142 px sprite is drawn taller than its swing)' },
    magic_carpet: { m: 11.5, why: 'real proportions: 5.4 m hubs and 4.4 m arms keep the orbit inside the 12 m width and the carpet just above its boarding deck; riders\' heads peak at 11.5 m' },
    flip_arm: { m: 13, why: 'real proportions: 7 m hub and a 5 m arm keep the gondola inside the 12 m footprint and just above its deck; its footrest peaks at 13 m' },
    bumper_cars: { m: 7.5, why: 'a real one-storey pavilion: 4.7 m clear under the fascia, crown sign to 7.5 m; 106 px counts the 4x4 floor depth' },
    mirror_maze: { m: 8, why: 'a 5.3 m pavilion with the crystal on its roof stand to 8 m; 82 px counts the 3x3 floor depth' },
    thunder_disc: { m: 11, why: 'U-track ends at 8 m (as today: 74 px / 8 = 9.25 m to the rail) plus the lightning signs; 106 px counts the floor depth' },
  };

  it('every height exception has a reason', () => {
    for (const [id, e] of Object.entries(HEIGHT_EXCEPTIONS)) expect(e.why.trim().length, id).toBeGreaterThan(0);
  });

  it('every flat ride is at its exception height, or at today\'s pixel height / 8 rounded to 0.5 m', () => {
    for (const r of FLAT_RIDES) {
      const px = TODAY_PX[r.id];
      expect(px, `${r.id} has no today's height`).toBeDefined();
      const rule = Math.round(((px as number) / 8) * 2) / 2;
      expect(itemSpec('ride', r.id).heightM, r.id).toBe(HEIGHT_EXCEPTIONS[r.id]?.m ?? rule);
    }
  });

  it('the content ride art heights in the table match the game', () => {
    for (const [id, art] of Object.entries(CONTENT_RIDE_ART)) expect(TODAY_PX[id], id).toBe(art.height);
  });

  it('tall rides stand taller than the carousel', () => {
    expect(itemSpec('ride', 'big_wheel').heightM).toBeGreaterThan(itemSpec('ride', 'carousel').heightM);
    expect(itemSpec('ride', 'swing_tower').heightM).toBeGreaterThan(itemSpec('ride', 'carousel').heightM);
  });

  it('stalls take one tile', () => {
    for (const st of STALLS) {
      const s = itemSpec('stall', st.id);
      expect(s.footprintTiles).toEqual([1, 1]);
      expect(s.heightM).toBeGreaterThan(0);
    }
  });

  it('scenery reads w, d and heightM from the catalogue', () => {
    for (const sc of SCENERY) expect(itemSpec('scenery', sc.id)).toEqual({ footprintTiles: [sc.w, sc.d], heightM: sc.heightM });
  });

  it('throws on unknown ids', () => {
    expect(() => itemSpec('ride', 'no_such_ride')).toThrow(/no_such_ride/);
    expect(() => itemSpec('stall', 'carousel')).toThrow(/carousel/);
    expect(() => itemSpec('scenery', 'snack_shack')).toThrow(/snack_shack/);
  });
});

describe('contentHash', () => {
  const dir = mkdtempSync(join(tmpdir(), 'art3d-hash-'));
  const a = join(dir, 'a.js');
  const b = join(dir, 'b.js');
  writeFileSync(a, 'export const a = 1;\n');
  writeFileSync(b, 'export const b = 2;\n');

  it('is a SHA-256 hex digest', () => expect(contentHash([a, b])).toMatch(/^[0-9a-f]{64}$/));

  it('does not depend on the order the files are listed in', () => expect(contentHash([b, a])).toBe(contentHash([a, b])));

  it('changes when a file changes', () => {
    const before = contentHash([a, b]);
    writeFileSync(b, 'export const b = 3;\n');
    expect(contentHash([a, b])).not.toBe(before);
  });

  it('tells apart moving text from one file to the next', () => {
    writeFileSync(a, 'xy');
    writeFileSync(b, 'z');
    const h1 = contentHash([a, b]);
    writeFileSync(a, 'x');
    writeFileSync(b, 'yz');
    expect(contentHash([a, b])).not.toBe(h1);
  });

  it('throws on a missing file', () => expect(() => contentHash([join(dir, 'missing.js')])).toThrow());
});
