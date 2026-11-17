/**
 * The welcome card's pause (VITE_ART=real build with the realistic look only; title-to-play bridge §3): the game is
 * paused while the card is open and gets its speed back when it closes. Pure: the card (`./welcome.ts`) gives it the
 * game's speed.
 */
import type { Speed } from '../../loop';

export interface WelcomeSession {
  open(): void;
  close(): void;
  isOpen(): boolean;
}

export function welcomeSession(game: { speed(): Speed; setSpeed(s: Speed): void }): WelcomeSession {
  let saved: Speed | null = null;
  return {
    open() {
      if (saved !== null) return;
      saved = game.speed();
      game.setSpeed(0);
    },
    close() {
      if (saved === null) return;
      const s = saved;
      saved = null;
      game.setSpeed(s);
    },
    isOpen: () => saved !== null,
  };
}
