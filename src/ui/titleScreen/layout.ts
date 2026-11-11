/**
 * Layout of the title screen (design E, the skyline): every position and scale of the scene, the name and the menu
 * block, from the window size and the measured height of the menu block. Pure, no DOM. The rules are in
 * `docs/superpowers/specs/thrills-and-chills/phase-7-title-screen.md` (PORTING §3 and the game rules G1 to G13).
 */

export type TitleKind = 'desktop' | 'phone' | 'low';
/** The safe-area insets of the window, CSS px (`--safe-top` and so on). */
export interface SafeInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}
export interface TitleLayoutInput {
  w: number;
  h: number;
  menuH: number;
  /** Safe-area insets; all 0 when left out. The scene covers the whole window; the name and the menu stay inside. */
  safe?: SafeInsets;
  /** Continue shows (there is a save): the phone and low menus then have two main buttons, else one. */
  continueShown?: boolean;
  /** The padding and border of a phone or low menu button side by side, CSS px (measured; 26 when left out). */
  buttonEdge?: number;
}
/** The desktop menu block in whole CSS px: PORTING's values times `ms`, rounded (G10). */
export interface MenuBox {
  /** Left edge, with the left inset. */
  left: number;
  /** Width: two small buttons side by side are whole px wide. */
  width: number;
  /** Minimum heights: the first main button, the second, the small ones. */
  h1: number;
  h2: number;
  h3: number;
  gap: number;
}
/** A block centred on whole CSS px: its left edge (with the left inset where it has one) and its width. */
export interface PlacedBox {
  left: number;
  width: number;
}
export interface TitleLayout {
  kind: TitleKind;
  /** Desktop is always 'column'. */
  menu: 'column' | 'row';
  /** The desktop compact menu (PORTING §3). */
  compact: boolean;
  /** Scale of the menu block: 1, 1.25 (s = 3) or 1.5 (s >= 4). */
  ms: number;
  /** Free space under the menu, CSS px (with the bottom inset). */
  mb: number;
  /** The desktop menu block; null for the phone and the low kind (their menu sizes are fixed in CSS). */
  menuBox: MenuBox | null;
  /**
   * The phone and low menu block (null on the desktop): centred on whole px, its width cut down to one that its buttons
   * share in whole px (their flex parts and gaps in main.css).
   */
  menuPlace: PlacedBox | null;
  /** The phone sheet and the low plate (null on the desktop), centred on whole px. */
  platePlace: PlacedBox | null;
  scene: 'wide' | 'tall';
  /** Whole-number scale of the scene. */
  s: number;
  /** Top left of the scene picture, whole CSS px. */
  sceneX: number;
  sceneY: number;
  name: 'line' | 'stack';
  /** Whole-number scale of the name. */
  nameS: number;
  /** Top left of the name picture, whole CSS px. */
  nameX: number;
  nameY: number;
}

/**
 * The facts of the pictures that the layout depends on (`src/ui/titleScreen/art/*.json`). A new export of the
 * pictures keeps these sizes, rows and columns.
 */
export const ART = {
  wide: {
    w: 960,
    h: 400,
    /** The highest ride pixel row. */
    rideTop: 134,
    promenadeTop: 288,
    promenadeBottom: 300,
    /** Lawn rows below the promenade. */
    lawnRows: 99,
    /** The coaster's left foot. */
    coasterFoot: 168,
    /** The middle of the skyline. */
    skylineMid: 330,
  },
  tall: {
    w: 450,
    h: 470,
    rideTop: 190,
    /** The promenade's bottom edge; the lawn is rows 315 to 469. */
    promenadeBottom: 314,
  },
  line: { w: 496, h: 62 },
  stack: { w: 176, h: 118 },
} as const;

/** PORTING §3 values. */
const DESKTOP_MIN_W = 900;
const LOW_MAX_H = 500;
const LOW_MAX_W = 960;
const COMPACT_MAX_H = 768;
/** Desktop: the coaster's left foot lands here, right of the menu block (times ms, G10). */
const COASTER_X = 336;
const MB = 32;
const MB_COMPACT = 24;
const MB_LOW = 12;
/** PORTING §3, desktop menu block at ms 1 (left, width, heights, gap); the compact form when h <= 768. */
const MENU_LEFT = 32;
const MENU_W = 288;
const MENU = { h1: 68, h2: 56, h3: 52, gap: 12 } as const;
const MENU_COMPACT = { h1: 60, h2: 56, h3: 46, gap: 10 } as const;
const NO_INSETS: SafeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
/** The name's free sky: at least 12 px from the top, 8 px above the ride tops. */
const NAME_TOP = 12;
const NAME_GAP = 8;
/** G5, the phone under a top inset: the smaller margins before the name gets smaller. */
const NAME_TOP_TIGHT = 6;
const NAME_GAP_TIGHT = 4;
/** The phone menu (row form at most 560 px, margins 16 px) and sheet (at most 560 px); the low menu (at most 820 px, margins 12 px) and plate (at most 560 px, 8 px from the sides). */
const PHONE_MENU_MAX = 560;
const PHONE_MARGIN = 16;
const SHEET_MAX = 560;
const LOW_MENU_MAX = 820;
const LOW_MARGIN = 12;
const LOW_PLATE_MAX = 560;
const LOW_PLATE_MARGIN = 8;
/** The gaps of the phone menu (row form, column form) and of the low row (main.css). */
const GAP_ROW = 10;
const GAP_COLUMN = 12;
const GAP_LOW = 10;
/** A menu button's padding and border side by side: 2 × 10 px and 2 × 3 px (main.css). */
const BUTTON_EDGE = 26;
/** The phone scene: the promenade's bottom edge stands 8 px above the menu block. */
const MENU_GAP = 8;
/** G5: how far the scene may move down to make room for the name, per scene pixel. */
const MOVE_DESKTOP = 50;
const MOVE_PHONE = 14;
const MOVE_LAST = 75;

/** The scale of the menu block (G10). */
function menuScale(s: number): number {
  return s <= 2 ? 1 : s === 3 ? 1.25 : 1.5;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/**
 * The widest menu width up to `max` that its buttons share in whole px (G1), so every button edge is on a whole px.
 * The buttons are flex items with basis 0: each starts at its padding and border (`edge`), then the rest of the row is
 * shared by their flex parts (main.css). Phone column form: two small buttons and a gap side by side. Phone row form:
 * Continue 7 parts and New game 5 beside a gap, then two pairs of small buttons side by side. Low row: Continue 2,
 * New game 1.5 (2 when it is the only main button) and four small buttons of 1, with 10 px gaps.
 */
function wholeMenuWidth(kind: TitleKind, menu: TitleLayout['menu'], max: number, continueShown: boolean, edge: number): number {
  const whole = (v: number): boolean => v >= 0 && Math.abs(v - Math.round(v)) < 1e-6;
  /** Each button of a row is whole: `parts` are the flex parts, `gap` the gap between them. */
  const row = (width: number, parts: readonly number[], gap: number): boolean => {
    const total = parts.reduce((a, b) => a + b, 0);
    const unit = (width - gap * (parts.length - 1) - edge * parts.length) / total;
    return unit >= 0 && parts.every((k) => whole(edge + k * unit));
  };
  /** Two pairs of two small buttons: the pairs share the row, the buttons share their pair. */
  const pairs = (width: number, gap: number): boolean => whole((width - gap) / 2) && row((width - gap) / 2, [1, 1], gap);
  const fits = (width: number): boolean => {
    if (kind === 'low') return row(width, continueShown ? [2, 1.5, 1, 1, 1, 1] : [2, 1, 1, 1, 1], GAP_LOW);
    if (menu === 'column') return row(width, [1, 1], GAP_COLUMN);
    return (!continueShown || row(width, [7, 5], GAP_ROW)) && pairs(width, GAP_ROW);
  };
  for (let width = Math.floor(max); width > max - 60; width--) if (fits(width)) return width;
  return Math.floor(max);
}

/** A block of `width` centred in `room` px that start at `start`, on whole px. */
const centred = (start: number, room: number, width: number): PlacedBox => ({ left: start + Math.floor((room - width) / 2), width });

export function titleLayout(input: TitleLayoutInput): TitleLayout {
  const { w, h, menuH } = input;
  const safe = input.safe ?? NO_INSETS;
  const edge = input.buttonEdge ?? BUTTON_EDGE;
  /** G4 and the name's place use the safe width. */
  const sw = w - safe.left - safe.right;
  const nameTop = NAME_TOP + safe.top;
  const kind: TitleKind = h < LOW_MAX_H && w > h && w <= LOW_MAX_W ? 'low' : w >= DESKTOP_MIN_W ? 'desktop' : 'phone';

  let s: number;
  let ms = 1;
  let mb: number;
  let sceneX: number;
  let sceneY: number;
  let compact = false;
  let menu: TitleLayout['menu'] = 'row';
  let menuBox: MenuBox | null = null;
  let menuPlace: PlacedBox | null = null;
  let platePlace: PlacedBox | null = null;
  let names: Array<{ name: TitleLayout['name']; nameS: number }>;

  if (kind === 'desktop') {
    menu = 'column';
    compact = h <= COMPACT_MAX_H;
    s = w >= 2304 && h >= 1440 ? 4 : w >= 1536 && h >= 1000 ? 3 : 2;
    // G9: the picture reaches the right edge of the window.
    const xAt = (sc: number): number => Math.round(COASTER_X * menuScale(sc)) - ART.wide.coasterFoot * sc;
    while (xAt(s) + ART.wide.w * s < w) s += 1;
    ms = menuScale(s);
    sceneX = xAt(s);
    mb = Math.round((compact ? MB_COMPACT : MB) * ms) + safe.bottom;
    const m = compact ? MENU_COMPACT : MENU;
    const gap = Math.round(m.gap * ms);
    const small = Math.round((MENU_W * ms - gap) / 2);
    menuBox = {
      left: Math.round(MENU_LEFT * ms) + safe.left,
      width: 2 * small + gap,
      h1: Math.round(m.h1 * ms),
      h2: Math.round(m.h2 * ms),
      h3: Math.round(m.h3 * ms),
      gap,
    };
    sceneY = h - ART.wide.h * s;
    names = [];
    for (let n = s; n >= 1; n--) {
      const name = ART.line.w * n <= sw - 32 ? 'line' : 'stack';
      if (ART[name].w * n <= sw - 8) names.push({ name, nameS: n });
    }
  } else if (kind === 'phone') {
    menu = w <= 599 && h >= 740 ? 'column' : 'row';
    s = w >= 600 && h >= 900 ? 3 : 2;
    mb = MB + safe.bottom;
    sceneX = Math.round(w / 2 - (ART.tall.w / 2) * s);
    sceneY = h - mb - menuH - MENU_GAP - ART.tall.promenadeBottom * s;
    names = [];
    for (let n = s; n >= 1; n--) if (ART.stack.w * n <= sw - 8) names.push({ name: 'stack', nameS: n });
    const room = sw - 2 * PHONE_MARGIN;
    menuPlace = centred(safe.left, sw, wholeMenuWidth(kind, menu, menu === 'column' ? room : Math.min(room, PHONE_MENU_MAX), input.continueShown ?? false, edge));
    platePlace = centred(0, w, Math.min(w, SHEET_MAX));
  } else {
    s = 1;
    mb = MB_LOW + safe.bottom;
    sceneX = clamp(Math.round(w / 2 - ART.wide.skylineMid), w - ART.wide.w, 0);
    sceneY = h - ART.wide.h - Math.max(0, mb + menuH + MENU_GAP - ART.wide.lawnRows);
    names = [{ name: sw >= 512 ? 'line' : 'stack', nameS: 1 }];
    menuPlace = centred(safe.left, sw, wholeMenuWidth(kind, menu, Math.min(sw - 2 * LOW_MARGIN, LOW_MENU_MAX), input.continueShown ?? false, edge));
    platePlace = centred(safe.left, sw, Math.min(LOW_PLATE_MAX, sw - 2 * LOW_PLATE_MARGIN));
  }
  if (names.length === 0) names = [{ name: 'stack', nameS: 1 }];

  // G5: the name fits in the sky above the rides; else the scene moves down, then (the phone under a top inset) the
  // name's margins get smaller, then the name gets smaller.
  const rideTop = (kind === 'phone' ? ART.tall.rideTop : ART.wide.rideTop) * s;
  const cap = (kind === 'desktop' ? MOVE_DESKTOP : MOVE_PHONE) * s;
  let pick = names[names.length - 1] as { name: TitleLayout['name']; nameS: number };
  let move = 0;
  let top = nameTop;
  for (const c of names) {
    const nameH = ART[c.name].h * c.nameS;
    const missing = Math.max(0, nameTop + nameH + NAME_GAP - (sceneY + rideTop));
    const last = c.nameS === 1 || c === names[names.length - 1];
    if (missing <= cap) {
      pick = c;
      move = missing;
      break;
    }
    if (!last && kind === 'phone' && safe.top > 0) {
      const tightTop = NAME_TOP_TIGHT + safe.top;
      const tight = Math.max(0, tightTop + nameH + NAME_GAP_TIGHT - (sceneY + rideTop));
      if (tight <= cap) {
        pick = c;
        move = tight;
        top = tightTop;
        break;
      }
    }
    if (last) {
      pick = c;
      move = Math.min(missing, Math.max(cap, MOVE_LAST * s));
      break;
    }
  }
  sceneY += move;
  const nameW = ART[pick.name].w * pick.nameS;
  const nameH = ART[pick.name].h * pick.nameS;
  const nameY = Math.max(top, Math.round((sceneY + rideTop - nameH) / 2));
  const nameX = Math.round(safe.left + sw / 2 - nameW / 2);

  return {
    kind,
    menu,
    compact,
    ms,
    mb,
    menuBox,
    menuPlace,
    platePlace,
    scene: kind === 'phone' ? 'tall' : 'wide',
    s,
    sceneX,
    sceneY,
    name: pick.name,
    nameS: pick.nameS,
    nameX,
    nameY,
  };
}
