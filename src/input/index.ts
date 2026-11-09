/**
 * Browser glue for input (Phase 0 §4.10, Phase 1 §4.1 and §7). Owner: W1-B.
 * Pointer Events (mouse, touch, pen), wheel, and keyboard feed the pure InputController.
 */
import type { Game } from '../game';
import { clampToMap } from './camera';
import { InputController, type UiIntent } from './controller';
import type { PointerKind } from './gestures';
import { keyAction } from './keyboard';

/** Window event for panel requests; the UI layer listens for it. */
export const UI_INTENT_EVENT = 'tc-ui-intent';

function pointerKind(t: string): PointerKind {
  return t === 'mouse' ? 'mouse' : t === 'pen' ? 'pen' : 'touch';
}

/** Keys typed into a field, or Space/Enter on a focused button, belong to that control. */
function keyBelongsToControl(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t || !(t instanceof HTMLElement)) return false;
  if (t.isContentEditable) return true;
  const tag = t.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if ((tag === 'BUTTON' || t.getAttribute('role') === 'button') && (e.key === ' ' || e.key === 'Enter')) return true;
  return false;
}

export function attachInput(canvas: HTMLCanvasElement, game: Game): void {
  const viewport = (): { width: number; height: number } => {
    const r = canvas.getBoundingClientRect();
    return { width: r.width || 1, height: r.height || 1 };
  };
  const ctl = new InputController(game, {
    viewport,
    onIntent: (intent: UiIntent) => window.dispatchEvent(new CustomEvent(UI_INTENT_EVENT, { detail: intent })),
  });
  const local = (e: PointerEvent | WheelEvent): { x: number; y: number } => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const send = (type: 'down' | 'move' | 'up' | 'cancel', e: PointerEvent): void => {
    const p = local(e);
    ctl.pointer({ type, id: e.pointerId, x: p.x, y: p.y, t: e.timeStamp, pointerType: pointerKind(e.pointerType), button: e.button });
  };

  canvas.addEventListener('pointerdown', (e) => {
    if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) document.activeElement.blur();
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic pointers cannot always be captured.
    }
    send('down', e);
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', (e) => send('move', e));
  canvas.addEventListener('pointerup', (e) => {
    send('up', e);
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointercancel', (e) => send('cancel', e));
  canvas.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse') ctl.hoverOut();
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const p = local(e);
      ctl.wheel(p.x, p.y, e.deltaY, e.deltaMode);
    },
    { passive: false },
  );
  // Block Safari's own pinch gestures on the page.
  for (const type of ['gesturestart', 'gesturechange']) canvas.addEventListener(type, (e) => e.preventDefault());

  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    // A title screen or dialog is open (set by the UI layer).
    if (document.body.dataset.tcModal) return;
    if (keyBelongsToControl(e)) return;
    const action = keyAction(e.key);
    if (!action) return;
    e.preventDefault();
    if (e.repeat && action.kind !== 'pan' && action.kind !== 'zoom') return;
    ctl.keyDown(e.key);
  });
  window.addEventListener('keyup', (e) => ctl.keyUp(e.key));
  window.addEventListener('blur', () => ctl.blur());

  game.onFrame(() => ctl.update(performance.now()));
  game.onWorldChanged(() => ctl.worldChanged());
  clampToMap(game.camera, game.world.state.map);
}
