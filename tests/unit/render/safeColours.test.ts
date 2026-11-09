/** Phase 6 §4.7 (W4-F request to W4-E): ghost, drag, and purchase colours come from the colour-blind safe pair. */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resetDisplayPrefs, setDisplayPrefs } from '../../../src/a11y/prefs';
import { ELEVATED_COLOURS } from '../../../src/render/elevated/layer';
import { withAlpha } from '../../../src/render/renderer';
import { GHOST_TINT_INVALID, GHOST_TINT_VALID } from '../../../src/render/sprites/bank';
import {
  GHOST_FILL_INVALID,
  GHOST_FILL_VALID,
  GHOST_INVALID,
  GHOST_VALID,
  ghostFill,
  ghostLineWidth,
  ghostStroke,
} from '../../../src/render/palette';
import { terrainGhostColours } from '../../../src/render/terrainTools/layer';

const ROOT = join(__dirname, '../../..');

/**
 * The red / green ghost literals used before Build 3 (core renderer, scenery, land tools, track builder, show sites,
 * elevated paths, patrol erase): fills, outlines, arrow tints, and label backgrounds.
 */
const RED_GREEN = [
  /rgba\(\s*70\s*,\s*205\s*,\s*95/i,
  /rgba\(\s*235\s*,\s*60\s*,\s*60/i,
  /rgba\(\s*229\s*,\s*72\s*,\s*77/i,
  /rgba\(\s*90\s*,\s*230\s*,\s*120/i,
  /rgba\(\s*255\s*,\s*90\s*,\s*90/i,
  /rgba\(\s*120\s*,\s*220\s*,\s*140/i,
  /rgba\(\s*40\s*,\s*120\s*,\s*60/i,
  /rgba\(\s*160\s*,\s*30\s*,\s*36/i,
  /#7dff9a\b/i,
  /#ff8a8a\b/i,
  /#ffb3b5\b/i,
  /#ff5c5c\b/i,
  /#eafff0\b/i,
  /#ffe1e1\b/i,
  /#1f6b34\b/i,
  /#8a1f23\b/i,
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? sourceFiles(p) : /\.ts$/.test(name) ? [p] : [];
  });
}

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
      const src = readFileSync(join(ROOT, f), 'utf8');
      expect(src, f).not.toMatch(/70, ?205, ?95|235, ?60, ?60|229, ?72, ?77|#7dff9a|#ff8a8a|#ffb3b5/);
    }
  });

  it('no file under src/render hard-codes a red / green ghost colour', () => {
    const files = sourceFiles(join(ROOT, 'src/render'));
    expect(files.length).toBeGreaterThan(40);
    const hits: string[] = [];
    for (const file of files) {
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        for (const re of RED_GREEN) if (re.test(line)) hits.push(`${relative(ROOT, file)}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(hits).toEqual([]);
  });
});

describe('ghost colours in every layer', () => {
  afterEach(() => resetDisplayPrefs());

  it('land, water, and blocked terrain ghosts use the safe pair', () => {
    expect(terrainGhostColours('land', true).stroke).toBe(GHOST_VALID);
    expect(terrainGhostColours('land', false)).toEqual({ fill: GHOST_FILL_INVALID, stroke: GHOST_INVALID });
    expect(terrainGhostColours('water', false)).toEqual(terrainGhostColours('land', false));
    expect(terrainGhostColours('water', true).fill).not.toBe(terrainGhostColours('land', true).fill);
  });

  it('elevated path ghosts use the safe pair', () => {
    expect(ELEVATED_COLOURS.ghostOk).toBe(GHOST_FILL_VALID);
    expect(ELEVATED_COLOURS.ghostEdge).toBe(GHOST_VALID);
    expect(ELEVATED_COLOURS.ghostBad).toBe(GHOST_FILL_INVALID);
    expect(ELEVATED_COLOURS.ghostBadEdge).toBe(GHOST_INVALID);
  });

  it('shared helpers pick the safe pair and double outlines with high contrast', () => {
    expect(ghostFill(true)).toBe(GHOST_FILL_VALID);
    expect(ghostFill(false)).toBe(GHOST_FILL_INVALID);
    expect(ghostStroke(true)).toBe(GHOST_VALID);
    expect(ghostStroke(false)).toBe(GHOST_INVALID);
    expect(ghostLineWidth(1.5)).toBe(1.5);
    setDisplayPrefs({ reducedMotion: false, highContrast: true, textScale: 100 });
    expect(ghostLineWidth(1.5)).toBe(3);
  });
});
