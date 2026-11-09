/**
 * Title screen (Phase 1 §4.7): logo with Frost and Spark, New Park (name 1–32 characters),
 * Continue (autosave; hidden when none), Load, Import. Owner: W1-B.
 */
import { text } from '../data/strings/en';
import { createWorld } from '../sim/world';
import type { UiContext } from './context';
import { h, newId, popModal, pushModal, setText } from './dom';
import { MASCOT_H, MASCOT_W, drawMascots } from './mascots';
import { PARK_NAME_MAX, validateParkName } from './names';

function randomSeed(): number {
  try {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return (a[0] ?? 0) >>> 0;
  } catch {
    return (Date.now() & 0x7fffffff) >>> 0;
  }
}

export function createTitleScreen(ctx: UiContext): { el: HTMLElement; show(): void; hide(): void; isOpen(): boolean } {
  const { game, saves } = ctx;
  let open = false;

  const art = h('canvas', { class: 'title-art', role: 'img', 'aria-label': text('ui.title.mascots') });
  const paintArt = (): void => {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    art.width = Math.round(MASCOT_W * dpr);
    art.height = Math.round(MASCOT_H * dpr);
    const c = art.getContext('2d');
    if (!c) return;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawMascots(c, MASCOT_W, MASCOT_H);
  };

  const titleId = newId('title');
  const logo = h(
    'h1',
    { id: titleId, class: 'logo', 'aria-label': text('ui.title.name') },
    h('span', { class: 'logo-thrills', text: 'Thrills', 'aria-hidden': 'true' }),
    h('span', { class: 'logo-amp', text: '&', 'aria-hidden': 'true' }),
    h('span', { class: 'logo-chills', text: 'Chills', 'aria-hidden': 'true' }),
  );

  // Main buttons.
  const continueBtn = h('button', { type: 'button', class: 'btn big', 'data-testid': 'title-continue', text: text('ui.title.continue'), onclick: () => { if (saves.load('auto')) hide(); } });
  const main = h(
    'div',
    { class: 'title-buttons' },
    h('button', { type: 'button', class: 'btn big primary', 'data-testid': 'title-new', text: text('ui.title.newPark'), onclick: () => showView('new') }),
    continueBtn,
    h('button', { type: 'button', class: 'btn big', 'data-testid': 'title-load', text: text('ui.title.load'), onclick: () => showView('load') }),
    h('button', { type: 'button', class: 'btn big', 'data-testid': 'title-import', text: text('ui.title.import'), onclick: () => ctx.importSave(() => hide()) }),
  );

  // New park form.
  const nameId = newId('new-name');
  const nameInput = h('input', { id: nameId, type: 'text', class: 'text-input', maxlength: PARK_NAME_MAX, autocomplete: 'off', 'data-testid': 'title-name' });
  const nameError = h('p', { class: 'field-error', role: 'alert' });
  const form = h(
    'form',
    {
      class: 'title-form',
      onsubmit: (e: Event) => {
        e.preventDefault();
        const v = validateParkName(nameInput.value);
        if (!v.ok) {
          setText(nameError, v.error);
          nameInput.focus();
          return;
        }
        game.setWorld(createWorld({ seed: randomSeed(), parkName: v.name }));
        hide();
        game.setSpeed(1);
      },
    },
    h('label', { for: nameId, class: 'field-label', text: text('ui.park.name') }),
    nameInput,
    nameError,
    h(
      'div',
      { class: 'title-buttons row-buttons' },
      h('button', { type: 'button', class: 'btn big', text: text('ui.title.back'), onclick: () => showView('main') }),
      h('button', { type: 'submit', class: 'btn big primary', 'data-testid': 'title-start', text: text('ui.title.start') }),
    ),
  );

  // Load slots.
  const slotList = h('div', { class: 'title-buttons' });
  const loadView = h('div', { class: 'title-load' }, h('h2', { class: 'dialog-title', text: text('ui.load.title') }), slotList);

  const card = h('div', { class: 'title-card' }, art, logo, h('p', { class: 'tagline', text: text('ui.title.tagline') }), main, form, loadView);
  const el = h('div', { class: 'title-screen', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, hidden: true }, card);

  const renderSlots = (): void => {
    const rows = saves.slots().map(({ slot, info }) =>
      h(
        'button',
        { type: 'button', class: 'btn big slot', onclick: () => { if (saves.load(slot)) hide(); } },
        h('span', { class: 'btn-label', text: text('ui.slot.label', { n: slot }) }),
        h('span', { class: 'btn-detail', text: info ? text('ui.slot.info', { park: info.parkName, date: info.gameDate }) : text('ui.slot.empty') }),
      ),
    );
    slotList.replaceChildren(...rows, h('button', { type: 'button', class: 'btn big', text: text('ui.title.back'), onclick: () => showView('main') }));
  };

  function showView(view: 'main' | 'new' | 'load'): void {
    main.hidden = view !== 'main';
    form.hidden = view !== 'new';
    loadView.hidden = view !== 'load';
    if (view === 'main') {
      continueBtn.hidden = !saves.hasAutosave();
      (main.querySelector('button') as HTMLButtonElement | null)?.focus();
    } else if (view === 'new') {
      setText(nameError, '');
      if (!nameInput.value) nameInput.value = text('ui.title.defaultName');
      nameInput.focus();
      nameInput.select();
    } else {
      renderSlots();
      (slotList.querySelector('button') as HTMLButtonElement | null)?.focus();
    }
  }

  function show(): void {
    if (!open) {
      open = true;
      pushModal();
    }
    game.setSpeed(0);
    el.hidden = false;
    paintArt();
    showView('main');
  }

  function hide(): void {
    if (!open) return;
    open = false;
    popModal();
    el.hidden = true;
  }

  return { el, show, hide, isOpen: () => open };
}
