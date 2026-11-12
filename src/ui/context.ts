/** Shared UI context passed to every view. Owner: W1-B. */
import type { Game } from '../game';
import type { DeckId } from './decks/model';
import type { SaveActions } from './saves';
import type { ToastKind } from './toasts';

export type PanelKind =
  | 'ride'
  | 'stall'
  | 'guest'
  | 'park'
  | 'finance'
  // Phase 3 (W2-B)
  | 'staff'
  | 'research'
  | 'marketing'
  | 'messages'
  // Phase 7 §4.7: the data of the held ride or stall card.
  | 'cardDetails'
  // Phase 6 (Wave 4.0): panels from UI extensions (`./extensions.ts` `panels`).
  | ExtensionPanelKind;

/** Panels a UI extension provides (Phase 6 §7): the show site panel (W4-C). */
export type ExtensionPanelKind = 'showSite';

/** Panels that show one entity; opening one selects that entity on the map. */
export type EntityPanelKind = 'ride' | 'stall' | 'guest' | 'staff' | 'showSite';

export interface UiContext {
  game: Game;
  root: HTMLElement;
  saves: SaveActions;
  toast(message: string, kind?: ToastKind): void;
  openPanel(kind: PanelKind, id?: number): void;
  closePanel(): void;
  /**
   * Show a map tile (ride work 1 Task 8, "Show on map"): on the phone the open panel's sheet lowers to its header, then
   * the camera puts the tile at the centre of the map area no panel, hand or top region covers. Optional: a context
   * without it centres the tile on the screen.
   */
  showMapPlace?(tile: number): void;
  activePanel(): { kind: PanelKind; id: number | null } | null;
  /** Guest the camera follows, or null. */
  follow: { guestId: number | null };
  showTitle(): void;
  hideTitle(): void;
  /** Pick a `.tcsave.json` file and load it. Calls `onLoaded` after a good load. */
  importSave(onLoaded?: () => void): void;
  /** Opens the hand with a deck (Phase 7 §4.4). */
  openDeck(deck: DeckId, zone?: string): void;
  /**
   * The control of an old toolbar id: its card when its deck is open, else its deck button; Demolish, the mood bar,
   * Messages, and Menu for their ids; null for `inspect`.
   */
  controlFor(toolId: string): HTMLElement | null;
  /** A card of the hand is pressed: a tool card (its tool, panel, picker, or chips) or a held ride or stall card. */
  cardPressed(): boolean;
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
