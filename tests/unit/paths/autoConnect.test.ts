import { describe, expect, it } from 'vitest';
import { executeCommand } from '../../../src/sim/commands';
import { makeTestWorld, placeFootpath, placeRideDirect } from '../../helpers/world';
import {
  activateFootpathTool,
  activateQueueTool,
  autoConnectRidePaths,
  entranceNeedsQueue,
  exitNeedsFootpath,
  findPathToFootpath,
  snapPathGate,
} from '../../../src/sim/paths/autoConnect';
import { Content } from '../../../src/sim/map';
import { defaultToolState, type Camera } from '../../../src/render/types';

describe('autoConnect paths & queues', () => {
  it('detects when entrance needs queue and exit needs footpath', () => {
    const w = makeTestWorld();
    const ride = placeRideDirect(w, 'carousel', 20, 20, 0);
    expect(entranceNeedsQueue(w, ride)).toBe(true);
    expect(exitNeedsFootpath(w, ride)).toBe(true);
  });

  it('snaps gate tile clicks to outside tiles', () => {
    const w = makeTestWorld();
    const ride = placeRideDirect(w, 'carousel', 20, 20, 0);
    const entOutside = ride.entrance!.outside;
    const extOutside = ride.exit!.outside;

    // Queue tool snapping on the building
    expect(snapPathGate(w, 'queue', ride.entrance!.gate)).toBe(entOutside);
    // Footpath tool snapping on the building
    expect(snapPathGate(w, 'footpath', ride.exit!.gate)).toBe(extOutside);
  });

  it('activates queue tool directly at entrance and footpath tool at exit', () => {
    const w = makeTestWorld();
    const ride = placeRideDirect(w, 'carousel', 20, 20, 0);
    const tool = defaultToolState();
    const camera: Camera = { centerX: 0, centerY: 0, zoom: 1, rotation: 0 };

    activateQueueTool(tool, camera, w.state.map, ride);
    expect(tool.tool).toBe('queue');
    expect(tool.hoverTile).toBe(ride.entrance!.outside);

    activateFootpathTool(tool, camera, w.state.map, ride);
    expect(tool.tool).toBe('footpath');
    expect(tool.hoverTile).toBe(ride.exit!.outside);
  });

  it('finds path and connects ride entrance and exit to existing footpaths', () => {
    const w = makeTestWorld();
    // Create a main footpath at y = 25, from x = 15 to x = 30
    for (let x = 15; x <= 30; x++) {
      placeFootpath(w, x, 25);
    }

    // Place carousel at (20, 20)
    const ride = placeRideDirect(w, 'carousel', 20, 20, 0);
    expect(entranceNeedsQueue(w, ride)).toBe(true);
    expect(exitNeedsFootpath(w, ride)).toBe(true);

    // Auto connect
    const res = autoConnectRidePaths(w, ride, (cmd) => executeCommand(w, cmd));
    expect(res.ok).toBe(true);
    expect(res.connectedQueue).toBe(true);
    expect(res.connectedExit).toBe(true);
    expect(res.cost).toBeGreaterThan(0);

    // After connection, warnings are satisfied
    expect(entranceNeedsQueue(w, ride)).toBe(false);
    expect(exitNeedsFootpath(w, ride)).toBe(false);

    // Entrance outside tile is queue
    expect(w.state.map.content[ride.entrance!.outside]).toBe(Content.Queue);
    // Exit outside tile is footpath
    expect(w.state.map.content[ride.exit!.outside]).toBe(Content.Footpath);

    // Calling auto-connect again reports already connected
    const second = autoConnectRidePaths(w, ride, (cmd) => executeCommand(w, cmd));
    expect(second.ok).toBe(true);
    expect(second.alreadyConnected).toBe(true);
  });
});
