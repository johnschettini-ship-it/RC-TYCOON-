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

  it('the name never touches the rides when it can fit (G5)', () => {
    for (const [w, h, menuH] of [[1280, 800, 264], [1280, 720, 238], [1366, 625, 238], [1280, 580, 238], [390, 844, 252], [375, 667, 116], [360, 640, 116], [844, 390, 52]] as const) {
      const l = titleLayout({ w, h, menuH });
      const rideTop = l.sceneY + (l.scene === 'wide' ? 134 : 190) * l.s;
      expect(l.nameY).toBeGreaterThanOrEqual(12);
      expect(nameBox(l).y + nameBox(l).h, `${w} x ${h}`).toBeLessThanOrEqual(rideTop - 8);
    }
  });
});
