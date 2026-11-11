/**
 * Panel framework (Phase 1 §7): one panel at a time. Side panel on desktop,
 * bottom sheet with a drag handle and 3 heights on phones. Owner: W1-B (Build 3: W4-F).
 * Phase 6 §4.7: a panel is a labelled region with a heading; one opened from the keyboard takes the focus (its
 * heading), so Tab goes on into the panel and Esc closes it.
 */
import { text } from '../data/strings/en';
import type { PanelView } from './context';
import { h, newId, setText } from './dom';
import { icon } from './icons';
import { SHEET_FRACTIONS, nextSheetHeight, snapSheet, type SheetHeight, type ToolbarPlacement } from './layout';

const UPDATE_MS = 250;
const TAP_PX = 6;

/** The last input was a key press (not a pointer): keyboard-opened panels take the focus. */
let keyboardInput = false;
let inputWatch = false;
function watchInput(): void {
  if (inputWatch || typeof window === 'undefined') return;
  inputWatch = true;
  window.addEventListener('keydown', () => (keyboardInput = true), { capture: true });
  window.addEventListener('pointerdown', () => (keyboardInput = false), { capture: true });
}

export class PanelHost {
  readonly el: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly bodyEl: HTMLElement;
  private readonly handle: HTMLElement;
  private view: PanelView | null = null;
  private lastUpdate = 0;
  private sheet: SheetHeight = 'half';
  private layout: ToolbarPlacement = 'side';

  constructor(private readonly onClosed: (view: PanelView) => void) {
    const titleId = newId('panel-title');
    this.titleEl = h('h2', { id: titleId, class: 'panel-title', tabindex: -1 });
    this.bodyEl = h('div', { class: 'panel-body' });
    this.handle = h('div', {
      class: 'panel-handle',
      role: 'button',
      tabindex: 0,
      'aria-label': text('ui.panel.resize'),
    });
    const close = h('button', { type: 'button', class: 'icon-btn panel-close', 'aria-label': text('ui.panel.close'), onclick: () => this.close() }, icon('cross'));
    this.el = h(
      'aside',
      { class: 'panel', role: 'region', 'aria-labelledby': titleId, hidden: true },
      this.handle,
      h('header', { class: 'panel-header' }, this.titleEl, close),
      this.bodyEl,
    );
    this.wireHandle();
    watchInput();
  }

  current(): PanelView | null {
    return this.view;
  }

  /** The height in px that shows the whole open panel with no scroll: its header and all of its body. */
  fullHeight(): number {
    return this.el.offsetHeight - this.bodyEl.clientHeight + this.bodyEl.scrollHeight;
  }

  open(view: PanelView): void {
    const prev = this.view;
    this.view = view;
    setText(this.titleEl, view.title);
    this.bodyEl.replaceChildren(view.body);
    this.el.dataset.kind = view.kind;
    this.el.hidden = false;
    this.bodyEl.scrollTop = 0;
    if (prev) this.onClosed(prev);
    view.update();
    this.lastUpdate = performance.now();
    this.applySheet();
    if (keyboardInput && (!prev || prev.kind !== view.kind || prev.id !== view.id)) this.titleEl.focus({ preventScroll: true });
  }

  close(): void {
    const v = this.view;
    if (!v) return;
    this.view = null;
    const hadFocus = this.el.contains(document.activeElement);
    this.el.hidden = true;
    // Focus inside the closing panel would be lost: it goes back to the map (the page body).
    if (hadFocus && document.activeElement instanceof HTMLElement) document.activeElement.blur();
    this.bodyEl.replaceChildren();
    this.onClosed(v);
  }

  setLayout(layout: ToolbarPlacement): void {
    this.layout = layout;
    this.el.dataset.layout = layout;
    this.applySheet();
  }

  /** Refresh the open panel a few times per second. */
  tick(now: number): void {
    const v = this.view;
    if (!v || now - this.lastUpdate < UPDATE_MS) return;
    this.lastUpdate = now;
    if (!v.update()) {
      this.close();
      return;
    }
    if (v.titleNow) setText(this.titleEl, v.titleNow());
  }

  private applySheet(): void {
    if (this.layout === 'bottom') {
      this.el.dataset.sheet = this.sheet;
      this.el.style.height = `${Math.round(SHEET_FRACTIONS[this.sheet] * 100)}vh`;
    } else {
      delete this.el.dataset.sheet;
      this.el.style.height = '';
    }
  }

  private wireHandle(): void {
    let startY = 0;
    let startH = 0;
    let active = -1;
    let moved = false;
    this.handle.addEventListener('pointerdown', (e) => {
      if (this.layout !== 'bottom') return;
      active = e.pointerId;
      startY = e.clientY;
      startH = this.el.getBoundingClientRect().height;
      moved = false;
      this.handle.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    this.handle.addEventListener('pointermove', (e) => {
      if (e.pointerId !== active) return;
      const dy = startY - e.clientY;
      if (Math.abs(dy) >= TAP_PX) moved = true;
      if (moved) this.el.style.height = `${Math.max(40, Math.min(window.innerHeight * 0.95, startH + dy))}px`;
    });
    const end = (e: PointerEvent): void => {
      if (e.pointerId !== active) return;
      active = -1;
      if (!moved) {
        this.sheet = nextSheetHeight(this.sheet);
        this.applySheet();
        return;
      }
      const snap = snapSheet(this.el.getBoundingClientRect().height, window.innerHeight);
      if (snap === 'closed') {
        this.close();
        return;
      }
      this.sheet = snap;
      this.applySheet();
    };
    this.handle.addEventListener('pointerup', end);
    this.handle.addEventListener('pointercancel', (e) => {
      if (e.pointerId !== active) return;
      active = -1;
      this.applySheet();
    });
    this.handle.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.sheet = nextSheetHeight(this.sheet);
        this.applySheet();
      }
    });
  }
}
