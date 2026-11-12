/** Phase 8b stage 0b test (never merged): the size and memory projection (Task 9). */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { devices } from '@playwright/test';
import { describe, expect, it } from 'vitest';
import { decodeIndex, type PackIndex } from '../../../../src/render/pixel/app/format';
import { deserialize } from '../../../../src/save';
import { executeCommand } from '../../../../src/sim/commands';
import type { World } from '../../../../src/sim/types';
import { createWorld } from '../../../../src/sim/world';
import { addGuestDirect, placeFootpath } from '../../../helpers/world';
import { CASES_FILE, CASES_FOCUS } from '../../../perf/casesScene';
import { PERF_SCENES } from '../../../perf/sceneInfo';
import { canvasSize, chunkBytesInView, homeZoom, MB, projectScene, type LoadedPacks, type ProjectDevice } from '../../../../tools/sheets/project';

/** A pack index with only sheets (the projection reads nothing else). */
function fakeIndex(sheets: Array<[file: string, w: number, h: number, swappable?: number]>): PackIndex {
  return {
    palette: new Uint8Array(3),
    swaps: [],
    sheets: sheets.map(([file, w, h, swappable]) => ({ file, w, h, swappable: swappable ?? 0 })),
    kind: new Uint8Array(0),
    key: new Float64Array(0),
    sheet: new Uint16Array(0),
    x: new Uint16Array(0),
    y: new Uint16Array(0),
    w: new Uint16Array(0),
    h: new Uint16Array(0),
    ox: new Int16Array(0),
    oy: new Int16Array(0),
  };
}

const H = (n: number): string => n.toString(16).padStart(10, '0');
const PACKS: LoadedPacks = {
  'rides-full': fakeIndex([0, 1, 2, 3].map((v) => [`carousel_${v}_0-${H(v)}.png`, 100 + 4 * v, 100] as [string, number, number]).concat([[`carousel_0_3-${H(9)}.png`, 300, 300]])),
  'rides-coarse': fakeIndex([
    [`carousel_0_0-${H(20)}.png`, 52, 40],
    [`carousel_0_2-${H(21)}.png`, 60, 40],
  ]),
  people: fakeIndex([
    [`guest_0-${H(1)}.png`, 10, 20],
    [`guest_1-${H(2)}.png`, 12, 20],
    [`staff-${H(3)}.png`, 8, 8],
  ]),
  objects: fakeIndex([
    [`fence-${H(4)}.png`, 40, 40],
    [`entrance-${H(5)}.png`, 30, 30],
    [`stall_snack_shack-${H(6)}.png`, 50, 50],
  ]),
  shadows: fakeIndex([[`shadow-${H(7)}.png`, 64, 64]]),
  ground: fakeIndex([[`ground-${H(8)}.png`, 128, 128]]),
  track: fakeIndex([
    [`rail_steel_coaster_0-${H(10)}.png`, 200, 100, 1],
    [`rail_steel_coaster_1-${H(11)}.png`, 220, 100, 1],
    [`support_round-${H(12)}.png`, 20, 40, 2],
    [`car_coaster-${H(13)}.png`, 64, 64, 3],
    [`gate-${H(14)}.png`, 16, 16],
  ]),
};
const DEV: ProjectDevice = { cssW: 100, cssH: 80, dpr: 1, stretch: 1, coarse: false };
const ok = (w: World, cmd: Parameters<typeof executeCommand>[1]): number => {
  const r = executeCommand(w, cmd, { setup: true });
  if (!r.ok) throw new Error(r.reason);
  return r.id ?? -1;
};

describe('projectScene', () => {
  it('one carousel and one guest: the exact sum of known sheet sizes', () => {
    const w = createWorld({ seed: 1, parkName: 'Projection' });
    ok(w, { type: 'placeRide', defId: 'carousel', x: 10, y: 10, rotation: 0 });
    addGuestDirect(w, placeFootpath(w, 10, 20));
    for (const view of [0, 1, 2, 3]) {
      const p = projectScene(w, PACKS, DEV, view);
      const expected = (100 + 4 * view) * 100 + 10 * 20 + 12 * 20 + 8 * 8 + 40 * 40 + 30 * 30 + 64 * 64 + 128 * 128;
      expect(p.sheetsMb * MB).toBe(expected * 4);
      expect(p.swapMb).toBe(0);
      expect(p.sheets).toBe(8);
      expect(p.staticMb * MB).toBe(100 * 80 * 4);
      expect(p.chunkMb * MB).toBe(chunkBytesInView(w, DEV, view as 0, { x: 32, y: 32 }));
      expect(p.chunkMb).toBeGreaterThan(0);
      expect(p.totalMb).toBeCloseTo(p.sheetsMb + p.swapMb + p.chunkMb + p.staticMb, 12);
    }
    // The coarse set reads rides-coarse only.
    const c = projectScene(w, PACKS, { ...DEV, coarse: true }, 0);
    expect(c.sheetsMb * MB).toBe((52 * 40 + 10 * 20 + 12 * 20 + 8 * 8 + 40 * 40 + 30 * 30 + 64 * 64 + 128 * 128) * 4);
  });

  it('a carousel at occupancy 1 on the coarse set counts the occupancy 2 sheet (fix round 1, I1)', () => {
    const w = createWorld({ seed: 1, parkName: 'Projection' });
    const id = ok(w, { type: 'placeRide', defId: 'carousel', x: 10, y: 10, rotation: 0 });
    const ride = w.state.rides.find((q) => q.id === id) as World['state']['rides'][number];
    ride.riders.push(1);
    const rest = (40 * 40 + 30 * 30 + 64 * 64 + 128 * 128) * 4;
    const c = projectScene(w, PACKS, { ...DEV, coarse: true }, 0);
    expect(c.sheetsMb * MB).toBe(60 * 40 * 4 + rest);
    // The upper bound adds the other occupancy groups of the set (0 here; 4 does not exist in the fake).
    expect(c.upperMb * MB - c.totalMb * MB).toBeCloseTo(52 * 40 * 4, 6);
    // A ride whose group the index lacks is an error, not 0 bytes.
    expect(() => projectScene(w, PACKS, { ...DEV, coarse: true }, 1)).toThrow(/no sheet group carousel\/1\/2/);
  });

  it('a swapped track sheet counts once per colour', () => {
    const w = createWorld({ seed: 2, parkName: 'Projection' });
    const a = ok(w, { type: 'placeStation', typeId: 'steel_coaster', x: 4, y: 4, dir: 1 });
    const b = ok(w, { type: 'placeStation', typeId: 'steel_coaster', x: 4, y: 12, dir: 1 });
    ok(w, { type: 'setTrackColours', rideId: a, track: 6, supports: 9, cars: 0 });
    ok(w, { type: 'setTrackColours', rideId: b, track: 6, supports: 9, cars: 0 });
    const plainBytes = (40 * 40 + 30 * 30 + 64 * 64 + 128 * 128) * 4;
    const p1 = projectScene(w, PACKS, DEV, 0);
    expect(p1.sheetsMb * MB).toBe(plainBytes);
    expect(p1.swapMb * MB).toBe((200 * 100 + 20 * 40) * 4);
    ok(w, { type: 'setTrackColours', rideId: b, track: 9, supports: 9, cars: 0 });
    const p2 = projectScene(w, PACKS, DEV, 1);
    expect(p2.swapMb * MB).toBe((2 * 220 * 100 + 20 * 40) * 4);
    expect(p2.sheets).toBe(4 + 3);
  });

  it('home zoom and canvas size', () => {
    expect(homeZoom(2.625, 3)).toBeCloseTo(8 / 7, 12);
    expect(homeZoom(2, 2)).toBe(1);
    expect(canvasSize({ cssW: 412, cssH: 839, dpr: 2.625, stretch: 3, coarse: true })).toEqual({ w: 361, h: 735 });
  });
});

// Output part (Task 9 Step 3): the projection of the four saves on the phone and tablet profiles.
describe.skipIf(!process.env.TC_PROJECT_OUT)('projection output', () => {
  it('writes the projection of the four scenes', { timeout: 600_000 }, () => {
    const out = process.env.TC_PROJECT_OUT as string;
    const dist = process.env.TC_PROJECT_DIST ?? 'dist-app';
    const packs: LoadedPacks = {};
    for (const pack of readdirSync(join(dist, 'art'))) {
      const f = readdirSync(join(dist, 'art', pack)).find((n) => /^index-[0-9a-f]+\.bin$/.test(n));
      if (f) packs[pack] = decodeIndex(new Uint8Array(readFileSync(join(dist, 'art', pack, f))));
    }
    const perf = join(__dirname, '../../../perf');
    const scenes = [
      ...PERF_SCENES.map((s) => ({ id: s.id as string, file: s.file, focus: s.focus })),
      { id: 'cases', file: CASES_FILE, focus: CASES_FOCUS },
    ];
    const pixel7 = devices['Pixel 7'];
    const profiles: Array<{ device: string; frameSet: 'full' | 'coarse'; d: ProjectDevice }> = [
      { device: 'phone', frameSet: 'coarse', d: { cssW: pixel7.viewport.width, cssH: pixel7.viewport.height, dpr: pixel7.deviceScaleFactor, stretch: 3, coarse: true } },
      { device: 'tablet', frameSet: 'full', d: { cssW: 1024, cssH: 1366, dpr: 2, stretch: 2, coarse: false } },
      { device: 'tablet', frameSet: 'coarse', d: { cssW: 1024, cssH: 1366, dpr: 2, stretch: 2, coarse: true } },
    ];
    const rows: Array<Record<string, unknown>> = [];
    for (const sc of scenes) {
      const r = deserialize(readFileSync(join(perf, sc.file), 'utf8'));
      if (!r.ok) throw new Error(`${sc.file}: ${r.error}`);
      for (const pr of profiles) {
        const views = [0, 1, 2, 3].map((v) => projectScene(r.world, packs, pr.d, v, sc.focus));
        const max = views.reduce((m, p) => (p.totalMb > m.totalMb ? p : m));
        rows.push({ scene: sc.id, device: pr.device, frameSet: pr.frameSet, stretch: pr.d.stretch, homeZoom: homeZoom(pr.d.dpr, pr.d.stretch), canvas: canvasSize(pr.d), view: views.indexOf(max), ...max, upperMb: Math.max(...views.map((p) => p.upperMb)), perView: views.map((p) => +p.totalMb.toFixed(3)), upperPerView: views.map((p) => +p.upperMb.toFixed(3)) });
      }
    }
    const reportPath = process.env.TC_ART_REPORT ?? join(dirname(out), 'art', 'report.json');
    const report = existsSync(reportPath) ? (JSON.parse(readFileSync(reportPath, 'utf8')) as Record<string, unknown>) : null;
    const decodedPerPack = Object.fromEntries(Object.entries(packs).map(([n, ix]) => [n, ix.sheets.reduce((a, s) => a + s.w * s.h * 4, 0)]));
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, `${JSON.stringify({ mb: MB, budgetMb: 64, rows, decodedPerPack, report }, null, 2)}\n`);
    expect(rows).toHaveLength(scenes.length * profiles.length);
  });
});

