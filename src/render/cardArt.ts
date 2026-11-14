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
