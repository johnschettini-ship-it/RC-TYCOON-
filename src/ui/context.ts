/** Shared UI context passed to every view. Owner: W1-B. */
import type { Game } from '../game';
import type { SaveActions } from './saves';
import type { ToastKind } from './toasts';

export type PanelKind =
  | 'ride'
  | 'stall'
  | 'guest'
  | 'park'
  | 'finance'
  | 'ridePicker'
  | 'stallPicker'
  // Phase 3 (W2-B)
  | 'staff'
  | 'research'
  | 'marketing'
  | 'messages';

/** Panels that show one entity; opening one selects that entity on the map. */
export type EntityPanelKind = 'ride' | 'stall' | 'guest' | 'staff';

export interface UiContext {
  game: Game;
  root: HTMLElement;
  saves: SaveActions;
  toast(message: string, kind?: ToastKind): void;
  openPanel(kind: PanelKind, id?: number): void;
  closePanel(): void;
  activePanel(): { kind: PanelKind; id: number | null } | null;
  /** Guest the camera follows, or null. */
  follow: { guestId: number | null };
  showTitle(): void;
  hideTitle(): void;
  /** Pick a `.tcsave.json` file and load it. Calls `onLoaded` after a good load. */
  importSave(onLoaded?: () => void): void;
}

/** One panel view inside the panel host. */
export interface PanelView {
  kind: PanelKind;
  /** Entity id for ride, stall, and guest panels (the staff panel tracks its member itself). */
  id: number | null;
  title: string;
  body: HTMLElement;
  /** Refresh from the world. Return false when the entity is gone (the host closes the panel). */
  update(): boolean;
  /** Title can change (park rename). */
  titleNow?(): string;
}
