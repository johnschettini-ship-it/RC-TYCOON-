/** Phase 8b stage 0b test (never merged): Node helpers for the 0b numbers (the `[perf]` line parser; Task 21 extends). */

export interface PerfLine {
  project: string;
  scene: string;
  run: number;
  frameP50: number;
  frameP95: number;
  workP95: number;
  renderP95: number;
  turns: [number, number];
  art: 'pixel' | 'classic';
  budgetMax: number | null;
  incompleteAfterTurn: number | null;
  missing: number | null;
  chunkMax: number | null;
  /** The budget parts at the end of the run (MB); `other` is the rest of the sprite memory (fix round 1, M1). */
  parts: { sheets: number; swaps: number; chunks: number; static: number; other: number } | null;
}

const num = (re: RegExp, s: string): number | null => {
  const m = re.exec(s);
  return m ? Number(m[1]) : null;
};

/**
 * The `[perf]` lines of a Playwright output (`perf-build3.spec.ts`): frame p95 (never tick, work, render or pan p95),
 * work and render p95 of the main window, the two turn frames, and the 0b art tail (Pixel) or `art classic`.
 */
export function parsePerf(text: string): PerfLine[] {
  const out: PerfLine[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const at = line.indexOf('[perf] ');
    if (at < 0) continue;
    const s = line.slice(at);
    const head = /^\[perf\] (\S+).*? scene (\S+) run (\d+)\//.exec(s);
    const frame = /frame p50 ([\d.]+) \/ p95 ([\d.]+)/.exec(s);
    const work = /; work p95 ([\d.]+) ms; render/.exec(s);
    const render = /render p95 ([\d.]+) ms/.exec(s);
    const turns = /turns: longest frame (\d+) ms .*?, (\d+) ms/.exec(s);
    if (!head || !frame || !work || !render || !turns) throw new Error(`parsePerf: unreadable line: ${s}`);
    const pixel = /; art n /.test(s);
    if (!pixel && !/; art classic\b/.test(s)) throw new Error(`parsePerf: no art tail: ${s}`);
    const sheets = num(/sheets ([\d.]+) MB/, s);
    const swaps = num(/swaps ([\d.]+) MB/, s);
    const chunks = num(/chunks ([\d.]+) MB/, s);
    const stat = num(/static ([\d.]+) MB/, s);
    const other = num(/other ([\d.]+) MB/, s);
    out.push({
      project: head[1] as string,
      scene: head[2] as string,
      run: Number(head[3]),
      frameP50: Number(frame[1]),
      frameP95: Number(frame[2]),
      workP95: Number(work[1]),
      renderP95: Number(render[1]),
      turns: [Number(turns[1]), Number(turns[2])],
      art: pixel ? 'pixel' : 'classic',
      budgetMax: pixel ? num(/budget max ([\d.]+) MB/, s) : null,
      incompleteAfterTurn: pixel ? num(/incomplete after turn (\d+)/, s) : null,
      missing: pixel ? num(/missing (\d+)/, s) : null,
      chunkMax: pixel ? num(/chunk max ([\d.]+) ms/, s) : null,
      parts: pixel && sheets !== null && swaps !== null && chunks !== null && stat !== null ? { sheets, swaps, chunks, static: stat, other: other ?? 0 } : null,
    });
  }
  return out;
}

// ------------------------------------------------------------------ rule functions (Task 21)

/** The middle value (3 values: the middle one; an even count: the mean of the two middle ones). Throws on an empty list. */
export function median(xs: number[]): number {
  if (xs.length === 0) throw new Error('median: empty list');
  const s = [...xs].sort((a, b) => a - b);
  const h = s.length >> 1;
  return s.length % 2 ? (s[h] as number) : ((s[h - 1] as number) + (s[h] as number)) / 2;
}

/** Whole frame steps of 16.67 ms (design values). */
export const steps = (ms: number): number => Math.round(ms / 16.67);

/** One scene's values: medians over its 3 runs. */
export interface SceneValues {
  frameP50: number;
  frameP95: number;
  workP95: number;
  renderP95: number;
  /** Median over the runs of each run's larger turn frame (Test decision 14). */
  turn: number;
  turnSteps: number;
  /** Median of the runs' budget max (Pixel), else null. */
  budgetMax: number | null;
  /** The largest budget max of any run (B6 reads the maximum over the whole run). */
  budgetMaxAll: number | null;
  /** Median of the misses in the measured window (0 for Classic). */
  missing: number;
  missingRuns: number[];
  incompleteAfterTurn: number | null;
  chunkMax: number | null;
}

/**
 * The values of one profile and scene. Throws unless there are exactly 3 lines.
 * Controller decision 1 (Batch 8, made after the data was seen): a Pixel line with `missing > 0` is valid timing
 * evidence (every frame was drawn; an object keeps its last decoded picture); its misses are reported in
 * `missing` / `missingRuns`. `strictMissing` gives the original Task 15 rule: such a line is rejected.
 */
export function sceneValues(lines: PerfLine[], project: string, scene: string, opts: { strictMissing?: boolean } = {}): SceneValues {
  const ls = lines.filter((l) => l.project === project && l.scene === scene);
  if (ls.length !== 3) throw new Error(`sceneValues: ${project} ${scene}: ${ls.length} lines, expected 3`);
  if (opts.strictMissing) {
    const bad = ls.filter((l) => l.art === 'pixel' && (l.missing ?? 0) > 0);
    if (bad.length) throw new Error(`sceneValues: ${project} ${scene}: missing ${bad.map((l) => l.missing).join(' / ')} (original rule: missing must be 0)`);
  }
  const pix = ls[0]?.art === 'pixel';
  const m = (f: (l: PerfLine) => number): number => median(ls.map(f));
  const turn = m((l) => Math.max(l.turns[0], l.turns[1]));
  return {
    frameP50: m((l) => l.frameP50),
    frameP95: m((l) => l.frameP95),
    workP95: m((l) => l.workP95),
    renderP95: m((l) => l.renderP95),
    turn,
    turnSteps: steps(turn),
    budgetMax: pix ? m((l) => l.budgetMax ?? NaN) : null,
    budgetMaxAll: pix ? Math.max(...ls.map((l) => l.budgetMax ?? NaN)) : null,
    missing: pix ? m((l) => l.missing ?? 0) : 0,
    missingRuns: ls.map((l) => l.missing ?? 0),
    incompleteAfterTurn: pix ? m((l) => l.incompleteAfterTurn ?? NaN) : null,
    chunkMax: pix ? m((l) => l.chunkMax ?? NaN) : null,
  };
}

/** The cases measures of one profile (Task 18): medians of 3, and the largest budget of any run. */
export interface CasesValues {
  incompleteAfterTurnMax: number;
  chunkMsMax: number;
  swapMainMsMax: number;
  placeFrameMaxMs: number;
  budgetMbMax: number;
  budgetMbMaxAll: number;
}

interface PhoneScenes { phone: SceneValues; build2: SceneValues }
interface TabletScenes { build1: SceneValues; build2: SceneValues }

export interface Measures {
  today: { phone: PhoneScenes; tablet: TabletScenes };
  /** `tablet`: the full frame set (null when not timed); `tabletCoarse`: the phone frame set on the tablet. */
  pixel: { phone: PhoneScenes; tablet: TabletScenes | null; tabletCoarse?: TabletScenes };
  cases: { phone: CasesValues; tablet: CasesValues };
  start: { newParkMs: number; continueBuild2Ms: number };
}

export type RuleKey = 'B2' | 'B2b' | 'B3turn' | 'B3b' | 'B3other' | 'B4' | 'B5' | 'B6';
export interface RuleResult { result: 'pass' | 'fired' | 'reported' | 'owner'; detail: string }

const BUDGET_MB = 64;
const FRAME_MS = 40;
const TURN_STEPS = 6;
const START_MS = 4000;
const EPS = 1e-9;
const f1 = (x: number): string => (Math.round(x * 10) / 10).toString();
const misses = (label: string, v: SceneValues): string => (v.missingRuns.some((n) => n > 0) ? `; ${label} missing per run ${v.missingRuns.join(' / ')} (valid, controller decision 1)` : '');

/** The kill rules with D6 = (a), D7 = (b) (controller C3: B3b decides, strict B3-turn reported only). */
export function rules(m: Measures): Record<RuleKey, RuleResult> {
  const px = m.pixel.phone;
  const td = m.today.phone;

  const b2Over = px.phone.frameP95 > FRAME_MS + EPS || px.build2.frameP95 > FRAME_MS + EPS;
  const B2: RuleResult = {
    result: 'reported',
    detail: `strict, for information: phone ${f1(px.phone.frameP95)} ms, build2 ${f1(px.build2.frameP95)} ms (limit 40): ${b2Over ? 'would fire' : 'would pass'}${misses('phone', px.phone)}${misses('build2', px.build2)}`,
  };

  const phoneOk = px.phone.frameP95 <= td.phone.frameP95 + EPS && px.phone.workP95 <= td.phone.workP95 + 2 + EPS;
  const build2Ok = px.build2.frameP95 <= FRAME_MS + EPS;
  const B2b: RuleResult = {
    result: phoneOk && build2Ok ? 'pass' : 'fired',
    detail:
      `phone frame p95 ${f1(px.phone.frameP95)} vs today ${f1(td.phone.frameP95)} ms, work p95 ${f1(px.phone.workP95)} vs today ${f1(td.phone.workP95)} + 2 ms (${phoneOk ? 'ok' : 'over'}); ` +
      `build2 frame p95 ${f1(px.build2.frameP95)} ms vs 40 (${build2Ok ? 'ok' : 'over'})${misses('phone', px.phone)}${misses('build2', px.build2)}`,
  };

  const turnOver = px.phone.turnSteps > TURN_STEPS || px.build2.turnSteps > TURN_STEPS;
  const B3turn: RuleResult = {
    result: 'reported',
    detail: `strict, for information: phone ${f1(px.phone.turn)} ms (${px.phone.turnSteps} steps), build2 ${f1(px.build2.turn)} ms (${px.build2.turnSteps} steps), limit 6 steps: ${turnOver ? 'would fire' : 'would pass'}`,
  };

  const b3bPhone = px.phone.turnSteps <= td.phone.turnSteps + 1;
  const b3bBuild2 = px.build2.turnSteps <= td.build2.turnSteps + 1;
  const B3b: RuleResult = {
    result: b3bPhone && b3bBuild2 ? 'pass' : 'fired',
    detail: `phone ${px.phone.turnSteps} steps vs today ${td.phone.turnSteps} + 1 (${b3bPhone ? 'ok' : 'over'}); build2 ${px.build2.turnSteps} steps vs today ${td.build2.turnSteps} + 1 (${b3bBuild2 ? 'ok' : 'over'})`,
  };

  const c = m.cases.phone;
  const ct = m.cases.tablet;
  const o = [c.chunkMsMax <= 12 + EPS, c.swapMainMsMax <= 3 + EPS, c.incompleteAfterTurnMax <= 30, c.placeFrameMaxMs <= 100 + EPS];
  const B3other: RuleResult = {
    result: o.every(Boolean) ? 'pass' : 'fired',
    detail:
      `phone: cold chunk ${f1(c.chunkMsMax)} ms (≤ 12), swap ${f1(c.swapMainMsMax)} ms (≤ 3), incomplete after turn ${c.incompleteAfterTurnMax} (≤ 30), 20 placements ${f1(c.placeFrameMaxMs)} ms (≤ 100); ` +
      `tablet (reported): ${f1(ct.chunkMsMax)} ms, ${f1(ct.swapMainMsMax)} ms, ${ct.incompleteAfterTurnMax}, ${f1(ct.placeFrameMaxMs)} ms`,
  };

  // B6 first: the maximum over the whole run of every budget reading, per profile.
  const all = (xs: (number | null)[]): number => Math.max(...xs.filter((x): x is number => x !== null));
  const tabletSets = [m.pixel.tablet, m.pixel.tabletCoarse].filter((t): t is TabletScenes => !!t);
  const phoneMax = all([px.phone.budgetMaxAll, px.build2.budgetMaxAll, c.budgetMbMaxAll]);
  const tabletMax = all([...tabletSets.flatMap((t) => [t.build1.budgetMaxAll, t.build2.budgetMaxAll]), ct.budgetMbMaxAll]);
  const B6: RuleResult = {
    result: phoneMax <= BUDGET_MB + EPS && tabletMax <= BUDGET_MB + EPS ? 'pass' : 'fired',
    detail: `largest budget of any run: phone ${phoneMax.toFixed(2)} MB, tablet ${tabletMax.toFixed(2)} MB (limit 64)`,
  };

  // B4: the coarse (phone) frame set decides when it was timed; else the full set.
  const t = m.pixel.tabletCoarse ?? m.pixel.tablet;
  const set = m.pixel.tabletCoarse ? 'coarse set' : 'full set';
  let B4: RuleResult;
  if (!t) B4 = { result: 'fired', detail: 'no tablet values' };
  else {
    const frameOver = t.build1.frameP95 > FRAME_MS + EPS || t.build2.frameP95 > FRAME_MS + EPS;
    const memOver = tabletMax > BUDGET_MB + EPS;
    const full = m.pixel.tablet && m.pixel.tabletCoarse ? `; full set build1 ${f1(m.pixel.tablet.build1.frameP95)}, build2 ${f1(m.pixel.tablet.build2.frameP95)} ms` : '';
    B4 = {
      result: frameOver || memOver ? 'fired' : 'pass',
      detail:
        `${set}: build1 frame p95 ${f1(t.build1.frameP95)} ms, build2 ${f1(t.build2.frameP95)} ms (limit 40: ${frameOver ? 'over' : 'ok'}); memory ${tabletMax.toFixed(2)} MB (limit 64: ${memOver ? 'over' : 'ok'})` +
        `${full}; today build1 ${f1(m.today.tablet.build1.frameP95)}, build2 ${f1(m.today.tablet.build2.frameP95)} ms${misses('build1', t.build1)}${misses('build2', t.build2)}`,
    };
  }

  const s = m.start;
  const B5: RuleResult = {
    result: s.newParkMs <= START_MS && s.continueBuild2Ms <= START_MS ? 'pass' : 'owner',
    detail: `new park ${Math.round(s.newParkMs)} ms, Continue build2 ${Math.round(s.continueBuild2Ms)} ms (limit 4000); device times: owner`,
  };

  return { B2, B2b, B3turn, B3b, B3other, B4, B5, B6 };
}
