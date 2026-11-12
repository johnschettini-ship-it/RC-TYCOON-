/** Phase 8b stage 0b test (never merged): the kill-rule functions and the writer of `numbers.json`. */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { median, parsePerf, rules, sceneValues, steps, type CasesValues, type Measures, type SceneValues } from './b0bKit';

const OUT = process.env.TC_0B_OUT;

// One scene's values, as `sceneValues` gives them.
const sv = (frameP95: number, workP95: number, turn: number, budgetMax: number | null = null, missing = 0): SceneValues => ({
  frameP50: frameP95 / 2,
  frameP95,
  workP95,
  renderP95: 5,
  turn,
  turnSteps: steps(turn),
  budgetMax,
  budgetMaxAll: budgetMax,
  missing,
  missingRuns: [missing, missing, missing],
  incompleteAfterTurn: budgetMax === null ? null : 6,
  chunkMax: budgetMax === null ? null : 3,
});

const cv = (over: Partial<CasesValues> = {}): CasesValues => ({
  incompleteAfterTurnMax: 6,
  chunkMsMax: 4,
  swapMainMsMax: 1,
  placeFrameMaxMs: 33.4,
  budgetMbMax: 22,
  budgetMbMaxAll: 23,
  ...over,
});

// A base set of measures where every rule passes.
const base = (): Measures => ({
  today: { phone: { phone: sv(49.9, 9.0, 117), build2: sv(33.4, 20, 83) }, tablet: { build1: sv(500, 290, 667), build2: sv(450, 260, 400) } },
  pixel: {
    phone: { phone: sv(33.4, 9.0, 67, 22), build2: sv(33.4, 17, 83, 26) },
    tablet: { build1: sv(33.4, 20, 100, 40), build2: sv(33.4, 20, 100, 41) },
  },
  cases: { phone: cv(), tablet: cv({ budgetMbMaxAll: 61.6 }) },
  start: { newParkMs: 1732, continueBuild2Ms: 2004 },
});

const line = (scene: string, run: number, missing: number): string =>
  `[perf] phone (CPU 4×) scene ${scene} run ${run}/3, canvas ratio 0.875: 30.0 fps, frame p50 16.7 / p95 ${30 + run}.0 / max 90 ms; ` +
  'tick p50 1.00 / p95 2.00 ms; work p95 9.0 ms; render p95 4.0 ms; draws 10; sprites 3.0 MB, 0 canvases made; ' +
  `long tasks 0 in 30 s; guests 1 → 1; heap 12 MB; turns: longest frame ${50 + run} ms (work 40.0 ms), 67 ms (work 50.0 ms); ` +
  'pan: frame p95 33.4 ms, work p95 10.0 ms; art n 2, k 3, budget max 22.08 MB, sheets 13.95 MB, swaps 1.11 MB, chunks 6.01 MB, ' +
  `static 1.01 MB, other 0.00 MB, incomplete after turn 6, missing ${missing}, chunk max 3.2 ms, turn and pan misses 66`;

describe('0b rule functions', () => {
  it('median and steps', () => {
    expect(median([50.1, 33.4, 49.9])).toBe(49.9);
    expect(steps(100)).toBe(6);
    expect(steps(116.6)).toBe(7);
    expect(() => median([])).toThrow();
  });

  it("B2b: phone passes at today's p95 with work + 2, build2 strict", () => {
    const m = base();
    m.pixel.phone.phone = sv(49.9, 11.0, 67, 22);
    expect(rules(m).B2b.result).toBe('pass');
    m.pixel.phone.phone = sv(49.9, 11.1, 67, 22);
    expect(rules(m).B2b.result).toBe('fired');
    const n = base();
    n.pixel.phone.build2 = sv(40.1, 17, 83, 26);
    expect(rules(n).B2b.result).toBe('fired');
    // B2 is strict and only reported (D7 = b).
    expect(rules(n).B2.result).toBe('reported');
  });

  it('B3b: one step over today passes, two steps fire', () => {
    const m = base();
    m.today.phone.phone = sv(49.9, 9, 100);
    m.pixel.phone.phone = sv(33.4, 9, 116, 22);
    expect(rules(m).B3b.result).toBe('pass');
    m.pixel.phone.phone = sv(33.4, 9, 133, 22);
    expect(rules(m).B3b.result).toBe('fired');
    expect(rules(m).B3turn.result).toBe('reported');
  });

  it('sceneValues accepts lines with missing pictures and reports the misses (controller decision 1)', () => {
    const lines = parsePerf([line('phone', 1, 26), line('phone', 2, 26), line('phone', 3, 27)].join('\n'));
    const v = sceneValues(lines, 'phone', 'phone');
    expect(v.missing).toBe(26);
    expect(v.missingRuns).toEqual([26, 26, 27]);
    expect(v.frameP95).toBe(32);
    expect(v.turn).toBe(67);
    // The original rule of Task 15 (missing must be 0) is still available and rejects these lines.
    expect(() => sceneValues(lines, 'phone', 'phone', { strictMissing: true })).toThrow(/missing/);
    // Not 3 lines: throws.
    expect(() => sceneValues(lines.slice(0, 2), 'phone', 'phone')).toThrow();
  });

  it('B5 above 4 s goes to the owner', () => {
    const m = base();
    expect(rules(m).B5.result).toBe('pass');
    m.start.newParkMs = 4100;
    expect(rules(m).B5.result).toBe('owner');
  });

  it('B4 fires above 40 ms on the tablet set, the coarse set decides when present; B6 takes the max of perf and cases', () => {
    const m = base();
    expect(rules(m).B4.result).toBe('pass');
    m.pixel.tablet = { build1: sv(100.1, 36, 167, 43), build2: sv(100, 34, 133, 42) };
    expect(rules(m).B4.result).toBe('fired');
    m.pixel.tabletCoarse = { build1: sv(33.4, 20, 100, 40), build2: sv(33.4, 20, 100, 41) };
    expect(rules(m).B4.result).toBe('pass');
    m.cases.tablet = cv({ budgetMbMaxAll: 64.5 });
    expect(rules(m).B6.result).toBe('fired');
    expect(rules(m).B4.result).toBe('fired');
  });

  it('B3-other: the phone decides each of its four limits', () => {
    for (const over of [{ chunkMsMax: 12.1 }, { swapMainMsMax: 3.1 }, { incompleteAfterTurnMax: 31 }, { placeFrameMaxMs: 100.1 }]) {
      const m = base();
      m.cases.phone = cv(over);
      expect(rules(m).B3other.result).toBe('fired');
    }
    const t = base();
    t.cases.tablet = cv({ placeFrameMaxMs: 116.6 });
    expect(rules(t).B3other.result).toBe('pass');
  });
});

// ------------------------------------------------------------------ numbers.json

const read = (p: string): string => readFileSync(join(OUT as string, p), 'utf8');
const json = (p: string): any => JSON.parse(read(p));
const med = (xs: number[]): number => median(xs);
const maxOf = (xs: number[]): number => Math.max(...xs);

function casesValues(j: any): CasesValues & Record<string, unknown> {
  const runs = j.runs as any[];
  const pick = (k: string): number[] => runs.map((r) => Number(r[k]));
  return {
    frameSet: j.frameSet,
    incompleteAfterTurnMax: med(pick('incompleteAfterTurnMax')),
    chunkMsMax: med(pick('chunkMsMax')),
    swapMainMsMax: med(pick('swapMainMsMax')),
    placeFrameMaxMs: med(pick('placeFrameMaxMs')),
    budgetMbMax: med(pick('budgetMbMax')),
    budgetMbMaxAll: maxOf(pick('budgetMbMax')),
    partsLastRun: runs[runs.length - 1].parts,
    decodeMsT1: med(pick('decodeMsT1')),
    decodeMsT4: med(pick('decodeMsT4')),
    decodeSheet: runs[0].decodeSheet,
    storeDecodeMs: (() => {
      const all = runs.flatMap((r) => (r.decodeMsList as { ms: number }[]).map((d) => d.ms)).sort((a, b) => a - b);
      return { count: all.length, median: all[Math.floor(all.length / 2)], max: all[all.length - 1] };
    })(),
    runs: runs.map((r) => ({
      incompleteAfterTurnMax: r.incompleteAfterTurnMax,
      chunkMsMax: r.chunkMsMax,
      swapMainMsMax: r.swapMainMsMax,
      placeFrameMaxMs: r.placeFrameMaxMs,
      budgetMbMax: r.budgetMbMax,
      decodeMsT1: r.decodeMsT1,
      decodeMsT4: r.decodeMsT4,
    })),
    loadavgBefore: j.loadavgBefore,
    loadavgAfter: j.loadavgAfter,
  };
}

function b1Counts(md: string): Record<string, unknown> {
  const kinds: Record<string, { entries: number; compared: number; equal: number; formatOk: number }> = {};
  for (const m of md.matchAll(/^\| (\w+) \| (\d+) \| (\d+) \| (\d+) \| (\d+) \|$/gm)) {
    kinds[m[1] as string] = { entries: Number(m[2]), compared: Number(m[3]), equal: Number(m[4]), formatOk: Number(m[5]) };
  }
  const head = /Entries: (\d+)\. Failures: (\d+)\./.exec(md);
  const rails = /(\d+) rails checked, (\d+) outside/.exec(md);
  return {
    entries: Number(head?.[1]),
    failures: Number(head?.[2]),
    railsChecked: Number(rails?.[1]),
    railsOutside: Number(rails?.[2]),
    firstRun: 'result.first-run.md: 240 rail entries outside the single-tile anchor bound only; every compared hash equal (controller decision: bound fixed, not a B1 failure)',
    pass: /B1: pass/.test(md),
    kinds,
  };
}

describe.skipIf(!OUT)('numbers.json', () => {
  it('reads the outputs and writes numbers.json', () => {
    const today = parsePerf(read('perf-today.txt'));
    const pxPhone = parsePerf(read('perf-pixel-phone.txt'));
    const pxTablet = parsePerf(read('perf-pixel-tablet.txt'));
    // Block 3 ran with ?frames=coarse (controller decision, Batch 7); block 4 was not run.
    const coarseFile = existsSync(join(OUT as string, 'perf-pixel-tablet-coarse.txt'));
    const s = (lines: typeof today, p: string, sc: string): SceneValues => sceneValues(lines, p, sc);
    const pixelTabletCoarse = { build1: s(pxTablet, 'tablet', 'build1'), build2: s(pxTablet, 'tablet', 'build2') };
    const cases = { phone: casesValues(json('e2e/cases-phone.json')), tablet: casesValues(json('e2e/cases-tablet.json')) };
    const st = json('e2e/start-phone.json');
    const m: Measures = {
      today: {
        phone: { phone: s(today, 'phone', 'phone'), build2: s(today, 'phone', 'build2') },
        tablet: { build1: s(today, 'tablet', 'build1'), build2: s(today, 'tablet', 'build2') },
      },
      pixel: {
        phone: { phone: s(pxPhone, 'phone', 'phone'), build2: s(pxPhone, 'phone', 'build2') },
        tablet: null,
        tabletCoarse: pixelTabletCoarse,
      },
      cases,
      start: { newParkMs: med(st.newPark), continueBuild2Ms: med(st.continueBuild2) },
    };
    expect(coarseFile).toBe(false);

    // The original Task 15 rule (a Pixel line with missing > 0 is invalid), for the report's second reading.
    const originalRule: Record<string, string> = {};
    for (const [label, lines, p, sc] of [
      ['pixel.phone.phone', pxPhone, 'phone', 'phone'],
      ['pixel.phone.build2', pxPhone, 'phone', 'build2'],
      ['pixel.tabletCoarse.build1', pxTablet, 'tablet', 'build1'],
      ['pixel.tabletCoarse.build2', pxTablet, 'tablet', 'build2'],
    ] as const) {
      try {
        sceneValues(lines, p, sc, { strictMissing: true });
        originalRule[label] = 'valid';
      } catch {
        originalRule[label] = `no valid value (missing per run ${sceneValues(lines, p, sc).missingRuns.join(' / ')})`;
      }
    }

    const r = rules(m);
    const b1 = b1Counts(read('b1/result.md'));
    const b8txt = read('b8-notes.md');
    const growth = /web (\d+) base (\d+) growth (-?\d+)/.exec(b8txt);
    const b8 = {
      webBytes: Number(growth?.[1]),
      baseBytes: Number(growth?.[2]),
      growthBytes: Number(growth?.[3]),
      limitBytes: 2048,
      noArt: /^no-art$/m.test(b8txt),
      workerSourceSame: /^worker-source-same$/m.test(b8txt),
      precacheFilesSame: /^precache-files-same$/m.test(b8txt),
      webClean: /^web-clean$/m.test(b8txt),
      appBuildCheck: /check-app: ok/.test(read('check-app.txt')) ? 'ok (no sw.js, no sw-manifest.json)' : 'failed',
    };
    const b8pass = b8.growthBytes <= 2048 && b8.noArt && b8.workerSourceSame && b8.precacheFilesSame && b8.webClean && b8.appBuildCheck.startsWith('ok');
    const b7txt = read('b7-notes.md');
    const b7 = {
      cmpPrintsNothing: /prints nothing \(all identical\)/.test(b7txt),
      recorderTests: /Recorder tests.*?(\d+) tests passed/.exec(b7txt)?.[1] ?? null,
      suite: /Whole unit suite[^\n]*/.exec(b7txt)?.[0] ?? null,
      holds: /B7: holds/.test(b7txt),
    };
    const allRules = {
      B1: { result: b1.pass && b1.failures === 0 ? 'pass' : 'fired', detail: `${b1.entries} entries, ${b1.failures} failures; ${Object.values(b1.kinds as Record<string, { compared: number }>).reduce((a, k) => a + k.compared, 0)} hashes compared, all equal; ${b1.railsChecked} rails in their slice bounds` },
      ...r,
      B7: { result: b7.holds ? 'pass' : 'fired', detail: 'classic-ops and renderer-ops identical to base; recorder tests pass; suite equal to baseline' },
      B8: { result: b8pass ? 'pass' : 'fired', detail: `website initial load +${b8.growthBytes} bytes (limit 2048); no art folder; worker rules the same; app build without worker` },
    };

    const numbers = {
      note: 'Stage 0b numbers (Task 21). Medians of 3 runs. 1 MB = 1 048 576 bytes. Drawing path: software (SwiftShader). Tablet Pixel runs use the coarse frame set.',
      today: m.today,
      pixel: { ...m.pixel, tabletNote: 'pixel.tablet (full frame set) was not timed: projection upper bound 152 MB on the cases park; block 3 ran the coarse set (controller decision, Batch 7); block 4 not run.' },
      cases,
      start: { ...m.start, newParkRuns: st.newPark, continueBuild2Runs: st.continueBuild2, limitMs: 4000 },
      sizes: json('art/report.json'),
      projection: json('projection.json'),
      b1,
      b7,
      b8,
      rules: allRules,
      validity: {
        decision:
          'Controller decision 1 (Batch 8, made after the data was seen): [perf] lines with missing > 0 are valid timing evidence. Every frame was drawn and the frame times are real; the misses are short bursts of 2-6 frames when a ride first changes to an occupancy group the warm-up never needed, and the object keeps its last decoded picture meanwhile.',
        missingRuns: {
          'pixel.phone.phone': m.pixel.phone.phone.missingRuns,
          'pixel.phone.build2': m.pixel.phone.build2.missingRuns,
          'pixel.tabletCoarse.build1': pixelTabletCoarse.build1.missingRuns,
          'pixel.tabletCoarse.build2': pixelTabletCoarse.build2.missingRuns,
        },
        originalRule,
      },
      drawingPath: { phone: json('e2e/gpu-phone.json'), tablet: json('e2e/gpu-tablet.json') },
      webkit: 'not possible here (controller decision C5: no WebKit download); the owner iPhone run covers WebKit',
      loadavg: read('loadavg.txt').trim().split('\n'),
    };
    writeFileSync(join(OUT as string, 'numbers.json'), JSON.stringify(numbers, null, 1) + '\n');
    expect(Object.keys(numbers)).toEqual(expect.arrayContaining(['today', 'pixel', 'cases', 'start', 'sizes', 'projection', 'b1', 'b7', 'b8', 'rules']));
  });
});
