/**
 * Browser wiring of the audio client (Phase 6 §4.1–4.2). Owner: W4-A. Unlock on the first user gesture, the hidden-tab
 * switch, `ui_click` (capture-phase `click` on buttons in `#ui`), and `ui_open` (a panel or dialog appears in `#ui`).
 */

/** A panel (side panel or bottom sheet) or a dialog (title screen, pickers, confirmations, tutorial bubble). */
const VISIBLE_SURFACE = '.panel:not([hidden]), [role="dialog"]:not([hidden])';
const SURFACE = '.panel, [role="dialog"]';
const BUTTON = 'button, [role="button"]';

/** Is this click a press of an enabled button inside `root`? */
export function isButtonPress(target: EventTarget | null, root: Element): boolean {
  const el = target as Element | null;
  if (!el || typeof el.closest !== 'function') return false;
  const b = el.closest(BUTTON);
  if (!b || !root.contains(b)) return false;
  if ((b as HTMLButtonElement).disabled === true || b.getAttribute('aria-disabled') === 'true') return false;
  return true;
}

/** Did these mutations make a panel or dialog appear (shown, switched to another panel, or added visible)? */
export function opensSurface(records: Iterable<MutationRecord>): boolean {
  for (const r of records) {
    if (r.type === 'attributes') {
      const el = r.target as Element;
      if (typeof el.matches !== 'function' || !el.matches(SURFACE) || el.hasAttribute('hidden')) continue;
      // Shown (the `hidden` attribute went away), or a visible panel took another view (`PanelHost.open`).
      if (r.attributeName === 'hidden' && r.oldValue !== null) return true;
      if (r.attributeName === 'data-kind' && el.matches('.panel')) return true;
    } else if (r.type === 'childList') {
      for (const n of Array.from(r.addedNodes)) {
        const el = n as Element;
        if (typeof el.matches !== 'function') continue;
        if (el.matches(VISIBLE_SURFACE) || el.querySelector(VISIBLE_SURFACE) !== null) return true;
      }
    }
  }
  return false;
}

/**
 * Unlock on the first activation gesture: `pointerdown` from a mouse, `keydown` (not Escape), and for touch and pen
 * the `pointerup` / `touchend` that ends the tap (browsers grant audio to those, not to a touch `pointerdown`);
 * `click` as a fallback. `unlock` is cheap once the context runs, so the listeners stay (iOS can suspend audio later).
 */
export function watchUnlock(target: Window, unlock: () => void): () => void {
  const down = (e: Event): void => {
    const p = (e as PointerEvent).pointerType;
    if (p === 'mouse' || p === '' || p === undefined) unlock();
  };
  const up = (e: Event): void => {
    if ((e as PointerEvent).pointerType !== 'mouse') unlock();
  };
  const key = (e: Event): void => {
    if ((e as KeyboardEvent).key !== 'Escape') unlock();
  };
  const all: [string, (e: Event) => void][] = [
    ['pointerdown', down],
    ['pointerup', up],
    ['touchend', unlock],
    ['click', unlock],
    ['keydown', key],
  ];
  for (const [type, fn] of all) target.addEventListener(type, fn, { capture: true, passive: true });
  return () => {
    for (const [type, fn] of all) target.removeEventListener(type, fn, { capture: true });
  };
}

/** `setHidden(document.hidden)` now and on every `visibilitychange`. */
export function watchVisibility(doc: Document, setHidden: (hidden: boolean) => void): () => void {
  const on = (): void => setHidden(doc.hidden);
  doc.addEventListener('visibilitychange', on);
  on();
  return () => doc.removeEventListener('visibilitychange', on);
}

/** `ui_click` on button presses and `ui_open` when a panel or dialog appears, inside `root`. */
export function watchUi(root: Element, onClick: () => void, onOpen: () => void): () => void {
  const click = (e: Event): void => {
    if (isButtonPress(e.target, root)) onClick();
  };
  root.addEventListener('click', click, true);
  const mo = new MutationObserver((records) => {
    if (opensSurface(records)) onOpen();
  });
  mo.observe(root, { subtree: true, childList: true, attributes: true, attributeOldValue: true, attributeFilter: ['hidden', 'data-kind'] });
  return () => {
    root.removeEventListener('click', click, true);
    mo.disconnect();
  };
}
