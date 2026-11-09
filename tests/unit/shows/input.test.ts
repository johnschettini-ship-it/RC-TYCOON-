/**
 * Show site placement input (Phase 6 §6, §7): the ghost follows the pointer with the command's own verdict, view
 * rotation, mouse click vs touch tap + Confirm, Enter, rotate, and the new site selected after placing. Owner: W4-C.
 */
import { describe, expect, it, vi } from 'vitest';

/** Phase 6 content stays locked until W4-D raises the build phase: the placement tests unlock the show sites. */
const unlock = vi.hoisted(() => ({ on: true }));
vi.mock('../../../src/sim/research/api', async (orig) => {
  const real = await orig<typeof import('../../../src/sim/research/api')>();
  return {
    ...real,
    isUnlocked: (world: Parameters<typeof real.isUnlocked>[0], id: string) =>
      (unlock.on && (id === 'lightshow_tower' || id === 'fireworks_launcher')) || real.isUnlocked(world, id),
  };
});

import { Game } from '../../../src/game';
import { chooseShowSite, confirmShowSite, exitShowTool, refreshShowGhost, rotateShowSite, showInput, showSiteOrigin, showSiteRouter } from '../../../src/input/shows';
import { routerOf } from '../../../src/input/toolRouters';
import { showGhostOf } from '../../../src/render/shows/ghost';
import { tileIndex } from '../../../src/sim/map';
import { SHOW_ERR } from '../../../src/data/strings/shows';
import { makeTestWorld, placeFootpath } from '../../helpers/world';

function game(): Game {
  return new Game(makeTestWorld());
}

describe('show site placement tool', () => {
  it('is the router of the placeShowSite tool', () => {
    expect(routerOf('placeShowSite')).toBe(showSiteRouter);
  });

  it('hover puts a valid ghost with the build cost on the hovered tile; a mouse click places and selects the site', () => {
    const g = game();
    const map = g.world.state.map;
    chooseShowSite(g, 'lightshow_tower');
    expect(g.tool.tool).toBe('placeShowSite');
    const anchor = tileIndex(map, 20, 20);
    showSiteRouter.gesture!(g, { type: 'hover', x: 0, y: 0 }, () => anchor);
    const ghost = showGhostOf(g.tool)!;
    expect(ghost).toMatchObject({ kind: 'showSite', defId: 'lightshow_tower', x: 20, y: 20, valid: true, reason: null, cost: 250_000 });
    expect(ghost.tiles).toHaveLength(4);
    const cash = g.world.state.park.cash;
    showSiteRouter.gesture!(g, { type: 'tap', x: 0, y: 0, pointerType: 'mouse' }, () => anchor);
    expect(g.world.state.shows).toHaveLength(1);
    expect(g.world.state.park.cash).toBe(cash - 250_000);
    expect(g.tool.tool).toBe('inspect');
    expect(g.tool.selectedEntity).toEqual({ kind: 'showSite', id: g.world.state.shows[0]!.id });
    expect(showGhostOf(g.tool)).toBeNull();
  });

  it('the ghost shows the command reason when the site is blocked; a click then builds nothing', () => {
    const g = game();
    placeFootpath(g.world, 21, 21);
    chooseShowSite(g, 'lightshow_tower');
    const anchor = tileIndex(g.world.state.map, 20, 20);
    showSiteRouter.gesture!(g, { type: 'hover', x: 0, y: 0 }, () => anchor);
    expect(showGhostOf(g.tool)).toMatchObject({ valid: false, reason: SHOW_ERR.pathInWay });
    const r = confirmShowSite(g);
    expect(r).toEqual({ ok: false, reason: SHOW_ERR.pathInWay });
    expect(g.world.state.shows).toHaveLength(0);
    expect(g.tool.tool).toBe('placeShowSite');
  });

  it('touch: a tap only moves the ghost; Confirm (or Enter) places', () => {
    const g = game();
    chooseShowSite(g, 'fireworks_launcher');
    showSiteRouter.enter!(g);
    showInput(g.tool).pointer = 'touch';
    showSiteRouter.enter!(g);
    expect(showGhostOf(g.tool)).toBeNull();
    const anchor = tileIndex(g.world.state.map, 30, 30);
    showSiteRouter.gesture!(g, { type: 'tap', x: 0, y: 0, pointerType: 'touch' }, () => anchor);
    expect(g.world.state.shows).toHaveLength(0);
    expect(showGhostOf(g.tool)).toMatchObject({ x: 30, y: 30, valid: true });
    expect(showSiteRouter.keyDown!(g, 'Enter')).toBe(true);
    expect(g.world.state.shows).toHaveLength(1);
    expect(g.world.state.shows[0]).toMatchObject({ defId: 'fireworks_launcher', x: 30, y: 30 });
  });

  it('rotate turns the ghost; the command takes the map rotation (view rotation taken off)', () => {
    const g = game();
    chooseShowSite(g, 'lightshow_tower');
    showSiteRouter.gesture!(g, { type: 'hover', x: 0, y: 0 }, () => tileIndex(g.world.state.map, 20, 20));
    rotateShowSite(g);
    expect(showGhostOf(g.tool)!.rotation).toBe(1);
    g.camera.rotation = 1;
    refreshShowGhost(g);
    // Tool rotation 1 seen through view rotation 1 is map rotation 0.
    expect(showGhostOf(g.tool)!.rotation).toBe(0);
  });

  it('the hovered tile is the footprint view-origin tile in every view rotation', () => {
    const map = makeTestWorld().state.map;
    const t = tileIndex(map, 20, 20);
    expect(showSiteOrigin(map, t, 2, 0)).toEqual({ x: 20, y: 20 });
    // View 1: u = (H − 1) − y, v = x; the view-origin tile is the footprint's max y.
    expect(showSiteOrigin(map, t, 2, 1)).toEqual({ x: 20, y: 19 });
    expect(showSiteOrigin(map, t, 2, 2)).toEqual({ x: 19, y: 19 });
    expect(showSiteOrigin(map, t, 2, 3)).toEqual({ x: 19, y: 20 });
    expect(showSiteOrigin(map, t, 1, 2)).toEqual({ x: 20, y: 20 });
  });

  it('Done leaves the tool and drops the ghost; no ghost without a pointer', () => {
    const g = game();
    chooseShowSite(g, 'lightshow_tower');
    showSiteRouter.gesture!(g, { type: 'hover', x: 0, y: 0 }, () => tileIndex(g.world.state.map, 20, 20));
    exitShowTool(g);
    expect(g.tool.tool).toBe('inspect');
    expect(showGhostOf(g.tool)).toBeNull();
    expect(confirmShowSite(g)).toBeNull();
  });
});
