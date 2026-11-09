/** Modal dialogs (menu, slot lists, confirm). Owner: W1-B. */
import { text } from '../data/strings/en';
import { h, newId, popModal, pushModal, type Child } from './dom';

export interface DialogAction {
  label: string;
  onClick: () => void;
  kind?: 'primary' | 'danger' | 'plain';
  /** Extra line under the label (slot info). */
  detail?: string;
  testId?: string;
}

export interface DialogHandle {
  close(): void;
  el: HTMLElement;
}

/**
 * Open a modal dialog over `root`. Esc and the backdrop close it when `dismissible` (default true).
 * Shortcut keys stay quiet while it is open (`data-tc-modal` on <body>).
 */
export function openDialog(
  root: HTMLElement,
  opts: { title: string; body?: Child; actions: DialogAction[]; onClose?: () => void; dismissible?: boolean; className?: string },
): DialogHandle {
  const titleId = newId('dialog-title');
  const dismissible = opts.dismissible ?? true;
  let open = true;
  const prevFocus = document.activeElement as HTMLElement | null;
  const close = (): void => {
    if (!open) return;
    open = false;
    backdrop.remove();
    popModal();
    opts.onClose?.();
    if (prevFocus && document.contains(prevFocus)) prevFocus.focus();
  };
  const buttons = opts.actions.map((a) =>
    h(
      'button',
      { type: 'button', class: `btn ${a.kind ?? 'plain'}`, 'data-testid': a.testId, onclick: () => a.onClick() },
      h('span', { class: 'btn-label', text: a.label }),
      a.detail ? h('span', { class: 'btn-detail', text: a.detail }) : null,
    ),
  );
  const dialog = h(
    'div',
    { class: `dialog ${opts.className ?? ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
    h('h2', { id: titleId, class: 'dialog-title', text: opts.title }),
    opts.body ?? null,
    h('div', { class: 'dialog-actions' }, ...buttons),
  );
  const backdrop = h('div', { class: 'modal-backdrop' }, dialog);
  backdrop.addEventListener('pointerdown', (e) => {
    if (e.target === backdrop && dismissible) close();
  });
  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && dismissible) {
      e.stopPropagation();
      close();
    } else if (e.key === 'Tab') {
      // Keep focus inside the dialog.
      const f = [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input, [tabindex="0"]')].filter((x) => !x.hidden);
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
  pushModal();
  root.append(backdrop);
  (buttons[0] ?? dialog).focus();
  return { close, el: dialog };
}

export function confirmDialog(root: HTMLElement, message: string, yes: string, no: string, onYes: () => void): DialogHandle {
  const d = openDialog(root, {
    title: message,
    actions: [
      { label: no, onClick: () => d.close(), kind: 'plain', testId: 'confirm-no' },
      { label: yes, onClick: () => { d.close(); onYes(); }, kind: 'danger', testId: 'confirm-yes' },
    ],
  });
  return d;
}

export const cancelLabel = (): string => text('ui.dialog.cancel');
