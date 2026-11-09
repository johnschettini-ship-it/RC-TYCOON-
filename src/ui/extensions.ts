/**
 * UI extension points (Wave 3.0 contract; Build 3 entries and `panels` Wave 4.0). Owner: integrator. The toolbar, HUD,
 * park panel, and UI root mount every registered extension, so cards add UI from their own folders without editing
 * Build 1 files. Every control needs a text label or `aria-label` and a 44 × 44 CSS px touch target (plan Global
 * Constraints).
 */
import type { SimEvent } from '../sim/types';
import type { ExtensionPanelKind, PanelView, UiContext } from './context';
import { landUi } from './land';
import { pathHeightUi } from './paths';
import { sceneryUi } from './scenery';
import { overlayUi } from './overlays';
import { afterDarkUi } from './afterDark';
import { viewUi } from './view';
import { scenarioUi } from './scenario';
import { showsUi } from './shows';
import { settingsUi } from './settings';
import { perfUi } from './perf';
import { offlineUi } from './offline';

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

/** Makes the view of an extension panel (`ctx.openPanel(kind, id)`); `id` is the entity id for entity panels. */
export type PanelFactory = (ctx: UiContext, id: number | null) => PanelView;

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
  /** Build 3: panels this extension provides (the show site panel, W4-C). */
  panels?: { [K in ExtensionPanelKind]?: PanelFactory };
}

/**
 * Registry order is mount order. Build 3 (Wave 4.0): shows (W4-C), settings screen (W4-F), performance overlay
 * (W4-E), offline update toast (W4-G).
 */
export const UI_EXTENSIONS: readonly UiExtension[] = [
  landUi,
  pathHeightUi,
  sceneryUi,
  overlayUi,
  afterDarkUi,
  viewUi,
  scenarioUi,
  showsUi,
  settingsUi,
  perfUi,
  offlineUi,
];

export function toolbarEntries(): ToolbarEntry[] {
  return UI_EXTENSIONS.flatMap((x) => x.toolbar ?? []);
}

/** The factory of an extension panel, or undefined when no extension provides it. */
export function extensionPanel(kind: ExtensionPanelKind): PanelFactory | undefined {
  for (const x of UI_EXTENSIONS) {
    const f = x.panels?.[kind];
    if (f) return f;
  }
  return undefined;
}
