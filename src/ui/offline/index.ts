/**
 * Offline update toast (Phase 6 §4.10, §7). Owner: W4-G. "Update ready" with **Reload** and **Later**; it stays until
 * the player picks one. Reload autosaves first (`./reload.ts`), then hands over to the new build. The service worker
 * side is `src/offline/` and `public/sw.js`.
 */
import { text } from '../../data/strings/en';
import { localizeReason } from '../../i18n';
import { offlineController } from '../../offline';
import { browserStore, SaveStore } from '../../save';
import type { UiContext } from '../context';
import { h, setText } from '../dom';
import type { UiExtension, UiPart } from '../extensions';
import { titleOpen } from '../scenario/shared';
import { autosaveBeforeReload } from './reload';

const CSS = `
.tc-update {
  position: absolute; z-index: 20;
  top: calc(var(--hud-bottom) + 66px); left: 50%; transform: translateX(-50%);
  width: max-content; max-width: calc(100% - 24px - var(--safe-left) - var(--safe-right));
  display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 8px;
  padding: 8px 10px 8px 16px;
  background: var(--surface); color: var(--ink);
  border: var(--outline); border-radius: var(--radius-surface);
  box-shadow: inset 6px 0 0 var(--accent-chill), var(--shadow);
  pointer-events: auto;
}
.tc-update[hidden] { display: none; }
.tc-update-text { font-weight: 700; }
.tc-update-actions { display: flex; gap: 8px; }
`;

let styled = false;

function injectStyles(): void {
  if (styled || typeof document === 'undefined') return;
  styled = true;
  const style = document.createElement('style');
  style.dataset.owner = 'offline';
  style.textContent = CSS;
  document.head.append(style);
}

function createUpdateToast(ctx: UiContext): UiPart {
  injectStyles();
  const label = h('span', { class: 'tc-update-text', role: 'status', 'aria-live': 'polite' });
  const reload = h('button', {
    type: 'button',
    class: 'btn primary',
    'data-testid': 'update-reload',
    text: text('offline.reload'),
    onclick: () => {
      const ctl = offlineController();
      if (!ctl) return;
      const saved = autosaveBeforeReload(ctx.game, new SaveStore(browserStore()), titleOpen());
      if (!saved.ok) {
        ctx.toast(text('ui.autosave.failed', { error: localizeReason(saved.error) }), 'error');
        return;
      }
      reload.disabled = true;
      ctl.applyUpdate();
    },
  });
  const later = h('button', {
    type: 'button',
    class: 'btn',
    'data-testid': 'update-later',
    text: text('offline.later'),
    onclick: () => offlineController()?.later(),
  });
  const el = h('div', { class: 'tc-update', 'data-testid': 'update-toast', hidden: true }, label, h('div', { class: 'tc-update-actions' }, reload, later));
  return {
    el,
    update() {
      const ready = offlineController()?.state().updateReady ?? false;
      if (el.hidden === !ready) return;
      el.hidden = !ready;
      // The live region announces the text when it appears.
      setText(label, ready ? text('offline.updateReady') : '');
      if (!ready) reload.disabled = false;
    },
  };
}

export const offlineUi: UiExtension = { bars: createUpdateToast };
