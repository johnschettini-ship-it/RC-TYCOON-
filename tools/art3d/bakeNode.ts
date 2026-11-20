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
import { TRACK_CLASSES, carQuadrant, pieceClass, poseClassOf, poseCode, railSplitClass, type TrackClass } from '../../src/render/real/trackClasses';
import { TRACK_RIDES } from '../../src/data/catalog';
import { pieceWorldSamples } from '../../src/sim/rides/track/api';
import { pieceWorldTiles } from '../../src/sim/rides/track/geometry';
import { getTrackPieceDef, getTrackTypeDef } from '../../src/data/track';
import { previewPieces } from '../../src/render/track/preview';
import { paletteColour } from '../../src/render/track/colours';
import { repackPng } from './pngRepack';
import { MASK_COVERAGE_FLOOR, coverageKind } from './maskFloors';
import { trackSpecOf, type TrackSpec } from './items/trackSpecs.js';

export { itemSpec, contentHash, checkIndex, checkCoverFolder, coverDecoded, titleDecoded, reachedPoses, cacheKey, sizeReport, formatSizeReport, S5_LIMIT_BYTES, repackPng, MASK_COVERAGE_FLOOR, coverageKind };
export type { ItemKind };

/** One car pose (quantised yaw 0-31, pitch and roll 0-23: src/render/real/pose.ts) and its yaw quadrant (car set `r<q>`). */
export interface BakePose { yaw: number; pitch: number; roll: number; q: number }
/** Rail samples and rail tiles of a piece built at one heading, entering tile (0, 0) at height 0. */
export interface PieceDir {
  n: number; x: number[]; y: number[]; z: number[]; yaw: number[]; pitch: number[]; bankSin: number[]; bankCos: number[];
  tiles: (ReturnType<typeof pieceWorldTiles>[number] & { clip?: [number, number, number, number]; runs?: [number, number][] })[];
}

/** Rail samples running along a tile edge (the track's width across it) before a piece is cut by track runs, not planes. */
export const STRADDLE_SAMPLES = 16;

/**
 * A piece whose track runs ALONG a tile edge (within `straddleHalfM`, the type spec's half track width, either side) for
 * more than STRADDLE_SAMPLES samples (4 m) is cut between its tile
 * pictures by track runs instead of the tile's clip planes (`runs`: the sample ranges [a, b] each rail tile draws):
 * a plane along the track splits its rails and spine lengthwise, and the two halves, drawn by two tiles in the game's
 * tile order, overlap in a notch or an X (the vertical loop's top runs along y = 0 for about 10 m, fix wave). A run
 * cut is across the track, so its pictures meet as piece ends do. Each segment between two samples belongs to the rail
 * tile (with its `clip` rectangle) holding its middle. Only the vertical loops qualify among today's pieces (their
 * longest run along an edge is 40 samples; turns and helixes 6-7), so no other picture changes.
 */
export function trackRuns<T extends { x: number; y: number; rail: boolean; clip?: [number, number, number, number] }>(
  s: { n: number; x: ArrayLike<number>; y: ArrayLike<number>; yaw: ArrayLike<number>; bankSin: ArrayLike<number>; bankCos: ArrayLike<number> },
  tiles: T[],
  straddleHalfM: number,
): (T & { runs?: [number, number][] })[] {
  const tileOf = (x: number, y: number): string => `${Math.floor(x / 4)},${Math.floor(y / 4)}`;
  let run = 0, best = 0;
  for (let k = 0; k < s.n; k++) {
    const yaw = s.yaw[k] as number, roll = Math.atan2(s.bankSin[k] as number, s.bankCos[k] as number);
    const lx = -Math.sin(yaw) * Math.cos(roll) * straddleHalfM, ly = Math.cos(yaw) * Math.cos(roll) * straddleHalfM;
    const c = tileOf(s.x[k] as number, s.y[k] as number);
    const off = tileOf((s.x[k] as number) + lx, (s.y[k] as number) + ly) !== c || tileOf((s.x[k] as number) - lx, (s.y[k] as number) - ly) !== c;
    run = off ? run + 1 : 0;
    best = Math.max(best, run);
  }
  if (best <= STRADDLE_SAMPLES) return tiles;
  const rail = tiles.map((t, i) => ({ t, i })).filter(({ t }) => t.rail);
  const owner = (x: number, y: number): number => {
    let at = -1, dist = Infinity;
    for (const { t, i } of rail) {
      const [x0, x1, y0, y1] = t.clip ?? [-2, 2, -2, 2];
      const cx = (t.x + 0.5) * 4, cy = (t.y + 0.5) * 4;
      const dx = Math.max(cx + x0 - x, 0, x - (cx + x1)), dy = Math.max(cy + y0 - y, 0, y - (cy + y1));
      const d = Math.hypot(dx, dy);
      if (d < dist) { dist = d; at = i; }
    }
    return at;
  };
  const runs = new Map<number, [number, number][]>();
  for (let k = 0; k + 1 < s.n; k++) {
    const o = owner(((s.x[k] as number) + (s.x[k + 1] as number)) / 2, ((s.y[k] as number) + (s.y[k + 1] as number)) / 2);
    const l = runs.get(o) ?? [];
    const last = l[l.length - 1];
    if (last && last[1] === k) last[1] = k + 1;
    else l.push([k, k + 1]);
    runs.set(o, l);
  }
  return tiles.map((t, i) => (t.rail && runs.has(i) ? { ...t, runs: runs.get(i)! } : t));
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
 *   pieces   every piece the type builds (`typeBuildsPiece`), with its class and its rail set's class (`railSet`: the
 *            class, or its half when the spec's `splitRailClasses` names it), its special, whether it has untinted
 *            parts (`UNTINTED_GROUPS`, or every piece of a type whose spec says `maskedRails`: masked sheet, not alpha), whether it takes a chain lift (`chainable`: Task 5's trough) and its samples and tiles at every heading;
 *   classes  in `TRACK_CLASSES` order, the class's pieces and its car poses (`poseClassOf`, as the game files them), each
 *            with its yaw quadrant `q` (`carQuadrant`: the car set `car:<type>~<class>:r<q>` it goes in);
 *   spins    `vehicle.spins`: every reached (pitch, roll) at all 32 yaws; a yaw no piece reaches files under `base`;
 *   front    the type's train has a front car (`loco`, `monorail`): every pose also as `front`.
 */
export interface TrackBakeInput {
  type: string; spins: boolean; front: boolean;
  pieces: Record<string, { special: string | null; group: string; cls: TrackClass; railSet: string; untinted: boolean; chainable: boolean; dirs: PieceDir[] }>;
  classes: { cls: TrackClass; pieces: string[]; poses: BakePose[] }[];
}

export function trackGeometry(typeId: string, spec: Pick<TrackSpec, 'straddleHalfM' | 'maskedRails' | 'splitRailClasses'> = trackSpecOf(typeId)): TrackBakeInput {
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
        tiles: trackRuns(s, clipRects(pieceWorldTiles(piece)), spec.straddleHalfM),
      });
    }
    const cls = pieceClass(id);
    pieces[id] = { special: def.special ?? null, group: def.group, cls, railSet: spec.splitRailClasses?.includes(cls) ? railSplitClass(id) : cls, untinted: !!spec.maskedRails || UNTINTED_GROUPS.includes(def.group), chainable: !!def.chainable, dirs };
  }
  const spins = type.vehicle.spins;
  const front = hasFrontCar(typeId);
  const classes = TRACK_CLASSES.map((cls) => ({ cls, pieces: ids.filter((id) => pieces[id]!.cls === cls), poses: [] as BakePose[] }));
  for (const p of carPoses(typeId, ids)) classes.find((c) => c.cls === poseClassOf(typeId, poseCode(p.yaw, p.pitch, p.roll)))!.poses.push({ ...p, q: carQuadrant(p.yaw) });
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
