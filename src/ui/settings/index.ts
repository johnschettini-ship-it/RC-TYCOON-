/**
 * Settings screen (Phase 6 §4.9, §7). Owner: W4-F.
 *
 * A modal screen over the title or the game: a side list of sections on desktop, a full-screen sheet with the
 * section list on top on phones; every section stays in one scrolling body (long settings scroll, nothing clips at
 * 175% text), and the list jumps to a section. Sliders have 44 px thumbs; choices are radio groups; switches are
 * toggle buttons (`aria-pressed`). Every control writes through `game.settings` at once. While
 * `game.settings.problem` is set, a notice shows it with **Reset settings** (nothing is written until then).
 * Opened from the title screen (Settings) and the in-game menu (Settings).
 */
import { text } from '../../data/strings/en';
import { LOCALES } from '../../data/strings/index';
import { GAME_VERSION, browserStore } from '../../save';
import { PROGRESS_KEY, emptyProgress } from '../../progress';
import type { SettingKey } from '../../settings';
import type { UiContext } from '../context';
import type { UiExtension } from '../extensions';
import { confirmDialog } from '../dialogs';
import { h, newId, popModal, pushModal, setAttr, setText } from '../dom';
import { downloadText, progressStore } from '../scenario/shared';
import { importProgress, savesExport } from './data';
import { applySetting, settingsNotice, settingsSections, SETTINGS_SECTIONS, type ControlSpec, type DataAction, type SettingsSectionId } from './model';

interface Bound {
  /** Show the stored value. */
  sync(): void;
}

function isDesktopPointer(): boolean {
  try {
    return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  } catch {
    return true;
  }
}

let openScreen: { close(): void; el: HTMLElement } | null = null;

/** True while the settings screen is open. */
export function settingsScreenOpen(): boolean {
  return openScreen !== null;
}

/** Open the settings screen at `section` (default: the first). */
export function openSettingsScreen(ctx: UiContext, section?: string): void {
  if (openScreen) openScreen.close();
  const store = ctx.game.settings;
  const prevFocus = document.activeElement as HTMLElement | null;
  const titleId = newId('settings-title');
  const bound: Bound[] = [];

  // Import progress uses one hidden file input.
  const fileInput = h('input', { type: 'file', accept: '.json,application/json', class: 'sr-only', tabindex: -1, 'aria-hidden': 'true' });
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    file
      .text()
      .then((raw) => {
        const r = importProgress(browserStore(), raw);
        if (r.ok) {
          progressStore().read();
          ctx.toast(text('settings.data.progressImported'), 'info');
        } else {
          ctx.toast(r.error, 'error');
        }
      })
      .catch((e: unknown) => ctx.toast(e instanceof Error ? e.message : String(e), 'error'));
  });

  const runAction = (id: DataAction): void => {
    switch (id) {
      case 'exportSaves': {
        const doc = savesExport(browserStore(), new Date().toISOString());
        if (doc === null) ctx.toast(text('settings.data.noSaves'), 'warning');
        else {
          downloadText('thrills-and-chills-saves.json', doc);
          ctx.toast(text('settings.data.exported'), 'info');
        }
        return;
      }
      case 'exportProgress': {
        let raw: string | null = null;
        try {
          raw = browserStore()?.getItem(PROGRESS_KEY) ?? null;
        } catch {
          raw = null;
        }
        downloadText(`${PROGRESS_KEY}.json`, raw ?? JSON.stringify(emptyProgress()));
        ctx.toast(text('settings.data.progressExported'), 'info');
        return;
      }
      case 'importProgress':
        fileInput.click();
        return;
      case 'resetProgress':
        confirmDialog(ctx.root, text('prog.progress.resetConfirm'), text('prog.progress.resetYes'), text('prog.progress.resetNo'), () => {
          if (progressStore().reset()) ctx.toast(text('prog.progress.resetDone'), 'info');
        });
        return;
    }
  };

  const controlEl = (c: ControlSpec): HTMLElement => {
    switch (c.kind) {
      case 'slider': {
        const id = newId(`setting-${c.key}`);
        const fmt = (v: number): string => (c.unit === 'percent' ? text('settings.percent', { n: v }) : String(v));
        const out = h('output', { class: 'setting-value', for: id });
        const input = h('input', { id, type: 'range', class: 'slider setting-slider', min: c.min, max: c.max, step: c.step, 'data-testid': `setting-${c.key}` });
        const sync = (): void => {
          const v = store.get(c.key);
          if (document.activeElement !== input && input.value !== String(v)) input.value = String(v);
          setText(out, fmt(v));
          setAttr(input, 'aria-valuetext', fmt(v));
        };
        input.addEventListener('input', () => {
          applySetting(store, c.key, Number(input.value));
          sync();
        });
        input.addEventListener('blur', sync);
        bound.push({ sync });
        return h('div', { class: 'setting setting-slider-row' }, h('label', { class: 'setting-label', for: id }, h('span', { text: c.label }), out), input);
      }
      case 'toggle': {
        const state = h('span', { class: 'toggle-state', 'aria-hidden': 'true' });
        const b = h(
          'button',
          {
            type: 'button',
            class: 'btn setting-toggle',
            'aria-pressed': 'false',
            'data-testid': c.testId ?? `setting-${c.key}`,
            onclick: () => applySetting(store, c.key, !store.get(c.key)),
          },
          h('span', { class: 'toggle-text' }, h('span', { class: 'btn-label', text: c.label }), c.detail ? h('span', { class: 'btn-detail', text: c.detail }) : null),
          state,
        );
        bound.push({
          sync: () => {
            const on = store.get(c.key);
            setAttr(b, 'aria-pressed', on ? 'true' : 'false');
            setText(state, text(on ? 'settings.on' : 'settings.off'));
          },
        });
        return h('div', { class: 'setting' }, b);
      }
      case 'choice': {
        const name = newId(`setting-${c.key}`);
        const legendId = newId('legend');
        const inputs = c.options.map((o) => {
          const input = h('input', { type: 'radio', name, value: String(o.value), class: 'choice-input', 'data-testid': `setting-${c.key}-${o.value}` });
          input.addEventListener('change', () => {
            if (input.checked) applySetting(store, c.key, o.value);
          });
          return { o, input, el: h('label', { class: 'choice' }, input, h('span', { class: 'choice-text', text: o.label })) };
        });
        bound.push({
          sync: () => {
            const v = store.get(c.key as SettingKey);
            for (const x of inputs) x.input.checked = x.o.value === v;
          },
        });
        return h(
          'fieldset',
          { class: 'setting setting-choice', 'aria-labelledby': legendId },
          h('legend', { id: legendId, class: 'setting-label', text: c.label }),
          h('div', { class: 'choices' }, ...inputs.map((x) => x.el)),
        );
      }
      case 'action':
        return h(
          'div',
          { class: 'setting' },
          h(
            'button',
            { type: 'button', class: `btn setting-action${c.danger ? ' danger' : ''}`, 'data-testid': `settings-${c.id}`, onclick: () => runAction(c.id) },
            h('span', { class: 'btn-label', text: c.label }),
            c.detail ? h('span', { class: 'btn-detail', text: c.detail }) : null,
          ),
        );
      case 'info':
        return h('div', { class: 'setting-info' }, h('dt', { text: c.label }), h('dd', { text: c.value }));
    }
  };

  const sections = settingsSections({ locales: LOCALES, version: GAME_VERSION, desktop: isDesktopPointer() });
  const headings = new Map<SettingsSectionId, HTMLElement>();
  const sectionEls = sections.map((s) => {
    const hid = `tc-settings-${s.id}`;
    const heading = h('h3', { id: hid, class: 'settings-section-title', tabindex: -1, text: s.title });
    headings.set(s.id, heading);
    const infos = s.controls.filter((c) => c.kind === 'info');
    const others = s.controls.filter((c) => c.kind !== 'info');
    return h(
      'section',
      { class: 'settings-section', 'aria-labelledby': hid, 'data-section': s.id },
      heading,
      ...others.map(controlEl),
      infos.length > 0 ? h('dl', { class: 'settings-about' }, ...infos.map(controlEl)) : null,
    );
  });

  const body = h('div', { class: 'settings-body' }, ...sectionEls);
  const jump = (id: SettingsSectionId): void => {
    const heading = headings.get(id);
    if (!heading) return;
    heading.scrollIntoView({ block: 'start' });
    heading.focus({ preventScroll: true });
    for (const b of navButtons) setAttr(b, 'aria-current', b.dataset.section === id ? 'true' : null);
  };
  const navButtons = sections.map((s) =>
    h('button', { type: 'button', class: 'settings-tab', 'data-section': s.id, 'data-testid': `settings-tab-${s.id}`, text: s.title, onclick: () => jump(s.id) }),
  );
  const nav = h('nav', { class: 'settings-nav', 'aria-label': text('settings.sections') }, h('ul', { class: 'settings-tabs' }, ...navButtons.map((b) => h('li', {}, b))));

  // Phase 6 §4.9: unreadable settings notice with Reset settings.
  const noticeText = h('p', { class: 'settings-notice-text' });
  const notice = h(
    'div',
    { class: 'settings-notice', role: 'alert', 'data-testid': 'settings-notice', hidden: true },
    noticeText,
    h('p', { class: 'tc-muted', text: text('settings.unreadableDetail') }),
    h('button', {
      type: 'button',
      class: 'btn danger',
      'data-testid': 'settings-reset',
      text: text('settings.reset'),
      onclick: () => {
        store.reset();
        ctx.toast(text('settings.resetDone'), 'info');
      },
    }),
  );
  const writeWarning = h('p', { class: 'settings-write-failed', role: 'status', hidden: true, text: text('settings.writeFailed') });

  const back = h('button', { type: 'button', class: 'btn settings-back', 'data-testid': 'settings-back', text: text('settings.back'), onclick: () => close() });
  const card = h(
    'div',
    { class: 'settings-card' },
    h('div', { class: 'settings-head' }, h('h2', { id: titleId, class: 'settings-title', text: text('settings.title') }), back),
    notice,
    writeWarning,
    h('div', { class: 'settings-layout' }, nav, body),
    fileInput,
  );
  const el = h('div', { class: 'settings-screen', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, 'data-testid': 'settings-screen' }, card);

  const syncAll = (): void => {
    for (const b of bound) b.sync();
    const n = settingsNotice(store);
    notice.hidden = n === null;
    if (n) setText(noticeText, n.message);
    writeWarning.hidden = !store.writeFailed;
  };
  const offStore = store.onChange((_v, changed) => {
    // A new language rebuilds the screen in it (W4-G switches the strings on the same change).
    if (changed.includes('locale')) {
      queueMicrotask(() => {
        if (openScreen?.el === el) openSettingsScreen(ctx, 'language');
      });
      return;
    }
    syncAll();
  });

  el.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' || e.key === 'Esc') {
      e.stopPropagation();
      e.preventDefault();
      close();
    } else if (e.key === 'Tab') {
      const f = [...el.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([type="file"]):not([type="radio"]), input[type="radio"]:checked')].filter(
        (x) => x.offsetParent !== null,
      );
      if (f.length === 0) return;
      const first = f[0] as HTMLElement;
      const last = f[f.length - 1] as HTMLElement;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  let open = true;
  function close(): void {
    if (!open) return;
    open = false;
    offStore();
    el.remove();
    popModal();
    if (openScreen?.el === el) openScreen = null;
    if (prevFocus && document.contains(prevFocus)) prevFocus.focus();
  }

  pushModal();
  ctx.root.append(el);
  openScreen = { close, el };
  syncAll();
  const start = (SETTINGS_SECTIONS as readonly string[]).includes(section ?? '') ? (section as SettingsSectionId) : null;
  if (start && start !== 'audio') jump(start);
  else back.focus();
}

/** No mounted parts: the title and the in-game menu open the screen (`openSettingsScreen`). */
export const settingsUi: UiExtension = {};
