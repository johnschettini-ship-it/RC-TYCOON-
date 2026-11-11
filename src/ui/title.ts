/**
 * Title screen (Phase 1 §4.7, Phase 5 §4.13, Phase 4 §4.9; Phase 7 design E, `docs/superpowers/specs/thrills-and-chills/
 * phase-7-title-screen.md`): a pixel skyline of the park with the name as pixel lettering in the sky, and the menu on the
 * lawn: Continue (the newest save or autosave, with its park line; hidden when none), New game (the main button when
 * there is no save), Load, Import, Settings, Credits. The sub-views lie on a plate (desktop) or a bottom sheet (phone)
 * over a veil of the sky; the scene and the name never move when a view opens. `titleScreen/layout.ts` places every
 * picture (whole CSS px, whole-number scales); this file writes its numbers as custom properties and data attributes. New game offers Tutorial, Scenarios, and
 * Sandbox (the scenario flow, `./scenario/flow.ts`) and the free-play New Park form (name 1–32 characters, map size
 * 64–256). Owner: W3-I (Build 2; W1-B built the Build 1 screen).
 *
 * Settings opens the Phase 6 settings screen (`./settings`, W4-F), which replaced the Build 2 settings view; its
 * Gameplay section holds "Unlock all scenarios" (now a stored setting).
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
import { h, newId, popModal, pushModal, setAttr, setText, toggleClass } from './dom';
import { PARK_NAME_MAX, validateParkName } from './names';
import { chipGroup } from './scenario/controls';
import { createScenarioFlow, type FlowHost } from './scenario/flow';
import { newestSlot, saveDateLabel } from './scenario/model';
import { progressStore, randomSeed, registerTitle, type TitleView } from './scenario/shared';
import { openSettingsScreen } from './settings';
import { injectScenarioStyles } from './scenario/styles';
import { titleLayout, type SafeInsets, type TitleLayout } from './titleScreen/layout';
import { lastRowPicture, pictureCanvas, type PictureData } from './titleScreen/picture';
import sceneWide from './titleScreen/art/scene-wide.json';
import sceneTall from './titleScreen/art/scene-tall.json';
import logoLine from './titleScreen/art/logo-line.json';
import logoStack from './titleScreen/art/logo-stack.json';

/** Free-play map size the form starts on (see the file comment). */
export const NEW_PARK_DEFAULT_SIZE = 96;
/** The size that keeps the Build 1 layout. */
const CLASSIC_SIZE = 64;
const LARGE_MAP = 192;
/** The pictures (decoded only when their kind first shows). */
const PICTURES: Record<'wide' | 'tall' | 'line' | 'stack', PictureData> = {
  wide: sceneWide as PictureData,
  tall: sceneTall as PictureData,
  line: logoLine as PictureData,
  stack: logoStack as PictureData,
};

type View = 'main' | 'new' | 'load' | 'credits' | 'flow';

export function createTitleScreen(ctx: UiContext): { el: HTMLElement; show(): void; hide(): void; isOpen(): boolean } {
  injectScenarioStyles();
  const { game, saves } = ctx;
  let open = false;

  // The scene and the fill below it (canvases swapped in by `layout`), the veil, and the name.
  const sceneLabel = text('ui.title.scene');
  let scene: HTMLCanvasElement | null = null;
  let lawn: HTMLCanvasElement | null = null;
  // Reads the safe-area insets (its paddings are var(--safe-top) and so on); its size changes with them.
  const safeProbe = h('div', { class: 'title-safe-probe', 'aria-hidden': 'true' });
  const veil = h('div', { class: 'title-veil', 'aria-hidden': 'true', hidden: true });
  const titleId = newId('title');
  const logo = h('h1', { id: titleId, class: 'title-logo', 'aria-label': text('ui.title.name') });

  // The menu: Continue and New game, then Load, Import, Settings, Credits.
  const newestSave = (): SlotInfo | null => {
    const auto = saves.autosaveInfo();
    return newestSlot([...saves.slots().flatMap((s) => (s.info ? [s.info] : [])), ...(auto ? [auto] : [])]);
  };
  const continueDetail = h('span', { class: 'btn-detail title-park-line' });
  const continueBtn = h(
    'button',
    {
      type: 'button',
      class: 'btn primary main go',
      'data-testid': 'title-continue',
      onclick: () => {
        const s = newestSave();
        if (s && saves.load(s.slot)) hide();
      },
    },
    h('span', { class: 'btn-label', text: text('ui.title.continue') }),
    continueDetail,
  );
  const newDetail = h('span', { class: 'btn-detail', text: text('ui.title.firstPark') });
  const newBtn = h(
    'button',
    { type: 'button', class: 'btn main', 'data-testid': 'title-new', onclick: () => showView('new') },
    h('span', { class: 'btn-label', text: text('prog.title.newGame') }),
    newDetail,
  );
  const small = (id: string, label: string, onClick: () => void, popup = false): HTMLButtonElement =>
    h('button', { type: 'button', class: 'btn', 'data-testid': `title-${id}`, 'aria-haspopup': popup ? 'dialog' : null, onclick: onClick }, h('span', { class: 'btn-label', text: label }));
  const main = h(
    'div',
    { class: 'title-menu' },
    h('div', { class: 'title-menu-main' }, continueBtn, newBtn),
    h(
      'div',
      { class: 'title-menu-small' },
      h('div', { class: 'title-pair' }, small('load', text('ui.title.load'), () => showView('load')), small('import', text('ui.title.import'), () => ctx.importSave(() => hide()))),
      h('div', { class: 'title-pair' }, small('settings', text('prog.title.settings'), () => openSettingsScreen(ctx), true), small('credits', text('prog.title.credits'), () => showView('credits'))),
    ),
  );

  /** The two states (PORTING §5): with a save, Continue is the main button; with none, New game is. */
  const showSaveState = (): void => {
    const save = newestSave();
    continueBtn.hidden = save === null;
    if (save) setText(continueDetail, text('ui.title.continueDetail', { park: save.parkName, date: saveDateLabel(save.tick) }));
    newDetail.hidden = save !== null;
    toggleClass(newBtn, 'primary', save === null);
    toggleClass(newBtn, 'go', save === null);
  };

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

  // Credits.
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
  const plate = h('div', { class: 'title-plate', hidden: true }, h('div', { class: 'title-grab', 'aria-hidden': 'true' }), newView, loadView, creditsView, flowSlot);
  const el = h('div', { class: 'title-screen', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, hidden: true }, safeProbe, veil, logo, main, plate);

  // Layout (G1): the numbers of `titleLayout` as custom properties and data attributes; again on every size change.
  let menuH = 0;
  const vars = new Map<string, string>();
  const setVar = (name: string, value: string): void => {
    if (vars.get(name) === value) return;
    vars.set(name, value);
    el.style.setProperty(name, value);
  };
  const apply = (l: TitleLayout): void => {
    setAttr(el, 'data-kind', l.kind);
    setAttr(el, 'data-menu', l.menu);
    setAttr(el, 'data-compact', l.compact ? 'true' : null);
    setAttr(el, 'data-scene', l.scene);
    setAttr(el, 'data-name', l.name);
    setVar('--tl-ms', String(l.ms));
    setVar('--tl-mb', `${l.mb}px`);
    // The desktop menu block in whole px (G10, G13); the phone and low menus, the sheet and the low plate are centred
    // on whole px (G1), their other sizes are fixed in CSS.
    const b = l.menuBox;
    if (b) {
      setVar('--tl-menu-left', `${b.left}px`);
      setVar('--tl-menu-w', `${b.width}px`);
      setVar('--tl-h1', `${b.h1}px`);
      setVar('--tl-h2', `${b.h2}px`);
      setVar('--tl-h3', `${b.h3}px`);
      setVar('--tl-gap', `${b.gap}px`);
    } else if (l.menuPlace) {
      setVar('--tl-menu-left', `${l.menuPlace.left}px`);
      setVar('--tl-menu-w', `${l.menuPlace.width}px`);
    }
    if (l.platePlace) {
      setVar('--tl-plate-left', `${l.platePlace.left}px`);
      setVar('--tl-plate-w', `${l.platePlace.width}px`);
    }
  };
  /** The safe-area insets in whole CSS px. */
  const readSafe = (): SafeInsets => {
    const st = getComputedStyle(safeProbe);
    const px = (v: string): number => Math.round(parseFloat(v) || 0);
    return { top: px(st.paddingTop), right: px(st.paddingRight), bottom: px(st.paddingBottom), left: px(st.paddingLeft) };
  };
  const place = (l: TitleLayout, height: number): void => {
    const sceneData = PICTURES[l.scene];
    const canvas = pictureCanvas(sceneData);
    if (scene !== canvas) {
      canvas.className = 'title-scene';
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', sceneLabel);
      if (scene) scene.replaceWith(canvas);
      else el.prepend(canvas);
      scene = canvas;
      // G7: the scene's last row, repeated downward (each column keeps its own colour).
      const fill = pictureCanvas(lastRowPicture(sceneData));
      fill.className = 'title-lawn';
      fill.setAttribute('aria-hidden', 'true');
      if (lawn) lawn.replaceWith(fill);
      else canvas.after(fill);
      lawn = fill;
    }
    const nameData = PICTURES[l.name];
    const name = pictureCanvas(nameData);
    if (logo.firstChild !== name) {
      name.setAttribute('aria-hidden', 'true');
      logo.replaceChildren(name);
    }
    const sceneBottom = l.sceneY + sceneData.h * l.s;
    setVar('--tl-scene-x', `${l.sceneX}px`);
    setVar('--tl-scene-y', `${l.sceneY}px`);
    setVar('--tl-scene-w', `${sceneData.w * l.s}px`);
    setVar('--tl-scene-h', `${sceneData.h * l.s}px`);
    setVar('--tl-name-x', `${l.nameX}px`);
    setVar('--tl-name-y', `${l.nameY}px`);
    setVar('--tl-name-w', `${nameData.w * l.nameS}px`);
    setVar('--tl-name-h', `${nameData.h * l.nameS}px`);
    setVar('--tl-name-bottom', `${l.nameY + nameData.h * l.nameS}px`);
    setVar('--tl-lawn-top', `${sceneBottom}px`);
    setVar('--tl-lawn-h', `${Math.max(0, height - sceneBottom)}px`);
    if (lawn) lawn.hidden = sceneBottom >= height;
  };
  // G1, the phone and low menus: their buttons share the menu's width by flex parts (main.css), which puts the inner
  // edges on fractions of a px. After the browser's own layout, each pair and button is fixed at its measured edges,
  // rounded to whole px from the menu's whole-px left edge; the gaps stay whole, and the widths follow the CSS (its
  // flex parts, gaps, padding, and text size). Only on a layout, never in a frame. The menu keeps its G6 width.
  const snapped = (): HTMLElement[] => [...main.querySelectorAll<HTMLElement>('.title-pair, .btn')];
  const unsnapButtons = (): void => {
    for (const x of snapped()) {
      x.style.removeProperty('flex');
      x.style.removeProperty('width');
    }
  };
  const snapButtons = (): void => {
    const left = main.getBoundingClientRect().left;
    // Every edge is read before any width is written (one layout pass).
    const edges = snapped()
      .filter((x) => x.getClientRects().length > 0)
      .map((x) => {
        const r = x.getBoundingClientRect();
        return { x, width: Math.round(r.right - left) - Math.round(r.left - left) };
      });
    for (const { x, width } of edges) {
      x.style.flex = 'none';
      x.style.width = `${width}px`;
    }
    // A button already at its narrowest (its text, at large text sizes) cannot lose the fraction: the browser keeps it
    // wider and the row would wrap. Then the browser's own layout stays, with fractional inner edges.
    if (edges.some(({ x, width }) => Math.abs(x.getBoundingClientRect().width - width) > 0.01)) unsnapButtons();
  };
  const layout = (): void => {
    if (!open) return;
    const w = el.clientWidth;
    const height = el.clientHeight;
    if (w === 0 || height === 0) return;
    const safe = readSafe();
    setVar('--tl-safe-top', `${safe.top}px`);
    setVar('--tl-safe-right', `${safe.right}px`);
    setVar('--tl-safe-bottom', `${safe.bottom}px`);
    setVar('--tl-safe-left', `${safe.left}px`);
    // The menu form depends only on the window (G2): set it first, then measure the menu block. While a view
    // shows, the menu stays in the layout (invisible and inert), so it is measured in its current form too.
    unsnapButtons();
    apply(titleLayout({ w, h: height, menuH, safe }));
    menuH = Math.round(main.getBoundingClientRect().height);
    const l = titleLayout({ w, h: height, menuH, safe });
    apply(l);
    place(l, height);
    if (l.menuPlace) snapButtons();
  };
  const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => layout());
  resize?.observe(el);
  resize?.observe(main);
  resize?.observe(safeProbe, { box: 'border-box' });

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
    // While a view shows, the menu keeps its place in the layout (so it can be measured) but is invisible and
    // inert: no pointer, no focus, nothing for a screen reader.
    setAttr(main, 'inert', view === 'main' ? null : '');
    newView.hidden = view !== 'new';
    loadView.hidden = view !== 'load';
    creditsView.hidden = view !== 'credits';
    flowSlot.hidden = view !== 'flow';
    // The views lie on the plate over a veil of the sky; the card grid takes the wide plate.
    plate.hidden = view === 'main';
    veil.hidden = view === 'main';
    toggleClass(plate, 'wide', wide);
    plate.scrollTop = 0;
    // The progress notice lives in one view at a time (scenario select draws its own).
    if (view !== 'new') newNotice.replaceChildren();
    if (view === 'main') {
      showSaveState();
      layout();
      main.querySelector<HTMLButtonElement>('button:not([hidden])')?.focus();
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
    } else if (view === 'credits') {
      (creditsView.querySelector('button') as HTMLButtonElement | null)?.focus();
    }
  }

  // While the title is open, the rest of the UI behind it is inert: no focus, no pointer, nothing for a screen reader.
  // The toast hosts and live regions stay out of it (a toast is still seen and announced); dialogs opened later (the
  // settings screen, a confirm dialog) are appended after it and stay usable.
  let madeInert: HTMLElement[] = [];
  const keepsLive = (c: HTMLElement): boolean =>
    c.classList.contains('toast-host') || c.hasAttribute('aria-live') || c.getAttribute('role') === 'status' || c.getAttribute('role') === 'alert';
  const holdUi = (): void => {
    const parent = el.parentElement;
    if (!parent) return;
    madeInert = [...parent.children].filter((c): c is HTMLElement => c instanceof HTMLElement && c !== el && !c.inert && !keepsLive(c));
    for (const c of madeInert) c.inert = true;
  };
  const releaseUi = (): void => {
    for (const c of madeInert) c.inert = false;
    madeInert = [];
  };
  // Tab and Shift+Tab go round the title's own controls (a dialog opened from it holds its own focus).
  el.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab' || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const f = [...el.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]):not([type="radio"]), input[type="radio"]:checked, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(
      (x) => x.getClientRects().length > 0 && x.closest('[inert]') === null && getComputedStyle(x).visibility !== 'hidden',
    );
    const first = f[0];
    const last = f[f.length - 1];
    if (!first || !last) return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });

  function show(): void {
    if (!open) {
      open = true;
      pushModal();
      holdUi();
    }
    game.setSpeed(0);
    el.hidden = false;
    showView('main');
  }

  function hide(): void {
    if (!open) return;
    open = false;
    popModal();
    releaseUi();
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
