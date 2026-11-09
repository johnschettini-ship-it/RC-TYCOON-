/**
 * Floating tool bars (Phase 3 §7.2, §4.3–4.4). Owner: W2-B.
 * - Patrol painting: Paint / Erase, brush 1×1 / 3×3 / 5×5, Clear, Done.
 * - Path items: Bench / Bin / Lamp / Remove / Repair, Repair all, Auto-repair, Done.
 * Both write the shared ToolState and the tool options; the input controller does the rest.
 */
import { PATH_ITEMS } from '../../data/catalog/people';
import { text } from '../../data/strings/en';
import { localizeReason } from '../../i18n';
import { BRUSH_SIZES, pathItemAction, toolOptions, type BrushSize, type PathItemAction, type PatrolMode } from '../../render/management/toolOptions';
import { brokenItemTiles } from '../../sim/staff/commands';
import type { UiContext } from '../context';
import { h, setAttr, setText, toggleClass } from '../dom';
import { formatMoney } from '../format';
import { mgmtIcon } from './icons';
import { segmented } from './widgets';

const ZOOM_HINT_BELOW = 0.75;
const BROKEN_COUNT_MS = 500;

function coarsePointer(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}

function backToInspect(ctx: UiContext): void {
  const t = ctx.game.tool;
  t.tool = 'inspect';
  t.defId = null;
  t.ghost = null;
  t.drag = null;
}

export function createPatrolBar(ctx: UiContext): { el: HTMLElement; update(): void } {
  const { game } = ctx;
  const title = h('span', { class: 'status-text', 'data-testid': 'patrol-title' });
  const hint = h('span', { class: 'status-detail' });
  const mode = segmented<PatrolMode>(
    text('ui.patrol.mode'),
    [
      { value: 'paint', label: text('ui.patrol.paint'), icon: 'paint', testId: 'patrol-paint' },
      { value: 'erase', label: text('ui.patrol.erase'), icon: 'erase', testId: 'patrol-erase' },
    ],
    (m) => {
      toolOptions(game.tool).patrolMode = m;
    },
    'compact',
  );
  const brush = segmented<BrushSize>(
    text('ui.patrol.brush'),
    BRUSH_SIZES.map((n) => ({ value: n, label: text('ui.patrol.brushSize', { n }), testId: `patrol-brush-${n}` })),
    (n) => {
      toolOptions(game.tool).brush = n;
    },
    'compact',
  );
  const clear = h('button', {
    type: 'button',
    class: 'btn',
    text: text('ui.patrol.clear'),
    'data-testid': 'patrol-clear',
    onclick: () => {
      const id = toolOptions(game.tool).patrolStaffId;
      if (id >= 0) game.dispatch({ type: 'clearPatrol', staffId: id });
    },
  });
  // Strokes are sent at the end of each drag, so Done only closes the tool.
  const done = h('button', { type: 'button', class: 'btn primary', 'data-testid': 'patrol-done', onclick: () => backToInspect(ctx) }, mgmtIcon('done'), h('span', { text: text('ui.patrol.done') }));
  const el = h(
    'div',
    { class: 'tool-status mgmt-bar patrol-bar', role: 'region', 'aria-label': text('ui.patrol.label'), hidden: true },
    h('div', { class: 'status-line', 'aria-live': 'polite' }, mgmtIcon('paint'), h('span', { class: 'status-texts' }, title, hint)),
    h('div', { class: 'status-actions wrap' }, mode.el, brush.el, clear, done),
  );
  const touch = coarsePointer();
  return {
    el,
    update() {
      const t = game.tool;
      const on = t.tool === 'patrol';
      if (el.hidden === on) el.hidden = !on;
      if (!on) return;
      const o = toolOptions(t);
      const m = game.world.state.staff.members.find((s) => s.id === o.patrolStaffId);
      setText(title, m ? text('ui.patrol.title', { name: m.name }) : text('ui.patrol.label'));
      let h1 = touch ? text('ui.patrol.hintTouch') : text('ui.patrol.hintMouse');
      if (m && m.patrol === null) h1 = `${text('ui.patrol.whole')} · ${h1}`;
      if (game.camera.zoom < ZOOM_HINT_BELOW) h1 = `${text('ui.patrol.zoomHint')} · ${h1}`;
      setText(hint, h1);
      mode.set(o.patrolMode);
      brush.set(o.brush);
      clear.toggleAttribute('disabled', !m || m.patrol === null);
    },
  };
}

export function createPathItemBar(ctx: UiContext): { el: HTMLElement; update(now: number): void } {
  const { game } = ctx;
  const cost = (id: string): number => PATH_ITEMS.find((d) => d.id === id)?.buildCost ?? 0;
  const choice = segmented<PathItemAction>(
    text('ui.pathItems.choice'),
    [
      { value: 'bench', label: text('ui.pathItems.bench'), detail: formatMoney(cost('bench')), icon: 'bench', testId: 'pathitem-bench' },
      { value: 'bin', label: text('ui.pathItems.bin'), detail: formatMoney(cost('bin')), icon: 'bin', testId: 'pathitem-bin' },
      { value: 'lamp', label: text('ui.pathItems.lamp'), detail: formatMoney(cost('lamp')), icon: 'lamp', testId: 'pathitem-lamp' },
      { value: 'remove', label: text('ui.pathItems.remove'), icon: 'remove', testId: 'pathitem-remove' },
      { value: 'repair', label: text('ui.pathItems.repair'), icon: 'repair', testId: 'pathitem-repair' },
    ],
    (a) => {
      game.tool.defId = a;
      game.tool.ghost = null;
    },
    'compact items',
  );
  const msg = h('span', { class: 'status-text', 'data-testid': 'pathitem-status' });
  const detail = h('span', { class: 'status-detail' });
  const okIcon = mgmtIcon('done', 'icon state-icon ok');
  const repairAll = h('button', { type: 'button', class: 'btn', 'data-testid': 'pathitem-repair-all', onclick: () => game.dispatch({ type: 'repairAllPathItems' }) });
  const auto = h('button', {
    type: 'button',
    class: 'btn',
    'aria-pressed': 'false',
    'data-testid': 'pathitem-auto-repair',
    text: text('ui.pathItems.autoRepair'),
    onclick: () => game.dispatch({ type: 'setAutoRepair', on: !game.world.state.staff.autoRepair }),
  });
  const done = h('button', { type: 'button', class: 'btn primary', onclick: () => backToInspect(ctx) }, mgmtIcon('done'), h('span', { text: text('ui.pathItems.done') }));
  const el = h(
    'div',
    { class: 'tool-status mgmt-bar pathitem-bar', role: 'region', 'aria-label': text('ui.pathItems.label'), hidden: true },
    h('div', { class: 'status-line', 'aria-live': 'polite' }, okIcon, h('span', { class: 'status-texts' }, msg, detail)),
    h('div', { class: 'status-actions wrap' }, choice.el, repairAll, auto, done),
  );
  let lastCount = 0;
  let broken = -1;
  return {
    el,
    update(now: number) {
      const t = game.tool;
      const on = t.tool === 'pathItem';
      if (el.hidden === on) el.hidden = !on;
      if (!on) return;
      const a = pathItemAction(t);
      choice.set(a);
      if (a === 'remove') setText(msg, text('ui.pathItems.hintRemove'));
      else if (a === 'repair') setText(msg, text('ui.pathItems.hintRepair'));
      else setText(msg, text('ui.pathItems.hintBuild', { name: text(`ui.pathItems.${a}`), cost: formatMoney(cost(a)) }));
      const g = t.ghost;
      setText(detail, g ? (g.valid ? text('ui.ghost.valid') : localizeReason(g.reason ?? '')) : '');
      okIcon.style.display = g?.valid ? '' : 'none';
      toggleClass(el, 'valid', g?.valid === true);
      toggleClass(el, 'invalid', g?.valid === false);
      if (now - lastCount >= BROKEN_COUNT_MS || broken < 0) {
        lastCount = now;
        broken = brokenItemTiles(game.world).length;
      }
      setText(repairAll, broken > 0 ? `${text('ui.pathItems.repairAll')} (${text('ui.pathItems.broken', { count: broken })})` : text('ui.pathItems.repairAll'));
      const autoOn = game.world.state.staff.autoRepair;
      setAttr(auto, 'aria-pressed', autoOn ? 'true' : 'false');
      setText(auto, text(autoOn ? 'ui.pathItems.autoOn' : 'ui.pathItems.autoOff'));
    },
  };
}
