/**
 * Layout of the title screen (design E, the skyline): every position and scale of the scene, the name and the menu
 * block, from the window size and the measured height of the menu block. Pure, no DOM. The rules are in
 * `docs/superpowers/specs/thrills-and-chills/phase-7-title-screen.md` (PORTING §3 and the game rules G1 to G10).
 */

export type TitleKind = 'desktop' | 'phone' | 'low';
export interface TitleLayoutInput {
  w: number;
  h: number;
  menuH: number;
}
export interface TitleLayout {
  kind: TitleKind;
  /** Desktop is always 'column'. */
  menu: 'column' | 'row';
  /** The desktop compact menu (PORTING §3). */
  compact: boolean;
  /** Scale of the menu block: 1, 1.25 (s = 3) or 1.5 (s >= 4). */
  ms: number;
  /** Free space under the menu, CSS px. */
  mb: number;
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
/** The name's free sky: at least 12 px from the top, 8 px above the ride tops. */
const NAME_TOP = 12;
const NAME_GAP = 8;
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

export function titleLayout(input: TitleLayoutInput): TitleLayout {
  const { w, h, menuH } = input;
  const kind: TitleKind = h < LOW_MAX_H && w > h && w <= LOW_MAX_W ? 'low' : w >= DESKTOP_MIN_W ? 'desktop' : 'phone';

  let s: number;
  let ms = 1;
  let mb: number;
  let sceneX: number;
  let sceneY: number;
  let compact = false;
  let menu: TitleLayout['menu'] = 'row';
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
    mb = Math.round((compact ? MB_COMPACT : MB) * ms);
    sceneY = h - ART.wide.h * s;
    names = [];
    for (let n = s; n >= 1; n--) {
      const name = ART.line.w * n <= w - 32 ? 'line' : 'stack';
      if (ART[name].w * n <= w - 8) names.push({ name, nameS: n });
    }
  } else if (kind === 'phone') {
    menu = w <= 599 && h >= 740 ? 'column' : 'row';
    s = w >= 600 && h >= 900 ? 3 : 2;
    mb = MB;
    sceneX = Math.round(w / 2 - (ART.tall.w / 2) * s);
    sceneY = h - mb - menuH - MENU_GAP - ART.tall.promenadeBottom * s;
    names = [];
    for (let n = s; n >= 1; n--) if (ART.stack.w * n <= w - 8) names.push({ name: 'stack', nameS: n });
  } else {
    s = 1;
    mb = MB_LOW;
    sceneX = clamp(Math.round(w / 2 - ART.wide.skylineMid), w - ART.wide.w, 0);
    sceneY = h - ART.wide.h - Math.max(0, mb + menuH + MENU_GAP - ART.wide.lawnRows);
    names = [{ name: w >= 512 ? 'line' : 'stack', nameS: 1 }];
  }
  if (names.length === 0) names = [{ name: 'stack', nameS: 1 }];

  // G5: the name fits in the sky above the rides; else the scene moves down, then the name gets smaller.
  const rideTop = (kind === 'phone' ? ART.tall.rideTop : ART.wide.rideTop) * s;
  const cap = (kind === 'desktop' ? MOVE_DESKTOP : MOVE_PHONE) * s;
  let pick = names[names.length - 1] as { name: TitleLayout['name']; nameS: number };
  let move = 0;
  for (const c of names) {
    const nameH = ART[c.name].h * c.nameS;
    const missing = Math.max(0, NAME_TOP + nameH + NAME_GAP - (sceneY + rideTop));
    const last = c.nameS === 1 || c === names[names.length - 1];
    if (missing <= cap || last) {
      pick = c;
      move = last ? Math.min(missing, Math.max(cap, MOVE_LAST * s)) : missing;
      break;
    }
  }
  sceneY += move;
  const nameW = ART[pick.name].w * pick.nameS;
  const nameH = ART[pick.name].h * pick.nameS;
  const nameY = Math.max(NAME_TOP, Math.round((sceneY + rideTop - nameH) / 2));
  const nameX = Math.round(w / 2 - nameW / 2);

  return {
    kind,
    menu,
    compact,
    ms,
    mb,
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
