/**
 * Ride reach status (path clarity spec 2026-11-18 §2–3): one line in every ride panel (flat and track) and in the
 * queue card, checked live, first failing step wins: no queue at the entrance → no footpath reaches the queue → the
 * ride is closed → guests can reach it. When a queue or footpath is missing, Show me closes the panel, moves the camera
 * to the spot (`showMapPlace`) and pulses it there for `SHOW_ME_MS` (`ToolState.pathFocus`, drawn by the queue layer).
 *
 * Auto-connect (owner 2026-11-19, merged here by the review of 2026-11-20): when a queue, the footpath to it or the exit
 * footpath is missing and a route exists, the same line offers "Connect it ($cost)". It asks once, with the cost, then
 * builds (`sim/paths/autoConnect.ts`); Undo takes that connection back with a full refund. When no route exists, the
 * line says why under the status.
 */
import { text } from '../../data/strings/en';
import { localizeReason } from '../../i18n';
import type { ToolState } from '../../render/types';
import { rideReach, type ReachStatus } from '../../sim/pathing/reach';
import {
  applyAutoConnect,
  cachedAutoConnectPlan,
  canPayPlan,
  lastAutoConnect,
  planAutoConnect,
  undoLastAutoConnect,
  type ConnectPlan,
} from '../../sim/paths/autoConnect';
import type { World } from '../../sim/types';
import type { UiContext } from '../context';
import { openDialog } from '../dialogs';
import { h, setAttr, setText } from '../dom';
import { formatMoney } from '../format';
import { icon } from '../icons';

/** How long the Show me pulse lasts (ms). */
export const SHOW_ME_MS = 3000;

export interface ReachLine {
  status: ReachStatus;
  text: string;
  /** Show me is offered (a queue or a footpath is missing). */
  showMe: boolean;
  tile: number;
  z: number;
}

/** The status line of ride `rideId`, or null when it has no entrance yet (nothing to check). */
export function reachLine(world: World, rideId: number): ReachLine | null {
  const r = rideReach(world, rideId);
  if (!r) return null;
  return { status: r.status, text: statusText(world, rideId, r.status), showMe: r.status === 'noQueue' || r.status === 'noFootpath', tile: r.tile, z: r.z };
}

/**
 * The line's text. A ride that is reached but not open says why in its own words: "The ride is closed" when the player
 * closed it, else the ride's state as the panel's status chip names it (Testing, Broken down, Being inspected, Closed
 * for the storm, Under construction).
 */
function statusText(world: World, rideId: number, status: ReachStatus): string {
  if (status !== 'closed') return text(`ride.reach.${status}`);
  const state = world.state.rides.find((x) => x.id === rideId)?.status ?? 'closed';
  return state === 'closed' ? text('ride.reach.closed') : text(`ui.ride.status.${state}`);
}

export interface ShowMeHost {
  game: { tool: ToolState };
  closePanel(): void;
  showMapPlace?(tile: number, z?: number): void;
}

/** Close the panel, bring `line`'s spot (at its own height: a deck stays centred) into view and pulse it until `now + SHOW_ME_MS`. */
export function showMe(host: ShowMeHost, line: ReachLine, now: number): void {
  if (!line.showMe || line.tile < 0) return;
  host.closePanel();
  host.showMapPlace?.(line.tile, line.z);
  host.game.tool.pathFocus = { tile: line.tile, z: line.z, until: now + SHOW_ME_MS };
}

/** What the Connect action offers for ride `rideId`: a plan with something to build, a reason it cannot, or nothing. */
export function connectOffer(world: World, rideId: number): { plan: ConnectPlan | null; reason: string | null } {
  const p = cachedAutoConnectPlan(world, rideId);
  if (!p.ok) return { plan: null, reason: p.code === 'noGates' ? null : text(`ui.ride.connect.${p.code}`) };
  return { plan: p.plan.steps.length > 0 ? p.plan : null, reason: null };
}

/** Ask once with the whole cost, then build; a refusal or a failure says why in a toast. */
function confirmConnect(ctx: UiContext, rideId: number): void {
  const { game } = ctx;
  const p = planAutoConnect(game.world, rideId);
  if (!p.ok) {
    ctx.toast(text(`ui.ride.connect.${p.code}`), 'error');
    return;
  }
  const plan = p.plan;
  if (plan.steps.length === 0) return;
  const cost = formatMoney(plan.cost);
  if (!canPayPlan(game.world, plan)) {
    ctx.toast(text('ui.ride.connect.noCash', { cost }), 'error');
    return;
  }
  const footpath = plan.join.length + plan.exit.length;
  const d = openDialog(ctx.root, {
    title: text('ui.ride.connect.confirm', { cost }),
    body: h('p', { class: 'dialog-text', 'data-testid': 'connect-detail', text: text('ui.ride.connect.detail', { queue: plan.queue.length, footpath }) }),
    actions: [
      { label: text('ui.dialog.cancel'), onClick: () => d.close(), kind: 'plain', testId: 'confirm-no' },
      {
        label: text('ui.ride.connect.yes', { cost }),
        kind: 'primary',
        testId: 'confirm-yes',
        onClick: () => {
          d.close();
          const r = applyAutoConnect(game.world, plan, (cmd) => game.dispatch(cmd));
          if (r.ok) ctx.toast(text('ui.ride.connect.done', { cost: formatMoney(r.built.cost) }), 'info');
          else if (r.code === 'failed') ctx.toast(localizeReason(r.reason ?? ''), 'error');
          else ctx.toast(text(`ui.ride.connect.${r.code}`, { cost }), 'error');
        },
      },
    ],
  });
}

/**
 * The status row: an icon, the status text, Show me and Connect it ($cost) (Undo after a connection), and the reason a
 * connection cannot be built. Hidden while the ride has no entrance.
 */
export function createReachStatus(ctx: UiContext, rideId: number): { el: HTMLElement; update(): void } {
  const okIcon = icon('check', 'icon reach-ok');
  const badIcon = icon('warning', 'icon reach-bad');
  const say = h('span', { class: 'reach-text', 'data-testid': 'reach-text' });
  let line: ReachLine | null = null;
  const button = h('button', {
    type: 'button',
    class: 'btn reach-show',
    'data-testid': 'reach-show-me',
    text: text('ride.reach.showMe'),
    onclick: () => {
      if (line) showMe(ctx, line, performance.now());
    },
  });
  const connect = h('button', { type: 'button', class: 'btn primary reach-connect', 'data-testid': 'reach-connect', hidden: true, onclick: () => confirmConnect(ctx, rideId) });
  const undo = h('button', {
    type: 'button',
    class: 'btn reach-undo',
    'data-testid': 'reach-connect-undo',
    hidden: true,
    text: text('ui.ride.connect.undo'),
    onclick: () => {
      const game = ctx.game;
      const before = game.world.state.park.cash;
      if (undoLastAutoConnect(game.world, rideId, (cmd) => game.dispatch(cmd))) {
        ctx.toast(text('ui.ride.connect.undone', { cost: formatMoney(Math.max(0, game.world.state.park.cash - before)) }), 'info');
      }
    },
  });
  const why = h('p', { class: 'reach-why muted', 'data-testid': 'reach-connect-why', hidden: true });
  const el = h('div', { class: 'reach-status', 'data-testid': 'reach-status' }, okIcon, badIcon, say, button, connect, undo, why);
  let last = '';
  return {
    el,
    update() {
      const world = ctx.game.world;
      line = reachLine(world, rideId);
      const offer = line ? connectOffer(world, rideId) : { plan: null, reason: null };
      const canUndo = line !== null && lastAutoConnect(world, rideId) !== null;
      const key = line ? `${line.status}|${line.text}|${offer.plan?.cost ?? -1}|${offer.reason ?? ''}|${canUndo}` : '';
      if (key === last) return;
      last = key;
      el.hidden = line === null;
      if (!line) return;
      setAttr(el, 'data-status', line.status);
      setText(say, line.text);
      const good = line.status === 'ok';
      okIcon.style.display = good ? '' : 'none';
      badIcon.style.display = good ? 'none' : '';
      button.hidden = !line.showMe;
      connect.hidden = offer.plan === null;
      if (offer.plan) setText(connect, text('ui.ride.connect', { cost: formatMoney(offer.plan.cost) }));
      undo.hidden = !canUndo;
      why.hidden = offer.reason === null;
      setText(why, offer.reason ?? '');
    },
  };
}
