/**
 * Build 2 UI extension points (Wave 3.0 contract). Owner: integrator. The toolbar, HUD, park panel, and UI root
 * mount every registered extension, so Wave 3 cards add UI from their own folders without editing Build 1 files.
 * Every control needs a text label or `aria-label` and a 44 × 44 CSS px touch target (plan Global Constraints).
 */
import type { SimEvent } from '../sim/types';
import type { UiContext } from './context';
import { landUi } from './land';
import { pathHeightUi } from './paths';
import { sceneryUi } from './scenery';
import { overlayUi } from './overlays';
import { afterDarkUi } from './afterDark';
import { viewUi } from './view';
import { scenarioUi } from './scenario';

/** A mounted piece of UI. `update` runs every frame. */
export interface UiPart {
  el: HTMLElement;
  update(now: number): void;
}

/** A toolbar button (inserted before Demolish, in registry order). */
export interface ToolbarEntry {
  /** `data-tool` and `data-testid="tool-<id>"`. */
  id: string;
  label: string;
  icon(): Element;
  onClick(ctx: UiContext): void;
  pressed(ctx: UiContext): boolean;
}

export interface UiExtension {
  toolbar?: ToolbarEntry[];
  /** HUD controls, after the weather badge (view rotate buttons, objectives flag). */
  hud?(ctx: UiContext): UiPart;
  /** Tool bars, mini-bars, legends, sheets, and dialogs mounted on the UI root (they show and hide themselves). */
  bars?(ctx: UiContext): UiPart;
  /** A section at the end of the park panel (After Dark switch, awards). */
  parkPanel?(ctx: UiContext): UiPart;
  /** Every drained batch of sim events (award toasts, end screen, tutorial bubbles). */
  onEvents?(ctx: UiContext, events: readonly SimEvent[]): void;
}

/** Registry order is mount order. */
export const UI_EXTENSIONS: readonly UiExtension[] = [landUi, pathHeightUi, sceneryUi, overlayUi, afterDarkUi, viewUi, scenarioUi];

export function toolbarEntries(): ToolbarEntry[] {
  return UI_EXTENSIONS.flatMap((x) => x.toolbar ?? []);
}
