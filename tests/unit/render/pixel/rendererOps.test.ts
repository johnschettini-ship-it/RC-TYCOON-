/**
 * Phase 8b stage 0b test (never merged): B7 evidence for the renderer. The Classic renderer on `FakeCanvas` draws the
 * `phone` scene save (3 frames at view rotations 0, 1, 1, zoom 1) and writes `renderer-ops.json` = { calls, hash }
 * (FNV-1a of the draw calls as JSON lines) to `TC_PROTO_OUT`. Task 16 runs it in `$PROTO/base` and in the worktree and
 * compares the files. Imports nothing under `src/render/pixel/`, so it runs in both trees. Fix round 1 (M8): each
 * scene also draws one frame at zoom 0.25, and with `TC_CASES_SAVE` (an absolute path, so `$PROTO/base` can read the
 * worktree's cases save) the cases park is drawn too (`renderer-ops-cases.json`).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FakeCanvas, install, make } from '../fakeCanvas';
import { createCanvasRenderer } from '../../../../src/render/renderer';
import { terrainClock } from '../../../../src/render/terrain';
import { tileToScreen } from '../../../../src/render/iso';
import { defaultToolState, type Camera } from '../../../../src/render/types';
import { deserialize } from '../../../../src/save';
import { PERF_SCENES } from '../../../perf/sceneInfo';

const OUT = process.env.TC_PROTO_OUT;

function fnv(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h >>> 0;
}

/** Draws `frames` of the save `file` around tile `focus` and writes `{ calls, draws, hash }` to `OUT/name`. */
function record(file: string, focus: { x: number; y: number }, name: string): number {
  install();
  terrainClock.now = () => 0;
  const r = deserialize(readFileSync(file, 'utf8'));
  if (!r.ok) throw new Error(r.error);
  const world = r.world;
  const map = world.state.map;
  const c = make(412, 915) as FakeCanvas & { style?: Record<string, string> };
  const ren = createCanvasRenderer(c as unknown as HTMLCanvasElement);
  ren.resize(412, 915, 2.625);
  const p = tileToScreen(focus.x, focus.y, map.heights[focus.y * map.width + focus.x] ?? 0);
  const tool = defaultToolState();
  const lines: string[] = [];
  const frames: Array<[0 | 1, number]> = [
    [0, 1],
    [1, 1],
    [1, 1],
    [1, 0.25],
  ];
  for (const [rotation, zoom] of frames) {
    const cam: Camera = { centerX: p.sx, centerY: p.sy, zoom, rotation };
    c.reset();
    ren.draw(world, cam, tool, 0);
    for (const d of c.draws) lines.push(JSON.stringify([d.image.width, d.image.height, d.x, d.y, d.w, d.h]));
    lines.push('--');
  }
  const calls = Object.fromEntries([...c.calls.entries()].sort(([a], [b]) => (a < b ? -1 : 1)));
  mkdirSync(OUT as string, { recursive: true });
  writeFileSync(join(OUT as string, name), `${JSON.stringify({ calls, draws: lines.length, hash: fnv(lines.join('\n')) }, null, 2)}\n`);
  return lines.length;
}

describe.skipIf(!OUT)('renderer ops (B7)', () => {
  it('writes renderer-ops.json for the phone scene', { timeout: 300_000 }, () => {
    const info = PERF_SCENES.find((s) => s.id === 'phone');
    if (!info) throw new Error('no phone scene');
    expect(record(join(__dirname, '../../../perf', info.file), info.focus, 'renderer-ops.json')).toBeGreaterThan(4);
  });

  // The cases park (`tests/perf/casesScene.ts` `CASES_FOCUS` (28, 28); written here, as the base tree has no such file).
  it.skipIf(!process.env.TC_CASES_SAVE)('writes renderer-ops-cases.json for the cases park', { timeout: 300_000 }, () => {
    expect(record(process.env.TC_CASES_SAVE as string, { x: 28, y: 28 }, 'renderer-ops-cases.json')).toBeGreaterThan(4);
  });
});
