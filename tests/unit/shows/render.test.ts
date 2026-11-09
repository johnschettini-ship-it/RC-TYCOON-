/**
 * Show layer (Phase 6 §4.4 rendering): depth-sorted site slices in 4 view rotations, stable sprite keys, effects in
 * the after-objects pass only while a show runs, reduced motion, and the theme palette. Owner: W4-C.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { resetDisplayPrefs, setDisplayPrefs } from '../../../src/a11y/prefs';
import { LAYER_KIND, type LayerFrame, type LayerSink } from '../../../src/render/layers';
import { createShowLayer } from '../../../src/render/shows/layer';
import { showTheme, SHOW_PALETTES } from '../../../src/render/shows/palette';
import { spriteKey } from '../../../src/render/spriteCache';
import { defaultToolState } from '../../../src/render/types';
import { createWorldLayers } from '../../../src/render/worldLayers';
import { allocId } from '../../../src/sim/ids';
import type { Dir } from '../../../src/sim/map';
import { makeTestWorld } from '../../helpers/world';
import { placeSite } from './helpers';

interface Pushed {
  kind: number;
  ref: number;
  sub: number;
  skey: number;
  depth: number;
}

function sink(): LayerSink & { items: Pushed[] } {
  const items: Pushed[] = [];
  return {
    items,
    push(kind, ref, sub, _ax, _ay, skey, depth) {
      items.push({ kind, ref, sub, skey, depth });
    },
  };
}

function frame(rotation: Dir = 0): LayerFrame {
  // The whole 64 × 64 map in view at zoom 1.
  return { scale: 1, offX: 1100, offY: 0, dpr: 1, bucket: 1, view: { x0: -2200, y0: -600, x1: 2200, y1: 2600 }, rotation, alpha: 0, width: 2200, height: 2200 };
}

class FakeCtx {
  globalCompositeOperation = 'source-over';
  globalAlpha = 1;
  fillStyle: unknown = '#000';
  strokeStyle: unknown = '#000';
  lineWidth = 1;
  fills = 0;
  rects = 0;
  save(): void {}
  restore(): void {}
  beginPath(): void {}
  moveTo(): void {}
  lineTo(): void {}
  closePath(): void {}
  arc(): void {}
  ellipse(): void {}
  setLineDash(): void {}
  fill(): void {
    this.fills++;
  }
  stroke(): void {}
  fillRect(): void {
    this.rects++;
  }
  createLinearGradient(): { addColorStop(): void } {
    return { addColorStop() {} };
  }
  createRadialGradient(): { addColorStop(): void } {
    return { addColorStop() {} };
  }
}

afterEach(() => resetDisplayPrefs());

describe('show layer registration', () => {
  it('is the shows layer of the world layer registry, after lighting (beams glow over the dark)', () => {
    const names = createWorldLayers().map((l) => l.name);
    expect(names.indexOf('shows')).toBeGreaterThan(names.indexOf('lighting'));
    expect(createShowLayer().kinds).toEqual([LAYER_KIND.showSite]);
  });
});

describe('collect: depth-sorted slices in every view rotation', () => {
  it('a 2 × 2 tower is 4 column slices, a 1 × 1 launcher one whole sprite; keys hold the sprite rotation', () => {
    const w = makeTestWorld();
    const tower = placeSite(w, 'lightshow_tower', 20, 20);
    const fw = placeSite(w, 'fireworks_launcher', 30, 30);
    void tower;
    void fw;
    for (const r of [0, 1, 2, 3] as const) {
      const layer = createShowLayer();
      const s = sink();
      layer.collect!(w, s, defaultToolState(), frame(r));
      const towerItems = s.items.filter((i) => i.ref === 0);
      const fwItems = s.items.filter((i) => i.ref === 1);
      expect(towerItems.map((i) => i.sub)).toEqual([0, 1, 2, 3]);
      expect(fwItems.map((i) => i.sub)).toEqual([-1]);
      expect(s.items.every((i) => i.kind === LAYER_KIND.showSite)).toBe(true);
      expect(towerItems[0]!.skey).toBe(spriteKey('lightshow_tower', r, 0, 1));
      expect(fwItems[0]!.skey).toBe(spriteKey('fireworks_launcher', r, 0, 1));
      // The front column of a 2 × 2 sorts one tile further forward than its back corner column.
      expect(Math.max(...towerItems.map((i) => i.depth)) - Math.min(...towerItems.map((i) => i.depth))).toBe(1);
    }
  });

  it('culls sites outside the view', () => {
    const w = makeTestWorld();
    placeSite(w, 'lightshow_tower', 20, 20);
    const s = sink();
    const f = frame();
    f.view = { x0: 5000, y0: 5000, x1: 6000, y1: 6000 };
    createShowLayer().collect!(w, s, defaultToolState(), f);
    expect(s.items).toEqual([]);
  });
});

describe('effects pass', () => {
  it('draws only while a show runs (and its last glows fade); beams for the tower, sparks for the launcher', () => {
    const w = makeTestWorld();
    const tower = placeSite(w, 'lightshow_tower', 20, 20);
    const fw = placeSite(w, 'fireworks_launcher', 40, 20);
    const layer = createShowLayer();
    const draw = (): void => layer.drawAfterObjects!(new FakeCtx() as unknown as CanvasRenderingContext2D, w, defaultToolState(), frame());
    draw();
    expect(layer.stats()).toEqual({ beams: 0, rockets: 0, particles: 0, flashes: 0, glows: 0 });
    tower.status = 'running';
    tower.startTick = w.state.tick - 30;
    fw.status = 'running';
    fw.startTick = w.state.tick - 200;
    draw();
    expect(layer.stats().beams).toBe(6);
    expect(layer.stats().particles + layer.stats().rockets).toBeGreaterThan(0);
    // Long after the show: nothing.
    tower.status = 'idle';
    fw.status = 'idle';
    w.state.tick += 2000;
    draw();
    expect(layer.stats()).toEqual({ beams: 0, rockets: 0, particles: 0, flashes: 0, glows: 0 });
    expect(layer.totals().frames).toBe(3);
  });

  it('reduced motion: still beams and glows, never rockets or particles', () => {
    setDisplayPrefs({ reducedMotion: true, highContrast: false, textScale: 100 });
    const w = makeTestWorld();
    const fw = placeSite(w, 'fireworks_launcher', 40, 20);
    fw.status = 'running';
    fw.startTick = w.state.tick;
    const layer = createShowLayer();
    for (let t = 0; t < 400; t += 2) {
      w.state.tick = fw.startTick + t;
      layer.drawAfterObjects!(new FakeCtx() as unknown as CanvasRenderingContext2D, w, defaultToolState(), frame());
      expect(layer.stats().particles).toBe(0);
      expect(layer.stats().rockets).toBe(0);
    }
    expect(layer.totals().glows).toBeGreaterThan(50);
    expect(layer.totals().reduced).toBe(true);
  });
});

describe('theme palette', () => {
  it('follows the scenery theme with the most items in the viewing radius (Classic Fair by default)', () => {
    const w = makeTestWorld();
    const site = placeSite(w, 'lightshow_tower', 20, 20);
    expect(showTheme(w, site)).toBe('classic_fair');
    const add = (defId: string, x: number, y: number): void => {
      w.state.scenery.push({ id: allocId(w.state), defId, x, y, z: 8, rotation: 0, edge: -1, waterLevel: 255 });
    };
    const frost = SHOW_PALETTES.frost_peaks;
    expect(frost.length).toBeGreaterThan(3);
    const frostItem = firstOfTheme('frost_peaks');
    const fairItem = firstOfTheme('classic_fair');
    add(frostItem, 23, 23);
    add(frostItem, 18, 22);
    add(fairItem, 24, 20);
    // Far away: does not count.
    add(fairItem, 60, 60);
    add(fairItem, 60, 61);
    expect(showTheme(w, site)).toBe('frost_peaks');
  });
});

import { SCENERY } from '../../../src/data/catalog';
function firstOfTheme(theme: string): string {
  const def = SCENERY.find((d) => d.theme === theme);
  if (!def) throw new Error(theme);
  return def.id;
}
