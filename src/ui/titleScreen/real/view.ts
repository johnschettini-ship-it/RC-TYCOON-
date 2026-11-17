/**
 * The realistic title screen's cover (VITE_ART=real build with the realistic look only): the owner's illustrated fair
 * poster (`art/real/title/`, cover index in `layout.ts`) with the name as real text in Fredoka over its sky. `title.ts`
 * keeps design E's menu, plate, sheet and focus rules and hands this module the scene and the name: one canvas over the
 * whole title, under the veil and the menu, draws the poster (object-fit cover on the focus box, `layout.ts`), the
 * fills where the poster does not reach the window's edge, a slow drift of a few px and the twinkling bulbs. The name
 * is the heading itself, styled like the approved mocks (yellow "Thrills", coral "&", light-blue "Chills", a brown
 * outline and a warm glow): sharp at any size and read by screen readers.
 *
 * - The title shows at once over a sky-coloured fill (CSS), the name with it; the poster fades in when decoded. A slow
 *   or failed download leaves the fill, the name and the menu, with no error shown.
 * - `show` releases the park's art first (`releasePark`), then decodes the poster; `hide` closes every title bitmap and
 *   empties the canvas. While the title covers the window the renderer draws no park (`titleHolds`).
 * - `leave` (a park opens; title-to-play bridge §1): the push through the arch (`push.ts`). The park draws under the
 *   title from its first frame; the poster zooms into the arch, the menu and the name fade, the title layer dissolves,
 *   then the title hides, every title bitmap is closed and `arrived` (`../../bridge/arrival.ts`) starts the glow and
 *   the welcome card. A tap or a key skips it; with reduced motion it is a 300 ms cross-fade. Shown again mid-push,
 *   the title stops the push and stays, its poster still decoded.
 * - A rotation keeps the old framing on screen until the new one is decoded (no blank frame), then closes the old.
 * - Reduced motion: no drift and no twinkle (no frame loop at all). A change while the title shows (the setting, or the
 *   system's `prefers-reduced-motion`, both applied as the `tc-rm` class on the document by `src/a11y`) takes effect
 *   at once.
 * - The title element hidden by someone else (the stage 1 bench hides `.title-screen` while it measures a park) counts
 *   as closed: the title bitmaps are closed and the frame loop stops; shown again, the park is released first and the
 *   poster decoded again.
 */
import { displayPrefs } from '../../../a11y/prefs';
import { releasePark, setTitleHold } from '../../../render/real/titleHold';
import type { TitleLayoutInput } from '../layout';
import { findBulbs, type Bulb } from './bulbs';
import { coverLayout, TITLE_EM, type CoverLayout, type Framing, type TitleKind } from './layout';
import { createTitleSession, loadTitleArt, type FramingArt } from './load';
import { startPush, type Push } from './push';
import { arrived } from '../../bridge/arrival';

/** Where the title pictures live, relative to the page. */
export const TITLE_ART_BASE = 'art/real/title/';
/** One drift cycle, ms. */
const DRIFT_MS = 24_000;
/** One bulb pulse, ms (each bulb at its own phase). */
const TWINKLE_MS = 2_600;
/** Brightest glow over a bulb (additive), and its radius in the poster's px. */
const GLOW_MAX = 0.55;
const GLOW_R = 7;
/** The canvas redraws at most this often while it moves, ms. */
const FRAME_MS = 50;
/** Most canvas px per CSS px (the phone render rule). */
const MAX_DENSITY = 2;
/** Bulbs are looked for on a copy at most this wide (once per decoded poster). */
const BULB_SCAN_W = 800;

export interface RealTitle {
  show(): void;
  hide(): void;
  /** A park opened behind the title: the push through the arch, then `hideTitle` (hides the element) and the art closed. */
  leave(hideTitle: () => void): void;
  /** The window and menu changed: place the picture again (draws at once, no blank frame). */
  place(input: TitleLayoutInput): void;
}

const STYLE_ID = 'tc-real-title-style';
/** The name's colours (the mocks); contrast to the outline is checked in the tests (at least 4.5:1). */
export const TITLE_COLOURS = { thrills: '#ffd76e', amp: '#ffa184', chills: '#aee8f8', outline: '#4a230c' } as const;
/**
 * The style. Built when the title is made, not at module level: a top-level call would keep this module in the website
 * build (it must stay byte-identical). The name's outline is a ring of shadows (works on every browser, unlike
 * paint-order on HTML text).
 */
const css = (): string => {
  const ring = Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * 2 * Math.PI;
    return `${(Math.cos(a) * 0.06).toFixed(3)}em ${(Math.sin(a) * 0.06).toFixed(3)}em 0 var(--tr-outline)`;
  }).join(', ');
  return `
.title-screen[data-art='real'] {
  background: linear-gradient(180deg, #4f4f7b 0%, #6d5a86 22%, #d9705e 46%, #f39a4c 62%, #f7c25e 72%, #3d2d3a 86%, #2a2029 100%);
}
.title-screen[data-art='real'] .title-real-scene {
  position: absolute; left: 0; top: 0; width: 100%; height: 100%; display: block; max-width: none;
  pointer-events: none; opacity: 0; transition: opacity 450ms ease-out;
}
.title-screen[data-art='real'] .title-real-scene[data-ready] { opacity: 1; }
.title-screen[data-art='real'] .title-logo {
  --tr-outline: ${TITLE_COLOURS.outline};
  left: var(--tr-title-x, 16px); top: var(--tr-title-y, 12px); width: var(--tr-title-w, auto);
  font-family: 'Fredoka', system-ui, sans-serif; font-weight: 600; font-size: var(--tr-title-font, 48px);
  line-height: 1; letter-spacing: 0.01em; text-align: center; white-space: nowrap;
  color: ${TITLE_COLOURS.thrills};
  text-shadow: ${ring}, 0 0.09em 0 var(--tr-outline), 0 0 0.35em rgba(255, 196, 110, 0.75), 0 0 0.8em rgba(255, 150, 70, 0.45);
  padding: 0.06em 0;
  pointer-events: none; user-select: none;
}
.title-screen[data-art='real'] .title-logo .tr-amp { color: ${TITLE_COLOURS.amp}; }
.title-screen[data-art='real'] .title-logo .tr-chills { color: ${TITLE_COLOURS.chills}; }
.title-screen[data-art='real'] .title-logo[data-kind='stack'] .tr-word { display: block; }
.title-screen[data-art='real'] .title-logo[data-kind='stack'] .tr-amp { font-size: 0.6em; line-height: 0.9; }
@media (prefers-reduced-motion: reduce) {
  .title-screen[data-art='real'] .title-real-scene { transition: none; }
}
.title-screen[data-art='real'].tc-leaving { cursor: default; }
.title-screen[data-art='real'].tc-leaving > :not(.title-real-scene) { opacity: var(--tr-ui, 0); transition: none; }
.title-screen[data-art='real'].tc-leaving .title-real-scene { transition: none; will-change: transform; }
`;
};

function injectStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = css();
  document.head.appendChild(s);
}

/** The name as three coloured words ("Thrills", "&", "Chills"); one word when it has no "&". */
function nameWords(name: string): HTMLElement[] {
  const at = name.indexOf('&');
  const word = (t: string, cls: string): HTMLElement => {
    const s = document.createElement('span');
    s.className = `tr-word ${cls}`;
    s.textContent = t;
    return s;
  };
  if (at < 0) return [word(name, 'tr-thrills')];
  return [word(name.slice(0, at).trim(), 'tr-thrills'), word('&', 'tr-amp'), word(name.slice(at + 1).trim(), 'tr-chills')];
}

/** Colours across a softened edge (the fills beside the poster). */
const EDGE_SAMPLES = 48;
/** Under the poster, its bottom row fades into the ground colour over this many CSS px. */
const BOTTOM_FADE = 56;
interface Edges {
  top: HTMLCanvasElement;
  bottom: HTMLCanvasElement;
  left: HTMLCanvasElement;
  right: HTMLCanvasElement;
  mean: string;
  /** The mean of the bottom row, darker: the plain ground under the poster. */
  ground: string;
}
interface Extras {
  edges: Edges | null;
  /** Bulbs in the poster file's px. */
  bulbs: Bulb[];
}
const extrasCache = new WeakMap<object, Extras>();
/** The crop's edge rows and columns (softened) and the bulbs, once per decoded poster. */
function extras(art: FramingArt, crop: { x: number; y: number; w: number; h: number }, lights: { x: number; y: number; w: number; h: number }): Extras {
  const hit = extrasCache.get(art);
  if (hit) return hit;
  let edges: Edges | null = null;
  let bulbs: Bulb[] = [];
  try {
    const strip = (sx: number, sy: number, sw: number, sh: number, across: boolean): HTMLCanvasElement | null => {
      const c = document.createElement('canvas');
      c.width = across ? EDGE_SAMPLES : 1;
      c.height = across ? 1 : EDGE_SAMPLES;
      const x = c.getContext('2d');
      if (!x) return null;
      x.imageSmoothingEnabled = true;
      x.imageSmoothingQuality = 'high';
      x.drawImage(art.poster, sx, sy, sw, sh, 0, 0, c.width, c.height);
      return c;
    };
    const top = strip(crop.x, crop.y, crop.w, 1, true);
    const bottom = strip(crop.x, crop.y + crop.h - 1, crop.w, 1, true);
    const left = strip(crop.x, crop.y, 1, crop.h, false);
    const right = strip(crop.x + crop.w - 1, crop.y, 1, crop.h, false);
    if (top && bottom && left && right) {
      const px = bottom.getContext('2d')?.getImageData(0, 0, EDGE_SAMPLES, 1).data;
      let r = 0;
      let g = 0;
      let b = 0;
      for (let i = 0; px && i < EDGE_SAMPLES; i++) {
        r += (px[i * 4] ?? 0) / EDGE_SAMPLES;
        g += (px[i * 4 + 1] ?? 0) / EDGE_SAMPLES;
        b += (px[i * 4 + 2] ?? 0) / EDGE_SAMPLES;
      }
      const c = (k: number): string => `rgb(${Math.round(r * k)}, ${Math.round(g * k)}, ${Math.round(b * k)})`;
      edges = { top, bottom, left, right, mean: c(1), ground: c(0.6) };
    }
    // The bulbs: on a copy at most BULB_SCAN_W wide, inside `lights`.
    const k = Math.min(1, BULB_SCAN_W / art.poster.width);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(art.poster.width * k));
    c.height = Math.max(1, Math.round(art.poster.height * k));
    const x = c.getContext('2d', { willReadFrequently: true });
    if (x) {
      x.drawImage(art.poster, 0, 0, c.width, c.height);
      const data = x.getImageData(0, 0, c.width, c.height).data;
      bulbs = findBulbs(data, c.width, c.height, { box: { x: lights.x * k, y: lights.y * k, w: lights.w * k, h: lights.h * k } }).map((b) => ({ ...b, x: (b.x + 0.5) / k, y: (b.y + 0.5) / k }));
      c.width = 0;
      c.height = 0;
    }
  } catch {
    // No 2D canvas (or a read refused): no fills beyond the mean colour, no twinkle.
  }
  const out = { edges, bulbs };
  extrasCache.set(art, out);
  return out;
}

let glowSprite: HTMLCanvasElement | null = null;
/** A soft warm dot (the bulb glow), drawn additively. */
function glow(): HTMLCanvasElement | null {
  if (glowSprite) return glowSprite;
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 32;
  const x = c.getContext('2d');
  if (!x) return null;
  const g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255, 236, 180, 1)');
  g.addColorStop(0.35, 'rgba(255, 200, 120, 0.55)');
  g.addColorStop(1, 'rgba(255, 170, 80, 0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 32, 32);
  glowSprite = c;
  return c;
}

export function createRealTitle(el: HTMLElement, logo: HTMLElement, sceneLabel: string, name: string): RealTitle {
  injectStyle();
  el.setAttribute('data-art', 'real');
  // The name as real text (the heading itself; its aria-label keeps the whole name as one phrase).
  logo.classList.remove('sr-only');
  logo.setAttribute('aria-label', name);
  logo.replaceChildren(...nameWords(name).flatMap((w, i) => (i === 0 ? [w] : [document.createTextNode(' '), w])));
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
  /** The push through the arch, while it runs (the art stays decoded; the park draws under the title). */
  let leaving: { push: Push; undo(): void } | null = null;
  let input: TitleLayoutInput | null = null;
  let lay: CoverLayout | null = null;
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
    const want = (isOpen || leaving !== null) && !el.hidden;
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

  /** Places the name; returns its bottom edge. */
  const setTitle = (kind: TitleKind, x: number, y: number, w: number, font: number): number => {
    logo.dataset.kind = kind;
    el.style.setProperty('--tr-title-x', `${x}px`);
    el.style.setProperty('--tr-title-y', `${y}px`);
    el.style.setProperty('--tr-title-w', `${w}px`);
    el.style.setProperty('--tr-title-font', `${font}px`);
    return y + font * TITLE_EM[kind].h;
  };

  const relayout = (): void => {
    if (!input) return;
    const idx = session.index();
    const wanted: Framing = input.h > input.w ? 'tall' : 'wide';
    reduced = displayPrefs().reducedMotion;
    // The layout of the framing on screen (or, while none is decoded, the one asked for: the name finds its place as
    // soon as the index is read).
    lay = idx ? coverLayout({ ...input, reducedMotion: reduced, framing: session.current()?.framing ?? wanted }, idx) : null;
    let bottom: number;
    if (lay) bottom = setTitle(lay.title.kind, lay.title.x, lay.title.y, lay.title.w, lay.title.font);
    else {
      // No index (yet, or a failed download): the name at the top, centred, over the sky fill.
      const safe = input.safe ?? { top: 0, right: 0, bottom: 0, left: 0 };
      const fitW = input.w - safe.left - safe.right - 32;
      const kind: TitleKind = wanted === 'wide' && fitW / TITLE_EM.line.w >= 30 ? 'line' : 'stack';
      const font = Math.min(kind === 'line' ? 72 : 60, fitW / TITLE_EM[kind].w);
      const w = font * TITLE_EM[kind].w;
      bottom = setTitle(kind, safe.left + (input.w - safe.left - safe.right - w) / 2, safe.top + 12, w, font);
    }
    // The plate and sheet stop under the name (design E's `--tl-name-bottom`): without it their max-height is invalid
    // and a tall view (the scenario list) grows past the window top, out of reach.
    el.style.setProperty('--tl-name-bottom', `${bottom}px`);
    session.want(wanted);
  };

  const clear = (): void => {
    canvas.removeAttribute('data-ready');
    canvas.width = 0;
    canvas.height = 0;
  };

  const draw = (now: number): void => {
    const art = session.current();
    const idx = session.index();
    if (!ctx || !art || !idx || !lay || !input || lay.framing !== art.framing) {
      clear();
      return;
    }
    lastDraw = now;
    const { w, h } = input;
    const F = idx[art.framing];
    const C = F.crop;
    const k = Math.min(Math.max(1, 1 / lay.s), Math.min(MAX_DENSITY, Math.max(1, window.devicePixelRatio || 1)));
    const bw = Math.max(1, Math.round(w * k));
    const bh = Math.max(1, Math.round(h * k));
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    ctx.setTransform(bw / w, 0, 0, bh / h, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const phase = reduced ? 0 : (2 * Math.PI * now) / DRIFT_MS;
    const dx = lay.drift * Math.sin(phase);
    const dy = 0.5 * lay.drift * Math.sin(2 * phase);
    const S = { x: lay.shown.x + dx, y: lay.shown.y + dy, w: lay.shown.w, h: lay.shown.h };
    const ex = extras(art, C, F.lights);
    // The fills where the poster does not reach the window's edge: the mean colour, then the crop's edge rows and
    // columns (softened to EDGE_SAMPLES colours) stretched outwards. Half a px into the poster: no seam.
    if (S.x > 0 || S.y > 0 || S.x + S.w < w || S.y + S.h < h) {
      const E = ex.edges;
      if (E) {
        ctx.fillStyle = E.mean;
        ctx.fillRect(0, 0, w, h);
        if (S.x > 0) ctx.drawImage(E.left, 0, 0, 1, EDGE_SAMPLES, 0, S.y, S.x + 0.5, S.h);
        if (S.x + S.w < w) ctx.drawImage(E.right, 0, 0, 1, EDGE_SAMPLES, S.x + S.w - 0.5, S.y, w - S.x - S.w + 0.5, S.h);
        if (S.y > 0) ctx.drawImage(E.top, 0, 0, EDGE_SAMPLES, 1, S.x, 0, S.w, S.y + 0.5);
        if (S.y + S.h < h) {
          // Below (phones: the ground the menu stands on): the bottom row for BOTTOM_FADE px, fading into the plain
          // ground colour (a long stretched row shows streaks).
          const y0 = S.y + S.h;
          const fade = Math.min(BOTTOM_FADE, h - y0);
          ctx.drawImage(E.bottom, 0, 0, EDGE_SAMPLES, 1, S.x, y0 - 0.5, S.w, fade + 0.5);
          const g = ctx.createLinearGradient(0, y0, 0, y0 + fade);
          g.addColorStop(0, E.ground.replace('rgb(', 'rgba(').replace(')', ', 0)'));
          g.addColorStop(1, E.ground);
          ctx.fillStyle = g;
          ctx.fillRect(0, y0, w, fade);
          ctx.fillStyle = E.ground;
          ctx.fillRect(0, y0 + fade, w, h - y0 - fade);
        }
      }
    }
    ctx.drawImage(art.poster, C.x, C.y, C.w, C.h, S.x, S.y, S.w, S.h);
    // The bulbs twinkle: a soft additive glow pulsing over each (none with reduced motion).
    const g = reduced ? null : glow();
    if (g && ex.bulbs.length > 0) {
      ctx.globalCompositeOperation = 'lighter';
      const r = Math.max(3, GLOW_R * lay.s);
      for (const b of ex.bulbs) {
        if (b.x < C.x || b.y < C.y || b.x > C.x + C.w || b.y > C.y + C.h) continue;
        const bx = lay.ox + dx + b.x * lay.s;
        const by = lay.oy + dy + b.y * lay.s;
        if (bx < -r || by < -r || bx > w + r || by > h + r) continue;
        const p = 0.5 + 0.5 * Math.sin(2 * Math.PI * (now / TWINKLE_MS + b.phase));
        ctx.globalAlpha = GLOW_MAX * p * p;
        ctx.drawImage(g, bx - r, by - r, 2 * r, 2 * r);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    // The places of what the canvas shows, CSS px, for the layout checks (e2e). Focus and wheel include the drift.
    const r1 = (v: number): string => v.toFixed(1);
    const box = (b: { x: number; y: number; w: number; h: number }, m = 0): string => [b.x - m, b.y - m / 2, b.w + 2 * m, b.h + m].map(r1).join(',');
    canvas.dataset.framing = art.framing;
    canvas.dataset.shown = box(lay.shown);
    canvas.dataset.focus = box(lay.focus, lay.drift);
    canvas.dataset.wheel = box(lay.wheel, lay.drift);
    canvas.dataset.hub = r1(lay.wheel.y + lay.wheel.h / 2 - lay.drift / 2);
    canvas.dataset.title = `${lay.title.kind}:${box(lay.title)}`;
    canvas.dataset.bulbs = String(ex.bulbs.length);
    canvas.setAttribute('data-ready', '');
  };

  /** Drift and twinkle: a frame every FRAME_MS while the title shows its art (none with reduced motion). */
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

  /** The arch on screen, CSS px (the push zooms about it): the index's arch, else the focus box's centre. */
  const archOnScreen = (): { x: number; y: number } | null => {
    const idx = session.index();
    if (!idx || !lay) return null;
    const F = idx[lay.framing];
    const a = idx.arch ?? { x: F.focus.x + F.focus.w / 2, y: F.focus.y + F.focus.h / 2 };
    return { x: lay.ox + a.x * lay.s, y: lay.oy + a.y * lay.s };
  };

  const leave = (hideTitle: () => void): void => {
    if (leaving) return;
    isOpen = false;
    if (el.hidden || !live) {
      // Hidden by someone else (the bench): nothing to push through.
      hideTitle();
      sync();
      return;
    }
    stopLoop();
    const reducedNow = displayPrefs().reducedMotion;
    // No poster on screen (still decoding, or a failed download): the cross-fade alone.
    const art = session.current() !== null && canvas.hasAttribute('data-ready');
    const at = archOnScreen();
    if (at) canvas.style.transformOrigin = `${at.x.toFixed(1)}px ${at.y.toFixed(1)}px`;
    el.classList.add('tc-leaving');
    el.setAttribute('aria-hidden', 'true');
    // The menu's focus goes with it (the park takes the keys once the push ends).
    if (document.activeElement instanceof HTMLElement && el.contains(document.activeElement)) document.activeElement.blur();
    const skip = (e: Event): void => {
      e.preventDefault();
      e.stopPropagation();
      leaving?.push.skip();
    };
    el.addEventListener('pointerdown', skip, true);
    window.addEventListener('keydown', skip, true);
    const undo = (): void => {
      el.removeEventListener('pointerdown', skip, true);
      window.removeEventListener('keydown', skip, true);
      el.classList.remove('tc-leaving');
      el.removeAttribute('aria-hidden');
      el.style.removeProperty('opacity');
      el.style.removeProperty('--tr-ui');
      canvas.style.removeProperty('transform');
      canvas.style.removeProperty('transform-origin');
    };
    const push = startPush(
      {
        now: () => performance.now(),
        frame: (cb) => requestAnimationFrame(cb),
        cancel: (id) => cancelAnimationFrame(id),
        apply(f) {
          canvas.style.transform = f.scale === 1 ? '' : `scale(${f.scale.toFixed(4)})`;
          el.style.opacity = f.layer.toFixed(3);
          el.style.setProperty('--tr-ui', f.ui.toFixed(3));
        },
        end() {
          // Hidden first, then the art closed (`sync`: the poster and the canvas emptied), then the park's arrival.
          undo();
          leaving = null;
          hideTitle();
          sync();
          arrived({ reduced: reducedNow });
        },
      },
      reducedNow || !art,
    );
    leaving = push.running() ? { push, undo } : null;
  };

  return {
    show() {
      if (leaving) {
        // Shown again mid-push: the title stays, with its poster.
        leaving.push.stop();
        leaving.undo();
        leaving = null;
      }
      isOpen = true;
      sync();
    },
    hide() {
      if (leaving) {
        leaving.push.stop();
        leaving.undo();
        leaving = null;
      }
      isOpen = false;
      sync();
    },
    leave,
    place(next) {
      input = next;
      refresh();
    },
  };
}
