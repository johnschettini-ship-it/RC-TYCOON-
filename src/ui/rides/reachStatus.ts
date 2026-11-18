/**
 * Ride reach status (path clarity spec 2026-11-18 §2–3): one line in every ride panel (flat and track) and in the
 * queue card, checked live, first failing step wins: no queue at the entrance → no footpath reaches the queue → the
 * ride is closed → guests can reach it. When a queue or footpath is missing, Show me closes the panel, moves the camera
 * to the spot (`showMapPlace`) and pulses it there for `SHOW_ME_MS` (`ToolState.pathFocus`, drawn by the queue layer).
 */
import { text } from '../../data/strings/en';
import type { ToolState } from '../../render/types';
import { rideReach, type ReachStatus } from '../../sim/pathing/reach';
import type { World } from '../../sim/types';
import type { UiContext } from '../context';
import { h, setAttr, setText } from '../dom';
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
  return { status: r.status, text: text(`ride.reach.${r.status}`), showMe: r.status === 'noQueue' || r.status === 'noFootpath', tile: r.tile, z: r.z };
}

export interface ShowMeHost {
  game: { tool: ToolState };
  closePanel(): void;
  showMapPlace?(tile: number): void;
}

/** Close the panel, bring `line`'s spot into view and pulse it until `now + SHOW_ME_MS`. */
export function showMe(host: ShowMeHost, line: ReachLine, now: number): void {
  if (!line.showMe || line.tile < 0) return;
  host.closePanel();
  host.showMapPlace?.(line.tile);
  host.game.tool.pathFocus = { tile: line.tile, z: line.z, until: now + SHOW_ME_MS };
}

/** The status row: an icon, the status text and Show me. Hidden while the ride has no entrance. */
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
  const el = h('div', { class: 'reach-status', 'data-testid': 'reach-status' }, okIcon, badIcon, say, button);
  let last = '';
  return {
    el,
    update() {
      line = reachLine(ctx.game.world, rideId);
      const key = line ? `${line.status}|${line.text}` : '';
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
    },
  };
}
