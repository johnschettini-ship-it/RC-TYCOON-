/**
 * Show site placement status bar (Phase 6 §7): the ghost state with an icon and the exact reason text (colour is never
 * the only signal), the site and its cost, and Rotate, Confirm, Sites, Done. Confirm is how touch places; on desktop a
 * click places and Confirm is there for keyboard and pen users too. Owner: W4-C.
 */
import { text } from '../../data/strings/en';
import { confirmShowSite, exitShowTool, rotateShowSite, showInput } from '../../input/shows';
import { showGhostOf } from '../../render/shows/ghost';
import type { UiContext } from '../context';
import { h, setText, toggleClass } from '../dom';
import { icon } from '../icons';
import { showStatusView } from './view';

export interface StatusBar {
  el: HTMLElement;
  update(visible: boolean): void;
}

function coarsePointer(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}

export function createShowStatusBar(ctx: UiContext, openPicker: () => void): StatusBar {
  const { game } = ctx;
  const okIcon = icon('check', 'icon state-icon ok');
  const badIcon = icon('cross', 'icon state-icon bad');
  const title = h('span', { class: 'status-text', 'data-testid': 'show-status' });
  const detail = h('span', { class: 'status-detail', 'data-testid': 'show-status-detail' });
  const btn = (id: string, label: string, onclick: () => void, glyph?: 'rotate' | 'check' | 'cross'): HTMLButtonElement =>
    h('button', { type: 'button', class: `btn${id === 'confirm' ? ' primary' : ''}`, 'aria-label': label, 'data-testid': `show-${id}`, onclick }, glyph ? icon(glyph) : null, h('span', { text: label }));
  const rotate = btn('rotate', text('shows.btn.rotate'), () => rotateShowSite(game), 'rotate');
  // A blocked placement toasts its reason through the UI root (every command result does).
  const confirm = btn('confirm', text('shows.btn.confirm'), () => void confirmShowSite(game), 'check');
  const sites = btn('sites', text('shows.btn.sites'), openPicker);
  const done = btn('done', text('shows.btn.done'), () => exitShowTool(game), 'cross');
  const el = h(
    'div',
    { class: 'tool-status shw-status', role: 'region', 'aria-label': text('shows.status.label'), hidden: true },
    h('div', { class: 'status-line', 'aria-live': 'polite' }, okIcon, badIcon, h('span', { class: 'status-texts' }, title, detail)),
    h('div', { class: 'status-actions' }, rotate, confirm, sites, done),
  );
  const touchDevice = coarsePointer();

  return {
    el,
    update(visible: boolean) {
      if (el.hidden === visible) el.hidden = !visible;
      if (!visible) return;
      const t = game.tool;
      const g = showGhostOf(t);
      const v = showStatusView(t.defId, g, touchDevice || showInput(t).pointer === 'touch');
      setText(title, v.title);
      setText(detail, v.detail);
      confirm.toggleAttribute('disabled', !g);
      okIcon.style.display = v.valid === true ? '' : 'none';
      badIcon.style.display = v.valid === false ? '' : 'none';
      toggleClass(el, 'valid', v.valid === true);
      toggleClass(el, 'invalid', v.valid === false);
    },
  };
}
