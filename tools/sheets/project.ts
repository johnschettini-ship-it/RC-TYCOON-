/** Phase 8b stage 0b test (never merged): projected decoded memory of a park (sheets, swaps, chunk images, static layer). */
import { getFlatRideDef } from '../../src/data/catalog/flatRides';
import { getTrackTypeDef } from '../../src/data/track';
import { coarseRideFrame, decodeRideFrame, rideFrameFor } from '../../src/render/anim';
import type { PackIndex } from '../../src/render/pixel/app/format';
import { nearestLevel } from '../../src/render/pixel/grid';
import { ART_SCALE } from '../../src/render/pixel/surface';
import { STEP_PX } from '../../src/render/iso';
import { chunkBounds } from '../../src/render/terrain';
import { chunkCount } from '../../src/render/terrainTracker';
import { mapToView, viewSpriteRotation, type ViewRotation } from '../../src/render/view';
import type { World } from '../../src/sim/types';

/** Decoded pack indexes by pack name. */
export type LoadedPacks = Record<string, PackIndex>;

export interface ProjectDevice {
  cssW: number;
  cssH: number;
  dpr: number;
  stretch: number;
  /** Coarse ride frame set (pack `rides-coarse`) instead of `rides-full`. */
  coarse: boolean;
}

export interface Projection {
  sheetsMb: number;
  swapMb: number;
  chunkMb: number;
  staticMb: number;
  totalMb: number;
  /** Decoded images: plain sheets plus swapped copies. */
  sheets: number;
  /**
   * Upper bound (fix round 1, I2): `totalMb` with every occupancy group of each ride in view (both frame sets: all
   * groups of the set in use) and the ghost sheets (valid and invalid swaps of every ghost sheet) loaded as well.
   */
  upperMb: number;
}

/** 1 MB = 1 048 576 bytes. */
export const MB = 1024 * 1024;
const HW = 32;
const HH = 16;

/** The packing group of a sheet file: the name before `-<sheet name>.png`, as written by `build.ts` (`/` became `_`). */
export const sheetGroup = (file: string): string => file.replace(/-[0-9a-f]{10}\.png$/, '');

/** The home zoom of a device (§7.6): the crisp level nearest to zoom 1 for stretch `k`. */
export function homeZoom(dpr: number, stretch: number): number {
  return nearestLevel(1, { device: 'phone', deviceRatio: dpr, stretch, canvasRatio: dpr / stretch });
}

/** Canvas size in canvas pixels (CSS size × dpr / stretch, rounded up). */
export function canvasSize(d: ProjectDevice): { w: number; h: number } {
  return { w: Math.ceil((d.cssW * d.dpr) / d.stretch), h: Math.ceil((d.cssH * d.dpr) / d.stretch) };
}

/**
 * Chunk image bytes of the chunks that meet the viewport at the home zoom, centred on the top of tile `focus`.
 * Image size: the chunk's world bounds (`chunkBounds`) at `ART_SCALE`, rounded up, 4 bytes per pixel.
 */
export function chunkBytesInView(world: World, d: ProjectDevice, view: ViewRotation, focus: { x: number; y: number }): number {
  const map = world.state.map;
  const zoom = homeZoom(d.dpr, d.stretch);
  const halfW = d.cssW / zoom / 2;
  const halfH = d.cssH / zoom / 2;
  const f = mapToView(focus.x, focus.y, view, map.width, map.height);
  const fz = map.heights[focus.y * map.width + focus.x] as number;
  const cx0 = (f.u - f.v) * HW;
  const cy0 = (f.u + f.v + 1) * HH - fz * STEP_PX;
  const n = chunkCount(map);
  let bytes = 0;
  for (let cy = 0; cy < n.cy; cy++) {
    for (let cx = 0; cx < n.cx; cx++) {
      const b = chunkBounds(map, cx, cy, view);
      if (b.right <= cx0 - halfW || b.left >= cx0 + halfW || b.bottom <= cy0 - halfH || b.top >= cy0 + halfH) continue;
      bytes += Math.ceil((b.right - b.left) * ART_SCALE) * Math.ceil((b.bottom - b.top) * ART_SCALE) * 4;
    }
  }
  return bytes;
}

/**
 * The decoded bytes a park needs in view `view` (Task 9): the sheets of its objects (rides: the group of their current
 * occupancy at their sprite rotation; guests and staff: every `people` sheet; stalls, scenery, shows: their def's
 * group; path items, decals, fence, entrance, shadows, ground, elevated paths: their groups), track sheets (rails of
 * the used types in this view, supports and cars) once per used colour as swaps, the chunk images that meet the
 * viewport, and the static layer (canvas width × height × 4). Ghosts are not counted (build mode only).
 * `focus` (the tile at the screen centre) defaults to the map centre.
 */
export function projectScene(world: World, packs: LoadedPacks, device: ProjectDevice, view: number, focus?: { x: number; y: number }): Projection {
  const s = world.state;
  const map = s.map;
  const r = (view & 3) as ViewRotation;
  // Sheets by pack and group.
  const groups = new Map<string, Array<{ pack: string; i: number; bytes: number }>>();
  for (const [pack, ix] of Object.entries(packs)) {
    ix.sheets.forEach((sh, i) => {
      const id = `${pack}:${sheetGroup(sh.file)}`;
      const list = groups.get(id) ?? [];
      list.push({ pack, i, bytes: sh.w * sh.h * 4 });
      groups.set(id, list);
    });
  }
  const plain = new Map<string, number>();
  const swaps = new Map<string, number>();
  // Fix round 1 (I1): a ride, stall, scenery or show group that the index lacks is an error (it would count 0 bytes).
  const strict = (pack: string, group: string): boolean => pack.startsWith('rides-') || /^(stall|scenery|show)\//.test(group);
  const use = (pack: string, group: string, swap = -1): void => {
    const list = groups.get(`${pack}:${group.replace(/[^A-Za-z0-9_-]+/g, '_')}`);
    if (!list && strict(pack, group)) throw new Error(`projectScene: no sheet group ${group} in pack ${pack}`);
    for (const sh of list ?? []) {
      if (swap < 0) plain.set(`${pack}:${sh.i}`, sh.bytes);
      else swaps.set(`${pack}:${sh.i}:${swap}`, sh.bytes);
    }
  };
  const ridePack = device.coarse ? 'rides-coarse' : 'rides-full';
  // Upper bound (I2): every occupancy group of the frame set for each ride, kept apart from the plain sum.
  const upper = new Map<string, number>();
  for (const ride of s.rides) {
    if (ride.kind !== 'flat') continue;
    const def = getFlatRideDef(ride.defId);
    if (!def) continue;
    // Fix round 1 (I1): the coarse set holds occupancy 0, 2 and 4 only (`coarseRideFrame`).
    const fr = rideFrameFor(ride, def);
    const occupancy = decodeRideFrame(device.coarse ? coarseRideFrame(fr) : fr).occupancy;
    const vrot = viewSpriteRotation(ride.rotation, r);
    use(ridePack, `${ride.defId}/${vrot}/${occupancy}`);
    for (const occ of device.coarse ? [0, 2, 4] : [0, 1, 2, 3, 4]) {
      for (const sh of groups.get(`${ridePack}:${`${ride.defId}/${vrot}/${occ}`.replace(/[^A-Za-z0-9_-]+/g, '_')}`) ?? []) upper.set(`${ridePack}:${sh.i}`, sh.bytes);
    }
  }
  for (const [id, list] of groups) if (id.startsWith('ghosts:')) for (const sh of list) for (const g of [0, 1]) upper.set(`ghosts:${sh.i}:${g}`, sh.bytes);
  if (s.guests.length > 0 || s.staff.members.length > 0) for (const g of groups.keys()) if (g.startsWith('people:')) use('people', g.slice('people:'.length));
  for (const st of s.stalls) use('objects', `stall/${st.defId}`);
  for (const sc of s.scenery) use('objects', `scenery/${sc.defId}`);
  for (const sh of s.shows) use('objects', `show/${sh.defId}`);
  let items = false;
  let decals = false;
  for (let i = 0; i < map.pathItem.length; i++) {
    if ((map.pathItem[i] as number) !== 0) items = true;
    if ((map.litter[i] as number) !== 0 || (map.mess[i] as number) !== 0) decals = true;
  }
  if (items) use('objects', 'pathItem');
  if (decals) use('objects', 'decal');
  use('objects', 'fence');
  use('objects', 'entrance');
  if (s.rides.length > 0 || s.stalls.length > 0 || s.scenery.length > 0) use('shadows', 'shadow');
  use('ground', 'ground');
  if (s.elevatedPaths.length > 0) use('track', 'elevated');
  for (const ride of s.rides) {
    if (ride.kind !== 'track') continue;
    const data = s.track.rides[String(ride.id)];
    const type = data ? getTrackTypeDef(data.typeId) : undefined;
    if (!data || !type) continue;
    use('track', `rail/${type.id}/${r}`, data.colours.track);
    use('track', `support/${type.render.supports}`, data.colours.supports);
    if (data.trains.length > 0) use('track', `car/${type.render.car}`, data.colours.cars);
    if (ride.entrance || ride.exit) use('track', 'gate');
  }
  const sum = (m: Map<string, number>): number => [...m.values()].reduce((a, b) => a + b, 0);
  const c = canvasSize(device);
  const sheetsMb = sum(plain) / MB;
  const swapMb = sum(swaps) / MB;
  const chunkMb = chunkBytesInView(world, device, r, focus ?? { x: Math.floor(map.width / 2), y: Math.floor(map.height / 2) }) / MB;
  const staticMb = (c.w * c.h * 4) / MB;
  const totalMb = sheetsMb + swapMb + chunkMb + staticMb;
  let extra = 0;
  for (const [k, b] of upper) if (!plain.has(k)) extra += b;
  return { sheetsMb, swapMb, chunkMb, staticMb, totalMb, sheets: plain.size + swaps.size, upperMb: totalMb + extra / MB };
}
