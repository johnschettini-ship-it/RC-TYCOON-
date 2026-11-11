/**
 * UI layer (Phase 0 §4.11, Phase 1 §4.7 and §7, Phase 7 §4.1): top region, decks, tool status, panels, toasts,
 * title screen, in-game menu, autosave. Owner: W1-B.
 * Talks to input only through the shared ToolState and the `tc-ui-intent` window event.
 */
import type { Game } from '../game';
import { SaveStore, importFile, type KeyValueStore } from '../save';
import type { PanelKind, PanelView, UiContext } from './context';
import { h, setAttr } from './dom';
import { createDecks, type DecksUi } from './decks';
import { heldCardId } from './decks/model';
import { createHud } from './hud';
import { isLowScreen, toolbarPlacement } from './layout';
import { openMenu } from './menu';
import { PanelHost } from './panelHost';
import { createCardDetailsPanel, heldCard } from './panels/cardDetails';
import { createFinancePanel } from './panels/finance';
import { createGuestPanel } from './panels/guest';
import { createParkPanel } from './panels/park';
import { createRidePanel } from './panels/ride';
import { createStallPanel } from './panels/stall';
import { SaveActions } from './saves';
import { createTitleScreen } from './title';
import { createTipBubble } from './tips/bubble';
import { toastForResult } from './toasts';
import { createToastView } from './toastView';
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
import { bindScenarioSettings, titleOpen } from './scenario/shared';
import { localizeReason } from '../i18n';
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
      .catch((e: unknown) => toast(localizeReason(e instanceof Error ? e.message : String(e)), 'error'));
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
    if (closed.kind === 'cardDetails' && panels.current() === null) fitDetails();
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
        case 'cardDetails':
          // Phase 7 §4.7: the data of the held ride or stall card; with no such card nothing opens.
          if (!heldCard(game)) return;
          view = createCardDetailsPanel(ctx);
          break;
        default: {
          // Phase 6 (Wave 4.0): panels from UI extensions (the show site panel, W4-C); none yet = nothing opens.
          const make = extensionPanel(kind);
          if (!make) return;
          view = make(ctx, id ?? null);
        }
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
      fitDetails();
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
    openDeck(deck, zone) {
      decks.open(deck, zone);
    },
    controlFor(toolId) {
      return decks.controlFor(toolId);
    },
    cardPressed() {
      return decks.cardPressed();
    },
  };

  const hud = createHud(ctx, () => openMenu(ctx));
  const decks: DecksUi = createDecks(ctx);
  // Phase 7 §4.4: the Rides deck is open when a park starts. The low layout (Task 19) starts with the hand closed.
  const startDeck = (): void => {
    if (root.dataset.low === '1') decks.close();
    else decks.open('rides');
  };
  const status = createToolStatus(ctx);
  const patrolBar = createPatrolBar(ctx);
  const pathItemBar = createPathItemBar(ctx);
  const messageToast = createMessageToast(ctx, () => {
    arbiter.clear();
    plainHiddenUntil = 0;
  });
  const title = createTitleScreen(ctx);
  // Phase 7 §4.8: one mascot tip at a time.
  const tip = createTipBubble(ctx);
  // Build 2 tool bars, legends, sheets, and dialogs (Wave 3 extensions).
  const extraBars = UI_EXTENSIONS.flatMap((x) => (x.bars ? [x.bars(ctx)] : []));
  root.append(hud.el, decks.el, status.el, patrolBar.el, pathItemBar.el, ...extraBars.map((b) => b.el), tip.el, tip.live, panels.el, toastView.el, messageToast.el, fileInput, title.el);
  mountTrackUi(ctx);

  // Task 19: a low window (a phone held sideways) has the phone layout with its own rules (`data-low`): its panels are
  // right-side panels, and the hand closes when the window becomes low.
  let wasLow: boolean | null = null;
  const applyLayout = (): void => {
    const w = window.innerWidth;
    const hgt = window.innerHeight;
    const layout = toolbarPlacement(w, hgt);
    const low = isLowScreen(w, hgt);
    root.dataset.layout = layout;
    setAttr(root, 'data-low', low ? '1' : null);
    panels.setLayout(low ? 'side' : layout);
    if (low && wasLow === false) decks.close();
    wasLow = low;
  };
  window.addEventListener('resize', applyLayout);
  applyLayout();
  startDeck();
  // Phase 7 §4.7, desktop: a card details panel that does not fit above the hand runs to the bottom of the screen, and
  // the hand ends at its left edge (`data-details="tall"`, main.css). The hand keeps its height, so the answer does not
  // change with the state. Measured when the panel opens or closes and when a region changes its size, not per frame.
  const fitDetails = (): void => {
    let tall = false;
    if (root.dataset.layout === 'side' && panels.current()?.kind === 'cardDetails' && !decks.hand.hidden) {
      const hand = decks.hand.getBoundingClientRect();
      // A side panel ends above the hand, as far from it as the hand is from the bottom of the screen.
      const limit = Math.floor(hand.top) - (window.innerHeight - hand.bottom);
      tall = panels.el.getBoundingClientRect().top + panels.fullHeight() > limit;
    }
    setAttr(root, 'data-details', tall ? 'tall' : null);
  };
  // The top region wraps on narrow screens: panels, toasts, and the deck list sit below its real height. The bottom
  // region is the hand on desktop (0 when closed) and the chip row with the hand on the phone.
  const measure = (): void => {
    root.style.setProperty('--hud-bottom', `${Math.ceil(hud.el.getBoundingClientRect().bottom)}px`);
    const tops: number[] = [];
    if (!decks.hand.hidden) tops.push(decks.hand.getBoundingClientRect().top);
    if (root.dataset.layout === 'bottom') tops.push(decks.list.getBoundingClientRect().top);
    const space = tops.length > 0 ? Math.ceil(window.innerHeight - Math.min(...tops)) : 0;
    root.style.setProperty('--toolbar-space', `${Math.max(0, space)}px`);
    // The low layout's right-side panels run from below the top region to above the deck chips row.
    if (root.dataset.low === '1') {
      root.style.setProperty('--chips-space', `${Math.max(0, Math.ceil(window.innerHeight - decks.list.getBoundingClientRect().top))}px`);
    }
    fitDetails();
  };
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(measure);
    ro.observe(hud.el);
    ro.observe(decks.list);
    ro.observe(decks.hand);
    // The path height bar sits above the tool status bar at its real height (it grows with the text scale).
    new ResizeObserver(() => {
      if (!status.el.hidden) root.style.setProperty('--tool-status-h', `${Math.ceil(status.el.getBoundingClientRect().height)}px`);
    }).observe(status.el);
    // The phone tip slides up over the top region when it does not fit above the chip row (large text).
    new ResizeObserver(() => {
      if (!tip.el.hidden) root.style.setProperty('--tip-h', `${Math.ceil(tip.el.getBoundingClientRect().height)}px`);
    }).observe(tip.el);
  }
  window.addEventListener('resize', measure);
  measure();

  // Every failed command shows its reason; warnings show too.
  game.onCommand((_cmd, result) => {
    const t = toastForResult(result);
    if (t) toast(t.message, t.kind);
  });
  game.onEvents((events) => {
    // The world behind the title is not the player's park: it never overwrites the autosave.
    if (!titleOpen()) saves.autosave(events);
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
    startDeck();
    panels.close();
    ctx.follow.guestId = null;
    lastSelection = null;
    messageToast.hide();
    arbiter.clear();
    toolOptions(game.tool).patrolStaffId = -1;
  });

  // After a mouse or touch click on a top region, deck, card, or tool status button, drop its focus so Space pauses the
  // game instead of pressing the button again. Keyboard activation (detail 0) keeps focus.
  root.addEventListener('click', (e) => {
    if ((e as MouseEvent).detail === 0) return;
    const b = (e.target as Element | null)?.closest('.deck-list button, .hand button, .hud button, .tool-status button');
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

  // A toast that would cover the tool status bar (large text on desktop) sits 8 px above the bar and the path height
  // bar, in their column; the bars stay where they are. Measured only while a toast and the bar show; written on a change.
  const toastButton = toastView.el.querySelector<HTMLElement>('.toast');
  let toastPlace = '';
  const placeToast = (): void => {
    let place = '';
    if (toastButton && !toastView.el.hidden && !toastButton.hidden && !status.el.hidden) {
      const bars = [status.el, ...root.querySelectorAll<HTMLElement>('.path-height-bar')].filter((b) => !b.hidden).map((b) => b.getBoundingClientRect());
      const top = Math.min(...bars.map((r) => r.top));
      const height = toastButton.getBoundingClientRect().height;
      // The toast's own place: 10 px below the top region (`.toast-host`).
      if (Math.ceil(hud.el.getBoundingClientRect().bottom) + 10 + height + 8 > top) {
        const left = Math.min(...bars.map((r) => r.left));
        const right = Math.max(...bars.map((r) => r.right));
        place = `${Math.floor(top - 8 - height)}px|${Math.floor(left)}px|${Math.floor(window.innerWidth - right)}px`;
      }
    }
    if (place === toastPlace) return;
    toastPlace = place;
    const [top = '', left = '', right = ''] = place === '' ? [] : place.split('|');
    toastView.el.style.top = top;
    toastView.el.style.left = left;
    toastView.el.style.right = right;
  };

  let lastTool = game.tool.tool;
  let lastHeld: string | null = null;
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
    // Phase 7 §4.7: on desktop the card details panel opens when a ride or stall card becomes the held card. An open
    // details panel goes to the new held card on the phone too, and closes when no card is held. A panel that the
    // player closed stays closed until the held card changes.
    const held = heldCardId(game.tool);
    if (held !== lastHeld) {
      lastHeld = held;
      const open = panels.current()?.kind === 'cardDetails';
      if (held === null) {
        if (open) panels.close();
      } else if (open || root.dataset.layout === 'side') ctx.openPanel('cardDetails');
    }
    follow();
    hud.update(now);
    decks.update(now);
    status.update();
    patrolBar.update();
    pathItemBar.update(now);
    for (const b of extraBars) b.update(now);
    tip.update(now);
    panels.tick(now);
    messageToast.update(now);
    const msgVisible = messageToast.visible(now);
    // The plain toast stays hidden while a message toast shows, and for the rest of its 3 s after.
    const hidePlain = msgVisible || now < plainHiddenUntil;
    if (toastView.el.hidden !== hidePlain) toastView.el.hidden = hidePlain;
    toastView.update(now);
    placeToast();
  });

  title.show();
}
