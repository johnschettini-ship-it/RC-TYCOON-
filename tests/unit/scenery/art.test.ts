/**
 * Scenery art (Phase 4 §4.5, §10 "The 85 scenery items render in all 4 view rotations"): every catalog item has its
 * own original drawing, stays inside its art bounds in every rotation (and wilted, arch half, edge variant), is
 * deterministic, uses no canvas transforms, and turns with the view.
 */
import { describe, expect, it } from 'vitest';
import { SCENERY, type SceneryDef } from '../../../src/data/catalog';
import { drawSceneryArt, SCENERY_ART, sceneryArtBounds, type SceneryArtOpts } from '../../../src/render/scenery/art';
import type { Dir } from '../../../src/sim/map';
import { Recorder } from '../render/content/recorder';

const FACINGS: Dir[] = [0, 1, 2, 3];
/** Stroke widths and round caps reach a little past the recorded points. */
const TOLERANCE = 3;

function opts(def: SceneryDef, facing: Dir, patch: Partial<SceneryArtOpts> = {}): SceneryArtOpts {
  const odd = facing % 2 === 1;
  return { facing, ex: odd ? def.d : def.w, ey: odd ? def.w : def.d, wilted: false, part: 0, edge: def.edge ? facing : -1, ...patch };
}

function draw(def: SceneryDef, o: SceneryArtOpts): Recorder {
  const rec = new Recorder();
  drawSceneryArt(rec.ctx(), def.id, o);
  return rec;
}

/** Every variant an item draws: 4 facings (or 4 edges), wilted for gardens, both halves for arches. */
function variants(def: SceneryDef): SceneryArtOpts[] {
  const out: SceneryArtOpts[] = [];
  for (const f of FACINGS) {
    out.push(opts(def, f));
    if (def.needsWater) out.push(opts(def, f, { wilted: true }));
    if (def.overPath) out.push(opts(def, f, { part: 1 }), opts(def, f, { part: 2 }));
  }
  return out;
}

describe('scenery art registry', () => {
  it('has one drawing per catalog item and nothing else', () => {
    expect(Object.keys(SCENERY_ART).sort()).toEqual(SCENERY.map((d) => d.id).sort());
  });

  it('every item draws something different from every other item', () => {
    const logs = SCENERY.map((d) => draw(d, opts(d, 2)).ops.join(';'));
    expect(new Set(logs).size).toBe(SCENERY.length);
  });
});

describe.each(SCENERY.map((d) => [d.id, d] as const))('%s', (_id, def) => {
  it('stays inside its bounds in every rotation and variant, with finite points and no transforms', () => {
    for (const o of variants(def)) {
      const b = sceneryArtBounds(def, o.ex, o.ey);
      const rec = draw(def, o);
      const where = `${def.id} ${JSON.stringify(o)}: ${JSON.stringify(rec.extent)} vs ${JSON.stringify(b)}`;
      expect(rec.nonFinite, where).toBe(0);
      expect(rec.transforms, where).toBe(0);
      expect(rec.fills, where).toBeGreaterThan(2);
      expect(rec.extent.left, where).toBeGreaterThanOrEqual(b.left - TOLERANCE);
      expect(rec.extent.right, where).toBeLessThanOrEqual(b.right + TOLERANCE);
      expect(rec.extent.top, where).toBeGreaterThanOrEqual(b.top - TOLERANCE);
      expect(rec.extent.bottom, where).toBeLessThanOrEqual(b.bottom + TOLERANCE);
    }
  });

  it('is deterministic', () => {
    for (const o of variants(def)) expect(draw(def, o).ops).toEqual(draw(def, o).ops);
  });

  it('turns with the view: the 4 rotations do not all draw the same', () => {
    const logs = new Set(FACINGS.map((f) => draw(def, opts(def, f)).ops.join(';')));
    expect(logs.size).toBeGreaterThan(1);
  });

  if (def.needsWater) {
    it('has wilted art', () => {
      for (const f of FACINGS) expect(draw(def, opts(def, f, { wilted: true })).ops).not.toEqual(draw(def, opts(def, f)).ops);
    });
  }

  if (def.overPath) {
    it('splits into a back half and a front post', () => {
      for (const f of FACINGS) {
        const back = draw(def, opts(def, f, { part: 1 }));
        const front = draw(def, opts(def, f, { part: 2 }));
        expect(back.fills).toBeGreaterThan(front.fills);
        expect(front.fills).toBeGreaterThan(0);
        expect(back.ops.length + front.ops.length).toBe(draw(def, opts(def, f)).ops.length);
      }
    });
  }
});
