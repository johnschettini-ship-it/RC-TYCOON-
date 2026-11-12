/** Responsive layout rules (Phase 0 §4.11, Phase 1 §7). Owner: W1-B. Pure. */

import type { TextScale } from '../settings/types';

export const LAYOUT_BREAKPOINT_PX = 900;

/** A window lower than this (and wider than high) is low: a phone held sideways (Task 19). */
export const LOW_HEIGHT_PX = 500;

export type ToolbarPlacement = 'bottom' | 'side';

/** The low layout (a phone held sideways): the phone layout with one slim top row and panels at the right side. */
export function isLowScreen(widthCss: number, heightCss: number): boolean {
  return heightCss < LOW_HEIGHT_PX && widthCss > heightCss;
}

/**
 * Bottom toolbar and bottom-sheet panels below 900 CSS px; left toolbar and side panels from 900 px. A low window has
 * the bottom toolbar at every width (its own rules, `data-low`, make the panels right-side panels).
 */
export function toolbarPlacement(viewportWidthCss: number, viewportHeightCss: number): ToolbarPlacement {
  if (isLowScreen(viewportWidthCss, viewportHeightCss)) return 'bottom';
  return viewportWidthCss < LAYOUT_BREAKPOINT_PX ? 'bottom' : 'side';
}

export type PillField = 'name' | 'cash' | 'guests' | 'rating';

/**
 * Fields of the status pill (Phase 7 §4.2): the phone drops the name, and at 150% text scale and more, guests and rating.
 * The upright phone's compact top row (Task 21; not the low layout) drops the rating too: it is in the mood circle's name.
 */
export function pillFields(layout: ToolbarPlacement, textScale: TextScale, compact = false): PillField[] {
  if (layout === 'side') return ['name', 'cash', 'guests', 'rating'];
  if (textScale >= 150) return ['cash'];
  return compact ? ['cash', 'guests'] : ['cash', 'guests', 'rating'];
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
