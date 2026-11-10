/** Responsive layout rules (Phase 0 §4.11, Phase 1 §7). Owner: W1-B. Pure. */

import type { TextScale } from '../settings/types';

export const LAYOUT_BREAKPOINT_PX = 900;

export type ToolbarPlacement = 'bottom' | 'side';

/** Bottom toolbar and bottom-sheet panels below 900 CSS px; left toolbar and side panels from 900 px. */
export function toolbarPlacement(viewportWidthCss: number): ToolbarPlacement {
  return viewportWidthCss < LAYOUT_BREAKPOINT_PX ? 'bottom' : 'side';
}

export type PillField = 'name' | 'cash' | 'guests' | 'rating';

/** Fields of the status pill (Phase 7 §4.2): the phone drops the name, and at 150% text scale and more, guests and rating. */
export function pillFields(layout: ToolbarPlacement, textScale: TextScale): PillField[] {
  if (layout === 'side') return ['name', 'cash', 'guests', 'rating'];
  return textScale >= 150 ? ['cash'] : ['cash', 'guests', 'rating'];
}

export type SheetHeight = 'peek' | 'half' | 'full';

/** Bottom-sheet heights as a share of the viewport height. */
export const SHEET_FRACTIONS: Readonly<Record<SheetHeight, number>> = { peek: 0.32, half: 0.55, full: 0.88 };

const ORDER: readonly SheetHeight[] = ['peek', 'half', 'full'];

/** Height the sheet settles at after a handle drag; well below the lowest height closes it. */
export function snapSheet(heightPx: number, viewportH: number): SheetHeight | 'closed' {
  const f = heightPx / Math.max(1, viewportH);
  if (f < SHEET_FRACTIONS.peek * 0.6) return 'closed';
  let best: SheetHeight = 'peek';
  for (const h of ORDER) if (Math.abs(SHEET_FRACTIONS[h] - f) < Math.abs(SHEET_FRACTIONS[best] - f)) best = h;
  return best;
}

export function nextSheetHeight(h: SheetHeight): SheetHeight {
  return ORDER[(ORDER.indexOf(h) + 1) % ORDER.length] as SheetHeight;
}
