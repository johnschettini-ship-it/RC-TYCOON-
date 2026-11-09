/**
 * Scenery tool status bar (Phase 4 §7): ghost state with an icon and the exact reason text (colour is never the only
 * signal), the item and cost, and Rotate, Confirm, Repeat, Remove, Items, Done. Confirm is how touch places; on
 * desktop a click places and Confirm is there for keyboard and pen users too. Owner: W3-D.
 */
import { getSceneryDef } from '../../data/catalog';
import { text } from '../../data/strings/en';
import { contentName } from '../contentName';
import { localizeReason } from '../../i18n';
import { confirmScenery, exitSceneryTool, rotateScenery, sceneryInput, setSceneryRemoveMode } from '../../input/scenery';
import { sceneryGhostOf } from '../../render/scenery/ghost';
import type { UiContext } from '../context';
import { h, setAttr, setText, toggleClass } from '../dom';
import { formatMoney } from '../format';
import { icon } from '../icons';

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

export function createStatusBar(ctx: UiContext, openPicker: () => void): StatusBar {
  const { game } = ctx;
  const okIcon = icon('check', 'icon state-icon ok');
  const badIcon = icon('cross', 'icon state-icon bad');
  const title = h('span', { class: 'status-text', 'data-testid': 'scenery-status' });
  const detail = h('span', { class: 'status-detail', 'data-testid': 'scenery-status-detail' });
  const btn = (id: string, label: string, onclick: () => void, extra: Record<string, string> = {}, glyph?: 'rotate' | 'check' | 'cross'): HTMLButtonElement =>
    h('button', { type: 'button', class: `btn${id === 'confirm' ? ' primary' : ''}`, 'aria-label': label, 'data-testid': `scenery-${id}`, onclick, ...extra }, glyph ? icon(glyph) : null, h('span', { text: label }));
  const rotate = btn('rotate', text('scenery.btn.rotate'), () => rotateScenery(game), {}, 'rotate');
  const confirm = btn('confirm', text('scenery.btn.confirm'), () => void confirmScenery(game), {}, 'check');
  const repeat = btn('repeat', text('scenery.btn.repeat'), () => {
    game.tool.scenery.repeat = !game.tool.scenery.repeat;
  }, { 'aria-pressed': 'false' });
  const remove = btn('remove', text('scenery.btn.remove'), () => setSceneryRemoveMode(game, !sceneryInput(game.tool).remove), { 'aria-pressed': 'false' });
  const items = btn('items', text('scenery.btn.items'), openPicker);
  const done = btn('done', text('scenery.btn.done'), () => exitSceneryTool(game), {}, 'cross');
  const el = h(
    'div',
    { class: 'tool-status scn-status', role: 'region', 'aria-label': text('scenery.status.label'), hidden: true },
    h('div', { class: 'status-line', 'aria-live': 'polite' }, okIcon, badIcon, h('span', { class: 'status-texts' }, title, detail)),
    h('div', { class: 'status-actions' }, rotate, confirm, repeat, remove, items, done),
  );
  const touchDevice = coarsePointer();

  return {
    el,
    update(visible: boolean) {
      if (el.hidden === visible) el.hidden = !visible;
      if (!visible) return;
      const t = game.tool;
      const st = sceneryInput(t);
      const g = sceneryGhostOf(t);
      const touch = touchDevice || st.pointer === 'touch';
      let valid: boolean | null = null;
      if (st.remove) {
        setText(title, text('scenery.status.remove'));
        if (g && g.targetId >= 0) {
          valid = true;
          setText(detail, text('scenery.status.removeTarget', { name: getSceneryDef(g.defId ?? '') ? contentName(g.defId ?? '') : '', refund: formatMoney(g.cost) }));
        } else {
          setText(detail, g ? text('scenery.status.nothing') : text(touch ? 'scenery.status.removeHintTouch' : 'scenery.status.removeHint'));
          if (g) valid = false;
        }
      } else {
        const def = t.scenery.defId ? getSceneryDef(t.scenery.defId) : undefined;
        setText(title, def ? text('scenery.status.place', { name: contentName(def.id), cost: formatMoney(def.buildCost) }) : text('scenery.status.pick'));
        if (!def) setText(detail, '');
        else if (!g) setText(detail, text(touch ? 'scenery.status.hintTouch' : 'scenery.status.hintMouse'));
        else {
          valid = g.valid;
          const edge = def.edge && g.edge >= 0 ? ` · ${text('scenery.status.edge', { side: text(`scenery.edge.${g.edge}`) })}` : '';
          setText(detail, (g.valid ? text('scenery.status.valid') : localizeReason(g.reason ?? '')) + edge);
        }
      }
      rotate.hidden = st.remove;
      confirm.toggleAttribute('disabled', !g || (st.remove ? g.targetId < 0 : !t.scenery.defId));
      setAttr(repeat, 'aria-pressed', t.scenery.repeat ? 'true' : 'false');
      setAttr(remove, 'aria-pressed', st.remove ? 'true' : 'false');
      okIcon.style.display = valid === true ? '' : 'none';
      badIcon.style.display = valid === false ? '' : 'none';
      toggleClass(el, 'valid', valid === true);
      toggleClass(el, 'invalid', valid === false);
    },
  };
}
