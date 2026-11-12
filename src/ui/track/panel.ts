/**
 * Track builder panel (phase-2 §7.1–7.3). Owner: W2-A. Browser only.
 * Desktop: a side panel; hovering a piece previews its ghost, a click selects it, Build (or Enter, or a click on
 * the ghost) adds it, a double-click selects and builds. Touch: a bottom sheet (≤ 45% of the height) with group
 * tabs, 56 px piece buttons, options, cost, Undo, a large Build button, and Done; map taps never add pieces.
 */
import { ALL_TRACK_PIECES, getTrackPieceDef, getTrackTypeDef, type TrackPieceDef } from '../../data/track';
import { getTrackRideDef } from '../../data/catalog/trackRides';
import { text } from '../../data/strings/en';
import { t as plural } from '../../data/strings/index';
import { TRACK_ERR } from '../../data/strings/track';
import { contentName } from '../contentName';
import { localizeReason } from '../../i18n';
import { trackToolOf, type PaletteGroupId, type TrackToolState } from '../../render/track/toolState';
import { findRide, trackData } from '../../sim/rides/track/common';
import { pieceStatic } from '../../sim/rides/track/geometry';
import type { TrackPieceInstance } from '../../sim/rides/track/types';
import type { UiContext } from '../context';
import { h, setAttr, setText, toggleClass } from '../dom';
import { formatMoney } from '../format';
import { icon } from '../icons';
import {
  autoFinishAvailable,
  autoFinishShown,
  blockedReason,
  cancelAutoFinish,
  confirmAutoFinish,
  startAutoFinishUi,
  stepAutoFinishUi,
  buildSelected,
  chainAllowed,
  chooseGate,
  confirmAction,
  heightTag,
  hoverPiece,
  meterView,
  type MeterItem,
  isBrakePiece,
  leaveBuilder,
  PALETTE_GROUPS,
  paletteFor,
  previewPieceId,
  rotateStation,
  selectGroup,
  selectPiece,
  setStationLength,
  stepBrakeSpeed,
  syncSelection,
  toggleChain,
  undoPiece,
  type PaletteGroupView,
} from './builder';

const ICON_W = 44;
const ICON_H = 28;

/**
 * The colours of the piece icons, read from the tokens (tokens.css) the first time an icon is drawn: the line and most
 * marks in ink (3:1 or more on the light piece button and on the gold pressed one), brakes in --danger, the water channel
 * and bank marks in --ok, the spooky sheet in --cat-weather. A token that does not resolve leaves the canvas default.
 */
let iconInk: Record<'ink' | 'danger' | 'ok' | 'spooky', string> | null = null;
function iconColours(): Record<'ink' | 'danger' | 'ok' | 'spooky', string> {
  if (!iconInk) {
    const st = typeof document !== 'undefined' ? getComputedStyle(document.documentElement) : null;
    const token = (name: string): string => st?.getPropertyValue(name).trim() ?? '';
    iconInk = { ink: token('--ink'), danger: token('--danger'), ok: token('--ok'), spooky: token('--cat-weather') };
  }
  return iconInk;
}

/** Small drawing of a piece: side view for slopes and loops, top view for the rest. */
function pieceIcon(def: TrackPieceDef): HTMLCanvasElement {
  const dpr = Math.min(3, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
  const c = h('canvas', { class: 'piece-icon', width: Math.round(ICON_W * dpr), height: Math.round(ICON_H * dpr), 'aria-hidden': 'true' });
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  ctx.scale(dpr, dpr);
  const col = iconColours();
  const sm = pieceStatic(def.id).samples;
  const side = def.group === 'G' || def.group === 'X' || def.group === 'L' || def.group === 'Cs';
  let u0 = Infinity;
  let u1 = -Infinity;
  let v0 = Infinity;
  let v1 = -Infinity;
  for (let k = 0; k < sm.n; k++) {
    const u = sm.x[k] as number;
    const v = side ? -(sm.h[k] as number) : (sm.y[k] as number);
    u0 = Math.min(u0, u);
    u1 = Math.max(u1, u);
    v0 = Math.min(v0, v);
    v1 = Math.max(v1, v);
  }
  const pad = 4;
  const k = Math.min((ICON_W - 2 * pad) / Math.max(1, u1 - u0), (ICON_H - 2 * pad) / Math.max(1, v1 - v0));
  const ox = (ICON_W - (u1 - u0) * k) / 2 - u0 * k;
  const oy = (ICON_H - (v1 - v0) * k) / 2 - v0 * k;
  ctx.beginPath();
  for (let i = 0; i < sm.n; i++) {
    const u = sm.x[i] as number;
    const v = side ? -(sm.h[i] as number) : (sm.y[i] as number);
    if (i === 0) ctx.moveTo(ox + u * k, oy + v * k);
    else ctx.lineTo(ox + u * k, oy + v * k);
  }
  ctx.strokeStyle = col.ink;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
  // Marks for special pieces.
  const midX = ox + (((sm.x[Math.floor(sm.n / 2)] as number) + 0) * k);
  const midY = oy + (side ? -(sm.h[Math.floor(sm.n / 2)] as number) : (sm.y[Math.floor(sm.n / 2)] as number)) * k;
  ctx.fillStyle = col.ink;
  if (def.special === 'station') ctx.fillRect(midX - 9, midY + 4, 18, 3);
  if (def.special === 'brakes' || def.special === 'blockBrake') {
    ctx.fillStyle = def.special === 'brakes' ? col.danger : col.ink;
    for (let i = -2; i <= 2; i++) ctx.fillRect(midX + i * 5 - 1, midY - 4, 2, 8);
  }
  // Water pieces (Phase 4 §4.4): a blue channel line, foam for splashdowns, waterfalls, and rough water, a swirl for
  // whirlpools, and belt marks for lift conveyors.
  if (def.water) {
    ctx.beginPath();
    for (let i = 0; i < sm.n; i++) {
      const u = sm.x[i] as number;
      const v = side ? -(sm.h[i] as number) : (sm.y[i] as number);
      if (i === 0) ctx.moveTo(ox + u * k, oy + v * k);
      else ctx.lineTo(ox + u * k, oy + v * k);
    }
    ctx.strokeStyle = col.ok;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = col.ink;
    if (def.special === 'splashdown' || def.special === 'waterfall' || def.special === 'rough') {
      for (let i = -2; i <= 2; i++) ctx.fillRect(midX + i * 5 - 1, midY - 6 + (i % 2 === 0 ? 0 : 2), 2, 3);
    }
    if (def.special === 'whirlpool') {
      ctx.strokeStyle = col.ink;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(midX, midY, 5, 0.3, Math.PI * 1.7);
      ctx.stroke();
    }
    if (def.water.drive === 'conveyor' && def.special !== 'station') {
      ctx.fillStyle = col.ink;
      for (let i = -2; i <= 2; i++) ctx.fillRect(midX + i * 5 - 1, midY - 2 - i * 1.2, 2, 4);
    }
  }
  if (def.special === 'spooky') {
    ctx.fillStyle = col.spooky;
    ctx.fillRect(midX - 8, midY - 9, 16, 12);
    ctx.fillStyle = col.ink;
    ctx.fillRect(midX - 4, midY - 6, 2, 3);
    ctx.fillRect(midX + 2, midY - 6, 2, 3);
  }
  if (def.exit.bank !== def.entry.bank || def.entry.bank !== 'none') {
    const end = def.exit.bank === 'none' ? def.entry.bank : def.exit.bank;
    const tilt = end === 'left' ? -1 : 1;
    ctx.strokeStyle = col.ok;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ICON_W - 12, ICON_H - 6 - tilt * 3);
    ctx.lineTo(ICON_W - 4, ICON_H - 6 + tilt * 3);
    ctx.stroke();
  }
  return c;
}

export interface TrackBuilderView {
  el: HTMLElement;
  update(): void;
}

interface PieceButton {
  def: TrackPieceDef;
  el: HTMLButtonElement;
}

function rideTitle(ctx: UiContext, st: TrackToolState): string {
  if (st.rideId !== null) {
    const r = findRide(ctx.game.world, st.rideId);
    if (r) return r.name;
  }
  return st.typeId ? (getTrackRideDef(st.typeId) ? contentName(st.typeId) : st.typeId) : text('ui.track.builder');
}

export function createTrackBuilder(ctx: UiContext): TrackBuilderView {
  const { game } = ctx;
  const st = (): TrackToolState => trackToolOf(game.tool);
  let lastPointer: string = 'mouse';

  // ---------- header
  const title = h('h2', { class: 'tb-title', 'data-testid': 'track-builder-title' });
  const count = h('span', { class: 'tb-count chip' });
  const close = h('button', { type: 'button', class: 'icon-btn', 'aria-label': text('ui.track.leave'), title: text('ui.track.leave'), 'data-testid': 'track-leave', onclick: () => leaveBuilder(game) }, icon('cross'));
  const follow = h(
    'button',
    {
      type: 'button',
      class: 'btn toggle small tb-follow',
      'aria-pressed': 'true',
      title: text('ui.track.followLong'),
      'aria-label': text('ui.track.followLong'),
      'data-testid': 'track-follow',
      onclick: () => {
        const s = st();
        s.follow = !s.follow;
        s.rev++;
      },
    },
    icon('follow'),
    h('span', { text: text('ui.track.follow') }),
  );
  const header = h('header', { class: 'tb-header' }, title, count, follow, close);

  // ---------- status line (icon + text, never colour only)
  const okIcon = icon('check', 'icon state-icon ok');
  const badIcon = icon('cross', 'icon state-icon bad');
  const statusMain = h('span', { class: 'status-text', 'data-testid': 'track-status' });
  const statusDetail = h('span', { class: 'status-detail', id: 'tb-reason', 'data-testid': 'track-reason' });
  const status = h('div', { class: 'tb-status', 'aria-live': 'polite' }, okIcon, badIcon, h('span', { class: 'status-texts' }, statusMain, statusDetail));

  // ---------- R5 (Task 6): the live meter of the selected piece. Each item carries its level as data, an icon for warn
  // and over, and the level's words for screen readers: never colour alone.
  const meterRow = h('div', { class: 'tb-meter', role: 'group', 'aria-label': text('ui.track.meter.title'), 'data-testid': 'track-meter', hidden: true });
  const meterSpans = new Map<MeterItem['id'], { el: HTMLElement; warn: SVGSVGElement; over: SVGSVGElement; value: HTMLElement; label: HTMLElement }>();
  for (const id of ['stops', 'speed', 'vertical', 'lateral'] as const) {
    const warn = icon('warning', 'icon meter-icon');
    const over = icon('cross', 'icon meter-icon');
    const value = h('span', { class: 'meter-value' });
    const label = h('span', { class: 'sr-only' });
    const el = h('span', { class: 'tb-meter-item', 'data-testid': `track-meter-${id}`, 'data-level': 'ok', hidden: true }, warn, over, value, label);
    meterSpans.set(id, { el, warn, over, value, label });
    meterRow.append(el);
  }
  const showMeter = (items: readonly MeterItem[]): void => {
    if (meterRow.hidden === (items.length > 0)) meterRow.hidden = items.length === 0;
    for (const [id, m] of meterSpans) {
      const it = items.find((x) => x.id === id);
      if (m.el.hidden === !!it) m.el.hidden = !it;
      if (!it) continue;
      setText(m.value, it.text);
      setText(m.label, it.level === 'ok' ? '' : it.label);
      setAttr(m.el, 'data-level', it.level);
      const w = it.level === 'warn' ? '' : 'none';
      const o = it.level === 'over' ? '' : 'none';
      if (m.warn.style.display !== w) m.warn.style.display = w;
      if (m.over.style.display !== o) m.over.style.display = o;
    }
  };

  // ---------- station phase
  const rotateLabel = h('span', { text: text('ui.track.rotate') });
  const rotate = h('button', { type: 'button', class: 'btn tb-rotate', 'data-testid': 'track-rotate', onclick: () => rotateStation(game) }, icon('rotate'), rotateLabel);
  const lenValue = h('output', { class: 'stepper-value', 'data-testid': 'track-station-length' });
  // Task 20, the slim row: the number alone on the screen; the output keeps the whole text ("3 tiles") for screen readers.
  const lenNumber = h('span', { class: 'stepper-value tb-len-number', 'aria-hidden': 'true' });
  const lenLess = h('button', { type: 'button', class: 'btn step', 'aria-label': text('ui.track.lengthLess'), onclick: () => setStationLength(game, st().stationLength - 1) }, '−');
  const lenMore = h('button', { type: 'button', class: 'btn step', 'aria-label': text('ui.track.lengthMore'), onclick: () => setStationLength(game, st().stationLength + 1) }, '+');
  const stationHint = h('p', { class: 'tb-hint muted', id: 'tb-station-hint' });
  // Phase 7 §4.6: the builder is the tool status bar of a held track card, so the phone's Details button is here.
  const details = h('button', { type: 'button', class: 'btn', 'data-testid': 'track-details', onclick: () => ctx.openPanel('cardDetails') }, h('span', { text: text('ui.card.details') }));
  const stationBox = h(
    'div',
    { class: 'tb-station' },
    h('div', { class: 'tb-row' }, rotate, details, h('div', { class: 'stepper', role: 'group', 'aria-label': text('ui.track.station.length') }, h('span', { class: 'row-label', text: text('ui.track.station.length') }), lenLess, lenValue, lenNumber, lenMore)),
    stationHint,
  );

  // ---------- pieces phase
  const groupButtons = new Map<PaletteGroupId, HTMLButtonElement>();
  const groups = h('div', { class: 'tb-groups', role: 'tablist', 'aria-label': text('ui.track.groups') });
  PALETTE_GROUPS.forEach((g, i) => {
    const b = h(
      'button',
      { type: 'button', role: 'tab', class: 'tb-group', 'data-group': g.id, 'data-testid': `track-builder-group-${g.id}`, 'aria-selected': 'false', onclick: () => selectGroup(game, g.id) },
      h('span', { class: 'tb-key', text: String(i + 1), 'aria-hidden': 'true' }),
      h('span', { text: text(`ui.track.group.${g.id}`) }),
    );
    groupButtons.set(g.id, b);
    groups.append(b);
  });
  const pieceButtons: PieceButton[] = ALL_TRACK_PIECES.map((def) => {
    const b = h(
      'button',
      { type: 'button', class: 'tb-piece', 'data-piece': def.id, 'data-testid': `track-piece-${def.id}`, 'aria-pressed': 'false', title: def.water?.wetsRiders ? `${contentName(def.id)} · ${text('ui.track.wet')}` : contentName(def.id) },
      pieceIcon(def),
      h('span', { class: 'tb-piece-name', text: contentName(def.id) }),
    );
    b.addEventListener('pointerdown', (e) => {
      lastPointer = e.pointerType || 'mouse';
    });
    b.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'mouse') hoverPiece(game, def.id);
    });
    b.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse') hoverPiece(game, null);
    });
    b.addEventListener('click', () => {
      trackToolOf(game.tool).touch = lastPointer !== 'mouse';
      selectPiece(game, def.id);
    });
    b.addEventListener('dblclick', () => {
      if (lastPointer !== 'mouse') return;
      selectPiece(game, def.id);
      buildSelected(game);
    });
    return { def, el: b };
  });
  const palette = h('div', { class: 'tb-palette', role: 'tabpanel', 'aria-label': text('ui.track.palette') }, ...pieceButtons.map((p) => p.el));
  const empty = h('p', { class: 'tb-hint muted', text: text('ui.track.noPieces') });
  const chain = h('button', { type: 'button', class: 'btn toggle', 'aria-pressed': 'false', 'data-testid': 'track-chain', onclick: () => toggleChain(game) }, h('span', { text: text('ui.track.chain') }));
  const brakeValue = h('output', { class: 'stepper-value', 'data-testid': 'track-brake-value' });
  const brakeLess = h('button', { type: 'button', class: 'btn step', 'aria-label': text('ui.track.brakeLess'), 'data-testid': 'track-brake-less', onclick: () => stepBrakeSpeed(game, -1) }, '−');
  const brakeMore = h('button', { type: 'button', class: 'btn step', 'aria-label': text('ui.track.brakeMore'), 'data-testid': 'track-brake-more', onclick: () => stepBrakeSpeed(game, 1) }, '+');
  const brake = h('div', { class: 'stepper', role: 'group', 'aria-label': text('ui.track.brake') }, h('span', { class: 'row-label', text: text('ui.track.brake') }), brakeLess, brakeValue, brakeMore);
  // R1 (Task 8): Auto-finish looks for a way back to the station; the path shows on the map with Confirm and Cancel.
  const autoFinish = h(
    'button',
    { type: 'button', class: 'btn tb-autofinish', title: text('ui.track.autoFinishLong'), 'data-testid': 'track-autofinish', onclick: () => startAutoFinishUi(game) },
    icon('check'),
    h('span', { text: text('ui.track.autoFinish') }),
  );
  const options = h('div', { class: 'tb-row tb-options' }, chain, brake, autoFinish);
  const moveEntrance = h('button', { type: 'button', class: 'btn', onclick: () => chooseGate(game, 'entrance') }, text('ui.track.moveEntrance'));
  const moveExit = h('button', { type: 'button', class: 'btn', onclick: () => chooseGate(game, 'exit') }, text('ui.track.moveExit'));
  const closedBox = h('div', { class: 'tb-row' }, moveEntrance, moveExit);
  const piecesBox = h('div', { class: 'tb-pieces' }, groups, palette, empty, options, closedBox);

  // ---------- gate phases
  const gateHint = h('p', { class: 'tb-hint muted' });
  const gatesBox = h('div', { class: 'tb-gates' }, gateHint);

  // ---------- actions
  // Task 22: the condensed panel shows Undo as a round icon button (its icon is hidden elsewhere).
  const undo = h('button', { type: 'button', class: 'btn tb-undo', 'aria-label': text('ui.track.undo'), 'data-testid': 'track-undo', onclick: () => undoPiece(game) }, icon('undo'), h('span', { text: text('ui.track.undo') }));
  const buildLabel = h('span', { text: text('ui.track.build') });
  const build = h('button', { type: 'button', class: 'btn primary big-action', 'data-testid': 'track-build', onclick: () => buildSelected(game) }, icon('check'), buildLabel);
  const confirmLabel = h('span', { text: text('ui.track.confirm') });
  const confirm = h('button', { type: 'button', class: 'btn primary big-action', 'data-testid': 'track-confirm', onclick: () => confirmAction(game) }, icon('check'), confirmLabel);
  const done = h('button', { type: 'button', class: 'btn', 'data-testid': 'track-done', onclick: () => leaveBuilder(game) }, h('span', { text: text('ui.track.done') }));
  const cancel = h('button', { type: 'button', class: 'btn', 'data-testid': 'track-cancel', onclick: () => leaveBuilder(game, false) }, h('span', { text: text('ui.track.cancel') }));
  const afConfirmLabel = h('span');
  const afNoCash = h('span', { class: 'sr-only', id: 'tb-af-nocash', text: localizeReason(TRACK_ERR.notEnoughCash) });
  const afConfirm = h('button', { type: 'button', class: 'btn primary big-action', 'data-testid': 'track-autofinish-confirm', hidden: true, onclick: () => confirmAutoFinish(game) }, icon('check'), afConfirmLabel);
  const afCancel = h('button', { type: 'button', class: 'btn', 'data-testid': 'track-autofinish-cancel', hidden: true, onclick: () => cancelAutoFinish(game) }, h('span', { text: text('ui.track.cancel') }));
  const keys = h('p', { class: 'tb-keys muted', text: text('ui.track.keys') });
  const actions = h('div', { class: 'tb-actions' }, undo, cancel, confirm, build, afCancel, afConfirm, done, afNoCash);

  // ---------- Task 20: the slim station row of the phone and the low layout. Details and Cancel move into a small menu
  // that the "⋯" button opens; they go back to their places when the row is not slim.
  const moreMenu = h('div', { class: 'tb-more-menu', id: 'tb-more-menu', 'data-testid': 'track-more-menu', role: 'group', 'aria-label': text('ui.track.moreMenu'), hidden: true });
  const more = h('button', {
    type: 'button',
    class: 'btn tb-more',
    'aria-label': text('ui.track.moreMenu'),
    title: text('ui.track.moreMenu'),
    'aria-expanded': 'false',
    'aria-controls': 'tb-more-menu',
    'data-testid': 'track-more',
    hidden: true,
    onclick: () => setMenu(moreMenu.hidden === true),
  }, h('span', { text: '⋯', 'aria-hidden': 'true' }));
  const setMenu = (open: boolean): void => {
    if (moreMenu.hidden === !open) return;
    moreMenu.hidden = !open;
    setAttr(more, 'aria-expanded', open ? 'true' : 'false');
  };
  details.addEventListener('click', () => setMenu(false));
  const detailsHome = details.parentElement as HTMLElement;
  let slimNow = false;
  const setSlim = (slim: boolean): void => {
    if (slim === slimNow) return;
    slimNow = slim;
    toggleClass(el, 'tb-slim', slim);
    // The reading and focus order follows the row: the stepper, then Rotate.
    toggleClass(lenValue, 'sr-only', slim);
    if (slim) {
      detailsHome.append(rotate);
      moreMenu.append(details, cancel);
      setAttr(el, 'aria-describedby', 'tb-station-hint');
      rotate.setAttribute('aria-label', text('ui.track.rotate'));
    } else {
      detailsHome.prepend(rotate, details);
      actions.insertBefore(cancel, confirm);
      el.removeAttribute('aria-describedby');
      rotate.removeAttribute('aria-label');
      confirm.removeAttribute('aria-label');
      setText(confirmLabel, text('ui.track.confirm'));
      if (status.hidden) status.hidden = false;
      setMenu(false);
    }
    more.hidden = !slim;
  };
  // Task 22: the piece step on the phone and in the low layout is condensed: one header row (Follow a round icon button
  // named "Follow"), one tab row and one row of small piece tiles that scroll sideways, a small status line, and Undo
  // (round), Build with the price, and Done.
  let compactNow = false;
  const setCompact = (compact: boolean): void => {
    if (compact === compactNow) return;
    compactNow = compact;
    toggleClass(el, 'tb-compact', compact);
    // Task 6: the condensed panel puts the meter beside the Chain lift and brake options (that row has room), so the
    // meter adds no row of its own; elsewhere it is its own row under the status line.
    if (compact) options.append(meterRow);
    else status.after(meterRow);
    // Task 8: the condensed panel shows Auto-finish as the first tile of the pieces row (that row scrolls and has room),
    // so it adds no row and leaves the option row to the meter; elsewhere it is in the option row.
    if (compact) palette.prepend(autoFinish);
    else options.insertBefore(autoFinish, options.contains(meterRow) ? meterRow : null);
    const name = text(compact ? 'ui.track.follow' : 'ui.track.followLong');
    setAttr(follow, 'aria-label', name);
    if (!compact) setText(buildLabel, text('ui.track.build'));
  };
  // A press outside the menu and its button closes the menu.
  document.addEventListener('pointerdown', (e) => {
    if (moreMenu.hidden) return;
    const t = e.target as Node | null;
    if (t && (moreMenu.contains(t) || more.contains(t))) return;
    setMenu(false);
  });
  actions.append(more, moreMenu);

  const el = h(
    'section',
    { class: 'track-builder', role: 'region', 'aria-label': text('ui.track.builder'), 'data-testid': 'track-builder', tabindex: -1, hidden: true },
    header,
    h('div', { class: 'tb-body' }, stationBox, piecesBox, gatesBox, status, meterRow),
    actions,
    keys,
  );
  // A mouse click leaves no focus behind, so Space still pauses and Enter still builds.
  el.addEventListener('click', (e) => {
    if ((e as MouseEvent).detail === 0) return;
    const b = (e.target as Element | null)?.closest('button');
    if (b instanceof HTMLElement) b.blur();
  });

  let palView: PaletteGroupView[] = [];
  let palKey: { data: unknown; n: number; last: TrackPieceInstance | null; closed: boolean } | null = null;

  const refreshPalette = (s: TrackToolState): void => {
    const data = s.rideId !== null ? trackData(game.world, s.rideId) : undefined;
    const n = data?.pieces.length ?? -1;
    const last = data?.pieces[n - 1] ?? null;
    const closed = !!data?.circuitClosed;
    if (palKey && palKey.data === data && palKey.n === n && palKey.last === last && palKey.closed === closed) return;
    palKey = { data, n, last, closed };
    palView = s.rideId !== null ? paletteFor(game.world, s.rideId) : [];
    syncSelection(s, palView);
  };

  const setStatus = (valid: boolean | null, main: string, detail: string): void => {
    setText(statusMain, main);
    setText(statusDetail, detail);
    // The condensed panel's line shows the detail, or the main text when there is no detail.
    toggleClass(status, 'no-detail', detail === '');
    okIcon.style.display = valid === true ? '' : 'none';
    badIcon.style.display = valid === false ? '' : 'none';
    toggleClass(status, 'valid', valid === true);
    toggleClass(status, 'invalid', valid === false);
  };

  return {
    el,
    update() {
      const t = game.tool;
      const s = st();
      const visible = t.tool === 'track' && s.phase !== 'idle';
      const layout = ctx.root.dataset.layout ?? 'side';
      // Phase 7 §4.7: the card details panel shows the held track card, so the builder stays. On the phone its sheet
      // lies where the builder is: the builder hides until the sheet closes.
      const cardDetails = visible && ctx.activePanel()?.kind === 'cardDetails';
      const show = visible && !(cardDetails && layout === 'bottom');
      if (el.hidden === show) el.hidden = !show;
      if (!visible) {
        palKey = null;
        setSlim(false);
        setCompact(false);
        return;
      }
      // Another panel (finance, park) takes over: leave the builder, the track stays as it is.
      if (ctx.activePanel() && !cardDetails) {
        leaveBuilder(game, false);
        el.hidden = true;
        palKey = null;
        return;
      }
      if (!show) return;
      el.dataset.phase = s.phase;
      // Task 20: the station step on the phone and in the low layout is one slim row at the bottom.
      const slim = s.phase === 'station' && layout === 'bottom';
      setSlim(slim);
      const compact = s.phase === 'pieces' && layout === 'bottom';
      setCompact(compact);
      // Task 19: the low layout (a phone held sideways) shows the builder as a right-side panel.
      setAttr(el, 'data-layout', ctx.root.dataset.low === '1' && !slim ? 'side' : layout);
      const touch = s.touch || layout === 'bottom';
      setText(title, rideTitle(ctx, s));
      const data = s.rideId !== null ? trackData(game.world, s.rideId) : undefined;
      count.hidden = !data;
      if (data) setText(count, text('ui.track.piecesCount', { n: data.pieces.length }));

      stationBox.hidden = s.phase !== 'station';
      piecesBox.hidden = s.phase !== 'pieces';
      gatesBox.hidden = s.phase !== 'entrance' && s.phase !== 'exit';
      rotate.hidden = s.phase !== 'station';
      cancel.hidden = s.phase !== 'station';
      // Desktop opens the card details panel by itself; the phone opens it from the station controls.
      if (details.hidden === (layout === 'bottom')) details.hidden = layout !== 'bottom';
      undo.hidden = s.phase === 'station';
      // Task 8: while Auto-finish searches or shows a path, Cancel and Confirm take Done's place in the action row.
      done.hidden = s.phase === 'station' || autoFinishShown(s);
      build.hidden = s.phase !== 'pieces' || !!data?.circuitClosed || autoFinishShown(s);
      confirm.hidden = s.phase === 'pieces';
      follow.hidden = s.phase === 'station';
      setAttr(follow, 'aria-pressed', s.follow ? 'true' : 'false');
      keys.hidden = touch || s.phase !== 'pieces';

      if (s.phase !== 'pieces') {
        if (!afConfirm.hidden) afConfirm.hidden = true;
        if (!afCancel.hidden) afCancel.hidden = true;
        showMeter([]);
        toggleClass(status, 'sr-only', false);
      }
      if (s.phase === 'station') {
        const g = s.stationGhost;
        const type = s.typeId ? getTrackTypeDef(s.typeId) : undefined;
        setText(lenValue, s.stationLength === 1 ? text('ui.track.tile') : text('ui.track.tiles', { n: s.stationLength }));
        setText(lenNumber, String(s.stationLength));
        setText(stationHint, text(touch ? 'ui.track.station.hintTouch' : 'ui.track.station.hint'));
        const name = s.typeId && getTrackRideDef(s.typeId) ? contentName(s.typeId) : '';
        const cost = g ? g.cost : type ? type.costs.base : 0;
        setStatus(g ? g.valid : null, text('ui.track.station.cost', { name, cost: formatMoney(cost) }), g ? (g.valid ? text('ui.track.fits') : localizeReason(g.reason ?? '')) : text('ui.track.station.title'));
        if (slim) {
          // Confirm carries the price; a station that does not fit cannot be confirmed, and its reason shows above the row.
          setText(confirmLabel, formatMoney(cost));
          setAttr(confirm, 'aria-label', text('ui.track.confirmStation', { name, cost: formatMoney(cost) }));
          const bad = !!g && !g.valid;
          if (status.hidden === bad) status.hidden = !bad;
          if (confirm.disabled !== (!g || bad)) confirm.toggleAttribute('disabled', !g || bad);
        } else {
          confirm.toggleAttribute('disabled', !g);
        }
        return;
      }

      if (s.phase === 'pieces') {
        stepAutoFinishUi(game);
        refreshPalette(s);
        const closed = !!data?.circuitClosed;
        const af = s.autoFinish;
        const afOn = autoFinishShown(s);
        const afFound = af?.state === 'found';
        const afShow = autoFinishAvailable(game);
        if (autoFinish.hidden === afShow) autoFinish.hidden = !afShow;
        if (afCancel.hidden === afOn) afCancel.hidden = !afOn;
        if (afConfirm.hidden === afFound) afConfirm.hidden = !afFound;
        if (afFound && af) {
          setText(afConfirmLabel, text('ui.track.autoFinishConfirm', { cost: formatMoney(af.cost) }));
          if (afConfirm.disabled === af.affordable) afConfirm.toggleAttribute('disabled', !af.affordable);
          setAttr(afConfirm, 'aria-describedby', af.affordable ? null : 'tb-af-nocash');
        }
        const available = new Set<string>();
        for (const g of palView) for (const p of g.pieces) available.add(p.id);
        for (const [id, b] of groupButtons) {
          const g = palView.find((x) => x.id === id);
          const has = !!g && g.pieces.length > 0;
          b.toggleAttribute('disabled', !has);
          setAttr(b, 'aria-selected', s.group === id ? 'true' : 'false');
        }
        const inGroup = new Set((palView.find((g) => g.id === s.group)?.pieces ?? []).map((p) => p.id));
        for (const pb of pieceButtons) {
          const show = inGroup.has(pb.def.id);
          if (pb.el.hidden === show) pb.el.hidden = !show;
          setAttr(pb.el, 'aria-pressed', s.selected === pb.def.id ? 'true' : 'false');
        }
        groups.hidden = closed;
        palette.hidden = closed;
        empty.hidden = closed || available.size > 0;
        closedBox.hidden = !closed;
        const pv = previewPieceId(s);
        const chainOk = chainAllowed(s.typeId, pv ?? s.selected);
        chain.hidden = !(s.typeId && getTrackTypeDef(s.typeId)?.chain);
        chain.toggleAttribute('disabled', !chainOk);
        setAttr(chain, 'aria-pressed', s.chain ? 'true' : 'false');
        brake.hidden = !isBrakePiece(pv ?? s.selected);
        setText(brakeValue, text('ui.track.brakeValue', { n: s.brakeSpeed }));
        options.hidden = closed;
        // Task 22: a piece that cannot be built (its ghost shows ✕) cannot be pressed; the reason is Build's description.
        const blocked = blockedReason(s);
        const off = s.selected === null || blocked !== null;
        if (build.disabled !== off) build.toggleAttribute('disabled', off);
        setAttr(build, 'aria-describedby', blocked !== null ? 'tb-reason' : null);
        const g0 = s.pieceGhost;
        const price = compact && !off && g0 && g0.ok && g0.defId === s.selected ? text('ui.track.buildPrice', { cost: formatMoney(g0.cost) }) : text('ui.track.build');
        setText(buildLabel, price);
        const g = s.pieceGhost;
        const items = !closed && !afOn && g && pv !== null ? meterView(g.meter) : [];
        showMeter(items);
        // Compact (Task 6): while the piece can be built the meter row takes the small line's place; the line's text
        // (name, price, height; the height also tags the ghost on the map) stays for screen readers (`sr-only`). A piece
        // that cannot be built shows its reason as before.
        toggleClass(status, 'sr-only', compact && items.length > 0 && !!g?.ok);
        if (closed) {
          setStatus(true, text('ui.track.complete'), '');
          return;
        }
        if (af?.state === 'searching') {
          setStatus(null, text('ui.track.autoFinishSearching'), '');
          return;
        }
        if (afFound && af) {
          const found = plural('ui.track.autoFinishFound', { n: af.pieces.length, cost: formatMoney(af.cost) });
          setStatus(af.affordable, found, af.affordable ? '' : localizeReason(TRACK_ERR.notEnoughCash));
          return;
        }
        if (af?.state === 'none') {
          setStatus(false, text('ui.track.autoFinish'), localizeReason(af.reason ?? ''));
          return;
        }
        if (!g || pv === null) {
          setStatus(null, text('ui.track.pickPiece'), '');
          return;
        }
        const name = getTrackPieceDef(g.defId) ? contentName(g.defId) : g.defId;
        if (g.ok) {
          setStatus(true, `${name} · ✓ ${formatMoney(g.cost)}`, `${text('ui.track.height', { tag: heightTag(g.heightAboveGround) })}${g.closes ? ` · ${text('ui.track.closes')}` : ''}`);
        } else {
          setStatus(false, `${name} · ✕`, localizeReason(g.reason ?? ''));
        }
        return;
      }

      // Gates.
      const kind = s.phase === 'exit' ? 'exit' : 'entrance';
      setText(gateHint, s.gateCandidates.length === 0 ? text('ui.track.gate.none') : text(touch ? 'ui.track.gate.hintTouch' : 'ui.track.gate.hint'));
      const g = s.gateGhost;
      const head = text(kind === 'entrance' ? 'ui.track.entrance.title' : 'ui.track.exit.title');
      if (g) setStatus(g.valid, head, g.valid ? text('ui.track.fits') : localizeReason(g.reason ?? ''));
      else setStatus(null, head, '');
      confirm.toggleAttribute('disabled', !g || !g.valid);
    },
  };
}
