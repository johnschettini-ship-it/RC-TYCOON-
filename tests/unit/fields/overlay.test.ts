/**
 * Calm and Buzz overlays (Phase 4 §4.6, §7): the `V` cycle, band styles (tint plus hatch density, so colour is
 * not the only signal), the legend with the 4 band names and thresholds, the tile value text, and the overlay
 * layer drawing tiles by band.
 */
import { describe, expect, it } from 'vitest';
import { OVERLAY_CYCLE, defaultToolState, type OverlayId } from '../../../src/render/types';
import type { LayerFrame } from '../../../src/render/layers';
import { cycleOverlay, setOverlay } from '../../../src/input/overlays';
import { FIELD_OVERLAY_STYLE, bandIndex } from '../../../src/render/fields/style';
import { createFieldOverlayLayer } from '../../../src/render/fields/overlay';
import { legendFor, overlayChips, tileValueText } from '../../../src/ui/overlays/legend';
import { displayFieldValue } from '../../../src/sim/fields/store';
import { calmAt } from '../../../src/sim/fields/api';
import { tileIndex } from '../../../src/sim/map';
import { text } from '../../../src/data/strings/en';
import { fieldStrings } from '../../../src/data/strings/fields';
import { makeTestWorld, placeRideDirect } from '../../helpers/world';
import { addSceneryDirect } from './helpers';

describe('overlay cycle (Phase 4 §7, master R21: V)', () => {
  it('cycles None → Calm → Buzz → Light → Temperament → None', () => {
    const t = defaultToolState();
    const seen: OverlayId[] = [t.overlay];
    for (let k = 0; k < 5; k++) {
      cycleOverlay(t);
      seen.push(t.overlay);
    }
    expect(seen).toEqual([...OVERLAY_CYCLE, 'none']);
  });

  it('starts the cycle at Calm from an overlay outside it', () => {
    const t = defaultToolState();
    t.overlay = 'patrol';
    cycleOverlay(t);
    expect(t.overlay).toBe('calm');
  });

  it('chips set an overlay directly', () => {
    const t = defaultToolState();
    setOverlay(t, 'buzz');
    expect(t.overlay).toBe('buzz');
    expect(overlayChips().map((c) => c.id)).toEqual([...OVERLAY_CYCLE]);
    expect(overlayChips().map((c) => c.label)).toEqual(['None', 'Calm', 'Buzz', 'Light', 'Temperament']);
  });
});

describe('band styles: colour plus hatch density', () => {
  it('has 4 bands per field; None draws nothing; hatch density rises with the band', () => {
    for (const f of ['calm', 'buzz'] as const) {
      const bands = FIELD_OVERLAY_STYLE[f];
      expect(bands.map((b) => b.band)).toEqual(['none', 'low', 'medium', 'high']);
      expect(bands[0]!.hatch).toBe(0);
      expect(bands[0]!.fill).toBeNull();
      for (let k = 1; k < 4; k++) {
        expect(bands[k]!.hatch).toBeGreaterThan(bands[k - 1]!.hatch);
        expect(bands[k]!.fill).not.toBeNull();
      }
    }
    // Calm (teal) and Buzz (orange) never share a colour.
    const calmFills = FIELD_OVERLAY_STYLE.calm.map((b) => b.fill);
    for (const b of FIELD_OVERLAY_STYLE.buzz) if (b.fill) expect(calmFills).not.toContain(b.fill);
  });

  it('bandIndex follows the bands', () => {
    expect([0, 19, 20, 59, 60, 119, 120, 255].map(bandIndex)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  });
});

describe('legend (4 band names and thresholds)', () => {
  it('Calm and Buzz show None < 20, Low 20–59, Medium 60–119, High ≥ 120', () => {
    for (const o of ['calm', 'buzz'] as const) {
      const l = legendFor(o)!;
      expect(l.title).toBe(o === 'calm' ? 'Calm' : 'Buzz');
      expect(l.rows.map((r) => `${r.name} ${r.range}`)).toEqual(['None < 20', 'Low 20–59', 'Medium 60–119', 'High ≥ 120']);
      expect(l.rows.map((r) => r.hatch)).toEqual(FIELD_OVERLAY_STYLE[o].map((b) => b.hatch));
    }
  });

  it('Light shows the lit threshold, Temperament the 3 groups, None has no legend', () => {
    expect(legendFor('light')!.rows.map((r) => `${r.name} ${r.range}`)).toEqual(['Dark < 96', 'Lit ≥ 96']);
    expect(legendFor('temperament')!.rows.map((r) => `${r.name} ${r.range}`)).toEqual(['Chill 0–35', 'Family 36–64', 'Thrill 65–100']);
    expect(legendFor('none')).toBeNull();
  });

  it('the tile value names the overlay, the exact value, and the band', () => {
    const w = makeTestWorld();
    addSceneryDirect(w, 'fountain_carved', 30, 30);
    const i = tileIndex(w.state.map, 30, 30);
    expect(tileValueText(w, 'calm', i)).toBe('Calm here: 102 (Medium)');
    expect(tileValueText(w, 'buzz', i)).toBe('Buzz here: 0 (None)');
    expect(tileValueText(w, 'calm', null)).toBeNull();
    expect(tileValueText(w, 'temperament', i)).toBeNull();
  });

  it('strings have no final period (master R4)', () => {
    for (const [k, v] of Object.entries(fieldStrings)) {
      expect(k.startsWith('fields.'), k).toBe(true);
      expect(/\.$/.test(v), k).toBe(false);
      expect(text(k)).toBe(v);
    }
  });
});

/** A recording 2D context: enough of the API for the overlay layer. */
function fakeCtx(): { ctx: CanvasRenderingContext2D; fills: string[]; strokes: number; moves: number; lines: number } {
  const rec = { fills: [] as string[], strokes: 0, moves: 0, lines: 0 };
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    save() {},
    restore() {},
    beginPath() {},
    closePath() {},
    moveTo() {
      rec.moves++;
    },
    lineTo() {
      rec.lines++;
    },
    fill() {
      rec.fills.push(String(ctx.fillStyle));
    },
    stroke() {
      rec.strokes++;
    },
  };
  return {
    ctx: ctx as unknown as CanvasRenderingContext2D,
    get fills() {
      return rec.fills;
    },
    get strokes() {
      return rec.strokes;
    },
    get moves() {
      return rec.moves;
    },
    get lines() {
      return rec.lines;
    },
  };
}

function frame(): LayerFrame {
  return { scale: 1, offX: 0, offY: 0, dpr: 1, bucket: 1, view: { x0: -1e6, y0: -1e6, x1: 1e6, y1: 1e6 }, rotation: 0, alpha: 0, width: 800, height: 600 };
}

describe('overlay layer', () => {
  it('draws nothing without a Calm or Buzz overlay', () => {
    const w = makeTestWorld();
    addSceneryDirect(w, 'fountain_carved', 30, 30);
    const layer = createFieldOverlayLayer();
    const f = fakeCtx();
    const tool = defaultToolState();
    for (const o of ['none', 'temperament', 'light'] as const) {
      tool.overlay = o;
      layer.drawGround!(f.ctx, w, tool, frame());
    }
    expect(f.fills).toEqual([]);
    expect(f.strokes).toBe(0);
  });

  it('tints tiles by band with one fill and one hatch stroke per band in use', () => {
    const w = makeTestWorld();
    addSceneryDirect(w, 'fountain_carved', 30, 30);
    addSceneryDirect(w, 'fountain_carved', 32, 30);
    const layer = createFieldOverlayLayer();
    const f = fakeCtx();
    const tool = defaultToolState();
    tool.overlay = 'calm';
    layer.drawGround!(f.ctx, w, tool, frame());
    // The fountains give Low, Medium, and High tiles: 3 batched fills and 3 hatch strokes.
    const styles = FIELD_OVERLAY_STYLE.calm;
    expect(f.fills).toEqual([styles[1]!.fill, styles[2]!.fill, styles[3]!.fill]);
    expect(f.strokes).toBe(3);
    // Count the tiles per band and check the hatch lines: hatch(b) lines per tile, 1 move each.
    const n = w.state.map.width * w.state.map.height;
    const per = [0, 0, 0, 0];
    for (let i = 0; i < n; i++) per[bandIndex(displayFieldValue(w, 'calm', i))]!++;
    const tiles = per[1]! + per[2]! + per[3]!;
    const hatchLines = per[1]! * styles[1]!.hatch + per[2]! * styles[2]!.hatch + per[3]! * styles[3]!.hatch;
    expect(f.moves).toBe(tiles + hatchLines);
    expect(per[3]).toBeGreaterThan(0);
    // Buzz has no source here.
    const g = fakeCtx();
    tool.overlay = 'buzz';
    layer.drawGround!(g.ctx, w, tool, frame());
    expect(g.fills).toEqual([]);
  });

  it('culls tiles outside the view', () => {
    const w = makeTestWorld();
    addSceneryDirect(w, 'fountain_carved', 30, 30);
    const layer = createFieldOverlayLayer();
    const f = fakeCtx();
    const tool = defaultToolState();
    tool.overlay = 'calm';
    const fr = frame();
    fr.view = { x0: 10_000, y0: 10_000, x1: 10_100, y1: 10_100 };
    layer.drawGround!(f.ctx, w, tool, fr);
    expect(f.fills).toEqual([]);
  });

  it('the display read sees a ride opened while paused (no tick in between)', () => {
    const w = makeTestWorld();
    const ride = placeRideDirect(w, 'flip_arm', 20, 20, 0);
    const tile = tileIndex(w.state.map, 21, 24);
    expect(calmAt(w, tile)).toBe(0);
    expect(displayFieldValue(w, 'buzz', tile)).toBe(0);
    ride.status = 'open';
    expect(displayFieldValue(w, 'buzz', tile)).toBeGreaterThan(0);
  });
});
