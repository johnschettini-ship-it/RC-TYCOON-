/**
 * Card pictures of the realistic test build (stage 1 round 2): the card and picker previews ask here first. Only the
 * VITE_ART=real build sets a drawer (`src/render/real/boot.ts`, with the realistic look); every caller checks
 * `import.meta.env.VITE_ART === 'real'` first, so the website build folds the calls and this module away.
 */

/** Draws the card picture of `id` fitted into a w × h box (`pad` CSS px each side); false to draw today's preview. */
export type CardArt = (ctx: CanvasRenderingContext2D, id: string, w: number, h: number, pad: number) => boolean;

let art: CardArt | null = null;

/** Sets (or clears) the drawer. */
export function setCardArt(fn: CardArt | null): void {
  art = fn;
}

/** True when a card picture was drawn for `id`; false when the caller should draw today's preview. */
export function drawCardArt(ctx: CanvasRenderingContext2D, id: string, w: number, h: number, pad: number): boolean {
  return art !== null && art(ctx, id, w, h, pad);
}

/** The card preview size in CSS px (as `src/ui/decks/card.ts`): the tool card pictures are drawn at it. */
const TOOL_W = 168;
const TOOL_H = 120;

/** A tool card picture canvas: it fills the card's picture area (`.tool-card-art`), its picture contained. */
function pictureCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  c.className = 'tool-card-picture';
  c.style.cssText = 'display:block;width:100%;height:0;min-height:100%;object-fit:contain';
  return c;
}

/**
 * The baked object of the base tool card `id` (frame `tool:<id>` of the card set) on a new canvas of the card preview
 * size at device pixel ratio `dpr`; null when there is none (no drawer, no frame, the set not ready): the card keeps
 * its icon. Realistic build only (`src/ui/decks/toolCards.ts` asks behind `import.meta.env.VITE_ART === 'real'`).
 */
export function toolCardPicture(
  id: string,
  dpr = Math.min(3, globalThis.devicePixelRatio || 1),
  make: (w: number, h: number) => HTMLCanvasElement = pictureCanvas,
): HTMLCanvasElement | null {
  if (art === null) return null;
  const c = make(Math.round(TOOL_W * dpr), Math.round(TOOL_H * dpr));
  const g = c.getContext('2d');
  if (!g) return null;
  g.scale(dpr, dpr);
  return drawCardArt(g, `tool:${id}`, TOOL_W, TOOL_H, Math.min(TOOL_W, TOOL_H) * 0.04) ? c : null;
}
