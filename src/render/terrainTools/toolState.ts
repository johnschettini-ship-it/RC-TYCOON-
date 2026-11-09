/**
 * Land and Water tool state beside the shared `ToolState` (Phase 4 §7). Owner: W3-A.
 * `ToolState.land` holds the contract options (mode, size, paint, corner, level target) and `ToolState.brush` the
 * ghost; this side table holds the rest, keyed by the ToolState object (one per game), like the Phase 3 tool
 * options. The browser glue (`ui/land`) and the bar write it, the input router (`input/land`) acts on it, and the
 * render layer only reads it. Plain data; no DOM.
 */
import type { PointerKind } from '../../input/gestures';
import type { ToolState } from '../types';

export type WaterMode = 'raise' | 'lower';

/**
 * A bar or key action: `raise` / `lower` (land, corner, water; level: target ± 1), `apply` (smooth, paint, raise,
 * lower modes: the mode's own action), `confirm` (level rectangle).
 */
export type LandAction = 'raise' | 'lower' | 'apply' | 'confirm';

export interface LandToolExtra {
  /** Water tool: raise or lower. */
  waterMode: WaterMode;
  /** Brush anchor: the last pointer tile (mouse hover, touch tap), or −1 = the tile at the screen centre. */
  anchor: number;
  /** Level rectangle corners (map tiles), or −1 when no rectangle is drawn. */
  rectStart: number;
  rectEnd: number;
  /** The rectangle waits for Confirm (touch, or any rectangle not applied on release). */
  rectPending: boolean;
  /** Pointer type of the last press on the map (written by the browser glue before the gesture recognizer runs). */
  pointer: PointerKind;
  /** Left mouse button held on the map: the action repeats every 300 ms (`LAND_REPEAT_MS`). */
  pressDown: boolean;
  /** Shift was held at the press: the opposite action (lower instead of raise). */
  pressShift: boolean;
  /** The current press already applied once (its release tap must not apply again). */
  pressApplied: boolean;
  nextRepeatMs: number;
  /** Bar buttons tapped since the last frame, in order (each applies once), and the bar button held (repeat every 300 ms). */
  queued: LandAction[];
  held: LandAction | null;
  heldNextMs: number;
  /** Bumped after every terrain command this tool sends (the ghost refreshes). */
  sent: number;
  /** Map canvas size in CSS px (0 = unknown), for the pointer position inside a tile (Corner mode). */
  viewW: number;
  viewH: number;
}

const store = new WeakMap<ToolState, LandToolExtra>();

export function landToolOf(tool: ToolState): LandToolExtra {
  let s = store.get(tool);
  if (!s) {
    s = {
      waterMode: 'raise',
      anchor: -1,
      rectStart: -1,
      rectEnd: -1,
      rectPending: false,
      pointer: 'mouse',
      pressDown: false,
      pressShift: false,
      pressApplied: false,
      nextRepeatMs: 0,
      queued: [],
      held: null,
      heldNextMs: 0,
      sent: 0,
      viewW: 0,
      viewH: 0,
    };
    store.set(tool, s);
  }
  return s;
}

/** Drop the transient parts (tool entered or left, world changed). Options (water mode) stay. */
export function resetLandTransient(s: LandToolExtra): void {
  s.anchor = -1;
  s.rectStart = -1;
  s.rectEnd = -1;
  s.rectPending = false;
  s.pressDown = false;
  s.pressShift = false;
  s.pressApplied = false;
  s.queued.length = 0;
  s.held = null;
}

export function isTerrainTool(tool: ToolState['tool']): tool is 'land' | 'water' {
  return tool === 'land' || tool === 'water';
}

/**
 * A press on the map canvas (browser glue, capture phase, so it runs before the gesture recognizer reads
 * `primaryDrag`). A left mouse press with the Land or Water tool starts hold-to-repeat.
 */
export function noteLandPointerDown(tool: ToolState, pointer: PointerKind, button: number, shift: boolean): void {
  const s = landToolOf(tool);
  s.pointer = pointer;
  if (!isTerrainTool(tool.tool) || pointer !== 'mouse' || button !== 0) return;
  s.pressDown = true;
  s.pressShift = shift;
  s.pressApplied = false;
}

/** The press ended (pointer up or cancel anywhere, or the window lost focus). */
export function noteLandPointerUp(tool: ToolState): void {
  landToolOf(tool).pressDown = false;
}

/** A bar button was pressed: apply on the next frame, then repeat every 300 ms while it is held. */
export function pressLandButton(tool: ToolState, action: LandAction): void {
  const s = landToolOf(tool);
  enqueue(s, action);
  s.held = action === 'confirm' ? null : action;
}

export function releaseLandButton(tool: ToolState): void {
  landToolOf(tool).held = null;
}

/** Mode chip: switch the Land mode; a level rectangle in progress is dropped. */
export function setLandMode(tool: ToolState, mode: ToolState['land']['mode']): void {
  if (tool.land.mode === mode) return;
  tool.land.mode = mode;
  const s = landToolOf(tool);
  s.rectStart = -1;
  s.rectEnd = -1;
  s.rectPending = false;
  if (mode !== 'level') tool.land.levelTarget = null;
}

/** One action on the next frame (keyboard activation of a bar button, `Page Up` / `Page Down`). */
export function queueLandAction(tool: ToolState, action: LandAction): void {
  enqueue(landToolOf(tool), action);
}

/** At most a few taps wait between two frames; more are dropped. */
const MAX_QUEUED = 8;

function enqueue(s: LandToolExtra, action: LandAction): void {
  if (s.queued.length < MAX_QUEUED) s.queued.push(action);
}
