/** Owner: W1-C. Phase 1 §4.1 building commands. */
import type { BuildCommand, HandlerMap } from '../types';
import { demolish } from './demolish';
import { buildPath, buildPathLine } from './paths';
import { placeRide, placeStall } from './place';

export { BUILD_STRINGS } from './strings';
export { rideWarnings, stallWarnings } from './warnings';
export { pathCost, previewPathCommand } from './paths';

export const buildHandlers: HandlerMap<BuildCommand> = {
  buildPath,
  buildPathLine,
  placeRide,
  placeStall,
  demolish,
};
