/**
 * UI layer (Phase 0 §4.11, Phase 1 §4.7 and §7): HUD, toolbar, tool status, panels, pickers,
 * toasts, title screen, in-game menu, autosave. Owner: W1-B.
 * Talks to input only through the shared ToolState and the `tc-ui-intent` window event.
 */
import type { Game } from '../game';
import { tileToScreen } from '../render/iso';
import { SaveStore, importFile, type KeyValueStore } from '../save';
import type { PanelKind, PanelView, UiContext } from './context';
import { h } from './dom';
import { createHud } from './hud';
import { toolbarPlacement } from './layout';
import { openMenu } from './menu';
import { PanelHost } from './panelHost';
import { createFinancePanel } from './panels/finance';
import { createGuestPanel } from './panels/guest';
import { createParkPanel } from './panels/park';
import { createPicker } from './panels/picker';
import { createRidePanel } from './panels/ride';
import { createStallPanel } from './panels/stall';
import { SaveActions } from './saves';
import { createTitleScreen } from './title';
import { toastForResult } from './toasts';
import { createToastView } from './toastView';
import { createToolbar } from './toolbar';
import { createToolStatus } from './toolStatus';

/** Window event the input layer fires for panel requests (keyboard `F`, `Esc`). */
export const UI_INTENT_EVENT = 'tc-ui-intent';

function safeLocalStorage(): KeyValueStore | null {
  try {
    const s = window.localStorage;
    const probe = '__tc_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

type Entity = NonNullable<Game['tool']['selectedEntity']>;
const sameEntity = (a: Entity | null, b: Entity | null): boolean => a === b || (!!a && !!b && a.kind === b.kind && a.id === b.id);

export function mountUI(root: HTMLElement, game: Game): void {
  root.classList.add('tc-ui');
  const toastView = createToastView();
  const toast = (message: string, kind: 'error' | 'warning' | 'info' = 'info'): void => toastView.show(message, kind);
  const saves = new SaveActions(game, new SaveStore(safeLocalStorage()), toast);

  // Import uses one hidden file input.
  let afterImport: (() => void) | null = null;
  const fileInput = h('input', { type: 'file', accept: '.json,.tcsave.json,application/json', class: 'sr-only', tabindex: -1, 'aria-hidden': 'true' });
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    const done = afterImport;
    afterImport = null;
    importFile(file)
      .then((result) => {
        if (saves.applyLoad(result)) done?.();
      })
      .catch((e: unknown) => toast(e instanceof Error ? e.message : String(e), 'error'));
  });

  let lastSelection: Entity | null = null;
  const panels = new PanelHost((closed) => {
    const sel = game.tool.selectedEntity;
    if (sel && closed.id !== null && closed.kind === sel.kind && closed.id === sel.id && panels.current() === null) {
      game.tool.selectedEntity = null;
      lastSelection = null;
    }
    if (closed.kind === 'guest' && ctx.follow.guestId === closed.id && panels.current() === null) ctx.follow.guestId = null;
  });

  const ctx: UiContext = {
    game,
    root,
    saves,
    toast,
    follow: { guestId: null },
    openPanel(kind: PanelKind, id?: number) {
      let view: PanelView;
      switch (kind) {
        case 'ride':
          view = createRidePanel(ctx, id ?? -1);
          break;
        case 'stall':
          view = createStallPanel(ctx, id ?? -1);
          break;
        case 'guest':
          view = createGuestPanel(ctx, id ?? -1);
          break;
        case 'park':
          view = createParkPanel(ctx);
          break;
        case 'finance':
          view = createFinancePanel(ctx);
          break;
        default:
          view = createPicker(ctx, kind);
      }
      if (kind !== 'ride' && kind !== 'stall' && kind !== 'guest') {
        // A non-entity panel replaces the inspected entity.
        game.tool.selectedEntity = null;
        lastSelection = null;
      }
      panels.open(view);
    },
    closePanel() {
      panels.close();
    },
    activePanel() {
      const v = panels.current();
      return v ? { kind: v.kind, id: v.id } : null;
    },
    showTitle() {
      panels.close();
      title.show();
    },
    hideTitle() {
      title.hide();
    },
    importSave(onLoaded) {
      afterImport = onLoaded ?? null;
      fileInput.click();
    },
  };

  const hud = createHud(ctx);
  const toolbar = createToolbar(ctx, () => openMenu(ctx));
  const status = createToolStatus(ctx);
  const title = createTitleScreen(ctx);
  root.append(hud.el, toolbar.el, status.el, panels.el, toastView.el, fileInput, title.el);

  const applyLayout = (): void => {
    const layout = toolbarPlacement(window.innerWidth);
    root.dataset.layout = layout;
    panels.setLayout(layout);
  };
  window.addEventListener('resize', applyLayout);
  applyLayout();
  // The HUD wraps on narrow screens: panels, toasts, and the side toolbar sit below its real height.
  const measure = (): void => {
    root.style.setProperty('--hud-bottom', `${Math.ceil(hud.el.getBoundingClientRect().bottom)}px`);
    const bar = toolbar.el.getBoundingClientRect();
    const space = root.dataset.layout === 'bottom' ? Math.ceil(window.innerHeight - bar.top) : 0;
    root.style.setProperty('--toolbar-space', `${Math.max(0, space)}px`);
  };
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(measure);
    ro.observe(hud.el);
    ro.observe(toolbar.el);
  }
  window.addEventListener('resize', measure);
  measure();

  // Every failed command shows its reason; warnings show too.
  game.onCommand((_cmd, result) => {
    const t = toastForResult(result);
    if (t) toast(t.message, t.kind);
  });
  game.onEvents((events) => saves.autosave(events));
  game.onWorldChanged(() => {
    panels.close();
    ctx.follow.guestId = null;
    lastSelection = null;
  });

  // After a mouse or touch click on a HUD or toolbar button, drop its focus so Space pauses the game
  // instead of pressing the button again. Keyboard activation (detail 0) keeps focus.
  root.addEventListener('click', (e) => {
    if ((e as MouseEvent).detail === 0) return;
    const b = (e.target as Element | null)?.closest('.toolbar button, .hud button, .tool-status button');
    if (b instanceof HTMLElement) b.blur();
  });

  window.addEventListener(UI_INTENT_EVENT, (e) => {
    const intent = (e as CustomEvent<string>).detail;
    if (intent === 'finance') {
      if (panels.current()?.kind === 'finance') panels.close();
      else ctx.openPanel('finance');
    } else if (intent === 'closePanel') {
      panels.close();
    }
  });

  // Camera follow: stop when the player moves the camera.
  let followSet: { x: number; y: number } | null = null;
  const follow = (): void => {
    const id = ctx.follow.guestId;
    const cam = game.camera;
    if (id === null) {
      followSet = null;
      return;
    }
    if (followSet && (Math.abs(cam.centerX - followSet.x) > 0.5 || Math.abs(cam.centerY - followSet.y) > 0.5)) {
      ctx.follow.guestId = null;
      followSet = null;
      return;
    }
    const g = game.world.state.guests.find((q) => q.id === id);
    if (!g) {
      ctx.follow.guestId = null;
      followSet = null;
      return;
    }
    const map = game.world.state.map;
    const p = tileToScreen((g.tile % map.width) + 0.5, Math.floor(g.tile / map.width) + 0.5, map.heights[g.tile] ?? 0);
    cam.centerX = p.sx;
    cam.centerY = p.sy;
    followSet = { x: p.sx, y: p.sy };
  };

  game.onFrame(() => {
    const now = performance.now();
    // Inspect selection from the input layer opens the matching panel.
    const sel = game.tool.selectedEntity;
    if (!sameEntity(sel, lastSelection)) {
      lastSelection = sel ? { ...sel } : null;
      if (sel && sel.kind !== 'staff') ctx.openPanel(sel.kind, sel.id);
      else if (!sel) {
        const cur = panels.current();
        if (cur && (cur.kind === 'ride' || cur.kind === 'stall' || cur.kind === 'guest')) panels.close();
      }
    }
    follow();
    hud.update(now);
    toolbar.update();
    status.update();
    panels.tick(now);
    toastView.update(now);
  });

  title.show();
}
