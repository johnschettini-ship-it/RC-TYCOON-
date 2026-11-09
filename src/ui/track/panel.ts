/**
 * Track builder panel (phase-2 §7.1–7.3). Owner: W2-A. Browser only.
 * Desktop: a side panel; hovering a piece previews its ghost, a click selects it, Build (or Enter, or a click on
 * the ghost) adds it, a double-click selects and builds. Touch: a bottom sheet (≤ 45% of the height) with group
 * tabs, 56 px piece buttons, options, cost, Undo, a large Build button, and Done; map taps never add pieces.
 */
import { ALL_TRACK_PIECES, getTrackPieceDef, getTrackTypeDef, type TrackPieceDef } from '../../data/track';
import { getTrackRideDef } from '../../data/catalog/trackRides';
import { text } from '../../data/strings/en';
import { trackToolOf, type PaletteGroupId, type TrackToolState } from '../../render/track/toolState';
import { findRide, trackData } from '../../sim/rides/track/common';
import { pieceStatic } from '../../sim/rides/track/geometry';
import type { TrackPieceInstance } from '../../sim/rides/track/types';
import type { UiContext } from '../context';
import { h, setAttr, setText, toggleClass } from '../dom';
import { formatMoney } from '../format';
import { icon } from '../icons';
import {
  buildSelected,
  chainAllowed,
  chooseGate,
  confirmAction,
  heightTag,
  hoverPiece,
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

/** Small drawing of a piece: side view for slopes and loops, top view for the rest. */
function pieceIcon(def: TrackPieceDef): HTMLCanvasElement {
  const dpr = Math.min(3, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
  const c = h('canvas', { class: 'piece-icon', width: Math.round(ICON_W * dpr), height: Math.round(ICON_H * dpr), 'aria-hidden': 'true' });
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  ctx.scale(dpr, dpr);
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
  ctx.strokeStyle = '#f2f5f8';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
  // Marks for special pieces.
  const midX = ox + (((sm.x[Math.floor(sm.n / 2)] as number) + 0) * k);
  const midY = oy + (side ? -(sm.h[Math.floor(sm.n / 2)] as number) : (sm.y[Math.floor(sm.n / 2)] as number)) * k;
  ctx.fillStyle = '#ffd23f';
  if (def.special === 'station') ctx.fillRect(midX - 9, midY + 4, 18, 3);
  if (def.special === 'brakes' || def.special === 'blockBrake') {
    ctx.fillStyle = def.special === 'brakes' ? '#f07a3a' : '#ffd23f';
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
    ctx.strokeStyle = '#4fb3d9';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#f2fbff';
    if (def.special === 'splashdown' || def.special === 'waterfall' || def.special === 'rough') {
      for (let i = -2; i <= 2; i++) ctx.fillRect(midX + i * 5 - 1, midY - 6 + (i % 2 === 0 ? 0 : 2), 2, 3);
    }
    if (def.special === 'whirlpool') {
      ctx.strokeStyle = '#f2fbff';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(midX, midY, 5, 0.3, Math.PI * 1.7);
      ctx.stroke();
    }
    if (def.water.drive === 'conveyor' && def.special !== 'station') {
      ctx.fillStyle = '#ffd23f';
      for (let i = -2; i <= 2; i++) ctx.fillRect(midX + i * 5 - 1, midY - 2 - i * 1.2, 2, 4);
    }
  }
  if (def.special === 'spooky') {
    ctx.fillStyle = '#b39ddb';
    ctx.fillRect(midX - 8, midY - 9, 16, 12);
    ctx.fillStyle = '#12202e';
    ctx.fillRect(midX - 4, midY - 6, 2, 3);
    ctx.fillRect(midX + 2, midY - 6, 2, 3);
  }
  if (def.exit.bank !== def.entry.bank || def.entry.bank !== 'none') {
    const end = def.exit.bank === 'none' ? def.entry.bank : def.exit.bank;
    const tilt = end === 'left' ? -1 : 1;
    ctx.strokeStyle = '#4fb3d9';
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
  return st.typeId ? (getTrackRideDef(st.typeId)?.name ?? st.typeId) : text('ui.track.builder');
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
      class: 'btn toggle small',
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
  const statusDetail = h('span', { class: 'status-detail', 'data-testid': 'track-reason' });
  const status = h('div', { class: 'tb-status', 'aria-live': 'polite' }, okIcon, badIcon, h('span', { class: 'status-texts' }, statusMain, statusDetail));

  // ---------- station phase
  const rotate = h('button', { type: 'button', class: 'btn', 'data-testid': 'track-rotate', onclick: () => rotateStation(game) }, icon('rotate'), h('span', { text: text('ui.track.rotate') }));
  const lenValue = h('output', { class: 'stepper-value', 'data-testid': 'track-station-length' });
  const lenLess = h('button', { type: 'button', class: 'btn step', 'aria-label': text('ui.track.lengthLess'), onclick: () => setStationLength(game, st().stationLength - 1) }, '−');
  const lenMore = h('button', { type: 'button', class: 'btn step', 'aria-label': text('ui.track.lengthMore'), onclick: () => setStationLength(game, st().stationLength + 1) }, '+');
  const stationHint = h('p', { class: 'tb-hint muted' });
  const stationBox = h(
    'div',
    { class: 'tb-station' },
    h('div', { class: 'tb-row' }, rotate, h('div', { class: 'stepper', role: 'group', 'aria-label': text('ui.track.station.length') }, h('span', { class: 'row-label', text: text('ui.track.station.length') }), lenLess, lenValue, lenMore)),
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
      { type: 'button', class: 'tb-piece', 'data-piece': def.id, 'data-testid': `track-piece-${def.id}`, 'aria-pressed': 'false', title: def.water?.wetsRiders ? `${def.name} · ${text('ui.track.wet')}` : def.name },
      pieceIcon(def),
      h('span', { class: 'tb-piece-name', text: def.name }),
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
  const options = h('div', { class: 'tb-row tb-options' }, chain, brake);
  const moveEntrance = h('button', { type: 'button', class: 'btn', onclick: () => chooseGate(game, 'entrance') }, text('ui.track.moveEntrance'));
  const moveExit = h('button', { type: 'button', class: 'btn', onclick: () => chooseGate(game, 'exit') }, text('ui.track.moveExit'));
  const closedBox = h('div', { class: 'tb-row' }, moveEntrance, moveExit);
  const piecesBox = h('div', { class: 'tb-pieces' }, groups, palette, empty, options, closedBox);

  // ---------- gate phases
  const gateHint = h('p', { class: 'tb-hint muted' });
  const gatesBox = h('div', { class: 'tb-gates' }, gateHint);

  // ---------- actions
  const undo = h('button', { type: 'button', class: 'btn', 'data-testid': 'track-undo', onclick: () => undoPiece(game) }, h('span', { text: text('ui.track.undo') }));
  const build = h('button', { type: 'button', class: 'btn primary big-action', 'data-testid': 'track-build', onclick: () => buildSelected(game) }, icon('check'), h('span', { text: text('ui.track.build') }));
  const confirm = h('button', { type: 'button', class: 'btn primary big-action', 'data-testid': 'track-confirm', onclick: () => confirmAction(game) }, icon('check'), h('span', { text: text('ui.track.confirm') }));
  const done = h('button', { type: 'button', class: 'btn', 'data-testid': 'track-done', onclick: () => leaveBuilder(game) }, h('span', { text: text('ui.track.done') }));
  const cancel = h('button', { type: 'button', class: 'btn', 'data-testid': 'track-cancel', onclick: () => leaveBuilder(game, false) }, h('span', { text: text('ui.track.cancel') }));
  const keys = h('p', { class: 'tb-keys muted', text: text('ui.track.keys') });
  const actions = h('div', { class: 'tb-actions' }, undo, cancel, confirm, build, done);

  const el = h(
    'section',
    { class: 'track-builder', role: 'region', 'aria-label': text('ui.track.builder'), 'data-testid': 'track-builder', hidden: true },
    header,
    h('div', { class: 'tb-body' }, stationBox, piecesBox, gatesBox, status),
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
      if (el.hidden === visible) el.hidden = !visible;
      if (!visible) {
        palKey = null;
        return;
      }
      // Another panel (finance, park, pickers) takes over: leave the builder, the track stays as it is.
      if (ctx.activePanel()) {
        leaveBuilder(game, false);
        el.hidden = true;
        palKey = null;
        return;
      }
      el.dataset.phase = s.phase;
      el.dataset.layout = ctx.root.dataset.layout ?? 'side';
      const touch = s.touch || el.dataset.layout === 'bottom';
      setText(title, rideTitle(ctx, s));
      const data = s.rideId !== null ? trackData(game.world, s.rideId) : undefined;
      count.hidden = !data;
      if (data) setText(count, text('ui.track.piecesCount', { n: data.pieces.length }));

      stationBox.hidden = s.phase !== 'station';
      piecesBox.hidden = s.phase !== 'pieces';
      gatesBox.hidden = s.phase !== 'entrance' && s.phase !== 'exit';
      rotate.hidden = s.phase !== 'station';
      cancel.hidden = s.phase !== 'station';
      undo.hidden = s.phase === 'station';
      done.hidden = s.phase === 'station';
      build.hidden = s.phase !== 'pieces' || !!data?.circuitClosed;
      confirm.hidden = s.phase === 'pieces';
      follow.hidden = s.phase === 'station';
      setAttr(follow, 'aria-pressed', s.follow ? 'true' : 'false');
      keys.hidden = touch || s.phase !== 'pieces';

      if (s.phase === 'station') {
        const g = s.stationGhost;
        const type = s.typeId ? getTrackTypeDef(s.typeId) : undefined;
        setText(lenValue, s.stationLength === 1 ? text('ui.track.tile') : text('ui.track.tiles', { n: s.stationLength }));
        setText(stationHint, text(touch ? 'ui.track.station.hintTouch' : 'ui.track.station.hint'));
        const name = s.typeId ? (getTrackRideDef(s.typeId)?.name ?? '') : '';
        const cost = g ? g.cost : type ? type.costs.base : 0;
        setStatus(g ? g.valid : null, text('ui.track.station.cost', { name, cost: formatMoney(cost) }), g ? (g.valid ? text('ui.track.fits') : (g.reason ?? '')) : text('ui.track.station.title'));
        confirm.toggleAttribute('disabled', !g);
        return;
      }

      if (s.phase === 'pieces') {
        refreshPalette(s);
        const closed = !!data?.circuitClosed;
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
        build.toggleAttribute('disabled', s.selected === null);
        if (closed) {
          setStatus(true, text('ui.track.complete'), '');
          return;
        }
        const g = s.pieceGhost;
        if (!g || pv === null) {
          setStatus(null, text('ui.track.pickPiece'), '');
          return;
        }
        const name = getTrackPieceDef(g.defId)?.name ?? g.defId;
        if (g.ok) {
          setStatus(true, `${name} · ✓ ${formatMoney(g.cost)}`, `${text('ui.track.height', { tag: heightTag(g.heightAboveGround) })}${g.closes ? ` · ${text('ui.track.closes')}` : ''}`);
        } else {
          setStatus(false, `${name} · ✕`, g.reason ?? '');
        }
        return;
      }

      // Gates.
      const kind = s.phase === 'exit' ? 'exit' : 'entrance';
      setText(gateHint, s.gateCandidates.length === 0 ? text('ui.track.gate.none') : text(touch ? 'ui.track.gate.hintTouch' : 'ui.track.gate.hint'));
      const g = s.gateGhost;
      const head = text(kind === 'entrance' ? 'ui.track.entrance.title' : 'ui.track.exit.title');
      if (g) setStatus(g.valid, head, g.valid ? text('ui.track.fits') : (g.reason ?? ''));
      else setStatus(null, head, '');
      confirm.toggleAttribute('disabled', !g || !g.valid);
    },
  };
}
