/**
 * The realistic title screen's picture (VITE_ART=real build with the realistic look only; spec
 * `2026-11-16-realistic-title-and-cards-design.md`). `title.ts` keeps design E's menu, plate, sheet and focus rules and
 * hands this module the scene and the name: one canvas over the whole title, under the veil and the menu, that draws
 * the three baked layers (sky, park with the big wheel's 8-frame sprite, foreground) with a slow parallax drift, the
 * gradient fill under the picture and the name sign. The heading keeps the name as visually hidden text.
 *
 * - The title shows at once over a sky gradient (CSS); the panorama fades in when decoded. A slow or failed download
 *   leaves the gradient and the menu, with no error shown.
 * - `show` releases the park's art first (`releasePark`), then decodes the title art; `hide` (a park opens) closes every
 *   title bitmap and empties the canvas. While the title covers the window the renderer draws no park (`titleHolds`).
 * - A rotation keeps the old framing on screen until the new one is decoded (no blank frame): for that moment both
 *   framings are decoded (about 32 MB, over the 24 MB of one framing; accepted by the review), then the old is closed.
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
import { createTitleSession, loadTitleArt, type FramingArt } from './load';

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

/** The average colour of the picture's bottom row (park under foreground): where the gradient fill starts. */
function bottomColour(art: FramingArt): [number, number, number] {
  try {
    const c = document.createElement('canvas');
    c.width = 1;
    c.height = 1;
    const x = c.getContext('2d', { willReadFrequently: true });
    if (!x) return [79, 106, 60];
    for (const b of [art.park, art.front]) x.drawImage(b, 0, b.height - 1, b.width, 1, 0, 0, 1, 1);
    const d = x.getImageData(0, 0, 1, 1).data;
    return [d[0] ?? 79, d[1] ?? 106, d[2] ?? 60];
  } catch {
    return [79, 106, 60];
  }
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
  const fills = new WeakMap<FramingArt, string[]>();

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
    if (lay.fill.h > 0) {
      let stops = fills.get(art);
      if (!stops) {
        const [r, g, b] = bottomColour(art);
        stops = [`rgb(${r} ${g} ${b})`, `rgb(${Math.round(r * 0.62)} ${Math.round(g * 0.62)} ${Math.round(b * 0.62)})`];
        fills.set(art, stops);
      }
      const grad = ctx.createLinearGradient(0, lay.fill.y, 0, h);
      grad.addColorStop(0, stops[0] as string);
      grad.addColorStop(1, stops[1] as string);
      ctx.fillStyle = grad;
      // Half a px up: no seam between the picture and the fill.
      ctx.fillRect(0, lay.fill.y - 0.5, w, lay.fill.h + 0.5);
    }
    ctx.drawImage(lay.sign === 'line' ? art.line : art.stack, lay.signBox.x, lay.signBox.y, lay.signBox.w, lay.signBox.h);
    // The places of what the canvas shows, CSS px, for the layout checks (e2e).
    const F = idx[art.framing];
    const r = (v: number): string => v.toFixed(1);
    const box = (b: { x: number; y: number; w: number; h: number }): string => [b.x, b.y, b.w, b.h].map(r).join(',');
    canvas.dataset.framing = art.framing;
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
