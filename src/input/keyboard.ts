/** Keyboard map (Phase 0 §4.10, Phase 1 §7). Owner: W1-B. Pure. */

export type PanDir = 'up' | 'down' | 'left' | 'right';

export type KeyAction =
  | { kind: 'pan'; dir: PanDir }
  | { kind: 'zoom'; dir: 'in' | 'out' }
  | { kind: 'togglePause' }
  | { kind: 'speed'; speed: 1 | 2 | 4 }
  | { kind: 'tool'; tool: 'footpath' | 'queue' | 'demolish' }
  | { kind: 'rotate' }
  | { kind: 'cancel' }
  | { kind: 'finance' }
  /** Phase 3 §7.4: H Staff panel, O Office (finance), M Messages. */
  | { kind: 'panel'; panel: 'staff' | 'office' | 'messages' }
  /** Phase 3 §7.4: B Bench, N Bin (path item tool). */
  | { kind: 'pathItem'; item: 'bench' | 'bin' }
  /** Phase 4 §4.8: `[` counter-clockwise, `]` clockwise (W3-G). */
  | { kind: 'rotateView'; dir: 1 | -1 }
  /** Phase 4 §7: `Page Up` / `Page Down` path height (W3-B). */
  | { kind: 'pathHeight'; delta: 1 | -1 }
  /**
   * Phase 4 §7 overlay cycle (W3-E). The spec names `O`, which Phase 3 §7.4 already uses for the Office panel;
   * bound to `V` until the owner decides (open question in the delivery plan).
   */
  | { kind: 'overlayCycle' };

/** Keys are `KeyboardEvent.key` values. */
export const KEY_BINDINGS: ReadonlyArray<{ keys: readonly string[]; action: KeyAction }> = [
  { keys: ['ArrowUp', 'w', 'W'], action: { kind: 'pan', dir: 'up' } },
  { keys: ['ArrowDown', 's', 'S'], action: { kind: 'pan', dir: 'down' } },
  { keys: ['ArrowLeft', 'a', 'A'], action: { kind: 'pan', dir: 'left' } },
  { keys: ['ArrowRight', 'd', 'D'], action: { kind: 'pan', dir: 'right' } },
  { keys: ['+', '='], action: { kind: 'zoom', dir: 'in' } },
  { keys: ['-', '_', '−'], action: { kind: 'zoom', dir: 'out' } },
  { keys: [' ', 'Spacebar'], action: { kind: 'togglePause' } },
  { keys: ['1'], action: { kind: 'speed', speed: 1 } },
  { keys: ['2'], action: { kind: 'speed', speed: 2 } },
  { keys: ['3'], action: { kind: 'speed', speed: 4 } },
  { keys: ['p', 'P'], action: { kind: 'tool', tool: 'footpath' } },
  { keys: ['q', 'Q'], action: { kind: 'tool', tool: 'queue' } },
  { keys: ['r', 'R'], action: { kind: 'rotate' } },
  // Backspace: the Mac keyboard "delete" key.
  { keys: ['Delete', 'Backspace'], action: { kind: 'tool', tool: 'demolish' } },
  { keys: ['Escape', 'Esc'], action: { kind: 'cancel' } },
  { keys: ['f', 'F'], action: { kind: 'finance' } },
  { keys: ['h', 'H'], action: { kind: 'panel', panel: 'staff' } },
  { keys: ['o', 'O'], action: { kind: 'panel', panel: 'office' } },
  { keys: ['m', 'M'], action: { kind: 'panel', panel: 'messages' } },
  { keys: ['b', 'B'], action: { kind: 'pathItem', item: 'bench' } },
  { keys: ['n', 'N'], action: { kind: 'pathItem', item: 'bin' } },
  { keys: ['['], action: { kind: 'rotateView', dir: -1 } },
  { keys: [']'], action: { kind: 'rotateView', dir: 1 } },
  { keys: ['PageUp'], action: { kind: 'pathHeight', delta: 1 } },
  { keys: ['PageDown'], action: { kind: 'pathHeight', delta: -1 } },
  { keys: ['v', 'V'], action: { kind: 'overlayCycle' } },
];

const byKey = new Map<string, KeyAction>();
for (const b of KEY_BINDINGS) for (const k of b.keys) byKey.set(k, b.action);

export function keyAction(key: string): KeyAction | null {
  return byKey.get(key) ?? null;
}

/** Keyboard pan speed: 600 screen px per second. */
export const KEY_PAN_SPEED_PX = 600;

/**
 * World-pixel camera movement for the held pan keys over `dtMs`, scaled by 1 / zoom and by `speed` (the pan speed
 * setting, Phase 6 §4.9: 0.5–2).
 */
export function keyboardPan(held: ReadonlySet<PanDir>, dtMs: number, zoom: number, speed = 1): { dx: number; dy: number } {
  const sx = (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0);
  const sy = (held.has('down') ? 1 : 0) - (held.has('up') ? 1 : 0);
  const step = (KEY_PAN_SPEED_PX * speed * dtMs) / 1000 / zoom;
  return { dx: sx * step + 0, dy: sy * step + 0 };
}
