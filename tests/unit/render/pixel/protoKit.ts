/** Phase 8 stage 0 prototype (never merged): Node helpers for the stage 0 outputs (PNG writer, the rides and track sheet, the numbers). */
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { FLAT_RIDES } from '../../../../src/data/catalog/flatRides';
import { artBuildLog, buildSprite, type AnyCanvas } from '../../../../src/render/canvas';
import { packDepth, sortKey, sortIndex } from '../../../../src/render/depth';
import { artStyle, setArtStyle } from '../../../../src/render/pixel/style';
import type { PixelSurface } from '../../../../src/render/pixel/surface';
import { drawRideArt, rideArtBounds, type RideArtState } from '../../../../src/render/sprites/rides';
import { TrackLayer, type DrawSink } from '../../../../src/render/track/layer';
import { executeCommand } from '../../../../src/sim/commands';
import { makeTestWorld, runTicks } from '../../../helpers/world';
import { buildR1, expectOk } from '../../track/helpers';
import { FakeCanvas, install } from '../fakeCanvas';

// ------------------------------------------------------------------ PNG

const CRC_TABLE: Uint32Array = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = (CRC_TABLE[(c ^ (bytes[i] as number)) & 255] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// One chunk: length, type, data, CRC32 over type and data.
function chunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  Buffer.from(data.buffer, data.byteOffset, data.length).copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** Write an RGBA image (8 bits per channel, `w × h × 4` bytes, row-major) as a PNG file: filter 0 on every row. */
export function writePng(path: string, w: number, h: number, rgba: Uint8Array): void {
  if (rgba.length !== w * h * 4) throw new Error(`writePng: ${rgba.length} bytes for ${w} × ${h}`);
  const raw = new Uint8Array((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    raw.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), y * (w * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter method
  ihdr[12] = 0; // no interlace
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  writeFileSync(path, Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', new Uint8Array(0))]));
}

// ------------------------------------------------------------------ sheet sprites

export interface SheetSprite {
  label: string;
  surface: PixelSurface;
  /** Place of the image's top-left pixel, in art pixels (rides: from the anchor; track: in the view). */
  x: number;
  y: number;
}

export interface SheetTrackView {
  rot: 0 | 1;
  slices: SheetSprite[];
  cars: SheetSprite[];
  other: SheetSprite[];
}

// The private sub numbers of the track draw list (`layer.ts:87-91`): 0 slice, 1 chain, 2 car, 3 gate, 4 water.
const SUB_SLICE = 0;
const SUB_CAR = 2;

/** The 18 flat rides at frame 0, rotation 2, in catalog order. */
function rideSprites(): SheetSprite[] {
  const log = artBuildLog.surfaces as Array<{ surface: PixelSurface; image: AnyCanvas }>;
  return FLAT_RIDES.map((def) => {
    const st: RideArtState = { rotation: 2, angle: 0, swing: 0, occupancy: 0 };
    const sp = buildSprite(rideArtBounds(def.id, def.w, def.d, 2), 0.5, (c) => drawRideArt(c, def.id, def.w, def.d, st));
    const rec = log.find((e) => e.image === sp.image);
    if (!rec) throw new Error(`no surface logged for ride ${def.id}`);
    return { label: def.id, surface: rec.surface, x: -sp.ox, y: -sp.oy };
  });
}

/** R1 with one train of 4 cars after 600 ticks of a test run, assembled in view `rot` from the track layer's draws. */
function trackView(world: ReturnType<typeof makeTestWorld>, rot: 0 | 1): SheetTrackView {
  const log = artBuildLog.surfaces as Array<{ surface: PixelSurface; image: AnyCanvas }>;
  const layer = new TrackLayer();
  const fake = new FakeCanvas(4096, 4096);
  const ctx = fake.getContext() as CanvasRenderingContext2D;
  const bySurface = new Map<unknown, PixelSurface>();
  const bigView = { x0: -1e7, y0: -1e7, x1: 1e7, y1: 1e7 };
  let view: SheetTrackView = { rot, slices: [], cars: [], other: [] };
  // Builds are capped per collect (20 slices, 32 cars), so passes repeat until one builds nothing.
  for (let pass = 0; pass < 100; pass++) {
    const items: Array<{ ref: number; sub: number; key: number }> = [];
    const sink: DrawSink = {
      push(_kind, ref, sub, _ax, _ay, _skey, depth, z, l) {
        items.push({ ref, sub, key: sortKey(packDepth(depth, z, l), items.length) });
      },
    };
    fake.reset();
    const before = log.length;
    layer.collect(world, sink, bigView, 0.5, 0.5, 0, 0, 0, rot);
    // Depth order, as the renderer's draw list (`renderer.ts` `DrawList.sort`).
    const order = items.map((it) => it.key).sort((a, b) => a - b);
    const subOf: number[] = [];
    const refOf: number[] = [];
    for (const key of order) {
      const it = items[sortIndex(key)] as { ref: number; sub: number };
      const n0 = fake.draws.length;
      layer.drawItem(ctx, it.ref, it.sub);
      for (let k = n0; k < fake.draws.length; k++) {
        subOf.push(it.sub);
        refOf.push(it.ref);
      }
    }
    for (let k = before; k < log.length; k++) {
      const e = log[k] as { surface: PixelSurface; image: AnyCanvas };
      bySurface.set(e.image, e.surface);
    }
    if (log.length > before) continue;
    // The last pass built nothing: its draws are the whole view.
    view = { rot, slices: [], cars: [], other: [] };
    fake.draws.forEach((d, k) => {
      const surface = bySurface.get(d.image);
      if (!surface) throw new Error(`track draw ${k} (sub ${subOf[k]}) has an image with no logged surface`);
      const sub = subOf[k] as number;
      const ref = refOf[k] as number;
      if (sub === SUB_SLICE) view.slices.push({ label: `slice ${ref}`, surface, x: d.x, y: d.y });
      else if (sub === SUB_CAR) view.cars.push({ label: `car ${ref}`, surface, x: d.x, y: d.y });
      else view.other.push({ label: `other ${ref}`, surface, x: d.x, y: d.y });
    });
    return view;
  }
  throw new Error('track sheet: builds did not settle in 100 passes');
}

/**
 * The sprites of the stage 0 sheet (§11.3): the 18 flat rides, and R1 with its train in view rotations 0 and 1.
 * Runs in Pixel and restores the art style and the build log after.
 */
export function buildSheetSprites(): { rides: SheetSprite[]; track: SheetTrackView[] } {
  install();
  const prevStyle = artStyle();
  const prevLog = artBuildLog.surfaces;
  artBuildLog.surfaces = [];
  try {
    setArtStyle('pixel');
    const rides = rideSprites();
    const world = makeTestWorld();
    const id = buildR1(world);
    expectOk(executeCommand(world, { type: 'setTrainConfig', rideId: id, trains: 1, carsPerTrain: 4 }));
    expectOk(executeCommand(world, { type: 'startTestRun', rideId: id }));
    runTicks(world, 600);
    const track = [trackView(world, 0), trackView(world, 1)];
    return { rides, track };
  } finally {
    artBuildLog.surfaces = prevLog;
    setArtStyle(prevStyle);
  }
}

// ------------------------------------------------------------------ numbers (Task 21)

/** `PEAK_LOAD_MAX` (§15): 392 KB. */
const PEAK_LOAD_MAX = 392 * 1024;
/** `PROJECTION_NEAR` (§15): 8 KB below `PEAK_LOAD_MAX`. */
const PROJECTION_NEAR = 8 * 1024;

/** The initial load in bytes of a release check text: the `(N bytes)` value when present, else the `X.X KB gzipped` value × 1024. */
export function parseLoadBytes(text: string): number {
  const line = text.split('\n').find((l) => l.includes('Initial load')) ?? text;
  const exact = /\((\d+) bytes\)/.exec(line);
  if (exact) return Number(exact[1]);
  const kb = /([\d.]+) KB gzipped/.exec(line);
  if (!kb) throw new Error('parseLoadBytes: no initial load value');
  return Math.round(Number(kb[1]) * 1024);
}

/**
 * The frame p95 of the `[perf] <project>` lines of scene `scene` (`perf-build3.spec.ts:272`), never the tick, work,
 * render or pan p95. With `requireN`, a line counts only when it ends with `n <k>`, k > 0. The mean of the counted lines.
 */
export function parseP95(text: string, project: 'desktop' | 'phone', scene: 'phone' | 'build2', requireN: boolean): number {
  const values: number[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line.startsWith(`[perf] ${project}`) || !line.includes(`scene ${scene} `)) continue;
    if (requireN) {
      const n = /\bn (\d+)$/.exec(line);
      if (!n || Number(n[1]) <= 0) continue;
    }
    const m = /frame p50 [\d.]+ \/ p95 ([\d.]+)/.exec(line);
    if (m) values.push(Number(m[1]));
  }
  if (values.length === 0) throw new Error(`parseP95: no counted line for ${project} scene ${scene}`);
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** The projected initial load at the end of stage 7, in bytes (§10.4 item 3). */
export function projection(v: {
  L_proto: number;
  C_MAP: number;
  C_ride: number;
  C_guest: number;
  K_SMALL: number;
  N_STAMP: number;
  T_TRACK: number;
  T_REST: number;
}): number {
  return (
    v.L_proto +
    v.C_MAP +
    v.C_ride * 17 +
    (v.C_guest * (14 + 85 + 2)) / v.K_SMALL +
    (v.C_guest * v.N_STAMP) / v.K_SMALL +
    v.T_TRACK +
    v.T_REST
  );
}

/** Kill rule 7 (at or above `PEAK_LOAD_MAX`) and 7a (at or above `PEAK_LOAD_MAX − PROJECTION_NEAR`). */
export function kill7(P: number): 'fires' | 'near' | 'clear' {
  if (P >= PEAK_LOAD_MAX) return 'fires';
  if (P >= PEAK_LOAD_MAX - PROJECTION_NEAR) return 'near';
  return 'clear';
}

/** The planned share of the pixel code at the end of each stage, in the order of §12.1 (§15). */
const STAGE_SHARES: ReadonlyArray<readonly [string, number]> = [
  ['1a-i', 0.15],
  ['1a-ii', 0.25],
  ['1b', 0.3],
  ['1c', 0.38],
  ['2a', 0.45],
  ['2b', 0.55],
  ['3', 0.68],
  ['4a', 0.8],
  ['4b', 0.84],
  ['4c', 0.84],
  ['5a', 0.88],
  ['6', 0.95],
  ['7', 1.0],
];

/**
 * `PIXEL_CODE_STEP_KB` by §10.4 item 6: `room = (392 − B / 1024) / rGzip` KB; the cumulative limit is
 * `floor(room × share)` for 1a-i and `floor(room × share) + ceil(cMapSrc / 1024)` from 1a-ii; the step is the growth
 * over the stage before. 5b, 8 and 9 have step 0 and the limit of stage 7.
 */
export function stepTable(B: number, rGzip: number, cMapSrc: number): Record<string, { step: number; limit: number }> {
  const room = (PEAK_LOAD_MAX / 1024 - B / 1024) / rGzip;
  const mapKb = Math.ceil(cMapSrc / 1024);
  const out: Record<string, { step: number; limit: number }> = {};
  let prev = 0;
  for (const [stage, share] of STAGE_SHARES) {
    const limit = Math.floor(room * share) + (stage === '1a-i' ? 0 : mapKb);
    out[stage] = { step: limit - prev, limit };
    prev = limit;
  }
  for (const stage of ['5b', '8', '9']) out[stage] = { step: 0, limit: prev };
  return out;
}

/** `BUILD_BUDGET_MS_DESKTOP` and `BUILD_BUDGET_MS_PHONE` from the slowest sprite builds (§10.3). */
export function buildBudgets(desktopMs: number, phoneMs: number): { desktop: number; phone: number } {
  return { desktop: Math.max(4, Math.ceil(desktopMs)), phone: Math.max(6, Math.ceil(phoneMs)) };
}
