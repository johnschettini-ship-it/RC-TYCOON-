/**
 * Title screen (Phase 1 §4.7, Phase 5 §4.13, Phase 4 §4.9): logo with Frost and Spark; Continue (the newest save or
 * autosave; hidden when none), New game, Load, Import, Settings, Credits. New game offers Tutorial, Scenarios, and
 * Sandbox (the scenario flow, `./scenario/flow.ts`) and the free-play New Park form (name 1–32 characters, map size
 * 64–256). Owner: W3-I (Build 2; W1-B built the Build 1 screen).
 *
 * Map sizes: 64 keeps the Build 1 park layout (every tile owned inside the fence), which Build 1 flows and their
 * end-to-end tests use (they pick 64 on the form); 96–256 use the Phase 4 free-play layout (`layout: 'freePlay'`,
 * W3-G). The form starts on 96, the Phase 4 / Phase 5 §4.5 default.
 */
import { text } from '../data/strings/en';
import type { SlotInfo } from '../save';
import { MAP_SIZES } from '../data/tuning/land';
import { createWorld } from '../sim/world';
import type { UiContext } from './context';
import { h, newId, popModal, pushModal, setAttr, setText } from './dom';
import { MASCOT_H, MASCOT_W, drawMascots } from './mascots';
import { PARK_NAME_MAX, validateParkName } from './names';
import { chipGroup } from './scenario/controls';
import { createScenarioFlow, type FlowHost } from './scenario/flow';
import { newestSlot } from './scenario/model';
import { progressStore, randomSeed, registerTitle, settings, type TitleView } from './scenario/shared';
import { injectScenarioStyles } from './scenario/styles';

/** Free-play map size the form starts on (see the file comment). */
export const NEW_PARK_DEFAULT_SIZE = 96;
/** The size that keeps the Build 1 layout. */
const CLASSIC_SIZE = 64;
const LARGE_MAP = 192;

type View = 'main' | 'new' | 'load' | 'settings' | 'credits' | 'flow';

export function createTitleScreen(ctx: UiContext): { el: HTMLElement; show(): void; hide(): void; isOpen(): boolean } {
  injectScenarioStyles();
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
  const tagline = h('p', { class: 'tagline', text: text('ui.title.tagline') });

  // Main buttons.
  const newestSave = (): SlotInfo | null => {
    const auto = saves.autosaveInfo();
    return newestSlot([...saves.slots().flatMap((s) => (s.info ? [s.info] : [])), ...(auto ? [auto] : [])]);
  };
  const continueBtn = h('button', {
    type: 'button',
    class: 'btn big',
    'data-testid': 'title-continue',
    text: text('ui.title.continue'),
    onclick: () => {
      const s = newestSave();
      if (s && saves.load(s.slot)) hide();
    },
  });
  const main = h(
    'div',
    { class: 'title-buttons' },
    h('button', { type: 'button', class: 'btn big primary', 'data-testid': 'title-new', text: text('prog.title.newGame'), onclick: () => showView('new') }),
    continueBtn,
    h('button', { type: 'button', class: 'btn big', 'data-testid': 'title-load', text: text('ui.title.load'), onclick: () => showView('load') }),
    h('button', { type: 'button', class: 'btn big', 'data-testid': 'title-import', text: text('ui.title.import'), onclick: () => ctx.importSave(() => hide()) }),
    h('div', { class: 'title-buttons row-buttons' },
      h('button', { type: 'button', class: 'btn big', 'data-testid': 'title-settings', text: text('prog.title.settings'), onclick: () => showView('settings') }),
      h('button', { type: 'button', class: 'btn big', 'data-testid': 'title-credits', text: text('prog.title.credits'), onclick: () => showView('credits') }),
    ),
  );

  // New game: Tutorial, Scenarios, Sandbox, and the free-play form.
  const mode = (id: string, label: string, detail: string, onClick: () => void): { el: HTMLButtonElement; detail: HTMLElement } => {
    const d = h('span', { class: 'btn-detail', text: detail });
    const el = h('button', { type: 'button', class: 'btn tc-mode', 'data-testid': `title-${id}`, onclick: onClick }, h('span', { class: 'btn-label', text: label }), d);
    return { el, detail: d };
  };
  const tutorialMode = mode('tutorial', text('prog.newGame.tutorial'), text('prog.newGame.tutorialDetail'), () => flow.startTutorial());
  const scenariosMode = mode('scenarios', text('prog.newGame.scenarios'), text('prog.newGame.scenariosDetail'), () => flow.showScenarioSelect());
  const sandboxMode = mode('sandbox', text('prog.newGame.sandbox'), text('prog.newGame.sandboxDetail'), () => flow.showSandboxSetup());
  const newNotice = h('div');

  let mapSize: number = NEW_PARK_DEFAULT_SIZE;
  const sizeWarning = h('p', { class: 'tc-warning', role: 'status', 'data-testid': 'title-size-warning' });
  const sizePicker = chipGroup(
    text('prog.newPark.size'),
    MAP_SIZES.map((n) => ({ value: n as number, label: text('prog.newPark.sizeValue', { n }), testId: `title-size-${n}` })),
    mapSize,
    (n) => {
      mapSize = n;
      setText(sizeWarning, n >= LARGE_MAP ? text('prog.largeMapWarning') : '');
    },
  );
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
        const seed = randomSeed();
        game.setWorld(mapSize === CLASSIC_SIZE ? createWorld({ seed, parkName: v.name }) : createWorld({ seed, parkName: v.name, mapSize, layout: 'freePlay' }));
        hide();
        game.setSpeed(1);
      },
    },
    h('h2', { class: 'tc-section-title', text: text('prog.newGame.freePlay') }),
    h('label', { for: nameId, class: 'field-label', text: text('ui.park.name') }),
    nameInput,
    nameError,
    sizePicker.el,
    sizeWarning,
    h(
      'div',
      { class: 'title-buttons row-buttons' },
      h('button', { type: 'button', class: 'btn big', 'data-testid': 'title-back', text: text('ui.title.back'), onclick: () => showView('main') }),
      h('button', { type: 'submit', class: 'btn big primary', 'data-testid': 'title-start', text: text('ui.title.start') }),
    ),
  );
  const newView = h(
    'div',
    { class: 'tc-view', 'data-testid': 'title-newgame' },
    h('h2', { class: 'dialog-title', text: text('prog.newGame.title') }),
    newNotice,
    h('div', { class: 'tc-modes' }, tutorialMode.el, scenariosMode.el, sandboxMode.el),
    form,
  );

  // Load slots.
  const slotList = h('div', { class: 'title-buttons' });
  const loadView = h('div', { class: 'title-load' }, h('h2', { class: 'dialog-title', text: text('ui.load.title') }), slotList);
  const renderSlots = (): void => {
    const rows = saves.slots().map(({ slot, info }) =>
      h(
        'button',
        { type: 'button', class: 'btn big slot', onclick: () => { if (saves.load(slot)) hide(); } },
        h('span', { class: 'btn-label', text: text('ui.slot.label', { n: slot }) }),
        h('span', { class: 'btn-detail', text: info ? text('ui.slot.info', { park: info.parkName, date: info.gameDate }) : text('ui.slot.empty') }),
      ),
    );
    const auto = saves.autosaveInfo();
    if (auto) {
      rows.push(
        h(
          'button',
          { type: 'button', class: 'btn big slot', 'data-testid': 'title-slot-auto', onclick: () => { if (saves.load('auto')) hide(); } },
          h('span', { class: 'btn-label', text: text('ui.slot.auto') }),
          h('span', { class: 'btn-detail', text: text('ui.slot.info', { park: auto.parkName, date: auto.gameDate }) }),
        ),
      );
    }
    slotList.replaceChildren(...rows, h('button', { type: 'button', class: 'btn big', text: text('ui.title.back'), onclick: () => showView('main') }));
  };

  // Settings (Phase 6 adds the full menu; Build 2 has the scenario lock switch) and credits.
  const unlockBtn = h('button', {
    type: 'button',
    class: 'btn big',
    'data-testid': 'title-unlock-all',
    'aria-pressed': 'false',
    onclick: () => {
      settings.unlockAll = !settings.unlockAll;
      setAttr(unlockBtn, 'aria-pressed', settings.unlockAll ? 'true' : 'false');
    },
  }, h('span', { class: 'btn-label', text: text('prog.settings.unlockAll') }), h('span', { class: 'btn-detail', text: text('prog.settings.unlockAllDetail') }));
  const settingsView = h(
    'div',
    { class: 'tc-view' },
    h('h2', { class: 'dialog-title', text: text('prog.settings.title') }),
    unlockBtn,
    h('button', { type: 'button', class: 'btn big', text: text('ui.title.back'), onclick: () => showView('main') }),
  );
  const creditsView = h(
    'div',
    { class: 'tc-view' },
    h('h2', { class: 'dialog-title', text: text('prog.credits.title') }),
    h('p', { text: text('prog.credits.text') }),
    h('p', { class: 'tc-muted', text: text('prog.credits.mascots') }),
    h('button', { type: 'button', class: 'btn big', text: text('ui.title.back'), onclick: () => showView('main') }),
  );

  // Views lent by the scenario flow (scenario select, sandbox setup).
  const flowSlot = h('div', { class: 'tc-flow' });
  const card = h('div', { class: 'title-card' }, art, logo, tagline, main, newView, loadView, settingsView, creditsView, flowSlot);
  const el = h('div', { class: 'title-screen', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, hidden: true }, card);

  const host: FlowHost = {
    showView(view, wide, focus) {
      flowSlot.replaceChildren(view);
      showView('flow', wide);
      (focus ?? view.querySelector<HTMLElement>('button'))?.focus();
    },
    showNewGame: () => showView('new'),
    overlay: el,
    close: () => hide(),
  };
  const flow = createScenarioFlow(ctx, host);

  function showView(view: View, wide = false): void {
    main.hidden = view !== 'main';
    newView.hidden = view !== 'new';
    loadView.hidden = view !== 'load';
    settingsView.hidden = view !== 'settings';
    creditsView.hidden = view !== 'credits';
    flowSlot.hidden = view !== 'flow';
    // The card grid uses the full width; the art and tagline make room for it.
    card.classList.toggle('wide', wide);
    art.hidden = view !== 'main';
    tagline.hidden = view !== 'main';
    // The progress notice lives in one view at a time (scenario select draws its own).
    if (view !== 'new') newNotice.replaceChildren();
    if (view === 'main') {
      continueBtn.hidden = newestSave() === null;
      (main.querySelector('button') as HTMLButtonElement | null)?.focus();
    } else if (view === 'new') {
      const r = progressStore().read();
      setText(tutorialMode.detail, text(r.ok && r.progress.tutorialDone ? 'prog.newGame.tutorialDone' : 'prog.newGame.tutorialDetail'));
      newNotice.replaceChildren(...(r.ok ? [] : [flow.progressNotice() as HTMLElement]));
      setText(nameError, '');
      if (!nameInput.value) nameInput.value = text('ui.title.defaultName');
      tutorialMode.el.focus();
    } else if (view === 'load') {
      renderSlots();
      (slotList.querySelector('button') as HTMLButtonElement | null)?.focus();
    } else if (view === 'settings') {
      setAttr(unlockBtn, 'aria-pressed', settings.unlockAll ? 'true' : 'false');
      unlockBtn.focus();
    } else if (view === 'credits') {
      (creditsView.querySelector('button') as HTMLButtonElement | null)?.focus();
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

  const openAt = (view: TitleView): void => {
    show();
    if (view === 'newGame') showView('new');
    else if (view === 'scenarios') flow.showScenarioSelect();
    else if (view === 'sandbox') flow.showSandboxSetup();
  };
  registerTitle({ open: openAt, isOpen: () => open, flow });

  return { el, show, hide, isOpen: () => open };
}
