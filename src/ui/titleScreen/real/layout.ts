/**
 * Layout of the realistic title screen (VITE_ART=real build only; spec `2026-11-16-realistic-title-and-cards-design.md`,
 * builder-check answer 1): where the baked panorama, its big-wheel sprite and the name sign go, from the window size,
 * the measured menu height and the title index (`art/real/title/index.json`, baked by `tools/art3d`). Pure, no DOM.
 *
 * It keeps design E's intent (`../layout.ts`, rules G1–G15 of `phase-7-title-screen.md`), re-derived for a picture
 * that scales smoothly (any scale, not whole numbers):
 * - The menu is design E's menu: `base` is `titleLayout` of the same input, used as is for the menu, plate and sheet.
 * - Framing: tall when the window is taller than wide, else wide.
 * - The picture covers the window's width (plus the drift on each side) and reaches down to the window bottom on the
 *   desktop, or to just under the menu's top edge on phones and low windows, where a gradient fill takes over below
 *   it. On the desktop only, the wheel (`menuAnchorX`, its left edge) stays right of the menu block, drift included:
 *   phones and low windows have the menu across the bottom, under the picture's bottom edge (it covers at most the
 *   24 px the picture runs under it), so there is no side to keep clear.
 * - The name sign sits in the sky above the ride tops (the higher of `nameRow` and the wheel's top) and inside the safe area: if it does
 *   not fit, the picture moves down (a little), then the sign gets smaller (to half), then the picture moves on down.
 * - Reduced motion: no drift.
 */
import { titleLayout, type SafeInsets, type TitleLayout, type TitleLayoutInput } from '../layout';

export type Framing = 'wide' | 'tall';
export type SignKind = 'line' | 'stack';

/** The big wheel: an 8-frame sprite (one row of frames, or one column) placed on the park layer, layer px. */
export interface TitleWheel {
  file: string;
  frames: number;
  fw: number;
  fh: number;
  x: number;
  y: number;
}
/** One framing of the panorama: three layers of w × h layer px. */
export interface FramingIndex {
  w: number;
  h: number;
  layers: { sky: string; park: string; front: string };
  wheel: TitleWheel;
  /** The top of the tallest ride, layer px: the name sits above it. */
  nameRow: number;
  /** The x the desktop menu must not cover (the wheel's left edge), layer px. Desktop only (see the file comment). */
  menuAnchorX: number;
}
export interface SignPicture {
  file: string;
  w: number;
  h: number;
}
/** `art/real/title/index.json` (file names relative to `title/`). */
export interface TitleIndex {
  wide: FramingIndex;
  tall: FramingIndex;
  sign: { line: SignPicture; stack: SignPicture };
}

/** The wheel turns in this many baked pictures (spec §Title). */
export const WHEEL_FRAMES = 8;
/** Largest layers the title may ship (spec §Sizes). */
export const TITLE_LAYER_MAX: Readonly<Record<Framing, { w: number; h: number }>> = { wide: { w: 1920, h: 800 }, tall: { w: 900, h: 1300 } };

export interface RealTitleInput extends TitleLayoutInput {
  /** No drift (prefers-reduced-motion or the setting). */
  reducedMotion?: boolean;
  /** Lay out this framing whatever the window's shape (the other framing still decoding: no blank frame). */
  framing?: Framing;
}
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface RealTitleLayout {
  /** Design E's layout of the same input: the menu, the plate and the sheet. */
  base: TitleLayout;
  framing: Framing;
  /** CSS px per layer px (any number). */
  s: number;
  /** The picture's box, CSS px (layers at rest). */
  picture: Rect;
  /** The gradient fill from the picture's bottom edge to the window bottom (h 0 when none). */
  fill: Rect;
  sign: SignKind;
  signS: number;
  signBox: Rect;
  /** One wheel frame's box at rest (it drifts with the park layer). */
  wheel: Rect;
  /** Drift amplitude of each layer, CSS px (0 with reduced motion). */
  drift: { sky: number; park: number; front: number };
}

const NO_INSETS: SafeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
/** The name: at least 12 px from the safe top, 8 px above the ride tops, 16 px from the safe sides. */
const NAME_TOP = 12;
const NAME_GAP = 8;
const NAME_SIDE = 16;
/** The one-line sign is used while it keeps at least this share of the picture's scale; else the stacked one. */
const LINE_MIN_SHARE = 0.6;
/** The sign may shrink to this share of its first scale before the picture moves further down. */
const SIGN_MIN_SHARE = 0.5;
/** How far the picture may move down for the name before the sign shrinks, as a share of its height. */
const MOVE_SHARE = 0.15;
/** Phones and low windows: the picture runs this far under the menu's top edge. */
const UNDER_MENU = 24;
/** Desktop: free space between the menu block's right edge and the wheel. */
const MENU_CLEAR = 16;
/** Drift amplitudes, CSS px: the sky least, the foreground most (parallax). */
export const DRIFT = { sky: 2, park: 4, front: 8 } as const;

export function realTitleLayout(input: RealTitleInput, idx: TitleIndex): RealTitleLayout {
  const { w, h, menuH } = input;
  const safe = input.safe ?? NO_INSETS;
  const sw = w - safe.left - safe.right;
  const base = titleLayout(input);
  const framing: Framing = input.framing ?? (h > w ? 'tall' : 'wide');
  const F = idx[framing];
  const drift = input.reducedMotion ? { sky: 0, park: 0, front: 0 } : { ...DRIFT };
  const d = Math.max(drift.sky, drift.park, drift.front);

  // The picture's bottom edge: the window bottom on the desktop, a little under the menu's top edge elsewhere.
  const bottom = base.kind === 'desktop' ? h : Math.min(h, h - base.mb - menuH + UNDER_MENU);
  let s = Math.max((w + 2 * d) / F.w, bottom / F.h);
  let x: number;
  if (base.kind === 'desktop' && base.menuBox && F.menuAnchorX > 0 && F.menuAnchorX < F.w) {
    // The wheel's left edge (drifting left by the park's drift) stays right of the menu block; the picture still covers
    // both sides of the window.
    const right = base.menuBox.left + base.menuBox.width + MENU_CLEAR + drift.park;
    s = Math.max(s, (right + d) / F.menuAnchorX, (w + d - right) / (F.w - F.menuAnchorX));
    x = Math.max((w - F.w * s) / 2, right - F.menuAnchorX * s);
  } else x = (w - F.w * s) / 2;
  let y = bottom - F.h * s;

  // The sign: the one-line board on wide framings while it keeps its size, else the stacked board; never wider than
  // the safe width less its sides, never larger than the picture's own scale (same bake density).
  const fit = (k: SignKind): number => Math.min(s, (sw - 2 * NAME_SIDE) / idx.sign[k].w);
  const sign: SignKind = framing === 'wide' && fit('line') >= LINE_MIN_SHARE * s ? 'line' : 'stack';
  const S = idx.sign[sign];
  let signS = Math.max(0, fit(sign));
  const nameTop = NAME_TOP + safe.top;
  // The ride tops: `nameRow`, or the wheel's top when it stands higher (the sign never covers the wheel).
  const rideTop = (): number => y + Math.min(F.nameRow, F.wheel.y) * s;
  const missing = (): number => nameTop + S.h * signS + NAME_GAP - rideTop();
  if (missing() > 0) y += Math.min(missing(), MOVE_SHARE * F.h * s);
  if (missing() > 0) signS = Math.max(signS * SIGN_MIN_SHARE, (rideTop() - NAME_GAP - nameTop) / S.h);
  if (missing() > 0) y += missing();
  const signW = S.w * signS;
  const signH = S.h * signS;
  const signBox: Rect = { x: safe.left + (sw - signW) / 2, y: Math.max(nameTop, (rideTop() - signH) / 2), w: signW, h: signH };

  const picture: Rect = { x, y, w: F.w * s, h: F.h * s };
  const fillTop = picture.y + picture.h;
  return {
    base,
    framing,
    s,
    picture,
    fill: { x: 0, y: fillTop, w, h: Math.max(0, h - fillTop) },
    sign,
    signS,
    signBox,
    wheel: { x: x + F.wheel.x * s, y: y + F.wheel.y * s, w: F.wheel.fw * s, h: F.wheel.fh * s },
    drift,
  };
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isFile = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && !v.includes('..') && !v.startsWith('/');

/** The index read from `title/index.json`, or an Error naming what is wrong (sizes over the caps included). */
export function checkTitleIndex(raw: unknown): TitleIndex | Error {
  const o = raw as Partial<TitleIndex> | null;
  if (!o || typeof o !== 'object') return new Error('title index: not an object');
  for (const f of ['wide', 'tall'] as const) {
    const F = o[f] as Partial<FramingIndex> | undefined;
    const cap = TITLE_LAYER_MAX[f];
    if (!F || !isNum(F.w) || !isNum(F.h) || F.w <= 0 || F.h <= 0) return new Error(`title index: ${f} has no size`);
    if (F.w > cap.w || F.h > cap.h) return new Error(`title index: ${f} is ${F.w}x${F.h}, over ${cap.w}x${cap.h}`);
    const L = F.layers;
    if (!L || !isFile(L.sky) || !isFile(L.park) || !isFile(L.front)) return new Error(`title index: ${f} layers`);
    const W = F.wheel;
    if (!W || !isFile(W.file) || W.frames !== WHEEL_FRAMES || !isNum(W.fw) || !isNum(W.fh) || !isNum(W.x) || !isNum(W.y) || W.fw <= 0 || W.fh <= 0) return new Error(`title index: ${f} wheel`);
    if (!isNum(F.nameRow) || F.nameRow < 0 || F.nameRow > F.h) return new Error(`title index: ${f} nameRow`);
    if (!isNum(F.menuAnchorX) || F.menuAnchorX < 0 || F.menuAnchorX > F.w) return new Error(`title index: ${f} menuAnchorX`);
  }
  for (const k of ['line', 'stack'] as const) {
    const S = o.sign?.[k];
    if (!S || !isFile(S.file) || !isNum(S.w) || !isNum(S.h) || S.w <= 0 || S.h <= 0) return new Error(`title index: sign ${k}`);
  }
  return o as TitleIndex;
}
