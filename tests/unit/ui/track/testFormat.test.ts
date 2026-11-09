/** Test tab formatting (phase-2 §4.9, §7.4): measured values, status line, and the chart series. */
import { describe, expect, it } from 'vitest';
import { trackUiStrings } from '../../../../src/data/strings/trackUi';
import { executeCommand } from '../../../../src/sim/commands';
import type { TestResult } from '../../../../src/sim/rides/track/types';
import { chartGeometry, formatG, formatMetres, formatSeconds, formatSpeed, testRows, testStatus } from '../../../../src/ui/track/testFormat';
import { makeTestWorld, runTicks } from '../../../helpers/world';
import { buildR1, dataOf } from '../../track/helpers';

function r1Test(): TestResult {
  const w = makeTestWorld();
  const id = buildR1(w);
  executeCommand(w, { type: 'startTestRun', rideId: id });
  const data = dataOf(w, id);
  const run = data.testRun!;
  expect(testStatus(null, run)).toEqual({ kind: 'running', text: 'Testing: 0% of the lap' });
  runTicks(w, Math.floor(run.ticksLeft / 2));
  expect(testStatus(null, data.testRun).text).toMatch(/^Testing: (49|50)% of the lap$/);
  runTicks(w, run.ticksLeft + 1);
  expect(data.test?.passed).toBe(true);
  return data.test!;
}

describe('value formatting', () => {
  it('speeds, G, seconds, and metres', () => {
    expect(formatSpeed(17410)).toBe('17.4 m/s (63 km/h)');
    expect(formatSpeed(0)).toBe('0.0 m/s (0 km/h)');
    expect(formatG(225)).toBe('2.25 g');
    expect(formatG(-23)).toBe('−0.23 g');
    expect(formatSeconds(965)).toBe('48.3 s');
    expect(formatMetres(204_370)).toBe('204 m');
  });

  it('UI strings follow master R4 (no final period)', () => {
    for (const [k, v] of Object.entries(trackUiStrings)) {
      expect(k.startsWith('ui.track.'), k).toBe(true);
      expect(/\.$/.test(v), `${k}: "${v}"`).toBe(false);
    }
  });
});

describe('Test tab (R1 reference circuit)', () => {
  const t = r1Test();

  it('lists the measured values in the §4.9 order', () => {
    const rows = testRows(t);
    expect(rows.map((r) => r.key)).toEqual(['vMax', 'vAvg', 'rideTime', 'length', 'drops', 'dropMax', 'posG', 'negG', 'airtime', 'latG', 'inversions', 'highest', 'turns']);
    const v = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    expect(v.vMax).toBe('17.4 m/s (63 km/h)');
    expect(v.rideTime).toBe('48.3 s');
    expect(v.length).toBe('204 m');
    expect(v.drops).toBe('1');
    expect(v.dropMax).toBe('16 m');
    expect(v.inversions).toBe('0');
    expect(v.highest).toBe('16 m');
    expect(v.turns).toBe('4');
    expect(testRows(t, true).at(-1)?.key).toBe('laps');
  });

  it('status line for no test, a passed test, and a failed test', () => {
    expect(testStatus(null, null)).toEqual({ kind: 'none', text: 'No test yet. Press Test to send an empty train round' });
    expect(testStatus(t, null)).toEqual({ kind: 'passed', text: 'Test passed' });
    expect(testStatus({ ...t, passed: false }, null)).toEqual({ kind: 'failed', text: 'Test failed' });
  });

  it('chart: three labelled series with different line styles inside the plot box', () => {
    const g = chartGeometry(t.chart, 320, 170);
    expect(g.series.map((s) => s.label)).toEqual(['Speed (m/s)', 'Vertical G', 'Lateral G']);
    const dashes = new Set(g.series.map((s) => s.dash.join(',')));
    expect(dashes.size).toBe(3);
    expect(g.speedMax).toBe(20);
    expect(g.gMin).toBe(0);
    expect(g.gMax).toBe(4);
    expect(g.seconds).toBeCloseTo(((t.chart.speedCms.length - 1) * t.chart.every) / 20, 6);
    for (const s of g.series) {
      expect(s.points.length).toBe(t.chart.speedCms.length * 2);
      for (let i = 0; i < s.points.length; i += 2) {
        expect(s.points[i]).toBeGreaterThanOrEqual(g.box.x - 1e-9);
        expect(s.points[i]).toBeLessThanOrEqual(g.box.x + g.box.w + 1e-9);
        expect(s.points[i + 1]).toBeGreaterThanOrEqual(g.box.y - 1e-9);
        expect(s.points[i + 1]).toBeLessThanOrEqual(g.box.y + g.box.h + 1e-9);
      }
    }
    // Time runs left to right.
    const sp = g.series[0]!.points;
    expect(sp[0]).toBe(g.box.x);
    expect(sp[sp.length - 2]).toBeCloseTo(g.box.x + g.box.w, 9);
  });

  it('a chart with negative G gets a scale below zero', () => {
    const g = chartGeometry({ every: 10, speedCms: [0, 500, 1000], gv: [100, -120, 300], gl: [0, 10, 20] }, 320, 170);
    expect(g.gMin).toBe(-2);
    expect(g.gMax).toBe(4);
    expect(g.speedMax).toBe(12);
  });
});
