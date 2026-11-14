/**
 * Card pictures (stage 1 round 2): one small baked picture per baked game item, in one always-loaded set
 * `preview:cards:d2:rall` with frames keyed by the item id (tools/art3d/items/cards.js). The card and picker previews
 * draw it (through `src/render/cardArt.ts`) when the item has one and the set is ready, else today's preview.
 * An item drawn in the game with another item's art (a stand-in, e.g. teacup_twirl → carousel) keeps today's
 * preview: its card shows what it is, not its stand-in.
 */
import type { CardArt } from '../cardArt';
import { realItem } from './fallbacks';
import { frameKey, type SetKey } from './indexFormat';
import type { SetManager } from './setManager';

/**
 * The card picture set, `setKey('preview', 'cards', 2, 'all')` (a literal, so no call is left in a bundle that only
 * imports constants): always wanted (RealLook.prepare), decoded before the UI draws its first card (boot).
 */
export const CARD_SET: SetKey = 'preview:cards:d2:rall';

/** The drawer for `setCardArt`: the baked card picture of `id`, fitted and centred like today's previews. */
export function cardPicture(sets: Pick<SetManager, 'use'>): CardArt {
  return (ctx, id, w, h, pad) => {
    if (realItem(id) !== id) return false;
    const rs = sets.use(CARD_SET);
    if (!rs) return false;
    const f = rs.frames[frameKey([id])];
    if (!f) return false;
    const image = rs.images[rs.sheets.findIndex((s) => s.file === f.sheet)];
    if (!image) return false;
    const k = Math.max(0.01, Math.min((w - 2 * pad) / f.w, (h - 2 * pad) / f.h));
    const dw = f.w * k;
    const dh = f.h * k;
    ctx.save();
    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, f.sx, f.sy, f.w, f.h, (w - dw) / 2, (h - dh) / 2, dw, dh);
    ctx.restore();
    return true;
  };
}
