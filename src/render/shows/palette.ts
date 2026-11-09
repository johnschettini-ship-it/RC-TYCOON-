/**
 * Show colours (Phase 6 §4.4: "colours cycle through the theme palette"). Owner: W4-C. Render only.
 * A site uses the palette of the scenery theme with the most items within its viewing radius (ties: the catalog theme
 * order; none: Classic Fair), so a Frost Peaks corner gets icy beams and a Volcano Ridge corner hot sparks.
 */
import { getSceneryDef, getShowSiteDef, SCENERY_THEMES, type SceneryThemeId } from '../../data/catalog';
import { inShowRadius } from '../../sim/shows/api';
import type { ShowSite } from '../../sim/shows/types';
import type { World } from '../../sim/types';

export const SHOW_PALETTES: Readonly<Record<SceneryThemeId, readonly string[]>> = Object.freeze({
  base: ['#ffd166', '#ef476f', '#06d6a0', '#4cc9f0', '#f78c6b', '#c77dff'],
  classic_fair: ['#ffd166', '#ef476f', '#06d6a0', '#4cc9f0', '#f78c6b', '#c77dff'],
  frost_peaks: ['#bde0fe', '#a2d2ff', '#e0fbfc', '#cdb4db', '#ffffff', '#90e0ef'],
  volcano_ridge: ['#ff6b35', '#f7c548', '#ff3c38', '#ffd23f', '#ff8c42', '#fff1a8'],
  spooky_hollow: ['#9d4edd', '#7bf1a8', '#ff9f1c', '#c77dff', '#b8f2e6', '#ffbf69'],
  jungle_lagoon: ['#80ed99', '#57cc99', '#ffd60a', '#48cae4', '#f4a261', '#c7f9cc'],
  starport: ['#4cc9f0', '#b5179e', '#7209b7', '#f72585', '#4361ee', '#e0aaff'],
});

/** The theme whose scenery items near the site are most numerous (`classic_fair` with none). */
export function showTheme(world: World, site: ShowSite): SceneryThemeId {
  const def = getShowSiteDef(site.defId);
  if (!def) return 'classic_fair';
  const counts = new Map<SceneryThemeId, number>();
  for (const item of world.state.scenery) {
    if (!inShowRadius(site.x, site.y, def.w, def.d, def.radius, item.x, item.y)) continue;
    const sd = getSceneryDef(item.defId);
    if (!sd || sd.theme === 'base') continue;
    counts.set(sd.theme, (counts.get(sd.theme) ?? 0) + 1);
  }
  let best: SceneryThemeId = 'classic_fair';
  let bestN = 0;
  for (const t of SCENERY_THEMES) {
    const n = counts.get(t.id) ?? 0;
    if (n > bestN) {
      best = t.id;
      bestN = n;
    }
  }
  return best;
}

/** Palette colour `i` (any integer). */
export function paletteColour(palette: readonly string[], i: number): string {
  const n = palette.length;
  return palette[((i % n) + n) % n] as string;
}
