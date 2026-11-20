/**
 * Ride connect tool helpers: pick the queue or footpath tool at a ride's entrance or exit and centre the camera
 * there. Input code, not sim: it touches the tool state and the camera.
 */
import type { MapState } from '../sim/map';
import type { Ride } from '../sim/rides/types';
import type { Camera, ToolState } from '../render/types';
import { centerOnTile } from './camera';

/** Activate queue tool directly positioned at ride entrance outside tile. */
export function activateQueueTool(tool: ToolState, camera: Camera, map: MapState, ride: Ride): boolean {
  if (!ride.entrance || ride.entrance.outside < 0) return false;
  tool.tool = 'queue';
  tool.defId = null;
  tool.drag = null;
  tool.ghost = null;
  tool.hoverTile = ride.entrance.outside;
  centerOnTile(camera, map, ride.entrance.outside);
  return true;
}

/** Activate footpath tool directly positioned at ride exit outside tile. */
export function activateFootpathTool(tool: ToolState, camera: Camera, map: MapState, ride: Ride): boolean {
  if (!ride.exit || ride.exit.outside < 0) return false;
  tool.tool = 'footpath';
  tool.defId = null;
  tool.drag = null;
  tool.ghost = null;
  tool.hoverTile = ride.exit.outside;
  centerOnTile(camera, map, ride.exit.outside);
  return true;
}
