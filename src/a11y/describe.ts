/**
 * Text description of a tile for screen readers (Phase 6 §4.7). Owner: W4-F. Read-only, from the state only.
 * "Tile 12, 30: footpath, 3 guests, next to Carousel": what is on the tile (ground, path, building, scenery, water),
 * path items, elevated paths, guests and staff standing there, ownership, then the buildings on the 4 neighbours.
 */
import { getSceneryDef, getShowSiteDef } from '../data/catalog';
import { text } from '../data/strings/en';
import { contentName } from '../ui/contentName';
import { Content, DIR_DX, DIR_DY, Owned, PathItem } from '../sim/map';
import type { World } from '../sim/types';

/** Name of the ride, stall, or show site with entity id `ref`, or null. */
export function buildingName(world: World, ref: number): string | null {
  const s = world.state;
  const ride = s.rides.find((r) => r.id === ref);
  if (ride) return ride.name;
  const stall = s.stalls.find((st) => st.id === ref);
  if (stall) return stall.name;
  const site = s.shows.find((x) => x.id === ref);
  if (site) return getShowSiteDef(site.defId) ? contentName(site.defId) : null;
  return null;
}

/** "A", "A and B", "A, B and C". */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  const head = names.slice(0, -1).join(text('a11y.listSep'));
  return text('a11y.listAnd', { a: head, b: names[names.length - 1] as string });
}

function count(n: number, one: string, many: string): string {
  return n === 1 ? text(one) : text(many, { n });
}

/** What the tile holds, as its first description part. */
function contentPart(world: World, tile: number): string {
  const map = world.state.map;
  const content = map.content[tile];
  const ref = map.contentRef[tile] ?? -1;
  switch (content) {
    case Content.Footpath:
      return text('a11y.footpath');
    case Content.Queue:
      return text('a11y.queue');
    case Content.ParkEntrance:
      return text('a11y.entrance');
    case Content.Building:
      return buildingName(world, ref) ?? text('a11y.building');
    case Content.Track: {
      const name = buildingName(world, ref);
      return name === null ? text('a11y.track') : text('a11y.trackOf', { name });
    }
    case Content.Scenery: {
      const item = world.state.scenery.find((x) => x.id === ref);
      const def = item ? getSceneryDef(item.defId) : undefined;
      return def ? contentName(def.id) : text('a11y.scenery');
    }
    default:
      if ((map.water[tile] ?? 0) > (map.heights[tile] ?? 0)) return text('a11y.water');
      return text(`a11y.terrain.${map.terrain[tile] ?? 0}`);
  }
}

const PATH_ITEM_KEYS: Readonly<Record<number, string>> = {
  [PathItem.Bench]: 'a11y.bench',
  [PathItem.Bin]: 'a11y.bin',
  [PathItem.Lamp]: 'a11y.lamp',
};

const OWNED_KEYS: Readonly<Record<number, string>> = {
  [Owned.NotOwned]: 'a11y.notOwned',
  [Owned.LandForSale]: 'a11y.landForSale',
  [Owned.RightsOwned]: 'a11y.rightsOwned',
  [Owned.RightsForSale]: 'a11y.rightsForSale',
};

export function describeTile(world: World, tile: number): string {
  const s = world.state;
  const map = s.map;
  const n = map.width * map.height;
  if (!Number.isInteger(tile) || tile < 0 || tile >= n) return text('a11y.offMap');
  const x = tile % map.width;
  const y = (tile - x) / map.width;
  const parts: string[] = [contentPart(world, tile)];
  // Water over a path or building is rare (shores); say it when it is there.
  if (map.content[tile] !== Content.Empty && (map.water[tile] ?? 0) > (map.heights[tile] ?? 0)) parts.push(text('a11y.water'));
  const item = PATH_ITEM_KEYS[map.pathItem[tile] ?? 0];
  if (item) parts.push(text(item));
  const decks = s.elevatedPaths.filter((e) => e.x === x && e.y === y);
  for (const d of decks) parts.push(text(d.kind === 'queue' ? 'a11y.elevatedQueue' : 'a11y.elevatedFootpath'));
  let guests = 0;
  for (const g of s.guests) if (g.tile === tile && g.state !== 'riding') guests++;
  if (guests > 0) parts.push(count(guests, 'a11y.guestOne', 'a11y.guestMany'));
  const staff = s.staff.members.reduce((k, m) => (m.tile === tile ? k + 1 : k), 0);
  if (staff > 0) parts.push(count(staff, 'a11y.staffOne', 'a11y.staffMany'));
  const owned = OWNED_KEYS[map.owned[tile] ?? Owned.Owned];
  if (owned && map.content[tile] !== Content.ParkEntrance) parts.push(text(owned));
  // Buildings on the 4 neighbours (N, E, S, W), each once, not the one this tile belongs to.
  const own = map.content[tile] === Content.Building || map.content[tile] === Content.Track ? (map.contentRef[tile] ?? -1) : -2;
  const seen = new Set<number>();
  const names: string[] = [];
  for (let d = 0; d < 4; d++) {
    const nx = x + (DIR_DX[d] as number);
    const ny = y + (DIR_DY[d] as number);
    if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue;
    const j = ny * map.width + nx;
    const c = map.content[j];
    if (c !== Content.Building && c !== Content.Track) continue;
    const ref = map.contentRef[j] ?? -1;
    if (ref === own || seen.has(ref)) continue;
    seen.add(ref);
    const name = buildingName(world, ref);
    if (name !== null) names.push(name);
  }
  if (names.length > 0) parts.push(text('a11y.nextTo', { names: joinNames(names) }));
  return text('a11y.tile', { x, y, what: parts.join(text('a11y.listSep')) });
}
