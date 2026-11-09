/**
 * Staff panel (Phase 3 §7.1): hire by type (cost and wage), list filtered by type with a status line,
 * and for the selected member: patrol summary and editing, costume (Performer), show on map, fire.
 * Owner: W2-B.
 */
import { STAFF, COSTUMES } from '../../data/catalog/people';
import type { Costume, StaffType } from '../../data/catalog/types';
import { text } from '../../data/strings/en';
import { STAFF_MAX } from '../../data/tuning/staff';
import { toolOptions } from '../../render/management/toolOptions';
import type { Staff } from '../../sim/staff/types';
import { formatDate } from '../../sim/time';
import type { PanelView, UiContext } from '../context';
import { confirmDialog } from '../dialogs';
import { h, setAttr, setText, toggleClass } from '../dom';
import { formatMoney } from '../format';
import { section, statRow, warningList } from '../widgets';
import { mgmtIcon } from './icons';
import { STAFF_FILTERS, filterStaff, patrolSummary, staffStatusText, staffTypeName, totalWages, type StaffFilter } from './staffInfo';
import { centreOnTile, segmented } from './widgets';

/** The filter survives closing and reopening the panel. */
let lastFilter: StaffFilter = 'all';

const COSTUME_IDS: readonly Costume[] = COSTUMES.map((c) => c.id);

function findStaff(ctx: UiContext, id: number): Staff | undefined {
  return ctx.game.world.state.staff.members.find((m) => m.id === id);
}

/** Selected staff id: the map selection when it is a staff member, else the patrol tool's member. */
export function selectedStaffId(ctx: UiContext): number {
  const sel = ctx.game.tool.selectedEntity;
  if (sel && sel.kind === 'staff') return sel.id;
  return -1;
}

export function selectStaff(ctx: UiContext, id: number | null): void {
  const t = ctx.game.tool;
  t.selectedEntity = id === null ? null : { kind: 'staff', id };
}

/** Start the patrol painting tool for a staff member (Phase 3 §7.2). */
export function startPatrolEdit(ctx: UiContext, staffId: number): void {
  const t = ctx.game.tool;
  toolOptions(t).patrolStaffId = staffId;
  t.selectedEntity = { kind: 'staff', id: staffId };
  t.tool = 'patrol';
  t.defId = null;
  t.ghost = null;
  t.drag = null;
  // Phones: the bottom sheet would cover the map. Done reopens the panel.
  if (ctx.root.dataset.layout === 'bottom') ctx.closePanel();
}

export function createStaffPanel(ctx: UiContext, focusId: number | null): PanelView {
  const { game } = ctx;
  if (focusId !== null && findStaff(ctx, focusId)) selectStaff(ctx, focusId);

  // ---- Hire
  const hireButtons = STAFF.map((def) =>
    h(
      'button',
      {
        type: 'button',
        class: 'btn hire-btn',
        'data-testid': `hire-${def.id}`,
        'aria-label': text('ui.staff.hireLabel', { type: staffTypeName(def.id), cost: formatMoney(def.hireCost), wage: formatMoney(def.wageMonthly) }),
        onclick: () => {
          const r = game.dispatch({ type: 'hireStaff', staffType: def.id });
          if (r.ok && r.id !== undefined) selectStaff(ctx, r.id);
        },
      },
      h('span', { class: 'hire-name', text: staffTypeName(def.id) }),
      h('span', { class: 'seg-detail', text: text('ui.staff.hireCost', { cost: formatMoney(def.hireCost), wage: formatMoney(def.wageMonthly) }) }),
    ),
  );
  const count = h('span', { class: 'muted', 'data-testid': 'staff-count' });
  const wages = h('span', { class: 'muted' });

  // ---- Filter and list
  const filter = segmented<StaffFilter>(
    text('ui.staff.filter'),
    STAFF_FILTERS.map((f) => ({ value: f, label: text(`ui.staff.filter.${f}`) })),
    (f) => {
      lastFilter = f;
      filter.set(f);
      renderList();
    },
    'compact',
  );
  const list = h('ul', { class: 'staff-list', role: 'list', 'aria-label': text('ui.staff.list') });
  const empty = h('p', { class: 'muted' });
  const rows = new Map<number, { el: HTMLLIElement; button: HTMLButtonElement; status: HTMLElement }>();
  let listKey = '';

  const rowFor = (m: Staff): { el: HTMLLIElement; button: HTMLButtonElement; status: HTMLElement } => {
    let r = rows.get(m.id);
    if (r) return r;
    const status = h('span', { class: 'staff-status' });
    const button = h(
      'button',
      {
        type: 'button',
        class: 'staff-row',
        'data-testid': 'staff-row',
        'data-staff-id': m.id,
        'aria-pressed': 'false',
        'aria-label': text('ui.staff.pick', { name: m.name, type: staffTypeName(m.type) }),
        onclick: () => selectStaff(ctx, selectedStaffId(ctx) === m.id ? null : m.id),
      },
      h('span', { class: `staff-dot type-${m.type}`, 'aria-hidden': 'true' }),
      h('span', { class: 'staff-text' }, h('span', { class: 'staff-name', text: m.name }), h('span', { class: 'staff-type', text: staffTypeName(m.type) }), status),
    );
    r = { el: h('li', {}, button), button, status };
    rows.set(m.id, r);
    return r;
  };

  function renderList(): void {
    const members = game.world.state.staff.members;
    const shown = filterStaff(members, lastFilter);
    const key = `${lastFilter}|${shown.map((m) => m.id).join(',')}`;
    if (key !== listKey) {
      listKey = key;
      const live = new Set(members.map((m) => m.id));
      for (const id of [...rows.keys()]) if (!live.has(id)) rows.delete(id);
      list.replaceChildren(...shown.map((m) => rowFor(m).el));
    }
    setText(empty, members.length === 0 ? text('ui.staff.none') : text('ui.staff.noneOfType'));
    empty.hidden = shown.length > 0;
    const sel = selectedStaffId(ctx);
    for (const m of shown) {
      const r = rowFor(m);
      setText(r.status, staffStatusText(game.world, m));
      setAttr(r.button, 'aria-pressed', m.id === sel ? 'true' : 'false');
      toggleClass(r.button, 'on', m.id === sel);
    }
  }

  // ---- Selected member
  const detailTitle = h('h3', { class: 'section-title' });
  const status = statRow(text('ui.staff.status'));
  const hired = statRow(text('ui.staff.hiredOn'));
  const wage = statRow(text('ui.staff.wage'));
  const patrol = statRow(text('ui.staff.patrol'));
  const patrolWarn = warningList();
  const editPatrol = h(
    'button',
    { type: 'button', class: 'btn', 'data-testid': 'staff-edit-patrol', onclick: () => { const id = selectedStaffId(ctx); if (id >= 0) startPatrolEdit(ctx, id); } },
    mgmtIcon('paint'),
    h('span', { text: text('ui.staff.editPatrol') }),
  );
  const clearPatrol = h('button', {
    type: 'button',
    class: 'btn',
    text: text('ui.staff.clearPatrol'),
    onclick: () => {
      const id = selectedStaffId(ctx);
      if (id >= 0) game.dispatch({ type: 'clearPatrol', staffId: id });
    },
  });
  const costume = segmented<Costume>(
    text('ui.staff.costume'),
    COSTUME_IDS.map((c) => ({ value: c, label: text(`costume.${c}`), testId: `costume-${c}` })),
    (c) => {
      const id = selectedStaffId(ctx);
      if (id >= 0) game.dispatch({ type: 'setCostume', staffId: id, costume: c });
    },
    'costumes',
  );
  for (const b of costume.buttons) b.prepend(h('span', { class: `costume-swatch costume-${b.dataset.value ?? ''}`, 'aria-hidden': 'true' }));
  const costumeBlock = h('div', { class: 'field-block' }, h('span', { class: 'row-label', text: text('ui.staff.costume') }), costume.el);
  const locate = h(
    'button',
    {
      type: 'button',
      class: 'btn',
      onclick: () => {
        const m = findStaff(ctx, selectedStaffId(ctx));
        if (m) centreOnTile(ctx, m.tile);
      },
    },
    mgmtIcon('locate'),
    h('span', { text: text('ui.staff.locate') }),
  );
  const fire = h('button', {
    type: 'button',
    class: 'btn danger',
    'data-testid': 'staff-fire',
    text: text('ui.staff.fire'),
    onclick: () => {
      const m = findStaff(ctx, selectedStaffId(ctx));
      if (!m) return;
      confirmDialog(ctx.root, text('ui.staff.fireConfirm', { name: m.name }), text('ui.staff.fire'), text('ui.staff.fireNo'), () => {
        const r = game.dispatch({ type: 'fireStaff', staffId: m.id });
        if (r.ok && selectedStaffId(ctx) === m.id) selectStaff(ctx, null);
      });
    },
  });
  const detail = section(
    null,
    detailTitle,
    status.el,
    hired.el,
    wage.el,
    patrol.el,
    patrolWarn.el,
    h('div', { class: 'button-row' }, editPatrol, clearPatrol),
    costumeBlock,
    h('div', { class: 'button-row' }, locate, fire),
  );
  detail.classList.add('staff-detail');
  detail.dataset.testid = 'staff-detail';

  const body = h(
    'div',
    { class: 'panel-content staff-panel' },
    section(text('ui.staff.hire'), h('div', { class: 'hire-grid' }, ...hireButtons), h('div', { class: 'row' }, count, wages)),
    detail,
    section(null, filter.el, list, empty),
  );
  filter.set(lastFilter);

  return {
    kind: 'staff',
    id: null,
    title: text('ui.staff.title'),
    body,
    update() {
      const s = game.world.state;
      const members = s.staff.members;
      setText(count, text('ui.staff.count', { count: members.length, max: STAFF_MAX }));
      setText(wages, text('ui.staff.wages', { amount: formatMoney(totalWages(members)) }));
      for (const b of hireButtons) b.toggleAttribute('disabled', members.length >= STAFF_MAX);
      renderList();
      const m = findStaff(ctx, selectedStaffId(ctx));
      detail.hidden = !m;
      if (m) {
        setText(detailTitle, `${m.name} · ${staffTypeName(m.type)}`);
        status.set(staffStatusText(game.world, m));
        hired.set(formatDate(m.hiredTick));
        wage.set(text('ui.staff.wageValue', { wage: formatMoney(STAFF.find((d) => d.id === (m.type as StaffType))?.wageMonthly ?? 0) }));
        const p = patrolSummary(game.world, m);
        patrol.set(p.tiles === 0 ? text('ui.staff.patrolAll') : text('ui.staff.patrolTiles', { count: p.tiles }));
        patrolWarn.set(p.connected ? [] : [text('staff.patrolNotConnected')]);
        clearPatrol.toggleAttribute('disabled', p.tiles === 0);
        costumeBlock.hidden = m.type !== 'performer';
        costume.set(m.costume);
      }
      return true;
    },
  };
}
