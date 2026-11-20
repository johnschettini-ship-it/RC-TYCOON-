/**
 * Ride pathway & queue line connection helper and UI section.
 * Provides quick actions to build queue lines, exit footpaths, or auto-connect
 * a ride's entrance and exit to the park's path network.
 */
import { BUILD_STRINGS } from '../../sim/commands/build/strings';
import { text } from '../../data/strings/en';
import { autoConnectRidePaths } from '../../sim/paths/autoConnect';
import {
  activateFootpathTool as simActivateFootpath,
  activateQueueTool as simActivateQueue,
} from '../../input/rideConnect';
import type { Ride } from '../../sim/rides/types';
import type { UiContext } from '../context';
import { h } from '../dom';
import { formatMoney } from '../format';
import { icon } from '../icons';
import { section } from '../widgets';
import { rideWarnings } from '../info';

export function activateQueueTool(ctx: UiContext, ride: Ride): void {
  simActivateQueue(ctx.game.tool, ctx.game.camera, ctx.game.world.state.map, ride);
  if (ctx.root?.dataset?.layout === 'bottom') {
    ctx.closePanel();
  }
}

export function activateFootpathTool(ctx: UiContext, ride: Ride): void {
  simActivateFootpath(ctx.game.tool, ctx.game.camera, ctx.game.world.state.map, ride);
  if (ctx.root?.dataset?.layout === 'bottom') {
    ctx.closePanel();
  }
}

export function createPathConnectSection(ctx: UiContext, rideId: number): {
  el: HTMLElement;
  update(ride: Ride): void;
} {
  const { game } = ctx;
  const queueBtn = h(
    'button',
    {
      type: 'button',
      class: 'btn',
      'data-testid': 'ride-build-queue',
      onclick: () => {
        const r = game.world.state.rides.find((x) => x.id === rideId);
        if (r) activateQueueTool(ctx, r);
      },
    },
    icon('queue'),
    h('span', { text: text('ui.ride.buildQueue') }),
  );

  const exitBtn = h(
    'button',
    {
      type: 'button',
      class: 'btn',
      'data-testid': 'ride-build-footpath',
      onclick: () => {
        const r = game.world.state.rides.find((x) => x.id === rideId);
        if (r) activateFootpathTool(ctx, r);
      },
    },
    icon('footpath'),
    h('span', { text: text('ui.ride.buildExit') }),
  );

  const autoConnectBtn = h(
    'button',
    {
      type: 'button',
      class: 'btn primary',
      'data-testid': 'ride-auto-connect',
      onclick: () => {
        const r = game.world.state.rides.find((x) => x.id === rideId);
        if (!r) return;
        const res = autoConnectRidePaths(game.world, r, (cmd) => game.dispatch(cmd));
        if (res.ok) {
          if (res.alreadyConnected) {
            ctx.toast(text('ui.ride.alreadyConnected'));
          } else {
            ctx.toast(text('ui.ride.autoConnectSuccess', { cost: formatMoney(res.cost) }));
          }
        } else {
          ctx.toast(res.reason ? text(res.reason) : text('ui.ride.autoConnectNoPath'), 'error');
        }
      },
    },
    icon('check'),
    h('span', { text: text('ui.ride.autoConnect') }),
  );

  const statusText = h('p', { class: 'muted', 'data-testid': 'path-connect-hint', text: text('ui.ride.pathConnectHint') });

  const actions = h('div', { class: 'status-actions wrap' }, queueBtn, exitBtn, autoConnectBtn);
  const el = section(text('ui.ride.pathConnect'), statusText, actions);

  return {
    el,
    update(ride: Ride) {
      const warns = rideWarnings(game.world, ride);
      const needsQueue = warns.includes(BUILD_STRINGS.entranceNeedsQueue);
      const needsExit = warns.includes(BUILD_STRINGS.exitNeedsFootpath);

      queueBtn.hidden = !needsQueue;
      exitBtn.hidden = !needsExit;
      autoConnectBtn.hidden = !needsQueue && !needsExit;

      // When fully connected, hide the section
      el.hidden = !needsQueue && !needsExit;
    },
  };
}
