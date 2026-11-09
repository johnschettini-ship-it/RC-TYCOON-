/**
 * Show site queries for other systems (Phase 6 §4.4). Owner: W4-C. Signatures are a contract:
 * - with no show sites (every Build 1 and Build 2 park) each query returns its neutral value;
 * - nothing here writes the state.
 */
import { getShowSiteDef, temperamentGroup, type ShowSiteDef } from '../../data/catalog';
import { SHOW_ARRIVALS_FROM_HOUR, SHOW_HAPPY_CAP, SHOW_MATCH_FACTOR, SHOW_MATCH_GROUP, SHOW_NIGHT_ARRIVALS } from '../../data/tuning/shows';
import { ageMonthsOf, assetValue } from '../finance/value';
import { footprintTiles } from '../footprint';
import { Content } from '../map';
import { elevatedIndex } from '../paths/nodes';
import { dayIndexOf, hourOf } from '../time';
import type { World } from '../types';
import type { Cents, EntityId } from '../units';
import type { ShowSite } from './types';

/** The site with this id, or undefined (real; binary search, the slice is sorted by id). */
export function findShowSite(world: World, id: EntityId): ShowSite | undefined {
  const list = world.state.shows;
  let lo = 0;
  let hi = list.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const site = list[mid] as ShowSite;
    if (site.id === id) return site;
    if (site.id < id) lo = mid + 1;
    else hi = mid - 1;
  }
  return undefined;
}

/** Footprint tile indices of a site, or [] for an unknown type or a site outside the map (real). */
export function showSiteTiles(world: World, site: ShowSite): number[] {
  const def = getShowSiteDef(site.defId);
  if (!def) return [];
  return footprintTiles(world.state.map, site.x, site.y, def.w, def.d, site.rotation) ?? [];
}

/**
 * True when tile (tx, ty) is within `radius` tiles of the centre of a `w` × `d` footprint at (x, y): Euclidean distance
 * from the footprint centre to the tile centre, in exact integer math on doubled coordinates.
 */
export function inShowRadius(x: number, y: number, w: number, d: number, radius: number, tx: number, ty: number): boolean {
  const dx = 2 * tx + 1 - (2 * x + w);
  const dy = 2 * ty + 1 - (2 * y + d);
  return dx * dx + dy * dy <= 4 * radius * radius;
}

/** Tiles in the viewing circle of a footprint, ascending (any content). */
export function radiusTiles(world: World, x: number, y: number, def: Pick<ShowSiteDef, 'w' | 'd' | 'radius'>): number[] {
  const map = world.state.map;
  const out: number[] = [];
  const r = def.radius;
  const y0 = Math.max(0, y - r);
  const y1 = Math.min(map.height - 1, y + def.d - 1 + r);
  const x0 = Math.max(0, x - r);
  const x1 = Math.min(map.width - 1, x + def.w - 1 + r);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) if (inShowRadius(x, y, def.w, def.d, r, tx, ty)) out.push(ty * map.width + tx);
  }
  return out;
}

/** Footpath tiles (a ground footpath or an elevated footpath) within the radius of a footprint, ascending. */
export function viewingTilesAt(world: World, x: number, y: number, def: Pick<ShowSiteDef, 'w' | 'd' | 'radius'>): number[] {
  const s = world.state;
  const map = s.map;
  const elevated = s.elevatedPaths.length > 0 ? elevatedIndex(world) : null;
  const out: number[] = [];
  for (const t of radiusTiles(world, x, y, def)) {
    if (map.content[t] === Content.Footpath) {
      out.push(t);
      continue;
    }
    if (!elevated) continue;
    for (let k = elevated.head[t] as number; k >= 0; k = elevated.next[k] as number) {
      if (s.elevatedPaths[k]?.kind === 'footpath') {
        out.push(t);
        break;
      }
    }
  }
  return out;
}

/**
 * Viewing tiles of site `id` (Phase 6 §4.4: footpaths within the show radius, measured from the footprint centre),
 * ascending. The pathing field for `show:N` starts from every guest-walkable node on these tiles
 * (`pathing/network.ts`). Computed from the map and the site on every call, so it only changes when paths, the site,
 * or the map change; the network caches the field until `markNetworkDirty`.
 */
export function viewingTiles(world: World, id: EntityId): readonly number[] {
  const site = findShowSite(world, id);
  const def = site ? getShowSiteDef(site.defId) : undefined;
  if (!site || !def) return [];
  return viewingTilesAt(world, site.x, site.y, def);
}

/** The site is gathering or running its show: guests heading for it keep going (`guests/state.ts` `targetValid`). */
export function showTargetValid(world: World, id: EntityId): boolean {
  const site = findShowSite(world, id);
  return site !== undefined && (site.status === 'announced' || site.status === 'running');
}

/** True when the site runs or ran a show on the day of `tick` (or one is scheduled for that day). */
function showTonight(site: ShowSite, tick: number): boolean {
  const day = dayIndexOf(tick);
  if (site.status === 'announced' || site.status === 'running') return true;
  if (site.startTick >= 0 && dayIndexOf(site.startTick) === day) return true;
  return site.schedule.enabled && site.nextShowTick >= 0 && dayIndexOf(site.nextShowTick) === day;
}

/**
 * Phase 6 §4.4 Arrivals: ×1.05 from 20:00 to 24:00 when After Dark is on and the park has ≥ 1 show that night
 * (scheduled, running, or already run tonight; a cancelled show no longer counts). Else 1 (`park/arrivals.ts`).
 */
export function showArrivalFactor(world: World): number {
  const s = world.state;
  if (s.shows.length === 0 || !s.park.afterDark || hourOf(s.tick) < SHOW_ARRIVALS_FROM_HOUR) return 1;
  for (const site of s.shows) if (showTonight(site, s.tick)) return SHOW_NIGHT_ARRIVALS;
  return 1;
}

/** Asset value of every show site for the park value (master R14, `finance/value.ts`). */
export function showSitesAssetValue(world: World): Cents {
  let total = 0;
  for (const site of world.state.shows) total += assetValue(site.totalBuildCost, ageMonthsOf(world, site.builtTick));
  return total;
}

/** The guest's temperament group suits this show type (master R6: Lightshow Chill, Fireworks Thrill). */
export function showMatches(defId: string, temperament: number): boolean {
  const group = SHOW_MATCH_GROUP[defId as ShowSiteDef['id']];
  return group !== undefined && temperamentGroup(temperament) === group;
}

/**
 * Total happiness a watcher has gained after `seconds` whole seconds of a show: +1 per second, ×1.3 when the group
 * matches (floor of the running total), never more than +40 per show.
 */
export function watchGain(seconds: number, match: boolean): number {
  if (seconds <= 0) return 0;
  const raw = match ? Math.floor(seconds * SHOW_MATCH_FACTOR + 1e-9) : seconds;
  return Math.min(SHOW_HAPPY_CAP, raw);
}

/** Guests watching site `id` right now (state `watchingShow`). */
export function watcherCount(world: World, id: EntityId): number {
  let n = 0;
  for (const g of world.state.guests) if (g.state === 'watchingShow' && g.showTarget === id) n++;
  return n;
}
