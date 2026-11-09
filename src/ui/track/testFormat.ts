/**
 * Test tab formatting (phase-2 §4.9, §7.4). Owner: W2-A. Pure: no DOM.
 * Test results are integers: mm, mm/s, ticks (20 per second), G in hundredths, ratings in hundredths.
 */
import { text } from '../../data/strings/en';
import { TICKS_PER_S } from '../../data/tuning/track';
import type { TestResult } from '../../sim/rides/track/types';

/** "17.4 m/s (63 km/h)". */
export function formatSpeed(mms: number): string {
  const ms = mms / 1000;
  return text('ui.track.fmt.speed', { ms: ms.toFixed(1), kmh: String(Math.round(ms * 3.6)) });
}

/** G in hundredths → "2.25 g" (a minus sign for negative G). */
export function formatG(hundredths: number): string {
  const v = (Math.abs(hundredths) / 100).toFixed(2);
  return text('ui.track.fmt.g', { g: hundredths < 0 ? `−${v}` : v });
}

/** Ticks → "48.3 s". */
export function formatSeconds(ticks: number): string {
  return text('ui.track.fmt.seconds', { s: (ticks / TICKS_PER_S).toFixed(1) });
}

/** Millimetres → "204 m" (whole metres). */
export function formatMetres(mm: number): string {
  return text('ui.track.fmt.metres', { m: String(Math.round(mm / 1000)) });
}

export interface TestRow {
  /** Stable key (tests, data-testid). */
  key: string;
  label: string;
  value: string;
}

/** Measured values of a test (§4.9 table), in display order. Go-kart laps show only when the type uses them. */
export function testRows(t: TestResult, showLaps = false): TestRow[] {
  const rows: TestRow[] = [
    { key: 'vMax', label: text('ui.track.test.vMax'), value: formatSpeed(t.vMaxMms) },
    { key: 'vAvg', label: text('ui.track.test.vAvg'), value: formatSpeed(t.vAvgMms) },
    { key: 'rideTime', label: text('ui.track.test.rideTime'), value: formatSeconds(t.rideTimeTicks) },
    { key: 'length', label: text('ui.track.test.length'), value: formatMetres(t.lengthMm) },
    { key: 'drops', label: text('ui.track.test.drops'), value: String(t.drops) },
    { key: 'dropMax', label: text('ui.track.test.dropMax'), value: formatMetres(t.dropMaxMm) },
    { key: 'posG', label: text('ui.track.test.posG'), value: formatG(t.posGMax) },
    { key: 'negG', label: text('ui.track.test.negG'), value: formatG(t.vertGMin) },
    { key: 'airtime', label: text('ui.track.test.airtime'), value: formatSeconds(t.airtimeTicks) },
    { key: 'latG', label: text('ui.track.test.latG'), value: formatG(t.latMax) },
    { key: 'inversions', label: text('ui.track.test.inversions'), value: String(t.inversions) },
    { key: 'highest', label: text('ui.track.test.highestPoint'), value: text('ui.track.fmt.metres', { m: String(t.highestM) }) },
    { key: 'turns', label: text('ui.track.test.turns'), value: String(t.turnPieces) },
  ];
  if (showLaps) rows.push({ key: 'laps', label: text('ui.track.test.laps'), value: String(t.laps) });
  return rows;
}

/** Status line of the Test tab. */
export function testStatus(test: TestResult | null, run: { ticksLeft: number; result: TestResult } | null): { kind: 'none' | 'running' | 'passed' | 'failed'; text: string } {
  if (run) {
    const total = Math.max(1, run.result.ticks);
    const pct = Math.max(0, Math.min(100, Math.floor(((total - run.ticksLeft) * 100) / total)));
    return { kind: 'running', text: text('ui.track.test.running', { pct }) };
  }
  if (!test) return { kind: 'none', text: text('ui.track.test.none') };
  return test.passed ? { kind: 'passed', text: text('ui.track.test.passed') } : { kind: 'failed', text: text('ui.track.test.failed') };
}

/** One chart series in plot coordinates. Different line styles keep the series apart without colour (§7.4). */
export interface ChartSeries {
  key: 'speed' | 'gv' | 'gl';
  label: string;
  dash: readonly number[];
  colour: string;
  /** Plot points: x, y pairs in px inside the plot box. */
  points: number[];
}

export interface ChartGeometry {
  series: ChartSeries[];
  /** Ride time shown on the x axis (s). */
  seconds: number;
  /** Top of the y axis for speed (m/s) and G (g); G shares the left axis scaled to the same box. */
  speedMax: number;
  gMin: number;
  gMax: number;
  /** Plot box inside the chart (px). */
  box: { x: number; y: number; w: number; h: number };
}

const niceCeil = (v: number, step: number): number => Math.max(step, Math.ceil(v / step) * step);

/**
 * Line chart of speed, vertical G, and lateral G over ride time (§7.4). Speed uses its own scale (0 to the
 * rounded top speed, left axis); both G series share a scale that always includes 0 and 1 g (right axis).
 */
export function chartGeometry(chart: TestResult['chart'], width: number, height: number): ChartGeometry {
  const n = Math.min(chart.speedCms.length, chart.gv.length, chart.gl.length);
  const box = { x: 34, y: 8, w: Math.max(10, width - 70), h: Math.max(10, height - 30) };
  const seconds = (Math.max(1, n - 1) * chart.every) / TICKS_PER_S;
  let vTop = 0;
  let gLo = 0;
  let gHi = 1;
  for (let i = 0; i < n; i++) {
    vTop = Math.max(vTop, (chart.speedCms[i] as number) / 100);
    gLo = Math.min(gLo, (chart.gv[i] as number) / 100, (chart.gl[i] as number) / 100);
    gHi = Math.max(gHi, (chart.gv[i] as number) / 100, (chart.gl[i] as number) / 100);
  }
  // Four grid steps on each axis: speed in whole m/s, G in half g.
  const speedMax = niceCeil(vTop, 4);
  const gMin = gLo < 0 ? -Math.ceil(-gLo) : 0;
  let gMax = niceCeil(gHi, 1);
  if ((gMax - gMin) % 2 !== 0) gMax += 1;
  const xOf = (i: number): number => box.x + (n <= 1 ? 0 : (i / (n - 1)) * box.w);
  const ySpeed = (v: number): number => box.y + box.h - (v / speedMax) * box.h;
  const yG = (g: number): number => box.y + box.h - ((g - gMin) / (gMax - gMin)) * box.h;
  const series: ChartSeries[] = [
    { key: 'speed', label: text('ui.track.chart.speed'), dash: [], colour: '#ffd23f', points: [] },
    { key: 'gv', label: text('ui.track.chart.gv'), dash: [6, 4], colour: '#f07a3a', points: [] },
    { key: 'gl', label: text('ui.track.chart.gl'), dash: [1.5, 3.5], colour: '#4fb3d9', points: [] },
  ];
  for (let i = 0; i < n; i++) {
    const x = xOf(i);
    series[0]!.points.push(x, ySpeed((chart.speedCms[i] as number) / 100));
    series[1]!.points.push(x, yG((chart.gv[i] as number) / 100));
    series[2]!.points.push(x, yG((chart.gl[i] as number) / 100));
  }
  return { series, seconds, speedMax, gMin, gMax, box };
}
