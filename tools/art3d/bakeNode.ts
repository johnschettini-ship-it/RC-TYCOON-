/**
 * Node side of the stage 1 bake, bundled by bake.mjs (rolldown) so the driver can use the game's TypeScript modules:
 * catalogue footprints and heights (itemSpec), the cache key (contentHash), every track type's geometry, classes and car
 * poses, and the index validator.
 */
import { itemSpec, contentHash, type ItemKind } from './catalog';
import { checkIndex, UNTINTED_GROUPS } from './checkIndex';
import { checkCoverFolder, coverDecoded, titleDecoded } from './titleIndex';
import { cacheKey } from './cacheKey';
import { sizeReport, formatSizeReport, S5_LIMIT_BYTES, typePieces } from './sizeReport';
import { carPoses, hasFrontCar, reachedPoses } from './poses';
import { TRACK_CLASSES, pieceClass, poseClassOf, poseCode, type TrackClass } from '../../src/render/real/trackClasses';
import { TRACK_RIDES } from '../../src/data/catalog';
import { pieceWorldSamples } from '../../src/sim/rides/track/api';
import { pieceWorldTiles } from '../../src/sim/rides/track/geometry';
import { getTrackPieceDef, getTrackTypeDef } from '../../src/data/track';
import { previewPieces } from '../../src/render/track/preview';
import { paletteColour } from '../../src/render/track/colours';
import { repackPng } from './pngRepack';

export { itemSpec, contentHash, checkIndex, checkCoverFolder, coverDecoded, titleDecoded, reachedPoses, cacheKey, sizeReport, formatSizeReport, S5_LIMIT_BYTES, repackPng };
export type { ItemKind };

/** One car pose (quantised yaw 0-31, pitch and roll 0-23: src/render/real/pose.ts). */
export interface BakePose { yaw: number; pitch: number; roll: number }
/** Rail samples and rail tiles of a piece built at one heading, entering tile (0, 0) at height 0. */
export interface PieceDir {
  n: number; x: number[]; y: number[]; z: number[]; yaw: number[]; pitch: number[]; bankSin: number[]; bankCos: number[];
  tiles: (ReturnType<typeof pieceWorldTiles>[number] & { clip?: [number, number, number, number] })[];
}

/**
 * The clip rectangle of each rail tile's picture (`clip`: [x0, x1, y0, y1], game metres from the tile centre; the tile
 * itself is [-2, 2, -2, 2]). A piece's tiles without rail (`rail: false`, the clearance tiles of a vertical loop) have
 * no picture of their own, yet a loop's spine runs out into them (0.57 m past the tile edge where the track stands
 * vertical): each such tile joins the picture of the adjacent rail tile with the highest rail (the part that leans
 * out), so nothing the bake models is clipped away. The joined tiles must make a rectangle (a clip is 4 planes).
 */
export function clipRects<T extends { x: number; y: number; railMin: number; railMax: number; rail: boolean }>(tiles: T[]): (T & { clip?: [number, number, number, number] })[] {
  const extra = new Map<T, T[]>();
  for (const t of tiles) {
    if (t.rail || t.railMax <= t.railMin) continue; // a flat clearance tile (a turn's inside corner) holds no rail
    const near = tiles.filter((q) => q.rail && Math.abs(q.x - t.x) + Math.abs(q.y - t.y) === 1);
    if (!near.length) continue;
    const to = near.reduce((a, b) => (b.railMax > a.railMax ? b : a));
    extra.set(to, [...(extra.get(to) ?? []), t]);
  }
  return tiles.map((t) => {
    const more = extra.get(t);
    if (!t.rail || !more) return t;
    const xs = [t, ...more].map((q) => q.x - t.x), ys = [t, ...more].map((q) => q.y - t.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    if ((x1 - x0 + 1) * (y1 - y0 + 1) !== more.length + 1) throw new Error(`clipRects: tile ${t.x},${t.y} and its rail-less neighbours are not a rectangle`);
    return { ...t, clip: [x0 * 4 - 2, x1 * 4 + 2, y0 * 4 - 2, y1 * 4 + 2] as [number, number, number, number] };
  });
}
/**
 * The bake input of a track type (items/trackKit.js bakeTrackType, frame plan items/trackKeys.js):
 *   pieces   every piece the type builds (`typeBuildsPiece`), with its class, its special, whether it has untinted
 *            parts (`UNTINTED_GROUPS`: masked sheet, not alpha) and its samples and tiles at every heading;
 *   classes  in `TRACK_CLASSES` order, the class's pieces and its car poses (`poseClassOf`, as the game files them);
 *   spins    `vehicle.spins`: every reached (pitch, roll) at all 32 yaws; a yaw no piece reaches files under `base`;
 *   front    the type's train has a front car (`loco`, `monorail`): every pose also as `front`.
 */
export interface TrackBakeInput {
  type: string; spins: boolean; front: boolean;
  pieces: Record<string, { special: string | null; group: string; cls: TrackClass; untinted: boolean; dirs: PieceDir[] }>;
  classes: { cls: TrackClass; pieces: string[]; poses: BakePose[] }[];
}

export function trackGeometry(typeId: string): TrackBakeInput {
  const type = getTrackTypeDef(typeId);
  if (!type) throw new Error(`trackGeometry: unknown track type ${typeId}`);
  const ids = typePieces(typeId);
  const pieces: TrackBakeInput['pieces'] = {};
  for (const id of ids) {
    const def = getTrackPieceDef(id);
    if (!def) throw new Error(`trackGeometry: unknown piece ${id}`);
    const dirs: PieceDir[] = [];
    for (let dir = 0; dir < 4; dir++) {
      const piece = { defId: id, x: 0, y: 0, z: 0, dir: dir as 0 | 1 | 2 | 3, chain: false, brakeSpeed: null, cost: 0 };
      const s = pieceWorldSamples(piece);
      dirs.push({
        n: s.n, x: [...s.x], y: [...s.y], z: [...s.z], yaw: [...s.yaw], pitch: [...s.pitch], bankSin: [...s.bankSin], bankCos: [...s.bankCos],
        tiles: clipRects(pieceWorldTiles(piece)),
      });
    }
    pieces[id] = { special: def.special ?? null, group: def.group, cls: pieceClass(id), untinted: UNTINTED_GROUPS.includes(def.group), dirs };
  }
  const spins = type.vehicle.spins;
  const front = hasFrontCar(typeId);
  const classes = TRACK_CLASSES.map((cls) => ({ cls, pieces: ids.filter((id) => pieces[id]!.cls === cls), poses: [] as BakePose[] }));
  for (const p of carPoses(typeId, ids)) classes.find((c) => c.cls === poseClassOf(typeId, poseCode(p.yaw, p.pitch, p.roll)))!.poses.push(p);
  return { type: typeId, spins, front, pieces, classes: classes.filter((c) => c.pieces.length || c.poses.length) };
}

/** One card picture to bake (items/cards.js): the item, its kind, and its catalogue footprint and height. */
export interface CardItem { id: string; kind: 'ride' | 'stall' | 'scenery' | 'path' | 'track' | 'tool'; spec?: ReturnType<typeof itemSpec> }

/** A track card's scene (items/cards.js): today's track preview pieces, placed, and the type's default colours. */
export interface TrackCardScene { pieces: { id: string; special: string | null; tile: [number, number]; samples: Omit<PieceDir, 'tiles'> }[]; colours: { track: string; supports: string; cars: string } }

/**
 * The card bake's input: the items with their specs, and for every track ride type (TRACK_RIDES) today's track
 * preview scene (src/render/track/preview.ts previewPieces) as placed rail samples, with the type's default colours
 * (track, supports, cars). A track card draws its type's scene with its type's style (items/cards.js).
 */
export function cardInput(items: CardItem[]): { items: CardItem[]; tracks: Record<string, TrackCardScene> } {
  const tracks: Record<string, TrackCardScene> = {};
  for (const r of TRACK_RIDES) {
    const type = getTrackTypeDef(r.id);
    if (!type) throw new Error(`cardInput: no track type ${r.id}`);
    const pieces = previewPieces(r.id).map((p) => {
      const s = pieceWorldSamples(p);
      const def = getTrackPieceDef(p.defId);
      return {
        id: p.defId, special: def?.special ?? null, tile: [p.x, p.y] as [number, number],
        samples: { n: s.n, x: [...s.x], y: [...s.y], z: [...s.z], yaw: [...s.yaw], pitch: [...s.pitch], bankSin: [...s.bankSin], bankCos: [...s.bankCos] },
      };
    });
    const c = type.render.colours;
    tracks[r.id] = { pieces, colours: { track: paletteColour(c.track), supports: paletteColour(c.supports), cars: paletteColour(c.cars) } };
  }
  return { items, tracks };
}
