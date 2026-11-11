import { describe, expect, it } from 'vitest';
import { titleLayout, type TitleLayout } from '../../../src/ui/titleScreen/layout';

const NAME = { line: { w: 496, h: 62 }, stack: { w: 176, h: 118 } } as const;

interface Vector {
  w: number;
  h: number;
  menuH: number;
  want: Partial<TitleLayout>;
}

/** PORTING §3 "What the rules give at the tested sizes" (menuH = the table's menu block; 1920 x 1080 with G10). */
const PORTING_TABLE: Vector[] = [
  { w: 1280, h: 800, menuH: 264, want: { kind: 'desktop', menu: 'column', compact: false, ms: 1, mb: 32, scene: 'wide', s: 2, name: 'line', nameS: 2, nameX: 144, nameY: 72, sceneX: 0, sceneY: 0 } },
  { w: 1280, h: 720, menuH: 238, want: { kind: 'desktop', menu: 'column', compact: true, ms: 1, mb: 24, scene: 'wide', s: 2, name: 'line', nameS: 2, nameX: 144, nameY: 32, sceneX: 0, sceneY: -80 } },
  { w: 1366, h: 768, menuH: 238, want: { kind: 'desktop', compact: true, s: 2, name: 'line', nameS: 2, nameX: 187, nameY: 56, sceneX: 0, sceneY: -32 } },
  { w: 1920, h: 1080, menuH: 330, want: { kind: 'desktop', compact: false, s: 3, ms: 1.25, mb: 40, name: 'line', nameS: 3, nameX: 216, nameY: 48, sceneX: -84, sceneY: -120 } },
  { w: 1024, h: 768, menuH: 238, want: { kind: 'desktop', compact: true, s: 2, name: 'line', nameS: 2, nameX: 16, nameY: 56, sceneX: 0, sceneY: -32 } },
  { w: 390, h: 844, menuH: 252, want: { kind: 'phone', menu: 'column', compact: false, ms: 1, mb: 32, scene: 'tall', s: 2, name: 'stack', nameS: 2, nameX: 19, nameY: 34, sceneX: -255, sceneY: -76 } },
  { w: 375, h: 667, menuH: 116, want: { kind: 'phone', menu: 'row', s: 2, name: 'stack', nameS: 2, nameX: 12, nameY: 14, sceneX: -262, sceneY: -117 } },
  { w: 412, h: 915, menuH: 252, want: { kind: 'phone', menu: 'column', s: 2, name: 'stack', nameS: 2, nameX: 30, nameY: 70, sceneX: -244, sceneY: -5 } },
  { w: 768, h: 1024, menuH: 116, want: { kind: 'phone', menu: 'row', s: 3, name: 'stack', nameS: 3, nameX: 120, nameY: 71, sceneX: -291, sceneY: -74 } },
];

/** The rules of the game build (G3 to G10). Scene moves are against the unmoved place (desktop h - 400 s; phone PORTING §3). */
const GAME_RULES: Vector[] = [
  // Phone: the name fits after the scene moves down 20 px (unmoved: 640 - 32 - 116 - 8 - 628 = -144).
  { w: 360, h: 640, menuH: 116, want: { kind: 'phone', menu: 'row', s: 2, name: 'stack', nameS: 2, nameY: 12, sceneY: -124 } },
  { w: 320, h: 568, menuH: 116, want: { kind: 'phone', name: 'stack', nameS: 1 } },
  { w: 844, h: 390, menuH: 52, want: { kind: 'low', menu: 'row', mb: 12, scene: 'wide', s: 1, name: 'line', nameS: 1, nameY: 31, sceneX: 0, sceneY: -10 } },
  { w: 667, h: 375, menuH: 52, want: { kind: 'low', menu: 'row', s: 1, name: 'line', nameS: 1 } },
  { w: 1366, h: 625, menuH: 238, want: { kind: 'desktop', compact: true, name: 'line', nameS: 2, nameY: 12, sceneY: -124 } },
  { w: 1280, h: 580, menuH: 238, want: { kind: 'desktop', name: 'line', nameS: 2, nameY: 12, sceneY: -124 } },
  // 1280 x 560: nameS 2 would need 116 px (more than 50 s); at nameS 1 the scene moves down 54 px: -240 + 54.
  { w: 1280, h: 560, menuH: 238, want: { kind: 'desktop', name: 'line', nameS: 1, nameY: 12, sceneY: -186 } },
  // 2560 x 950: G9 raises s to 3 (G10: ms 1.25); the scene moves down 54 px: 950 - 1200 + 54.
  { w: 2560, h: 950, menuH: 330, want: { kind: 'desktop', s: 3, ms: 1.25, sceneX: -84, name: 'line', nameS: 3, nameY: 12, sceneY: -196 } },
  { w: 1920, h: 1080, menuH: 330, want: { kind: 'desktop', s: 3, ms: 1.25, sceneX: -84, name: 'line', nameS: 3, nameX: 216, nameY: 48 } },
];

const nameBox = (l: TitleLayout): { x: number; y: number; w: number; h: number } => ({ x: l.nameX, y: l.nameY, w: NAME[l.name].w * l.nameS, h: NAME[l.name].h * l.nameS });

describe('titleLayout (Phase 7 title screen §3, G1 to G10)', () => {
  for (const v of [...PORTING_TABLE, ...GAME_RULES]) {
    it(`${v.w} x ${v.h} with a menu block of ${v.menuH} px`, () => {
      const l = titleLayout({ w: v.w, h: v.h, menuH: v.menuH });
      expect(l).toMatchObject(v.want);
      // Every position and scale is a whole number (ms is one of three steps).
      for (const k of ['s', 'sceneX', 'sceneY', 'nameS', 'nameX', 'nameY', 'mb'] as const) expect(Number.isInteger(l[k]), k).toBe(true);
      expect([1, 1.25, 1.5]).toContain(l.ms);
      // The name lies inside the window.
      const n = nameBox(l);
      expect(n.x).toBeGreaterThanOrEqual(0);
      expect(n.y).toBeGreaterThanOrEqual(0);
      expect(n.x + n.w).toBeLessThanOrEqual(v.w);
      expect(n.y + n.h).toBeLessThanOrEqual(v.h);
    });
  }

  it('the 360 x 640 phone moves the scene down 20 px from its unmoved place', () => {
    expect(titleLayout({ w: 360, h: 640, menuH: 116 }).sceneY - (640 - 32 - 116 - 8 - 314 * 2)).toBe(20);
  });
  it('1366 x 625 moves the scene down 51 px, 1280 x 580 96 px, 1280 x 560 54 px, 2560 x 950 54 px', () => {
    expect(titleLayout({ w: 1366, h: 625, menuH: 238 }).sceneY - (625 - 800)).toBe(51);
    expect(titleLayout({ w: 1280, h: 580, menuH: 238 }).sceneY - (580 - 800)).toBe(96);
    expect(titleLayout({ w: 1280, h: 560, menuH: 238 }).sceneY - (560 - 800)).toBe(54);
    expect(titleLayout({ w: 2560, h: 950, menuH: 330 }).sceneY - (950 - 1200)).toBe(54);
  });

  it('kinds (G3): low for landscape phones, desktop from 900 px wide, else phone', () => {
    expect(titleLayout({ w: 960, h: 499, menuH: 52 }).kind).toBe('low');
    expect(titleLayout({ w: 961, h: 499, menuH: 238 }).kind).toBe('desktop');
    expect(titleLayout({ w: 960, h: 500, menuH: 238 }).kind).toBe('desktop');
    expect(titleLayout({ w: 899, h: 600, menuH: 116 }).kind).toBe('phone');
    expect(titleLayout({ w: 480, h: 480, menuH: 116 }).kind).toBe('phone');
  });

  it('menu form and compact depend only on the window (G2)', () => {
    for (const menuH of [100, 250, 400]) {
      expect(titleLayout({ w: 390, h: 844, menuH })).toMatchObject({ menu: 'column', compact: false });
      expect(titleLayout({ w: 375, h: 667, menuH })).toMatchObject({ menu: 'row', compact: false });
      expect(titleLayout({ w: 1280, h: 768, menuH })).toMatchObject({ menu: 'column', compact: true });
      expect(titleLayout({ w: 1280, h: 769, menuH })).toMatchObject({ menu: 'column', compact: false });
    }
  });

  it('the name is never wider than the window less 8 px (G4)', () => {
    for (const w of [300, 320, 352, 359, 360, 600, 900, 1000, 1023, 1024, 1500, 1536, 2400, 3440]) {
      for (const h of [568, 800, 1100, 1500]) {
        const l = titleLayout({ w, h, menuH: 250 });
        expect(nameBox(l).w, `${w} x ${h}`).toBeLessThanOrEqual(w - 8);
        if (l.kind === 'phone') expect(l.name).toBe('stack');
        if (l.kind === 'desktop') expect(l.name).toBe(NAME.line.w * l.nameS <= w - 32 ? 'line' : 'stack');
      }
    }
  });

  it('the desktop picture covers the window (G9): 3440 x 1300 takes s 4 and ms 1.5', () => {
    const l = titleLayout({ w: 3440, h: 1300, menuH: 396 });
    expect(l).toMatchObject({ kind: 'desktop', s: 4, ms: 1.5, sceneX: 504 - 672 });
    for (const [w, h] of [[1280, 800], [1920, 1080], [2560, 950], [2560, 1440], [3440, 1300], [3840, 2160]] as const) {
      const d = titleLayout({ w, h, menuH: 264 });
      expect(d.sceneX + 960 * d.s, `${w} x ${h}`).toBeGreaterThanOrEqual(w);
      expect(d.sceneX).toBeLessThanOrEqual(0);
    }
  });

  it('the low kind (G6): the menu row lifts the scene; the name is a stack below 512 px', () => {
    const tall = titleLayout({ w: 844, h: 390, menuH: 120 });
    // 12 + 120 + 8 - 99 = 41 px lift.
    expect(tall.sceneY).toBe(390 - 400 - 41);
    expect(titleLayout({ w: 500, h: 400, menuH: 52 })).toMatchObject({ kind: 'low', name: 'stack', nameS: 1 });
    expect(titleLayout({ w: 960, h: 450, menuH: 52 }).sceneX).toBe(0);
  });

  it('safe areas at 0 change nothing: every vector gives the same layout as without them', () => {
    for (const v of [...PORTING_TABLE, ...GAME_RULES]) {
      const safe = { top: 0, right: 0, bottom: 0, left: 0 };
      expect(titleLayout({ w: v.w, h: v.h, menuH: v.menuH, safe }), `${v.w} x ${v.h}`).toEqual(titleLayout({ w: v.w, h: v.h, menuH: v.menuH }));
    }
  });

  it('safe areas: 844 x 390 with left 47, right 47, bottom 21 keeps the name between x 47 and 797', () => {
    const l = titleLayout({ w: 844, h: 390, menuH: 52, safe: { top: 0, right: 47, bottom: 21, left: 47 } });
    expect(l).toMatchObject({ kind: 'low', mb: 33 });
    const n = nameBox(l);
    expect(n.x).toBeGreaterThanOrEqual(47);
    expect(n.x + n.w).toBeLessThanOrEqual(797);
    // Centred in the safe width.
    expect(n.x).toBe(Math.round(47 + 750 / 2 - n.w / 2));
    // The scene still covers the whole window.
    expect(l.sceneX).toBeLessThanOrEqual(0);
    expect(l.sceneX + 960 * l.s).toBeGreaterThanOrEqual(844);
  });

  it('safe areas: 390 x 844 with top 47, bottom 34 keeps the name under the top inset and the menu over the bottom one', () => {
    const l = titleLayout({ w: 390, h: 844, menuH: 252, safe: { top: 47, right: 0, bottom: 34, left: 0 } });
    // G5's smaller top margin under a top inset: 6 px below it.
    expect(l.nameY).toBeGreaterThanOrEqual(47 + 6);
    expect(l.mb).toBe(66);
  });

  it('safe areas: the desktop menu moves right by the left inset; G4 uses the safe width', () => {
    const l = titleLayout({ w: 1280, h: 800, menuH: 264, safe: { top: 0, right: 30, bottom: 0, left: 30 } });
    expect(l.menuBox?.left).toBe(32 + 30);
    expect(nameBox(l).x).toBe(Math.round(30 + 1220 / 2 - nameBox(l).w / 2));
    // 1050 px: the line at 2x (992 px) is wider than 1050 - 60 - 32, so the name takes scale 1 or the stack.
    const narrow = titleLayout({ w: 1050, h: 800, menuH: 264, safe: { top: 0, right: 30, bottom: 0, left: 30 } });
    expect(nameBox(narrow).w).toBeLessThanOrEqual(1050 - 60 - 8);
  });

  it('the desktop menu block is whole px at ms 1.25 and 1.5 (PORTING values times ms, rounded)', () => {
    // ms 1: PORTING's values.
    expect(titleLayout({ w: 1280, h: 800, menuH: 264 }).menuBox).toEqual({ left: 32, width: 288, h1: 68, h2: 56, h3: 52, gap: 12 });
    expect(titleLayout({ w: 1280, h: 720, menuH: 238 }).menuBox).toEqual({ left: 32, width: 288, h1: 60, h2: 56, h3: 46, gap: 10 });
    // ms 1.25, compact (2560 x 700: G9 gives s 3): 46 * 1.25 = 57.5 -> 58, 10 * 1.25 = 12.5 -> 13.
    const compact = titleLayout({ w: 2560, h: 700, menuH: 300 });
    expect(compact).toMatchObject({ s: 3, ms: 1.25, compact: true });
    expect(compact.menuBox).toMatchObject({ left: 40, h1: 75, h2: 70, h3: 58, gap: 13 });
    for (const [w, h] of [[1920, 1080], [2560, 700], [3440, 1300], [2560, 1440]] as const) {
      const l = titleLayout({ w, h, menuH: 330 });
      const b = l.menuBox;
      expect(b, `${w} x ${h}`).not.toBeNull();
      if (!b) continue;
      for (const v of Object.values(b)) expect(Number.isInteger(v), `${w} x ${h}`).toBe(true);
      // Two small buttons side by side are whole px wide as well.
      expect((b.width - b.gap) % 2, `${w} x ${h}`).toBe(0);
      expect(Number.isInteger(l.mb)).toBe(true);
    }
    expect(titleLayout({ w: 390, h: 844, menuH: 252 }).menuBox).toBeNull();
  });

  it('G5, the phone under a top inset: the name keeps scale 2 with smaller margins (iPhone in standalone mode)', () => {
    // 390 x 844, top 47, bottom 34: 33 px missing at the usual margins (more than 14 s); 23 px with 6 px and 4 px.
    const a = titleLayout({ w: 390, h: 844, menuH: 252, safe: { top: 47, right: 0, bottom: 34, left: 0 } });
    expect(a).toMatchObject({ kind: 'phone', name: 'stack', nameS: 2, nameY: 53, sceneY: -110 + 23 });
    // The name ends 4 px above the ride tops.
    expect(a.nameY + 118 * 2).toBe(a.sceneY + 190 * 2 - 4);
    const b = titleLayout({ w: 393, h: 852, menuH: 252, safe: { top: 59, right: 0, bottom: 34, left: 0 } });
    expect(b).toMatchObject({ kind: 'phone', name: 'stack', nameS: 2 });
    expect(b.nameY).toBeGreaterThanOrEqual(59 + 6);
    expect(b.nameY + 118 * 2).toBeLessThanOrEqual(b.sceneY + 190 * 2 - 4);
  });

  it('G1, the phone and low menus, the sheet and the low plate lie on whole px; their buttons share the menu in whole px', () => {
    const whole = (v: number): boolean => Math.abs(v - Math.round(v)) < 1e-6;
    // Flex items with basis 0: each button starts at its padding and border (edge), the rest is shared by its parts.
    const share = (width: number, parts: number[], gap: number, edge: number): number[] => {
      const unit = (width - gap * (parts.length - 1) - edge * parts.length) / parts.reduce((a, b) => a + b, 0);
      return parts.map((k) => edge + k * unit);
    };
    const cases = [[601, 900, 116, false, 14], [601, 900, 116, true, 14], [899, 700, 116, true, 14], [375, 667, 116, true, 14], [390, 844, 252, false, 26], [391, 844, 252, true, 26], [845, 390, 52, false, 26], [845, 390, 52, true, 26], [667, 375, 52, true, 28]] as const;
    for (const [w, h, menuH, cont, edge] of cases) {
      const l = titleLayout({ w, h, menuH, continueShown: cont, buttonEdge: edge });
      const m = l.menuPlace;
      const p = l.platePlace;
      expect(m && p, `${w} x ${h}`).toBeTruthy();
      if (!m || !p) continue;
      for (const v of [m.left, m.width, p.left, p.width]) expect(Number.isInteger(v), `${w} x ${h}`).toBe(true);
      // Centred on whole px; at most the width of G6 and the phone menu rule, and at most 14 px less.
      expect(Math.abs(m.left - (w - m.width) / 2)).toBeLessThanOrEqual(0.5);
      const max = l.kind === 'low' ? Math.min(w - 24, 820) : l.menu === 'row' ? Math.min(w - 32, 560) : w - 32;
      expect(m.width, `${w} x ${h}`).toBeLessThanOrEqual(max);
      expect(m.width, `${w} x ${h}`).toBeGreaterThan(max - 15);
      let widths: number[];
      if (l.kind === 'low') widths = share(m.width, cont ? [2, 1.5, 1, 1, 1, 1] : [2, 1, 1, 1, 1], 10, edge);
      else if (l.menu === 'row') widths = [...(cont ? share(m.width, [7, 5], 10, edge) : []), (m.width - 10) / 2, ...share((m.width - 10) / 2, [1, 1], 10, edge)];
      else widths = share(m.width, [1, 1], 12, edge);
      for (const x of widths) expect(whole(x), `${w} x ${h} (save ${cont}): ${widths.join(', ')}`).toBe(true);
      expect(p.width).toBe(l.kind === 'low' ? Math.min(560, w - 16) : Math.min(w, 560));
    }
    expect(titleLayout({ w: 1280, h: 800, menuH: 264 }).menuPlace).toBeNull();
  });

  it('the name never touches the rides when it can fit (G5)', () => {
    for (const [w, h, menuH] of [[1280, 800, 264], [1280, 720, 238], [1366, 625, 238], [1280, 580, 238], [390, 844, 252], [375, 667, 116], [360, 640, 116], [844, 390, 52]] as const) {
      const l = titleLayout({ w, h, menuH });
      const rideTop = l.sceneY + (l.scene === 'wide' ? 134 : 190) * l.s;
      expect(l.nameY).toBeGreaterThanOrEqual(12);
      expect(nameBox(l).y + nameBox(l).h, `${w} x ${h}`).toBeLessThanOrEqual(rideTop - 8);
    }
  });
});
