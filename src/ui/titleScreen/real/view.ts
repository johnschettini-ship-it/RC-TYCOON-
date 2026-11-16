/**
 * The realistic title screen's picture (VITE_ART=real build with the realistic look only; spec
 * `2026-11-16-realistic-title-and-cards-design.md`). `title.ts` keeps design E's menu, plate, sheet and focus rules and
 * hands this module the scene and the name: one canvas over the whole title, under the veil and the menu, that draws
 * the three baked layers (sky, park with the big wheel's 8-frame sprite, foreground) with a slow parallax drift, the
 * fills above and below it (the sky's top row and the lawn's bottom row stretched to the window's edges) and the name sign. The heading keeps the name as visually hidden text.
 *
 * - The title shows at once over a sky gradient (CSS); the panorama fades in when decoded. A slow or failed download
 *   leaves the gradient and the menu, with no error shown.
 * - `show` releases the park's art first (`releasePark`), then decodes the title art; `hide` (a park opens) closes every
 *   title bitmap and empties the canvas. While the title covers the window the renderer draws no park (`titleHolds`).
 * - A rotation keeps the old framing on screen until the new one is decoded (no blank frame): for that moment both
 *   framings are decoded (about 41 MB with the baked art: wide 23.27 MB + tall 18.11 MB, over the 24 MB cap of one framing;
 *   accepted by the review), then the old is closed.
 * - Reduced motion: no drift, the wheel stands still. A change while the title shows (the setting, or the system's
 *   `prefers-reduced-motion`, both applied as the `tc-rm` class on the document by `src/a11y`) takes effect at once.
 * - The title element hidden by someone else (the stage 1 bench hides `.title-screen` while it measures a park) counts
 *   as closed: the title bitmaps are closed and the frame loop stops; shown again, the park is released first and the
 *   title art decoded again.
 */
import { displayPrefs } from '../../../a11y/prefs';
import { releasePark, setTitleHold } from '../../../render/real/titleHold';
import type { TitleLayoutInput } from '../layout';
import { realTitleLayout, type RealTitleLayout } from './layout';
import { createTitleSession, loadTitleArt } from './load';

/** Where the baked title pictures live, relative to the page. */
export const TITLE_ART_BASE = 'art/real/title/';
/** One drift cycle (all layers in step, each with its own amplitude), ms. */
const DRIFT_MS = 24_000;
/** One wheel frame, ms. */
const WHEEL_FRAME_MS = 140;
/** The canvas redraws at most this often while it moves, ms. */
const FRAME_MS = 50;
/** Most canvas px per CSS px (the phone render rule). */
const MAX_DENSITY = 2;

export interface RealTitle {
  show(): void;
  hide(): void;
  /** The window and menu changed: place the picture again (draws at once, no blank frame). */
  place(input: TitleLayoutInput): void;
}

const STYLE_ID = 'tc-real-title-style';
const CSS = `
.title-screen[data-art='real'] {
  background: linear-gradient(180deg, #5b86c4 0%, #9dbbe0 34%, #f1d3a6 62%, #e9b47d 74%, #7d8f58 86%, #4f6a3c 100%);
}
.title-screen[data-art='real'] .title-real-scene {
  position: absolute; left: 0; top: 0; width: 100%; height: 100%; display: block; max-width: none;
  pointer-events: none; opacity: 0; transition: opacity 450ms ease-out;
}
.title-screen[data-art='real'] .title-real-scene[data-ready] { opacity: 1; }
@media (prefers-reduced-motion: reduce) {
  .title-screen[data-art='real'] .title-real-scene { transition: none; }
}
`;

function injectStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = CSS;
  document.head.appendChild(s);
}

/** Colours across a softened edge row (the fills above and below the picture). */
const ROW_SAMPLES = 48;
const edgeCache = new WeakMap<object, { top: HTMLCanvasElement; bottom: HTMLCanvasElement } | null>();
/** The sky's top row and the picture's bottom row (sky, park, foreground), each softened to ROW_SAMPLES px; null when no 2D canvas. */
function edgeRows(art: { sky: ImageBitmap; park: ImageBitmap; front: ImageBitmap }): { top: HTMLCanvasElement; bottom: HTMLCanvasElement } | null {
  if (edgeCache.has(art)) return edgeCache.get(art) ?? null;
  let out: { top: HTMLCanvasElement; bottom: HTMLCanvasElement } | null = null;
  try {
    const make = (layers: ImageBitmap[], top: boolean): HTMLCanvasElement | null => {
      const c = document.createElement('canvas');
      c.width = ROW_SAMPLES;
      c.height = 1;
      const x = c.getContext('2d');
      if (!x) return null;
      x.imageSmoothingEnabled = true;
      x.imageSmoothingQuality = 'high';
      for (const b of layers) x.drawImage(b, 0, top ? 0 : b.height - 1, b.width, 1, 0, 0, ROW_SAMPLES, 1);
      return c;
    };
    const top = make([art.sky], true);
    const bottom = make([art.sky, art.park, art.front], false);
    out = top && bottom ? { top, bottom } : null;
  } catch {
    out = null;
  }
  edgeCache.set(art, out);
  return out;
}

export function createRealTitle(el: HTMLElement, logo: HTMLElement, sceneLabel: string, name: string): RealTitle {
  injectStyle();
  el.setAttribute('data-art', 'real');
  // The name as visually hidden text: the sign is a picture on the canvas.
  logo.classList.add('sr-only');
  logo.textContent = name;
  const canvas = document.createElement('canvas');
  canvas.className = 'title-real-scene';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', sceneLabel);
  canvas.width = 0;
  canvas.height = 0;
  el.prepend(canvas);
  const ctx = canvas.getContext('2d');

  /** The title is open (`show` … `hide`); its art lives while it is open and its element is not hidden. */
  let isOpen = false;
  let live = false;
  let input: TitleLayoutInput | null = null;
  let lay: RealTitleLayout | null = null;
  let reduced = displayPrefs().reducedMotion;
  let raf = 0;
  let lastDraw = -Infinity;

  const session = createTitleSession({
    load: () => loadTitleArt(TITLE_ART_BASE),
    releasePark,
    changed: () => refresh(),
  });
  setTitleHold(() => isOpen && !el.hidden);

  const stopLoop = (): void => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  };
  /** Opens the title art when the title is open and shown, closes it otherwise. */
  const sync = (): void => {
    const want = isOpen && !el.hidden;
    if (want === live) return;
    live = want;
    if (want) session.open();
    else {
      stopLoop();
      session.close();
      clear();
    }
  };
  /** Layout, a frame and the loop again (window, art or reduced motion changed). */
  const refresh = (): void => {
    relayout();
    draw(performance.now());
    loop();
  };
  if (typeof MutationObserver === 'function') {
    // Someone else hiding or showing the title (the bench).
    new MutationObserver(sync).observe(el, { attributes: true, attributeFilter: ['hidden'] });
    // Reduced motion switched while the title shows.
    new MutationObserver(() => {
      if (live && displayPrefs().reducedMotion !== reduced) refresh();
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  }

  const relayout = (): void => {
    const art = session.current();
    const idx = session.index();
    reduced = displayPrefs().reducedMotion;
    lay = art && idx && input ? realTitleLayout({ ...input, reducedMotion: reduced, framing: art.framing }, idx) : null;
    // The plate and sheet stop under the name (design E's `--tl-name-bottom`, set by title.ts's `place` in the classic
    // look): the sign's bottom edge, or the safe top while no sign shows. Without it their max-height is invalid and a
    // tall view (the scenario list) grows past the window top, out of reach.
    if (input) el.style.setProperty('--tl-name-bottom', `${lay ? lay.signBox.y + lay.signBox.h : (input.safe?.top ?? 0)}px`);
    if (input) session.want(input.h > input.w ? 'tall' : 'wide');
  };

  const clear = (): void => {
    canvas.removeAttribute('data-ready');
    canvas.width = 0;
    canvas.height = 0;
  };

  const draw = (now: number): void => {
    const art = session.current();
    const idx = session.index();
    if (!ctx || !art || !idx || !lay || !input) {
      clear();
      return;
    }
    lastDraw = now;
    const { w, h } = input;
    const k = Math.min(Math.max(1, 1 / lay.s), Math.min(MAX_DENSITY, Math.max(1, window.devicePixelRatio || 1)));
    const bw = Math.max(1, Math.round(w * k));
    const bh = Math.max(1, Math.round(h * k));
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    ctx.setTransform(bw / w, 0, 0, bh / h, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const phase = reduced ? 0 : Math.sin((2 * Math.PI * now) / DRIFT_MS);
    const P = lay.picture;
    const dPark = lay.drift.park * phase;
    ctx.drawImage(art.sky, P.x + lay.drift.sky * phase, P.y, P.w, P.h);
    ctx.drawImage(art.park, P.x + dPark, P.y, P.w, P.h);
    // The wheel: one frame of its sprite (a row of frames, or a column), on the park layer.
    const W = idx[art.framing].wheel;
    const f = reduced ? 0 : Math.floor(now / WHEEL_FRAME_MS) % W.frames;
    const across = art.wheel.width >= W.fw * W.frames;
    ctx.drawImage(art.wheel, across ? f * W.fw : 0, across ? 0 : f * W.fh, W.fw, W.fh, lay.wheel.x + dPark, lay.wheel.y, lay.wheel.w, lay.wheel.h);
    ctx.drawImage(art.front, P.x + lay.drift.front * phase, P.y, P.w, P.h);
    // The fills: the sky's top row stretched up to the window top, the picture's bottom row (all layers) stretched down
    // to the window bottom (the lawn continues). Each row is first softened to ROW_SAMPLES colours across, so a stretched
    // row shows smooth colour, not streaks of single pixels. Half a px into the picture: no seam.
    const rows = edgeRows(art);
    if (rows && lay.fillAbove.h > 0) ctx.drawImage(rows.top, 0, 0, ROW_SAMPLES, 1, P.x + lay.drift.sky * phase, 0, P.w, lay.fillAbove.h + 0.5);
    if (rows && lay.fill.h > 0) ctx.drawImage(rows.bottom, 0, 0, ROW_SAMPLES, 1, P.x + dPark, lay.fill.y - 0.5, P.w, h - lay.fill.y + 0.5);
    ctx.drawImage(lay.sign === 'line' ? art.line : art.stack, lay.signBox.x, lay.signBox.y, lay.signBox.w, lay.signBox.h);
    // The places of what the canvas shows, CSS px, for the layout checks (e2e).
    const F = idx[art.framing];
    const r = (v: number): string => v.toFixed(1);
    const box = (b: { x: number; y: number; w: number; h: number }): string => [b.x, b.y, b.w, b.h].map(r).join(',');
    canvas.dataset.framing = art.framing;
    canvas.dataset.picture = box(P);
    canvas.dataset.wheel = box({ x: lay.wheel.x - lay.drift.park, y: lay.wheel.y, w: lay.wheel.w + 2 * lay.drift.park, h: lay.wheel.h });
    canvas.dataset.sign = `${lay.sign}:${box(lay.signBox)}`;
    canvas.dataset.nameRow = r(P.y + Math.min(F.nameRow, F.wheel.y) * lay.s);
    canvas.dataset.anchor = r(P.x + F.menuAnchorX * lay.s - lay.drift.park);
    canvas.setAttribute('data-ready', '');
  };

  /** Drift and wheel: a frame every FRAME_MS while the title shows its art (none with reduced motion). */
  const loop = (): void => {
    if (raf || !live || reduced || !session.current()) return;
    const tick = (now: number): void => {
      raf = 0;
      // Reduced motion may have been switched on by refresh() since the last tick: stop drawing.
      if (!live || reduced || !session.current()) return;
      if (displayPrefs().reducedMotion !== reduced) {
        relayout();
        draw(now);
        if (reduced) return;
      } else if (now - lastDraw >= FRAME_MS) draw(now);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  };

  return {
    show() {
      isOpen = true;
      sync();
    },
    hide() {
      isOpen = false;
      sync();
    },
    place(next) {
      input = next;
      refresh();
    },
  };
}
