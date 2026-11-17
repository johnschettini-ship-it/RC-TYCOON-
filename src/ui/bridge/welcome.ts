/**
 * The welcome card (VITE_ART=real build with the realistic look only; title-to-play bridge §3): on a new sandbox or
 * free-play park from the title, when the push through the arch ends, a card in the poster's style welcomes the
 * player. Cream paper, a coral double frame, "Welcome to" in brown, the name in the title's letter colours with a brown
 * outline, one line of text and one button, "Let's go" (`src/styles/realBridge.css`).
 *
 * A modal dialog: the focus goes to the button, Escape or the button closes it, and the focus then returns to the
 * game (the page; the map keys work again). The game is paused while it is open (`./welcomeModel.ts`); the tip bubble
 * and the other overlays wait (`data-tc-modal`, `pushModal`).
 */
import { text } from '../../data/strings/en';
import type { UiContext } from '../context';
import { h, newId, popModal, pushModal } from '../dom';
import { welcomeSession } from './welcomeModel';

/** The name as coloured words ("Thrills", "&", "Chills"), as on the title. */
function nameWords(name: string): HTMLElement[] {
  const at = name.indexOf('&');
  const word = (t: string, cls: string): HTMLElement => h('span', { class: `tc-word ${cls}`, text: t });
  if (at < 0) return [word(name, 'tc-word-y')];
  return [word(name.slice(0, at).trim(), 'tc-word-y'), word('&', 'tc-word-c'), word(name.slice(at + 1).trim(), 'tc-word-b')];
}

export interface WelcomeCard {
  close(): void;
  el: HTMLElement;
}

export function openWelcome(ctx: UiContext): WelcomeCard {
  const { game, root } = ctx;
  const session = welcomeSession({ speed: () => game.speed, setSpeed: (s) => game.setSpeed(s) });
  const titleId = newId('welcome');
  const name = text('ui.title.name');
  const go = h('button', { type: 'button', class: 'btn tc-welcome-go', 'data-testid': 'welcome-go', text: text('ui.welcome.go'), onclick: () => close() });
  const card = h(
    'div',
    { class: 'tc-welcome', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, 'data-testid': 'welcome-card' },
    h(
      'h2',
      { id: titleId, class: 'tc-welcome-title' },
      h('span', { class: 'tc-welcome-to', text: text('ui.welcome.to') }),
      ' ',
      // The name as plain text in coloured words (spaced, so it reads "Thrills & Chills"; no ARIA on the span).
      h('span', { class: 'tc-welcome-name' }, ...nameWords(name).flatMap((w, i) => (i === 0 ? [w] : [' ', w]))),
    ),
    h('p', { class: 'tc-welcome-body', text: text('ui.welcome.body') }),
    go,
  );
  const backdrop = h('div', { class: 'modal-backdrop tc-welcome-backdrop' }, card);
  let open = true;
  const close = (): void => {
    if (!open) return;
    open = false;
    backdrop.remove();
    popModal();
    session.close();
    // The focus returns to the game: the page, where the map keys listen.
    if (document.activeElement instanceof HTMLElement && card.contains(document.activeElement)) document.activeElement.blur();
  };
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === 'Tab') {
      // One control: the focus stays on it.
      e.preventDefault();
      go.focus();
    }
  });
  session.open();
  pushModal();
  root.append(backdrop);
  go.focus();
  return { close, el: card };
}
