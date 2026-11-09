/** Phase 6 §4.7 (W4-F request to W4-E): ghost, drag, and purchase colours come from the colour-blind safe pair. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { withAlpha } from '../../../src/render/renderer';
import { GHOST_TINT_INVALID, GHOST_TINT_VALID } from '../../../src/render/sprites/bank';
import { GHOST_INVALID, GHOST_VALID } from '../../../src/render/palette';

const rgb = (hex: string): string => {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255}, ?${(n >> 8) & 255}, ?${n & 255}`;
};

describe('safe ghost colours', () => {
  it('ghost sprite washes are the safe valid / invalid colours', () => {
    expect(GHOST_TINT_VALID).toMatch(new RegExp(`^rgba\\(${rgb(GHOST_VALID)}, ?0\\.5\\)$`));
    expect(GHOST_TINT_INVALID).toMatch(new RegExp(`^rgba\\(${rgb(GHOST_INVALID)}, ?0\\.55\\)$`));
    expect(withAlpha('#0072B2', 0.4)).toBe('rgba(0,114,178,0.4)');
  });

  it('the renderer and the sprite bank no longer hard-code red / green', () => {
    for (const f of ['src/render/renderer.ts', 'src/render/sprites/bank.ts']) {
      const src = readFileSync(join(__dirname, '../../..', f), 'utf8');
      expect(src, f).not.toMatch(/70, ?205, ?95|235, ?60, ?60|229, ?72, ?77|#7dff9a|#ff8a8a|#ffb3b5/);
    }
  });
});
