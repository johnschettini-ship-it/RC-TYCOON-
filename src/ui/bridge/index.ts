/**
 * The title-to-play bridge in the park (VITE_ART=real build with the realistic look only;
 * `docs/superpowers/specs/2026-11-17-title-to-play-bridge-design.md`). `mountUI` calls `mountBridge` behind the build
 * check, so the website build folds all of it away. When the title's push through the arch ends (`./arrival.ts`), the
 * arrival glow (`./glow.ts`) plays and, on a new sandbox or free-play park, the welcome card (`./welcome.ts`) opens.
 * The "Make the poster real" goal panel (`./goalPanel.ts`) lives in the park, under the title in the page order.
 */
import type { UiContext } from '../context';
import { arrivalPlan, onArrival, takeNewPark } from './arrival';
import { showGlow } from './glow';
import { openWelcome } from './welcome';
import { createGoalPanel } from './goalPanel';

export function mountBridge(ctx: UiContext, titleEl: HTMLElement): void {
  const { game, root } = ctx;
  const goal = createGoalPanel(ctx);
  root.insertBefore(goal.el, titleEl);
  game.onFrame(() => goal.update(performance.now()));
  onArrival(({ reduced }) => {
    const plan = arrivalPlan({ reduced, newPark: takeNewPark(), kind: game.world.state.scenario.kind });
    if (plan.glow) showGlow();
    if (plan.welcome) openWelcome(ctx);
  });
}
