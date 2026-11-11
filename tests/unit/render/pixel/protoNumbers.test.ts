/** Phase 8 stage 0 prototype (never merged): the projection and the numbers file, `numbers.json` (spec §10.3, §10.4, §11.3, §11.5). */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { startDerivedMemo, stopDerivedMemo } from '../../../../src/render/pixel/derived';
import { setArtStyle } from '../../../../src/render/pixel/style';
import { buildBudgets, buildSheetSprites, kill7, parseLoadBytes, parseP95, projection, stepTable } from './protoKit';

afterEach(() => setArtStyle('classic'));

describe('stage 0 numbers (pure)', () => {
  it('step table at the start values reproduces §15', () => {
    const t = stepTable(352.7 * 1024, 0.6, 0);
    expect(['1a-i', '1a-ii', '1b', '1c', '2a', '2b', '3', '4a', '4b', '4c', '5a', '6', '7', '5b', '8', '9'].map((s) => t[s]!.step))
      .toEqual([9, 7, 3, 5, 5, 7, 8, 8, 3, 0, 2, 5, 3, 0, 0, 0]);
    expect(t['7']!.limit).toBe(65);
    expect(stepTable(352.7 * 1024, 0.6, 30_000)['1a-ii']!.step).toBe(7 + 30);
  });
  it('projection and the kill rule 7 bands', () => {
    expect(projection({ L_proto: 360_000, C_MAP: 4_000, C_ride: 1_000, C_guest: 400, K_SMALL: 2, N_STAMP: 8, T_TRACK: 13_312, T_REST: 8_192 }))
      .toBe(360_000 + 4_000 + 17_000 + (400 * 101) / 2 + (400 * 8) / 2 + 13_312 + 8_192);
    expect(kill7(392 * 1024)).toBe('fires');
    expect(kill7(384 * 1024)).toBe('near');
    expect(kill7(384 * 1024 - 1)).toBe('clear');
  });
  it('build budgets (§10.3)', () => expect(buildBudgets(2.1, 7.2)).toEqual({ desktop: 4, phone: 8 }));
  const phoneLine = (n: string, p95 = '41.5'): string =>
    `[perf] phone (CPU 4×) scene phone run 1/1 (high), canvas ratio 1.3125: 30.0 fps, frame p50 20.0 / p95 ${p95} / max 90 ms; ` +
    'tick p50 1.00 / p95 2.00 ms; work p95 9.0 ms; render p95 8.0 ms; draws 10; sprites 5.0 MB, 3 canvases made; ' +
    'long tasks 0 in 30 s; guests 1 → 1; heap 50 MB; turns: longest frame 80 ms (work 70.0 ms), 60 ms (work 50.0 ms); ' +
    `pan: frame p95 33.3 ms, work p95 n/a ms; zoom 1.143, n ${n}`;
  const build2 = (project: 'desktop' | 'phone', p95: string): string =>
    `[perf] ${project}${project === 'phone' ? ' (CPU 4×)' : ''} scene build2 run 1/1, canvas ratio 1: 50.0 fps, frame p50 10.0 / p95 ${p95} / max 40 ms; ` +
    'tick p50 1.00 / p95 2.00 ms; work p95 9.0 ms; render p95 8.0 ms; draws 10; sprites 5.0 MB, 3 canvases made; ' +
    'long tasks 0 in 30 s; guests 1 → 1; heap 50 MB; turns: longest frame 30 ms (work 20.0 ms), 30 ms (work 20.0 ms); pan: frame p95 22.2 ms, work p95 n/a ms';
  it('parseP95 takes the frame p95 of the right project and scene', () => {
    expect(parseP95(phoneLine('3'), 'phone', 'phone', true)).toBe(41.5); // not tick 2.00, work 9.0, render 8.0 or pan 33.3
    expect(parseP95([phoneLine('3', '40.0'), phoneLine('3', '42.0')].join('\n'), 'phone', 'phone', true)).toBe(41);
    expect(parseP95([phoneLine('0', '99.0'), phoneLine('n/a', '99.0'), phoneLine('2', '30.0')].join('\n'), 'phone', 'phone', true)).toBe(30);
    expect(() => parseP95(phoneLine('n/a'), 'phone', 'phone', true)).toThrow();
    const classic = [build2('desktop', '12.5'), build2('phone', '35.0')].join('\n');
    expect(parseP95(classic, 'desktop', 'build2', false)).toBe(12.5);
    expect(parseP95(classic, 'phone', 'build2', false)).toBe(35);
  });
  it('parses the release lines', () => {
    expect(parseLoadBytes('| 2 | Initial load < 400 KB gzip (master §10) | PASS | 360.1 KB gzipped JS + CSS (368742 bytes) |')).toBe(368742);
    expect(parseLoadBytes('| 2 | Initial load < 400 KB gzip (master §10) | PASS | 352.7 KB gzipped JS + CSS |')).toBe(Math.round(352.7 * 1024));
  });
});

// ------------------------------------------------------------------ the numbers file

/** Every `.ts` file under `dir`, in path order. */
function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...tsFiles(p));
    else if (name.endsWith('.ts')) out.push(p);
  }
  return out;
}

const hex2 = (v: number): string => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');

/** The §6.4 scan: every `#rrggbb` (case folded) and every numeric `rgb(…)`/`rgba(…)` (as `#rrggbb`) under `src/render/`, outside `src/render/pixel/`. */
function scanLiterals(): Set<string> {
  const keys = new Set<string>();
  for (const file of tsFiles('src/render')) {
    if (file.startsWith(join('src/render', 'pixel'))) continue;
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/#[0-9a-f]{6}\b/gi)) keys.add(m[0].toLowerCase());
    for (const m of text.matchAll(/rgba?\(([0-9., ]+)\)/g)) {
      const parts = (m[1] as string).split(',').map((s) => Number(s.trim()));
      if (parts.length < 3 || parts.slice(0, 3).some((v) => !Number.isFinite(v))) continue;
      keys.add(`#${hex2(parts[0] as number)}${hex2(parts[1] as number)}${hex2(parts[2] as number)}`);
    }
  }
  return keys;
}

describe.skipIf(!process.env.TC_PROTO_OUT)('stage 0 numbers.json', () => {
  it('writes numbers.json', () => {
    const OUT = process.env.TC_PROTO_OUT as string;
    const read = (name: string): string => readFileSync(join(OUT, name), 'utf8');
    expect(existsSync(join(OUT, 'e2e/numbers-desktop.json'))).toBe(true);
    expect(existsSync(join(OUT, 'e2e/numbers-phone.json'))).toBe(true);
    const desk = JSON.parse(read('e2e/numbers-desktop.json')) as Record<string, number | string>;
    const ph = JSON.parse(read('e2e/numbers-phone.json')) as Record<string, number | string>;

    // Sizes (§10.4 item 3, §11.4).
    const B = parseLoadBytes(read('release-base.txt'));
    const L_proto = parseLoadBytes(read('release-pixel.txt'));
    const C_ride = L_proto - parseLoadBytes(read('release-no-carousel.txt'));
    const C_guest = L_proto - parseLoadBytes(read('release-no-guest.txt'));
    expect(C_ride).toBeGreaterThan(0);
    expect(C_guest).toBeGreaterThan(0);

    // The colour map: the scan plus the derived outputs of the sheet sprites, each value 'n3'.
    const keys = scanLiterals();
    startDerivedMemo();
    let recs: ReturnType<typeof stopDerivedMemo> = [];
    try {
      buildSheetSprites();
    } finally {
      recs = stopDerivedMemo();
    }
    for (const r of recs) keys.add(r.out.toLowerCase());
    const sorted = [...keys].sort();
    const map = Object.fromEntries(sorted.map((k) => [k, 'n3']));
    const C_MAP = gzipSync(JSON.stringify(map)).length;
    const src =
      'export const COLOUR_MAP: Readonly<Record<string, string>> = {\n' + sorted.map((k) => `  '${k}': 'n3',\n`).join('') + '};\n';
    const C_MAP_SRC = gzipSync(src).length;
    const R_GZIP = C_ride / gzipSync(readFileSync('src/render/pixel/art/rides.ts'), { level: 9 }).length;

    // The projection (§10.4 item 3) with the start values of §15.
    const K_SMALL = 2;
    const N_STAMP = 8;
    const T_TRACK = 13 * 1024;
    const T_REST = 8 * 1024;
    const P = projection({ L_proto, C_MAP, C_ride, C_guest, K_SMALL, N_STAMP, T_TRACK, T_REST });

    // Frames (§11.5).
    const frameP95 = parseP95(read('perf-pixel-desktop.txt'), 'desktop', 'build2', true);
    const frameP95K2 = parseP95(read('perf-pixel-k2.txt'), 'phone', 'phone', true);
    const frameP95K3 = parseP95(read('perf-pixel-k3.txt'), 'phone', 'phone', true);
    const classicText = read('perf-classic.txt');
    const phoneFrameP95 = parseP95(classicText, 'phone', 'phone', false);
    const desktopFrameP95 = parseP95(classicText, 'desktop', 'build2', false);
    const members = ['spriteBuildMsMax', 'chunkBuildMsMax', 'chunkBuildMsMaxLoad', 'turnFrameMsMax', 'rideBuildMsMax', 'spriteMb', 'chunkMb', 'loadavgBefore', 'loadavgAfter'];
    const pick = (j: Record<string, number | string>): Record<string, number | string> => {
      for (const k of members) expect(j[k], k).toBeDefined();
      return Object.fromEntries(members.map((k) => [k, j[k] as number | string]));
    };
    const budgets = buildBudgets(desk.spriteBuildMsMax as number, ph.spriteBuildMsMax as number);

    const numbers = {
      B,
      L_proto,
      C_ride,
      C_guest,
      C_MAP,
      C_MAP_SRC,
      R_GZIP,
      K_SMALL,
      N_STAMP,
      T_TRACK,
      T_REST,
      P,
      desktop: { frameP95, ...pick(desk) },
      phone: { frameP95K2, frameP95K3, ...pick(ph) },
      classic: { phoneFrameP95, desktopFrameP95, phoneRatio: frameP95K2 / phoneFrameP95, desktopRatio: frameP95 / desktopFrameP95 },
      kill7: kill7(P),
      constants: {
        PIXEL_CODE_STEP_KB: stepTable(B, R_GZIP, C_MAP_SRC),
        R_GZIP,
        BUILD_BUDGET_MS_DESKTOP: budgets.desktop,
        BUILD_BUDGET_MS_PHONE: budgets.phone,
      },
      colourMapKeys: sorted.length,
    };
    writeFileSync(join(OUT, 'numbers.json'), JSON.stringify(numbers, null, 2) + '\n');
  });
});
