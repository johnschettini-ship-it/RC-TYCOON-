/**
 * UI layer (Phase 0 §4.11, Phase 1 §4.7 and §7): HUD, toolbar, tool status, panels, pickers,
 * toasts, title screen, in-game menu, autosave. Owner: W1-B.
 * Talks to input only through the shared ToolState and the `tc-ui-intent` window event.
 */
import type { Game } from '../game';
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
import { createMarketingPanel } from './management/marketingPanel';
import { createMessageToast } from './management/messageToast';
import { createMessagesPanel } from './management/messagesPanel';
import { createResearchPanel } from './management/researchPanel';
import { createStaffPanel } from './management/staffPanel';
import { MESSAGE_TOAST_MS, TOAST_PRIORITY, ToastArbiter, messageHasToast, messageToastPriority } from './management/toastArbiter';
import { createPathItemBar, createPatrolBar } from './management/toolBars';
import { TOAST_MS } from './toasts';
import { toolOptions } from '../render/management/toolOptions';
import { mountTrackUi } from './track';
import { extensionPanel, UI_EXTENSIONS } from './extensions';
import { tileCentreWorld } from '../input/camera';
import { bindScenarioSettings } from './scenario/shared';
import { confirmDialog } from './dialogs';
import { text } from '../data/strings/en';
import type { Command } from '../sim/commands/types';

/** Window event the input layer fires for a demolish that needs the player's yes (Settings → Confirm demolish). */
export const CONFIRM_DEMOLISH_EVENT = 'tc-confirm-demolish';

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
  // Phase 6 §4.9: "Unlock all scenarios" is a stored setting.
  bindScenarioSettings(game.settings);
  const toastView = createToastView();
  // Phase 3 §7.3: one toast at a time; breakdown > research > others (see ToastArbiter).
  const arbiter = new ToastArbiter();
  let plainHiddenUntil = 0;
  const toast = (message: string, kind: 'error' | 'warning' | 'info' = 'info'): void => {
    const now = performance.now();
    if (!arbiter.offer(TOAST_PRIORITY.other, now, TOAST_MS)) return;
    messageToast.hide();
    plainHiddenUntil = 0;
    toastView.show(message, kind);
  };
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
    // The staff panel tracks its member itself (id null). Patrol painting keeps the member selected.
    if (sel && sel.kind === 'staff' && closed.kind === 'staff' && panels.current() === null && game.tool.tool !== 'patrol') {
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
        case 'staff':
          view = createStaffPanel(ctx, id ?? null);
          break;
        case 'research':
          view = createResearchPanel(ctx);
          break;
        case 'marketing':
          view = createMarketingPanel(ctx);
          break;
        case 'messages':
          view = createMessagesPanel(ctx);
          break;
        case 'showSite': {
          // Phase 6 (Wave 4.0): panels from UI extensions (the show site panel, W4-C); none yet = nothing opens.
          const make = extensionPanel(kind);
          if (!make) return;
          view = make(ctx, id ?? null);
          break;
        }
        default:
          view = createPicker(ctx, kind);
      }
      const sel = game.tool.selectedEntity;
      if ((kind === 'ride' || kind === 'stall' || kind === 'guest' || kind === 'staff' || kind === 'showSite') && id !== undefined && id >= 0) {
        // An entity panel selects its entity (message locate, long-press), so the frame loop does not reopen it.
        game.tool.selectedEntity = { kind, id };
        lastSelection = { kind, id };
      } else if (kind === 'staff' && sel?.kind === 'staff') {
        // The staff panel keeps the selected staff member.
      } else if (kind !== 'ride' && kind !== 'stall' && kind !== 'guest' && kind !== 'showSite') {
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
  const patrolBar = createPatrolBar(ctx);
  const pathItemBar = createPathItemBar(ctx);
  const messageToast = createMessageToast(ctx, () => {
    arbiter.clear();
    plainHiddenUntil = 0;
  });
  const title = createTitleScreen(ctx);
  // Build 2 tool bars, legends, sheets, and dialogs (Wave 3 extensions).
  const extraBars = UI_EXTENSIONS.flatMap((x) => (x.bars ? [x.bars(ctx)] : []));
  root.append(hud.el, toolbar.el, status.el, patrolBar.el, pathItemBar.el, ...extraBars.map((b) => b.el), panels.el, toastView.el, messageToast.el, fileInput, title.el);
  mountTrackUi(ctx);

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
  game.onEvents((events) => {
    saves.autosave(events);
    for (const x of UI_EXTENSIONS) x.onEvents?.(ctx, events);
    // Breakdown and research messages also toast, with a Show button (Phase 3 §4.14).
    const now = performance.now();
    for (const ev of events) {
      if (ev.type !== 'message' || !messageHasToast(ev.category)) continue;
      if (!arbiter.offer(messageToastPriority(ev.category), now, MESSAGE_TOAST_MS)) continue;
      messageToast.show(ev, now);
      plainHiddenUntil = now + TOAST_MS;
    }
  });
  game.onWorldChanged(() => {
    panels.close();
    ctx.follow.guestId = null;
    lastSelection = null;
    messageToast.hide();
    arbiter.clear();
    toolOptions(game.tool).patrolStaffId = -1;
  });

  // After a mouse or touch click on a HUD or toolbar button, drop its focus so Space pauses the game
  // instead of pressing the button again. Keyboard activation (detail 0) keeps focus.
  root.addEventListener('click', (e) => {
    if ((e as MouseEvent).detail === 0) return;
    const b = (e.target as Element | null)?.closest('.toolbar button, .hud button, .tool-status button');
    if (b instanceof HTMLElement) b.blur();
  });

  // Phase 6 §4.9 Confirm demolish: the input layer hands the command over; it runs on yes.
  window.addEventListener(CONFIRM_DEMOLISH_EVENT, (e) => {
    const cmd = (e as CustomEvent<Command>).detail;
    confirmDialog(root, text('a11y.demolish.confirm'), text('a11y.demolish.yes'), text('a11y.demolish.no'), () => game.dispatch(cmd));
  });

  window.addEventListener(UI_INTENT_EVENT, (e) => {
    const intent = (e as CustomEvent<string>).detail;
    if (intent === 'finance' || intent === 'office') {
      if (panels.current()?.kind === 'finance') panels.close();
      else ctx.openPanel('finance');
    } else if (intent === 'staff' || intent === 'messages') {
      if (panels.current()?.kind === intent) panels.close();
      else ctx.openPanel(intent);
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
    const p = tileCentreWorld(map, g.tile, cam.rotation);
    cam.centerX = p.sx;
    cam.centerY = p.sy;
    followSet = { x: p.sx, y: p.sy };
  };

  let lastTool = game.tool.tool;
  game.onFrame(() => {
    const now = performance.now();
    // Inspect selection from the input layer opens the matching panel.
    const sel = game.tool.selectedEntity;
    if (!sameEntity(sel, lastSelection)) {
      lastSelection = sel ? { ...sel } : null;
      if (sel && sel.kind !== 'staff') ctx.openPanel(sel.kind, sel.id);
      else if (sel && sel.kind === 'staff') {
        // Long-press or tap on a staff member opens the staff panel (Phase 3 §7.3); the open panel follows the selection.
        if (panels.current()?.kind !== 'staff' && game.tool.tool !== 'patrol') ctx.openPanel('staff', sel.id);
      } else if (!sel) {
        const cur = panels.current();
        if (cur && (cur.kind === 'ride' || cur.kind === 'stall' || cur.kind === 'guest' || cur.kind === 'showSite')) panels.close();
      }
    }
    // Leaving the patrol tool (Done, Esc, another tool) brings the staff panel back.
    const tool = game.tool.tool;
    if (tool !== lastTool) {
      if (lastTool === 'patrol') {
        const id = toolOptions(game.tool).patrolStaffId;
        toolOptions(game.tool).patrolStaffId = -1;
        if (id >= 0 && game.world.state.staff.members.some((m) => m.id === id) && panels.current()?.kind !== 'staff') ctx.openPanel('staff', id);
      }
      lastTool = tool;
    }
    follow();
    hud.update(now);
    toolbar.update();
    status.update();
    patrolBar.update();
    pathItemBar.update(now);
    for (const b of extraBars) b.update(now);
    panels.tick(now);
    messageToast.update(now);
    const msgVisible = messageToast.visible(now);
    // The plain toast stays hidden while a message toast shows, and for the rest of its 3 s after.
    const hidePlain = msgVisible || now < plainHiddenUntil;
    if (toastView.el.hidden !== hidePlain) toastView.el.hidden = hidePlain;
    toastView.update(now);
  });

  title.show();
}
