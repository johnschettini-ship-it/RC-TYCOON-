/**
 * Map cursor state (Phase 6 §4.7, §7). Owner: W4-F. UI state only (never in saves). The cursor layer
 * (`render/a11y/layer.ts`) draws a dashed diamond on `tile`; the HUD shows `describeTile` for it.
 *
 * The keys (`./keys.ts`) move the cursor and act through a `CursorInput`, which the input controller provides
 * (`InputController.cursorInput()`, registered by `input/index.ts`), so `Enter` behaves exactly like a click there.
 */
import type { MapState } from '../sim/map';
import { mapToView, viewSize, viewToMap, type ViewRotation } from '../render/view';

export interface MapCursor {
  on: boolean;
  /** Tile index, or −1 before the cursor is placed. */
  tile: number;
  /** Start tile of a Shift + arrows path drag, or −1. */
  dragFrom: number;
}

export const mapCursor: MapCursor = { on: false, tile: -1, dragFrom: -1 };

/** Cursor off and unplaced (new world, tests). */
export function resetMapCursor(): void {
  mapCursor.on = false;
  mapCursor.tile = -1;
  mapCursor.dragFrom = -1;
}

export type CursorDir = 'up' | 'down' | 'left' | 'right';

/** Arrow keys (`KeyboardEvent.key`) → cursor directions. */
export const ARROW_DIRS: Readonly<Record<string, CursorDir>> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

/**
 * One tile in view terms, so a key always moves the same way on screen whatever the view rotation:
 * right = view u + 1 (down-right), left = u − 1 (up-left), down = v + 1 (down-left), up = v − 1 (up-right).
 * The cursor stays inside the map.
 */
export function cursorStep(map: Pick<MapState, 'width' | 'height'>, tile: number, dir: CursorDir, r: ViewRotation): number {
  const x = tile % map.width;
  const y = Math.floor(tile / map.width);
  const p = mapToView(x, y, r, map.width, map.height);
  const vs = viewSize(map, r);
  let u = p.u;
  let v = p.v;
  if (dir === 'right') u += 1;
  else if (dir === 'left') u -= 1;
  else if (dir === 'down') v += 1;
  else v -= 1;
  u = Math.max(0, Math.min(vs.w - 1, u));
  v = Math.max(0, Math.min(vs.h - 1, v));
  const m = viewToMap(u, v, r, map.width, map.height);
  return m.y * map.width + m.x;
}

/** What the cursor keys ask of the input controller (no DOM). */
export interface CursorInput {
  /** The tool's hover at `tile` (ghosts and brushes follow it), as if the mouse moved there. */
  hover(tile: number): void;
  /** A primary mouse click at `tile`. */
  click(tile: number): void;
  /** Path drag from `from` to `tile` (starts it when none is running). False when the tool does not drag. */
  dragTo(from: number, tile: number): boolean;
  /** End the drag and build, as a release. */
  dragEnd(): void;
  /** Drop the drag: nothing is built. */
  dragCancel(): void;
  /** Move the camera so `tile` is well inside the view. */
  reveal(tile: number): void;
  /** The tile at the screen centre (or the nearest map tile). */
  centreTile(): number;
}

let input: CursorInput | null = null;

export function setCursorInput(next: CursorInput | null): void {
  input = next;
}

export function cursorInput(): CursorInput | null {
  return input;
}

type Listener = () => void;
const shortcutListeners: Listener[] = [];
const cursorListeners: Listener[] = [];

/** Key `?`: the UI opens the shortcut list. Returns the unsubscribe function. */
export function onShortcutList(cb: Listener): () => void {
  shortcutListeners.push(cb);
  return () => {
    const i = shortcutListeners.indexOf(cb);
    if (i >= 0) shortcutListeners.splice(i, 1);
  };
}

/** True when a listener took the request. */
export function requestShortcutList(): boolean {
  for (const l of [...shortcutListeners]) l();
  return shortcutListeners.length > 0;
}

/** The cursor turned on or off or moved (the UI updates its description line). */
export function onCursorChange(cb: Listener): () => void {
  cursorListeners.push(cb);
  return () => {
    const i = cursorListeners.indexOf(cb);
    if (i >= 0) cursorListeners.splice(i, 1);
  };
}

export function cursorChanged(): void {
  for (const l of [...cursorListeners]) l();
}
