/**
 * Title screen flow for Build 2 (Phase 5 §4.4, §4.5, §4.13). Owner: W3-I; `../title.ts` hosts it.
 * New game → Tutorial, Scenarios, Sandbox (and the free-play New Park form in `../title.ts`). Scenario select is a
 * card grid; the detail sheet is a side panel on desktop and a bottom sheet on phones. New games come from the sim
 * factories (`createScenarioWorld`, `createSandboxWorld` — W3-H; `createTutorialWorld` — W3-I) and go in with
 * `game.setWorld`. The end screen opens on a `scenarioEnded` event (the loop pauses).
 */
import { SCENARIOS, getScenarioDef, type Difficulty, type ScenarioDef } from '../../data/scenarios';
import type { Climate, TerrainStyle } from '../../data/scenarios/types';
import { text } from '../../data/strings/en';
import { MAP_SIZES } from '../../data/tuning/land';
import { DIFFICULTIES, PROGRESS_KEY } from '../../progress';
import { scenarioResult, type ScenarioResult } from '../../sim/scenario/api';
import { createSandboxWorld, createScenarioWorld } from '../../sim/scenario/start';
import type { SandboxOptions } from '../../sim/scenario/types';
import { createTutorialWorld } from '../../sim/tutorial/start';
import { formatDate } from '../../sim/time';
import type { SimEvent, World } from '../../sim/types';
import type { UiContext } from '../context';
import { confirmDialog, openDialog, type DialogHandle } from '../dialogs';
import { h, newId, setText } from '../dom';
import { formatMoney } from '../format';
import { chipGroup } from './controls';
import { mascotCanvas } from './mascotArt';
import { deadlineText, endFacts, goalText, scenarioCards, startConditions, type ScenarioCard } from './model';
import { downloadText, openTitle, progressStore, randomSeed, settings } from './shared';

export interface ScenarioFlow {
  /** Tutorial, Scenarios, Sandbox (and the free-play New Park form). */
  showNewGame(): void;
  /** Card grid: name, stars, climate and After Dark icons, lock state, best stars per preset. */
  showScenarioSelect(): void;
  /** Description, goals, deadline, start conditions, preset picker, Start (side panel; bottom sheet on phones). */
  showScenarioDetail(id: string): void;
  startScenario(id: string, difficulty: Difficulty): void;
  showSandboxSetup(): void;
  startSandbox(options: SandboxOptions, parkName: string): void;
  startTutorial(): void;
  /**
   * End screen on a `scenarioEnded` event: the facts of the sim's `scenarioResult` (the one source for the end
   * screen and the progress record); Keep playing, Scenario select / Try again, Main menu. Nothing opens when the
   * world has no finished run.
   */
  showEndScreen(event: Extract<SimEvent, { type: 'scenarioEnded' }>): void;
  /** The unreadable-progress notice (error, Export raw data, Reset progress), or null when progress reads fine. */
  progressNotice(): HTMLElement | null;
}

/** What the title screen lends the flow. */
export interface FlowHost {
  /** Show a view in the title card (`wide` for the card grid). */
  showView(el: HTMLElement, wide: boolean, focus?: HTMLElement | null): void;
  /** The New game view of the title. */
  showNewGame(): void;
  /** Layer over the whole title screen (the detail sheet). */
  overlay: HTMLElement;
  /** Close the title screen: a game starts. */
  close(): void;
}

const STAR = '★';
const NO_STAR = '☆';
const starsText = (n: number, of: number): string => STAR.repeat(n) + NO_STAR.repeat(Math.max(0, of - n));
const CLIMATES: readonly Climate[] = ['temperate', 'cold', 'hot', 'coastal'];
const TERRAINS: readonly TerrainStyle[] = ['flat', 'rollingHills', 'mountains', 'islands', 'riverValley'];

function head(title: string, onBack: () => void): HTMLElement {
  return h(
    'div',
    { class: 'tc-view-head' },
    h('h2', { text: title }),
    h('button', { type: 'button', class: 'btn', 'data-testid': 'flow-back', text: text('prog.back'), onclick: onBack }),
  );
}

export function createScenarioFlow(ctx: UiContext, host: FlowHost): ScenarioFlow {
  const { game, root } = ctx;
  let detail: { close(): void } | null = null;
  let endDialog: DialogHandle | null = null;

  const start = (world: World): void => {
    closeDetail();
    game.setWorld(world);
    host.close();
    game.setSpeed(1);
  };

  function closeDetail(): void {
    detail?.close();
    detail = null;
  }

  // ---------------------------------------------------------------- scenario select

  function progressNotice(error: string, raw: string): HTMLElement {
    return h(
      'div',
      { class: 'tc-notice', role: 'alert', 'data-testid': 'progress-error' },
      h('p', { text: error }),
      h('p', { class: 'tc-muted', text: text('prog.progress.blocked') }),
      h(
        'div',
        { class: 'tc-row' },
        h('button', { type: 'button', class: 'btn', 'data-testid': 'progress-export', text: text('prog.progress.export'), onclick: () => downloadText(`${PROGRESS_KEY}.json`, raw) }),
        h('button', {
          type: 'button',
          class: 'btn danger',
          'data-testid': 'progress-reset',
          text: text('prog.progress.reset'),
          onclick: () =>
            confirmDialog(root, text('prog.progress.resetConfirm'), text('prog.progress.resetYes'), text('prog.progress.resetNo'), () => {
              if (progressStore().reset()) ctx.toast(text('prog.progress.resetDone'), 'info');
              flow.showScenarioSelect();
            }),
        }),
      ),
    );
  }

  function cardEl(c: ScenarioCard): HTMLElement {
    const state = c.open ? text('prog.select.open') : text('prog.select.locked');
    const best = DIFFICULTIES.map((d) => {
      const n = c.best[d];
      return h('span', { title: text(`prog.difficulty.${d}`), text: `${text(`prog.difficulty.${d}`).charAt(0)} ${n === null ? '–' : starsText(n, 3)}` });
    });
    const night = c.afterDark === 'off' ? null : h('span', { class: 'tc-tag night', text: text(`prog.afterDark.${c.afterDark}`) });
    const el = h(
      'button',
      {
        type: 'button',
        class: `tc-card${c.open ? '' : ' locked'}`,
        'data-testid': `scenario-card-${c.id}`,
        'aria-disabled': c.open ? 'false' : 'true',
        'aria-label': text('prog.select.cardLabel', { name: c.name, n: c.stars, state }),
        onclick: () => {
          if (c.open) flow.showScenarioDetail(c.id);
        },
      },
      h('span', { class: 'tc-card-name', text: c.name }),
      h('span', { class: 'tc-stars', 'aria-hidden': 'true', text: starsText(c.stars, 5) }),
      h('span', { class: 'tc-tags' }, h('span', { class: `tc-tag climate-${c.climate}`, text: text(`prog.climate.${c.climate}`) }), night),
      c.open ? h('span', { class: 'tc-best', 'aria-label': text('prog.select.best') }, ...best) : h('span', { class: 'tc-lock', text: `${text('prog.select.locked')} · ${text('prog.select.lockedHint', { n: c.winsNeeded })}` }),
      c.earlier ? h('span', { class: 'tc-earlier', text: text('prog.select.earlier') }) : null,
    );
    return el;
  }

  // ---------------------------------------------------------------- detail sheet

  function detailSheet(def: ScenarioDef): void {
    closeDetail();
    let difficulty: Difficulty = 'standard';
    const titleId = newId('scenario-detail');
    const startRows = h('dl', { class: 'tc-facts' });
    const presetNote = h('p', { class: 'tc-muted' });
    const renderStart = (): void => {
      const s = startConditions(def, difficulty);
      const rows: Array<[string, string]> = [
        [text('prog.detail.cash'), formatMoney(s.cash)],
        [text('prog.detail.loan'), formatMoney(s.loan)],
        [text('prog.detail.maxLoan'), formatMoney(s.maxLoan)],
        [text('prog.detail.climate'), text(`prog.climate.${def.climate}`)],
        [text('prog.detail.night'), text(`prog.afterDark.${def.afterDark}`)],
      ];
      startRows.replaceChildren(...rows.flatMap(([k, v]) => [h('dt', { text: k }), h('dd', { text: v })]));
      setText(presetNote, text(`prog.difficulty.${difficulty}Detail`));
    };
    const presets = chipGroup(
      text('prog.detail.preset'),
      DIFFICULTIES.map((d) => ({ value: d, label: text(`prog.difficulty.${d}`), testId: `preset-${d}` })),
      difficulty,
      (d) => {
        difficulty = d;
        renderStart();
      },
      'preset-picker',
    );
    presets.el.querySelector('.tc-chips')?.classList.add('tc-presets');
    renderStart();
    const startBtn = h('button', { type: 'button', class: 'btn big primary', 'data-testid': 'scenario-start', text: text('prog.detail.start'), onclick: () => flow.startScenario(def.id, difficulty) });
    const close = h('button', { type: 'button', class: 'btn', 'data-testid': 'scenario-detail-close', text: text('prog.detail.close'), onclick: () => closeDetail() });
    const sheet = h(
      'div',
      { class: 'tc-detail', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, 'data-testid': 'scenario-detail' },
      h('div', { class: 'tc-view-head' }, h('h2', { id: titleId, text: text(def.nameKey) }), close),
      h('span', { class: 'tc-stars', text: starsText(def.stars, 5), 'aria-label': text('prog.select.difficultyStars', { n: def.stars }) }),
      h('p', { text: def.description }),
      h('h3', { class: 'tc-section-title', text: text('prog.detail.goals') }),
      h('ul', { class: 'tc-goals' }, ...def.objectives.map((o) => h('li', { text: goalText(o) }))),
      def.objectives.length > 1 ? h('p', { class: 'tc-muted', text: text('prog.detail.allGoals') }) : null,
      h('h3', { class: 'tc-section-title', text: text('prog.detail.deadline') }),
      h('p', { text: deadlineText(def) }),
      h('h3', { class: 'tc-section-title', text: text('prog.detail.startConditions') }),
      startRows,
      presets.el,
      presetNote,
      startBtn,
    );
    const backdrop = h('div', { class: 'tc-sheet-backdrop' }, sheet);
    backdrop.addEventListener('pointerdown', (e) => {
      if (e.target === backdrop) closeDetail();
    });
    sheet.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeDetail();
      } else if (e.key === 'Tab') {
        // Keep focus inside the sheet.
        const f = [...sheet.querySelectorAll<HTMLElement>('button')].filter((b) => b.tabIndex >= 0);
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
      }
    });
    host.overlay.append(backdrop);
    const opener = document.activeElement as HTMLElement | null;
    detail = {
      close() {
        backdrop.remove();
        if (opener && document.contains(opener)) opener.focus();
      },
    };
    startBtn.focus();
  }

  // ---------------------------------------------------------------- sandbox setup

  function sandboxView(): HTMLElement {
    const opts: SandboxOptions = {
      mapSize: 96,
      terrainStyle: 'rollingHills',
      seed: randomSeed(),
      climate: 'temperate',
      afterDark: true,
      unlimitedMoney: true,
      allUnlocked: true,
      guestsArrive: true,
      breakdowns: true,
      weather: 'normal',
      awards: true,
    };
    const warning = h('p', { class: 'tc-warning', role: 'status', 'data-testid': 'sandbox-size-warning' });
    const showWarning = (): void => setText(warning, opts.mapSize >= 192 ? text('prog.largeMapWarning') : '');
    const size = chipGroup(
      text('prog.sandbox.mapSize'),
      MAP_SIZES.map((n) => ({ value: n, label: text('prog.newPark.sizeValue', { n }), testId: `sandbox-size-${n}` })),
      opts.mapSize as (typeof MAP_SIZES)[number],
      (n) => {
        opts.mapSize = n;
        showWarning();
      },
    );
    const terrain = chipGroup(text('prog.sandbox.terrain'), TERRAINS.map((t) => ({ value: t, label: text(`prog.terrain.${t}`) })), opts.terrainStyle, (t) => (opts.terrainStyle = t));
    const climate = chipGroup(text('prog.sandbox.climate'), CLIMATES.map((c) => ({ value: c, label: text(`prog.climate.${c}`) })), opts.climate, (c) => (opts.climate = c));
    const onOff = (key: 'afterDark' | 'unlimitedMoney' | 'allUnlocked' | 'guestsArrive' | 'breakdowns' | 'awards'): HTMLElement =>
      chipGroup(
        text(`prog.sandbox.${key}`),
        [
          { value: true, label: text('prog.sandbox.on'), testId: `sandbox-${key}-on` },
          { value: false, label: text('prog.sandbox.off'), testId: `sandbox-${key}-off` },
        ],
        opts[key],
        (v) => (opts[key] = v),
      ).el;
    const weather = chipGroup(
      text('prog.sandbox.weather'),
      (['normal', 'alwaysSunny'] as const).map((w) => ({ value: w, label: text(`prog.weather.${w}`) })),
      opts.weather,
      (w) => (opts.weather = w),
    );
    const seedId = newId('sandbox-seed');
    const seedInput = h('input', { id: seedId, type: 'text', inputmode: 'numeric', class: 'text-input', autocomplete: 'off', 'data-testid': 'sandbox-seed', value: String(opts.seed) });
    const seedError = h('p', { class: 'field-error', role: 'alert' });
    const nameId = newId('sandbox-name');
    const nameInput = h('input', { id: nameId, type: 'text', class: 'text-input', maxlength: 32, autocomplete: 'off', 'data-testid': 'sandbox-name', value: text('prog.sandbox.parkName') });
    const startBtn = h('button', {
      type: 'button',
      class: 'btn big primary',
      'data-testid': 'sandbox-start',
      text: text('prog.sandbox.start'),
      onclick: () => {
        const raw = seedInput.value.trim();
        const seed = /^\d{1,10}$/.test(raw) ? Number(raw) : NaN;
        if (!Number.isInteger(seed) || seed > 0xffffffff) {
          setText(seedError, text('prog.sandbox.seedError'));
          seedInput.focus();
          return;
        }
        const name = nameInput.value.trim() || text('prog.sandbox.parkName');
        flow.startSandbox({ ...opts, seed }, name.slice(0, 32));
      },
    });
    showWarning();
    return h(
      'div',
      { class: 'tc-view', 'data-testid': 'sandbox-setup' },
      head(text('prog.sandbox.title'), () => host.showNewGame()),
      h('div', { class: 'tc-field' }, h('label', { for: nameId, class: 'field-label', text: text('ui.park.name') }), nameInput),
      h('div', { class: 'tc-options' }, size.el, warning, terrain.el),
      h(
        'div',
        { class: 'tc-field' },
        h('label', { for: seedId, class: 'field-label', text: text('prog.sandbox.seed') }),
        h('div', { class: 'tc-row' }, seedInput, h('button', { type: 'button', class: 'btn', 'data-testid': 'sandbox-random', text: text('prog.sandbox.random'), onclick: () => { seedInput.value = String(randomSeed()); setText(seedError, ''); } })),
        seedError,
      ),
      h('div', { class: 'tc-options tc-option-grid' }, climate.el, onOff('afterDark'), onOff('unlimitedMoney'), onOff('allUnlocked'), onOff('guestsArrive'), onOff('breakdowns'), weather.el, onOff('awards')),
      startBtn,
    );
  }

  // ---------------------------------------------------------------- end screen

  const flow: ScenarioFlow = {
    showNewGame() {
      host.showNewGame();
    },

    showScenarioSelect() {
      closeDetail();
      const r = progressStore().read();
      const cards = scenarioCards(SCENARIOS, r.ok ? r.progress : null, settings.unlockAll);
      const grid = h('div', { class: 'tc-grid', role: 'list', 'data-testid': 'scenario-grid' }, ...cards.map((c) => h('div', { role: 'listitem' }, cardEl(c))));
      const view = h(
        'div',
        { class: 'tc-view', 'data-testid': 'scenario-select' },
        head(text('prog.select.title'), () => host.showNewGame()),
        flow.progressNotice(),
        cards.length === 0 ? h('p', { class: 'tc-muted', text: text('prog.select.empty') }) : grid,
      );
      host.showView(view, true, view.querySelector<HTMLElement>('.tc-card:not(.locked)') ?? view.querySelector<HTMLElement>('button'));
    },

    progressNotice() {
      const r = progressStore().current();
      return r.ok ? null : progressNotice(r.error, r.raw);
    },

    showScenarioDetail(id) {
      const def = getScenarioDef(id);
      if (def) detailSheet(def);
    },

    startScenario(id, difficulty) {
      const world = createScenarioWorld(id, difficulty);
      if (!world) {
        ctx.toast(text('prog.detail.startFailed'), 'error');
        return;
      }
      start(world);
    },

    showSandboxSetup() {
      closeDetail();
      const view = sandboxView();
      host.showView(view, true, view.querySelector<HTMLElement>('[data-testid=sandbox-name]'));
    },

    startSandbox(options, parkName) {
      start(createSandboxWorld(options, parkName));
    },

    startTutorial() {
      start(createTutorialWorld(randomSeed(), text('prog.tutorial.parkName')));
    },

    showEndScreen(_event) {
      const world = game.world;
      const run = world.state.scenario.kind === 'scenario' ? world.state.scenario : null;
      const result: ScenarioResult | null = scenarioResult(world);
      if (!result) return;
      endDialog?.close();
      game.setSpeed(0);
      const won = result.status === 'won';
      const facts = endFacts(result, formatDate(world.state.tick));
      const body = h(
        'div',
        { class: 'tc-view' },
        h('div', { class: 'tc-end-art' }, mascotCanvas('both', won ? 'happy' : 'sad', 96, text(won ? 'prog.end.mascotsHappy' : 'prog.end.mascotsSad'))),
        result.endReason ? h('p', { class: 'tc-end-reason', text: text(`prog.end.reason.${result.endReason}`) }) : null,
        h('dl', { class: 'tc-facts', 'data-testid': 'end-facts' }, ...facts.flatMap((f) => [h('dt', { text: f.label }), h('dd', { text: f.value })])),
      );
      const close = (): void => {
        endDialog?.close();
        endDialog = null;
      };
      const keepPlaying = {
        label: text('prog.end.keepPlaying'),
        testId: 'end-keep-playing',
        kind: 'primary' as const,
        onClick: () => {
          close();
          game.dispatch({ type: 'scenarioContinue' });
          game.setSpeed(1);
        },
      };
      const mainMenu = { label: text('prog.end.mainMenu'), testId: 'end-main-menu', onClick: () => { close(); ctx.showTitle(); } };
      const actions = won
        ? [keepPlaying, { label: text('prog.end.scenarioSelect'), testId: 'end-scenario-select', onClick: () => { close(); openTitle('scenarios'); } }, mainMenu]
        : [
            {
              label: text('prog.end.tryAgain'),
              testId: 'end-try-again',
              kind: 'primary' as const,
              onClick: () => {
                close();
                if (run) flow.startScenario(run.id, run.difficulty);
              },
            },
            { ...keepPlaying, kind: 'plain' as const },
            mainMenu,
          ];
      endDialog = openDialog(root, { title: text(won ? 'prog.end.won' : 'prog.end.lost'), body, actions, dismissible: false, className: 'tc-end' });
      endDialog.el.setAttribute('data-testid', 'end-screen');
    },
  };
  return flow;
}
