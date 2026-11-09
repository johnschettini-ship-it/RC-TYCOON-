/**
 * Scenery art registry (Phase 4 §4.5, §10): one original procedural drawing per catalog item (85), drawn for any view
 * rotation (`facing`), wilted gardens, and arch halves. Owner: W3-D. Art never uses canvas transforms, randomness, or
 * time, so the same inputs give the same pixels (master §2.5).
 */
import { getSceneryDef, type SceneryDef } from '../../../data/catalog';
import type { ArtBounds } from '../../sprites/rides';
import { BASE_ART } from './base';
import { FAIR_ART } from './fair';
import { FROST_ART } from './frost';
import { JUNGLE_ART } from './jungle';
import { type Ctx, type SceneryArtFn, type SceneryArtOpts, box, shade } from './kit';
import { SPOOKY_ART } from './spooky';
import { STARPORT_ART } from './starport';
import { VOLCANO_ART } from './volcano';

export type { SceneryArtOpts, SceneryArtFn };

export const SCENERY_ART: Readonly<Record<string, SceneryArtFn>> = {
  ...BASE_ART,
  ...FAIR_ART,
  ...FROST_ART,
  ...VOLCANO_ART,
  ...SPOOKY_ART,
  ...JUNGLE_ART,
  ...STARPORT_ART,
};

/** Room above the item's catalog height for flags, flames, smoke, and stars (world px). */
export const ART_HEADROOM_PX = 26;
const SIDE_PAD = 8;
const BOTTOM_PAD = 6;

/** Art bounds around the anchor (world px at zoom 1) for a view footprint ex × ey. */
export function sceneryArtBounds(def: Pick<SceneryDef, 'heightM' | 'edge'>, ex: number, ey: number): ArtBounds {
  const w = def.edge ? 1 : ex;
  const d = def.edge ? 1 : ey;
  return {
    left: -d * 32 - SIDE_PAD,
    right: w * 32 + SIDE_PAD,
    top: -def.heightM * 8 - ART_HEADROOM_PX,
    bottom: (w + d) * 16 + BOTTOM_PAD,
  };
}

/** Plain block for an unknown id (never in the catalog; keeps a broken save drawable). */
function fallback(ctx: Ctx, o: SceneryArtOpts): void {
  box(ctx, 0.2, 0.2, o.ex - 0.2, o.ey - 0.2, 0, 8, '#c8c8c8', shade('#c8c8c8', 0.85), shade('#c8c8c8', 0.7));
}

export function drawSceneryArt(ctx: Ctx, defId: string, o: SceneryArtOpts): void {
  const art = SCENERY_ART[defId];
  if (art && getSceneryDef(defId)) art(ctx, o);
  else fallback(ctx, o);
}
