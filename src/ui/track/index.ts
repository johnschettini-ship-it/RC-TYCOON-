/**
 * Track builder UI (phase-2 §7). Owner: W2-A. `mountTrackUi` adds the builder panel to the UI root and keeps it
 * in step with the shared tool state every frame. The track ride panel is reached through `createTrackRidePanel`.
 */
import { resetTrackTool, trackToolOf } from '../../render/track/toolState';
import type { UiContext } from '../context';
import { createTrackBuilder } from './panel';

export { createTrackRidePanel } from './ridePanel';

export function mountTrackUi(ctx: UiContext): void {
  const builder = createTrackBuilder(ctx);
  ctx.root.append(builder.el);
  ctx.game.onFrame(() => builder.update());
  ctx.game.onWorldChanged(() => resetTrackTool(trackToolOf(ctx.game.tool)));
}
