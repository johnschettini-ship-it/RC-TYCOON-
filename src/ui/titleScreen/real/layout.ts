/**
 * Layout of the realistic title screen's poster cover (VITE_ART=real build only): where the owner's poster, the name
 * and the menu go, from the window size, the measured menu height and the cover index (`art/real/title/index.json`,
 * copied from `art-src/title/` by `tools/art3d/cover.ts`). Pure, no DOM.
 *
 * The poster replaced the baked panorama (owner's choice, 2026-11-17; mocks variant-10 and variant-11). The rules:
 * - The menu is design E's menu: `base` is `titleLayout` of the same input, used as is for the menu, plate and sheet.
 * - Framing: tall when the window is taller than wide, else wide. Each framing names its file (the tall one may be the
 *   wide file with a narrower crop until a tall poster exists), the part of the file that may show (`crop`), the part
 *   that must stay visible (`focus`: the wheel and the arch), the wheel, and the title anchor (`title`: the sky where
 *   the name sits).
 * - Fit: object-fit cover of the crop (with the drift to spare on every side), centred on the focus box, but never
 *   so large that the focus box leaves the window (phones: the room above the menu). When that limit wins, the crop no
 *   longer covers the window and its edge rows and columns are stretched to the edges (`view.ts`). Phones hug the top
 *   (the name over the sky) and keep the focus box above the menu.
 * - Desktop: the menu block (bottom left) never covers the wheel, drift included.
 * - The name: real text (Fredoka), one line on the wide framing while it keeps a readable size, else stacked. Centred on
 *   the title anchor, inside the safe area, and above the wheel's hub.
 * - Reduced motion: no drift.
 */
import { titleLayout, type SafeInsets, type TitleLayout, type TitleLayoutInput } from '../layout';

export type Framing = 'wide' | 'tall';
export type TitleKind = 'line' | 'stack';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
/** One framing of the cover, in the file's px. */
export interface CoverFraming {
  /** File name relative to `title/`. */
  file: string;
  /** The file's size, px. */
  w: number;
  h: number;
  /** The part of the file that may show (the tall framing of the wide poster: inside its frame). */
  crop: Rect;
  /** What must stay visible: the wheel and the arch. */
  focus: Rect;
  /** The big wheel (the desktop menu never covers it; the name stays above its hub). */
  wheel: Rect;
  /** The title anchor: the sky where the name sits. */
  title: Rect;
  /** Where the twinkling bulbs are looked for (inside the painted area). */
  lights: Rect;
}
/** `art/real/title/index.json`. */
export interface CoverIndex {
  format: 'cover/1';
  wide: CoverFraming;
  tall: CoverFraming;
  /** Written by the copy step for the record; not needed by the reader. */
  bytes?: { compressed: number; decoded: { wide: number; tall: number } };
}

/** Largest file per framing, px (the owner's later posters: about 2560 wide, about 1440 x 2080 tall). */
export const COVER_MAX: Readonly<Record<Framing, { w: number; h: number }>> = { wide: { w: 2560, h: 1600 }, tall: { w: 1600, h: 2400 } };
/** Decoded RGBA bytes of one framing (spec §Sizes). */
export const COVER_DECODED_MAX = 24_000_000;
/** All files together, compressed (spec §Sizes). */
export const COVER_COMPRESSED_MAX = 3_000_000;

/** The name's box per font px (Fredoka 600, measured in Chromium, with room for the outline and glow). */
export const TITLE_EM: Readonly<Record<TitleKind, { w: number; h: number }>> = { line: { w: 6.95, h: 1.12 }, stack: { w: 3.2, h: 2.66 } };
/** The one-line name is used on the wide framing while its font keeps at least this size, CSS px. */
const LINE_MIN_FONT = 30;
/** The name: at least 12 px from the safe top, 16 px from the safe sides, 8 px above the wheel's hub. */
const NAME_TOP = 12;
const NAME_SIDE = 16;
const HUB_GAP = 8;
/** Desktop: free space between the menu block's right edge and the wheel. */
const MENU_CLEAR = 16;
/** Phones: free space between the focus box and the menu's top edge. */
const MENU_GAP = 8;
/** Drift amplitude, CSS px (a few px; none with reduced motion). */
export const DRIFT = 3;

export interface RealTitleInput extends TitleLayoutInput {
  /** No drift (prefers-reduced-motion or the setting). */
  reducedMotion?: boolean;
  /** Lay out this framing whatever the window's shape (the other framing still decoding: no blank frame). */
  framing?: Framing;
}
export interface CoverLayout {
  /** Design E's layout of the same input: the menu, the plate and the sheet. */
  base: TitleLayout;
  framing: Framing;
  /** CSS px per file px. */
  s: number;
  /** Where the file's (0, 0) lands, CSS px, at rest. */
  ox: number;
  oy: number;
  /** The crop on screen at rest, CSS px. */
  shown: Rect;
  /** The focus box and the wheel on screen at rest, CSS px. */
  focus: Rect;
  wheel: Rect;
  /** The name: its form, font size (CSS px) and box. */
  title: { kind: TitleKind; font: number } & Rect;
  /** Drift amplitude, CSS px (0 with reduced motion). */
  drift: number;
}

const NO_INSETS: SafeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export function coverLayout(input: RealTitleInput, idx: CoverIndex): CoverLayout {
  const { w, h, menuH } = input;
  const safe = input.safe ?? NO_INSETS;
  const base = titleLayout(input);
  const framing: Framing = input.framing ?? (h > w ? 'tall' : 'wide');
  const F = idx[framing];
  const C = F.crop;
  const Fo = F.focus;
  const Wh = F.wheel;
  const T = F.title;
  const d = input.reducedMotion ? 0 : DRIFT;

  // The band the focus box must stay in: the safe window; on phones, above the menu.
  const top = safe.top;
  const bottom = base.kind === 'phone' ? h - base.mb - menuH - MENU_GAP : h - safe.bottom;
  const sCover = Math.max((w + 2 * d) / C.w, (h + 2 * d) / C.h);
  const sFocus = Math.min((w - safe.left - safe.right - 2 * d) / Fo.w, Math.max(1, bottom - top - 2 * d) / Fo.h);
  let s = Math.min(sCover, sFocus);

  // Across: cover centred on the focus box, or (narrower than the window) the crop centred.
  const placeX = (sc: number): number => {
    if (C.w * sc >= w + 2 * d) return clamp(w / 2 - (Fo.x + Fo.w / 2) * sc, w + d - (C.x + C.w) * sc, -d - C.x * sc);
    return (w - C.w * sc) / 2 - C.x * sc;
  };
  let ox = placeX(s);
  if (base.kind === 'desktop' && base.menuBox) {
    // The wheel's left edge (drifting left by d) right of the menu block.
    const right = base.menuBox.left + base.menuBox.width + MENU_CLEAR + d;
    if (ox + Wh.x * s < right) {
      // Larger, while the focus box still fits, so the crop still reaches the window's right edge.
      const sRight = (w + d - right) / (C.x + C.w - Wh.x);
      if (sRight > s) s = Math.min(sRight, sFocus);
      ox = right - Wh.x * s;
    }
  }

  // Down: cover centred on the focus box in the band (or, shorter than the window, the crop's top at the window's
  // top); then the focus box inside the band, which wins over the cover (phones: a fill shows under the menu or, on
  // a short band, over the top).
  const hug = -d - C.y * s;
  let oy = C.h * s >= h + 2 * d ? clamp((top + bottom) / 2 - (Fo.y + Fo.h / 2) * s, h + d - (C.y + C.h) * s, hug) : hug;
  oy = Math.max(top + d / 2 - Fo.y * s, Math.min(oy, bottom - d / 2 - (Fo.y + Fo.h) * s));

  // The name: one line on the wide framing while it keeps a readable size, else stacked.
  const fitW = w - safe.left - safe.right - 2 * NAME_SIDE;
  const font = (k: TitleKind): number => Math.max(0, Math.min((T.h * s) / TITLE_EM[k].h, Math.min(fitW, T.w * s) / TITLE_EM[k].w));
  const kind: TitleKind = framing === 'wide' && font('line') >= LINE_MIN_FONT ? 'line' : 'stack';
  let f = font(kind);
  const nameTop = safe.top + NAME_TOP;
  const hub = oy + (Wh.y + Wh.h / 2) * s - d / 2;
  let ty = Math.max(nameTop, oy + (T.y + T.h / 2) * s - (f * TITLE_EM[kind].h) / 2);
  // Above the wheel's hub: smaller when it would reach it.
  if (ty + f * TITLE_EM[kind].h > hub - HUB_GAP) {
    f = Math.max(0, Math.min(f, (hub - HUB_GAP - ty) / TITLE_EM[kind].h));
    ty = Math.max(nameTop, Math.min(ty, hub - HUB_GAP - f * TITLE_EM[kind].h));
  }
  const tw = f * TITLE_EM[kind].w;
  const th = f * TITLE_EM[kind].h;
  const left = safe.left + NAME_SIDE;
  const tx = clamp(ox + (T.x + T.w / 2) * s - tw / 2, left, Math.max(left, w - safe.right - NAME_SIDE - tw));

  const at = (r: Rect): Rect => ({ x: ox + r.x * s, y: oy + r.y * s, w: r.w * s, h: r.h * s });
  return { base, framing, s, ox, oy, shown: at(C), focus: at(Fo), wheel: at(Wh), title: { kind, font: f, x: tx, y: ty, w: tw, h: th }, drift: d };
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isFile = (v: unknown): v is string => typeof v === 'string' && /^[\w.-]+$/.test(v) && !v.startsWith('.');
const isRect = (r: unknown): r is Rect => {
  const o = r as Partial<Rect> | null;
  return !!o && typeof o === 'object' && isNum(o.x) && isNum(o.y) && isNum(o.w) && isNum(o.h) && o.w > 0 && o.h > 0;
};
const inside = (a: Rect, b: Rect): boolean => a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;

/** Decoded RGBA bytes per framing (its one file). */
export function coverDecoded(idx: CoverIndex): { wide: number; tall: number } {
  return { wide: idx.wide.w * idx.wide.h * 4, tall: idx.tall.w * idx.tall.h * 4 };
}

/** The index read from `title/index.json`, or an Error naming what is wrong (sizes over the caps included). */
export function checkCoverIndex(raw: unknown): CoverIndex | Error {
  const o = raw as Partial<CoverIndex> | null;
  if (!o || typeof o !== 'object') return new Error('cover index: not an object');
  if (o.format !== 'cover/1') return new Error(`cover index: format ${String(o.format)} is not cover/1`);
  for (const f of ['wide', 'tall'] as const) {
    const F = o[f] as Partial<CoverFraming> | undefined;
    if (!F || typeof F !== 'object') return new Error(`cover index: ${f} missing`);
    if (!isFile(F.file)) return new Error(`cover index: ${f} file name`);
    if (!isNum(F.w) || !isNum(F.h) || !Number.isInteger(F.w) || !Number.isInteger(F.h) || F.w <= 0 || F.h <= 0) return new Error(`cover index: ${f} has no size`);
    const cap = COVER_MAX[f];
    // The tall framing may use the wide file (cropped) until a tall poster exists: either cap holds.
    const fits = (c: { w: number; h: number }): boolean => (F.w as number) <= c.w && (F.h as number) <= c.h;
    if (!fits(cap) && !(f === 'tall' && fits(COVER_MAX.wide))) return new Error(`cover index: ${f} is ${F.w}x${F.h}, over ${cap.w}x${cap.h}`);
    if (F.w * F.h * 4 > COVER_DECODED_MAX) return new Error(`cover index: ${f} decodes to ${F.w * F.h * 4} bytes, over ${COVER_DECODED_MAX}`);
    const file: Rect = { x: 0, y: 0, w: F.w, h: F.h };
    for (const k of ['crop', 'focus', 'wheel', 'title', 'lights'] as const) if (!isRect(F[k])) return new Error(`cover index: ${f} ${k} is not a box`);
    const { crop, focus, wheel, title, lights } = F as CoverFraming;
    if (!inside(crop, file)) return new Error(`cover index: ${f} crop outside the file`);
    if (!inside(focus, crop)) return new Error(`cover index: ${f} focus outside the crop`);
    if (!inside(wheel, focus)) return new Error(`cover index: ${f} wheel outside the focus box`);
    if (!inside(title, crop)) return new Error(`cover index: ${f} title anchor outside the crop`);
    if (!inside(lights, file)) return new Error(`cover index: ${f} lights outside the file`);
    if (title.y + title.h > wheel.y + wheel.h / 2) return new Error(`cover index: ${f} title anchor reaches below the wheel's hub`);
    if (f === 'wide' && crop.w <= crop.h) return new Error('cover index: wide crop is not wider than tall');
  }
  return o as CoverIndex;
}
