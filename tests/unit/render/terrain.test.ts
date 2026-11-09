import { describe, expect, it } from 'vitest';
import { chunkBounds, grassShade } from '../../../src/render/terrain';
import { generateMap } from '../../../src/sim/map';
import { GROUND_LEVEL } from '../../../src/data/tuning/core';

describe('terrain chunks', () => {
  it('bounds an inner chunk by its tiles at ground level', () => {
    const map = generateMap();
    const b = chunkBounds(map, 1, 1);
    // Tiles x, y in [16, 32): left corner of (16, 31), right corner of (31, 16).
    expect(b.left).toBe((16 - 32) * 32);
    expect(b.right).toBe((32 - 16) * 32);
    expect(b.top).toBe(32 * 16 - (GROUND_LEVEL + 2) * 8);
    expect(b.bottom).toBe(64 * 16 - GROUND_LEVEL * 8);
  });

  it('extends front-edge chunks down to height 0 for the map edge faces', () => {
    const map = generateMap();
    const b = chunkBounds(map, 3, 3);
    expect(b.bottom).toBe(128 * 16);
  });

  it('picks one of two grass shades per tile, deterministically from the seed', () => {
    const seen = new Set<number>();
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const s = grassShade(1234, x, y);
        expect(s).toBe(grassShade(1234, x, y));
        seen.add(s);
      }
    }
    expect([...seen].sort()).toEqual([0, 1]);
    let differ = 0;
    for (let x = 0; x < 64; x++) if (grassShade(1, x, 7) !== grassShade(2, x, 7)) differ++;
    expect(differ).toBeGreaterThan(0);
  });
});

describe('renderer module', () => {
  it('imports without a DOM (canvas work only happens at draw time)', async () => {
    const mod = await import('../../../src/render/renderer');
    expect(typeof mod.createCanvasRenderer).toBe('function');
    expect(typeof mod.drawPreview).toBe('function');
  });
});
