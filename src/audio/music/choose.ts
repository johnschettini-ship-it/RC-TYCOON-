/**
 * Theme in view (Phase 6 §4.3 "Theme choice"). Owner: W4-B. Reads `GameState.scenery` only; never writes state.
 * The theme with the most scenery items in view plays; base-set items have no theme. Default: Classic Fair.
 */
import { getSceneryDef } from '../../data/catalog';
import { GROUND_LEVEL } from '../../data/tuning/core';
import { nightActive } from '../../sim/lighting/api';
import type { MapState } from '../../sim/map';
import { sceneryExtent } from '../../sim/scenery/api';
import type { World } from '../../sim/types';
import type { Camera } from '../../render/types';
import { viewToMapContinuous } from '../../render/view';
import { MUSIC_THEMES, type MusicThemeId } from '../types';

/** The visible tile rectangle (inclusive) the theme choice counts scenery in; x1 < x0 is empty. */
export interface ViewTiles {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export const DEFAULT_THEME: MusicThemeId = 'classic_fair';

/**
 * The scenery theme with the most items whose footprint meets `view`. Ties go to `current` (the theme playing now,
 * so the music does not flip at a balance point), else to the first theme in `MUSIC_THEMES` order. No themed item in
 * view: Classic Fair.
 */
export function chooseTheme(world: World, view: ViewTiles, current?: MusicThemeId | null): MusicThemeId {
  const counts = new Map<MusicThemeId, number>();
  if (view.x1 >= view.x0 && view.y1 >= view.y0) {
    for (const s of world.state.scenery) {
      const def = getSceneryDef(s.defId);
      if (!def || def.theme === 'base') continue;
      const { w, d } = sceneryExtent(def, s.rotation);
      if (s.x > view.x1 || s.x + w - 1 < view.x0 || s.y > view.y1 || s.y + d - 1 < view.y0) continue;
      counts.set(def.theme, (counts.get(def.theme) ?? 0) + 1);
    }
  }
  let best = 0;
  for (const c of counts.values()) best = Math.max(best, c);
  if (best === 0) return DEFAULT_THEME;
  if (current && counts.get(current) === best) return current;
  return MUSIC_THEMES.find((t) => counts.get(t) === best) as MusicThemeId;
}

export interface MusicChoice {
  theme: MusicThemeId;
  night: boolean;
}

/**
 * What the music player should play (the argument of `MusicPlayer.setTheme`): the Title theme on the title screen or
 * with no park; else the theme in view, in its night variant while After Dark is on and it is night.
 */
export function chooseMusic(
  world: World | null,
  view: ViewTiles | null,
  onTitle: boolean,
  current?: MusicThemeId | null,
): MusicChoice {
  if (onTitle || !world || !view) return { theme: 'title', night: false };
  return { theme: chooseTheme(world, view, current), night: nightActive(world) };
}

/**
 * Map tiles under the screen: the bounding rectangle of the 4 screen corners projected onto ground level (heights
 * other than `z` shift a little), clamped to the map. `viewW`/`viewH` are the canvas size in CSS px.
 */
export function viewTilesForCamera(
  cam: Camera,
  viewW: number,
  viewH: number,
  map: Pick<MapState, 'width' | 'height'>,
  z: number = GROUND_LEVEL,
): ViewTiles {
  const zoom = cam.zoom > 0 ? cam.zoom : 1;
  const hw = viewW / 2 / zoom;
  const hh = viewH / 2 / zoom;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [sx, sy] of [
    [-hw, -hh],
    [hw, -hh],
    [-hw, hh],
    [hw, hh],
  ] as const) {
    // Master 6.4 inverted at height z: a = u − v, b = u + v.
    const a = (cam.centerX + sx) / 32;
    const b = (cam.centerY + sy + z * 8) / 16;
    const p = viewToMapContinuous((a + b) / 2, (b - a) / 2, cam.rotation, map.width, map.height);
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  if (!(x1 >= 0 && y1 >= 0 && x0 < map.width && y0 < map.height)) return { x0: 0, y0: 0, x1: -1, y1: -1 };
  return {
    x0: Math.max(0, Math.floor(x0)),
    y0: Math.max(0, Math.floor(y0)),
    x1: Math.min(map.width - 1, Math.floor(x1)),
    y1: Math.min(map.height - 1, Math.floor(y1)),
  };
}
