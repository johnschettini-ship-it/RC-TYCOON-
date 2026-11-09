/** Owner: W1-B. HUD, toolbar, panels, title screen (Phase 0 §4.11, Phase 1 §4.7 and §7). Replace the placeholder. */
import type { Game } from '../game';
import { formatDate } from '../sim/time';

export function mountUI(root: HTMLElement, game: Game): void {
  const hud = document.createElement('div');
  hud.className = 'hud';
  hud.setAttribute('role', 'status');
  root.appendChild(hud);
  game.onFrame(() => {
    const s = game.world.state;
    hud.textContent = `${s.park.name} · $${(s.park.cash / 100).toLocaleString('en-US')} · ${formatDate(s.tick)}`;
  });
}
