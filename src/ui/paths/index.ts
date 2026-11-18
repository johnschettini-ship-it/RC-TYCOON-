/**
 * Path step builder panel (touch controls spec 2026-11-18 §3), for the footpath and queue tools. Registered in
 * `../extensions.ts`. It replaces the Height mini-bar and the path half of the tool status bar with ONE row:
 * - before a start: the hint "Tap a tile to start", the Height and slope button, Done;
 * - after a start: Turn left, Forward, Turn right, Height and slope, Undo, Done.
 * Every control is an icon with a short label under it (Left, Forward, Right, Slope, Undo, Done; the full names are their
 * accessible names), at least 44 × 44, sharing the row equally, so the row fits a 360 px phone at any text size (a label
 * too long for its button wraps under the icon rather than being cut). Holding Turn left, Forward or Turn right repeats it (`STEP_HOLD_MS`, then every
 * `STEP_REPEAT_MS`). The Height and slope button opens a small menu above the row: Flat / Up / Down (elevated paths
 * only; ground paths follow the land) and − height +. `Page Up` / `Page Down` still change the height.
 * The ghost's cost shows in a tag over the ghost on the map (with the height of an elevated path), or the reason the
 * step cannot be built, in the danger colour. Mouse players see one tip, once, about Shift-drag lines (`./shiftTip`).
 */
import { text } from '../../data/strings/en';
import { STEP_HOLD_MS, STEP_REPEAT_MS } from '../../data/tuning/interface';
import { localizeReason } from '../../i18n';
import { mapPointToWorld } from '../../input/camera';
import { changePathHeight, pathHeightRange } from '../../input/pathHeight';
import { canUndoStep, nextStep, pathBuilderStarted, stepPath, undoStep, type StepMove } from '../../input/pathBuilder';
import { worldToScreen } from '../../render/camera';
import type { RampMode } from '../../sim/commands/types';
import type { UiContext } from '../context';
import { h, setAttr, setText, toggleClass } from '../dom';
import type { UiExtension, UiPart } from '../extensions';
import { formatMoney } from '../format';
import { icon } from '../icons';
import { segmented } from '../management/widgets';
import { createShiftTip } from './shiftTip';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 24 × 24 line icons (stroke `currentColor`), like `../icons.ts`. */
const PATHS = {
  forward: 'M12 20 V5 M6 11 L12 5 L18 11',
  left: 'M16 20 V13 A4 4 0 0 0 12 9 H5 M9 5 L5 9 L9 13',
  right: 'M8 20 V13 A4 4 0 0 1 12 9 H19 M15 5 L19 9 L15 13',
  flat: 'M3 15 H21 M3 19 H21',
  up: 'M3 19 H21 M3 19 L21 9 M15 8 L21 9 L18.5 14.5',
  down: 'M3 19 H21 M3 9 L21 19 M15 20 L21 19 L18.5 13.5',
} as const;

function lineIcon(name: keyof typeof PATHS): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', 'icon');
  const p = document.createElementNS(SVG_NS, 'path');
  p.setAttribute('d', PATHS[name]);
  p.setAttribute('fill', 'none');
  p.setAttribute('stroke', 'currentColor');
  p.setAttribute('stroke-width', '2');
  p.setAttribute('stroke-linecap', 'round');
  p.setAttribute('stroke-linejoin', 'round');
  svg.append(p);
  return svg;
}

function heightLabel(z: number | null, ground: number): string {
  if (z === null) return text('paths.ground');
  return `${text('paths.metres', { n: z })} · ${text('paths.aboveGround', { n: z - ground })}`;
}

/** A round 44 × 44 icon button; a hold repeats `act` (Turn left, Forward, Turn right). */
function stepButton(testId: string, iconEl: Element, label: string, act: () => void, repeat: boolean, primary = false): HTMLButtonElement {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let repeated = false;
  const stop = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const b = h(
    'button',
    {
      type: 'button',
      class: primary ? 'btn primary path-step' : 'btn path-step',
      'data-testid': testId,
      onclick: () => {
        // The click that ends a hold that already repeated does not step again.
        if (repeated) repeated = false;
        else act();
      },
    },
    iconEl,
    h('span', { class: 'path-label', text: label }),
  );
  if (repeat) {
    b.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      repeated = false;
      stop();
      const tick = (): void => {
        repeated = true;
        act();
        timer = setTimeout(tick, STEP_REPEAT_MS);
      };
      timer = setTimeout(tick, STEP_HOLD_MS);
    });
    for (const type of ['pointerup', 'pointercancel', 'pointerleave'] as const) b.addEventListener(type, stop);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  return b;
}

export function createPathPanel(ctx: UiContext): UiPart {
  const { game } = ctx;
  const step = (move: StepMove): void => {
    stepPath(game, move);
  };
  const hint = h('span', { class: 'status-text path-hint', 'data-testid': 'path-hint', text: text('paths.hint') });
  const left = stepButton('path-left', lineIcon('left'), text('paths.labelLeft'), () => step('left'), true);
  const forward = stepButton('path-forward', lineIcon('forward'), text('paths.labelForward'), () => step('forward'), true, true);
  const right = stepButton('path-right', lineIcon('right'), text('paths.labelRight'), () => step('right'), true);
  setAttr(left, 'aria-label', text('paths.left'));
  setAttr(right, 'aria-label', text('paths.right'));

  // Height and slope: the button and its menu above the row.
  const slopeIcons = { flat: lineIcon('flat'), up: lineIcon('up'), down: lineIcon('down') } as const;
  const slope = h(
    'button',
    { type: 'button', class: 'btn path-step', 'data-testid': 'path-slope', 'aria-expanded': 'false', 'aria-controls': 'path-slope-menu', onclick: () => setMenu(menu.hidden !== false) },
    slopeIcons.flat,
    slopeIcons.up,
    slopeIcons.down,
    h('span', { class: 'path-label', text: text('paths.labelSlope') }),
  );
  const value = h('span', { class: 'status-text path-height-value', 'data-testid': 'path-height-value', 'aria-live': 'polite' });
  const lower = h(
    'button',
    { type: 'button', class: 'btn path-btn', 'aria-label': text('paths.lower'), title: `${text('paths.lower')} (Page Down)`, 'data-testid': 'path-height-down', onclick: () => changePathHeight(game.tool, game.world, -1) },
    h('span', { text: '−', 'aria-hidden': 'true' }),
  );
  const raise = h(
    'button',
    { type: 'button', class: 'btn path-btn', 'aria-label': text('paths.raise'), title: `${text('paths.raise')} (Page Up)`, 'data-testid': 'path-height-up', onclick: () => changePathHeight(game.tool, game.world, 1) },
    h('span', { text: '+', 'aria-hidden': 'true' }),
  );
  const ramp = segmented<RampMode>(
    text('paths.ramp'),
    [
      { value: 'flat', label: text('paths.rampFlat'), testId: 'path-ramp-flat' },
      { value: 'up', label: text('paths.rampUp'), testId: 'path-ramp-up' },
      { value: 'down', label: text('paths.rampDown'), testId: 'path-ramp-down' },
    ],
    (m) => {
      game.tool.pathHeight.ramp = m;
    },
    'compact',
  );
  const menu = h(
    'div',
    { class: 'path-slope-menu', id: 'path-slope-menu', 'data-testid': 'path-slope-menu', role: 'group', 'aria-label': text('paths.slopeMenu'), hidden: true },
    h('div', { class: 'path-menu-row' }, lower, value, raise),
    h('div', { class: 'path-menu-row' }, ramp.el),
  );
  const setMenu = (open: boolean): void => {
    menu.hidden = !open;
    setAttr(slope, 'aria-expanded', open ? 'true' : 'false');
  };

  const undo = stepButton('path-undo', icon('undo'), text('paths.undo'), () => undoStep(game), false);
  setAttr(undo, 'aria-label', text('paths.undo'));
  const done = stepButton(
    'path-done',
    icon('check'),
    text('paths.done'),
    () => {
      const t = game.tool;
      t.tool = 'inspect';
      t.defId = null;
      t.ghost = null;
      t.drag = null;
    },
    false,
  );
  setAttr(done, 'aria-label', text('paths.done'));
  setAttr(done, 'title', text('paths.done'));
  setAttr(undo, 'title', text('paths.undo'));
  setAttr(left, 'title', text('paths.left'));
  setAttr(right, 'title', text('paths.right'));

  const tip = createShiftTip();
  const el = h(
    'div',
    { class: 'tool-status path-panel', role: 'region', 'aria-label': text('paths.builder'), 'data-testid': 'path-panel', hidden: true },
    tip.el,
    h('div', { class: 'path-row' }, hint, left, forward, right, h('div', { class: 'path-slope-wrap' }, slope, menu), undo, done),
  );

  // The ghost's cost (or its reason) over the ghost on the map.
  const tag = h('div', { class: 'path-cost-tag', 'data-testid': 'path-cost-tag', 'aria-hidden': 'true', hidden: true });
  ctx.root.append(tag);
  let canvas: HTMLElement | null = null;

  /** Put the tag over `tile` at height `z` (CSS px of the UI root), with `label`, in the danger colour when `bad`. */
  const showTag = (tile: number, z: number, label: string, bad: boolean): void => {
    const map = game.world.state.map;
    canvas ??= document.getElementById('game');
    const r = canvas?.getBoundingClientRect() ?? { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
    const rr = ctx.root.getBoundingClientRect();
    const w = mapPointToWorld(map, (tile % map.width) + 0.5, Math.floor(tile / map.width) + 0.5, z, game.camera.rotation);
    const p = worldToScreen(game.camera, w.sx, w.sy, r.width, r.height);
    const x = r.left - rr.left + p.x;
    const y = r.top - rr.top + p.y - 22 * game.camera.zoom;
    setText(tag, label);
    toggleClass(tag, 'bad', bad);
    tag.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -100%)`;
    tag.hidden = false;
  };

  const placeTag = (): void => {
    const t = game.tool;
    const d = t.drag;
    // A Shift-drag line: the number of tiles and the total (or the reason) at its end.
    if (d && d.stepDir === undefined && d.tiles.length > 0) {
      const map = game.world.state.map;
      const z = t.pathHeight.z ?? ((map.heights[d.endTile] as number) ?? 0);
      const label = d.reason ? localizeReason(d.reason) : text('paths.lineTag', { count: d.tiles.length, cost: formatMoney(d.cost) });
      showTag(d.endTile, z, label, !!d.reason);
      return;
    }
    const plan = d && d.stepDir !== undefined ? nextStep(game) : null;
    if (!plan || plan.tiles.length === 0 && !plan.reason) {
      tag.hidden = true;
      return;
    }
    const map = game.world.state.map;
    const last = plan.tiles.length > 0 ? (plan.tiles[plan.tiles.length - 1] as number) : -1;
    const node = plan.nodes[plan.nodes.length - 1];
    if (last < 0 || !node) {
      tag.hidden = true;
      return;
    }
    const ground = map.heights[last] as number;
    const label = plan.reason ? localizeReason(plan.reason) : node.z === null ? formatMoney(plan.cost) : text('paths.costTag', { cost: formatMoney(plan.cost), height: text('paths.aboveGround', { n: node.z - ground }) });
    showTag(last, node.z ?? ground, label, plan.reason !== null);
  };

  let lastKey = '';
  return {
    el,
    update() {
      const t = game.tool;
      const on = t.tool === 'footpath' || t.tool === 'queue';
      if (el.hidden === on) el.hidden = !on;
      tip.update(on);
      if (!on) {
        tag.hidden = true;
        if (!menu.hidden) setMenu(false);
        return;
      }
      const started = pathBuilderStarted(game);
      setAttr(el, 'data-started', started ? '1' : '0');
      hint.hidden = started;
      left.hidden = !started;
      forward.hidden = !started;
      right.hidden = !started;
      undo.hidden = !started;
      undo.toggleAttribute('disabled', !canUndoStep(game));
      const map = game.world.state.map;
      const plan = started ? nextStep(game) : null;
      const fwdLabel = plan ? (plan.reason ? text('paths.forwardReason', { reason: localizeReason(plan.reason) }) : text('paths.forwardCost', { cost: formatMoney(plan.cost) })) : text('paths.forward');
      setAttr(forward, 'aria-label', fwdLabel);
      setAttr(forward, 'title', fwdLabel);
      toggleClass(el, 'invalid', !!plan?.reason);
      // The height menu: the tile the height refers to is the end, else the tile under the pointer, else the entrance.
      const ref = plan?.tiles[0] ?? t.hoverTile;
      const tile = ref !== null && ref !== undefined && ref >= 0 && ref < map.width * map.height ? ref : map.entranceTile;
      const ground = tile >= 0 ? (map.heights[tile] as number) : 0;
      const z = t.pathHeight.z;
      const rampNow: RampMode = z === null ? 'flat' : t.pathHeight.ramp;
      const key = `${z}|${rampNow}|${ground}`;
      if (key !== lastKey) {
        lastKey = key;
        setText(value, heightLabel(z, ground));
        slopeIcons.flat.style.display = rampNow === 'flat' ? '' : 'none';
        slopeIcons.up.style.display = rampNow === 'up' ? '' : 'none';
        slopeIcons.down.style.display = rampNow === 'down' ? '' : 'none';
        const slopeName = text(rampNow === 'up' ? 'paths.rampUp' : rampNow === 'down' ? 'paths.rampDown' : 'paths.rampFlat');
        const label = text('paths.slopeState', { height: heightLabel(z, ground), slope: slopeName });
        setAttr(slope, 'aria-label', label);
        setAttr(slope, 'title', label);
      }
      const { max } = pathHeightRange(game.world, tile >= 0 ? tile : 0);
      lower.toggleAttribute('disabled', z === null);
      raise.toggleAttribute('disabled', z !== null && z >= max);
      ramp.set(rampNow);
      for (const b of ramp.buttons) b.toggleAttribute('disabled', z === null);
      setAttr(el, 'data-height', z === null ? 'ground' : String(z));
      placeTag();
    },
  };
}

export const pathHeightUi: UiExtension = {
  bars: (ctx) => createPathPanel(ctx),
};
