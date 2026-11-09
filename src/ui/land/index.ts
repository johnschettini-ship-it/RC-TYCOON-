/**
 * Land and Water tools (Phase 4 §7): toolbar buttons, the mode chips (Raise, Lower, Smooth, Corner, Level, Paint),
 * size chips 1/3/5/7, the terrain type picker, the touch mini-bar (Raise, Lower, + / − level target, Confirm).
 * Owner: W3-A. Registered in `../extensions.ts`.
 *
 * The bar shows on every device (desktop users may use it too): the ghost state with an icon and text (cost, or the
 * reason it cannot be built), the chips, and the action buttons. A tap on an action applies once; press and hold
 * repeats every 300 ms (the input router does the work on its next frame). Every control is at least 44 × 44 CSS px
 * and has a text label or `aria-label`.
 *
 * Browser glue: capture-phase pointer listeners note presses on the map canvas before the gesture recognizer reads
 * them (`noteLandPointerDown`), and a ResizeObserver keeps the canvas size in the tool's side table.
 */
import { text } from '../../data/strings/en';
import { localizeReason } from '../../i18n';
import { BRUSH_SIZES } from '../../data/tuning/terrain';
import {
  isTerrainTool,
  landToolOf,
  noteLandPointerDown,
  noteLandPointerUp,
  pressLandButton,
  queueLandAction,
  releaseLandButton,
  resetLandTransient,
  setLandMode,
  type LandAction,
  type WaterMode,
} from '../../render/terrainTools/toolState';
import type { LandMode, ToolState } from '../../render/types';
import type { PointerKind } from '../../input/gestures';
import { Terrain, type TerrainCode } from '../../sim/map';
import type { BrushSize } from '../../sim/terrain/types';
import type { UiContext } from '../context';
import { h, setAttr, setText, toggleClass } from '../dom';
import type { UiExtension, UiPart } from '../extensions';
import { formatMoney } from '../format';
import { icon } from '../icons';
import { segmented } from '../management/widgets';

const SVG_NS = 'http://www.w3.org/2000/svg';

const PATHS = {
  land: 'M2.5 19.5 L8.5 9 L12.5 15 L15.5 10.5 L21.5 19.5 Z M7 13 L8.5 11 L10 13',
  water: 'M3 9.5 C5 7.5 7 7.5 9 9.5 C11 11.5 13 11.5 15 9.5 C17 7.5 19 7.5 21 9.5 M3 15 C5 13 7 13 9 15 C11 17 13 17 15 15 C17 13 19 13 21 15',
  raise: 'M12 19.5 V5 M6 11 L12 5 L18 11',
  lower: 'M12 4.5 V19 M6 13 L12 19 L18 13',
  plus: 'M12 5 V19 M5 12 H19',
  minus: 'M5 12 H19',
} as const;

/** Original line icon (24 × 24), decorative. */
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

/** Paint swatches (same family as the terrain art; a label always goes with the colour). */
const SWATCH: Record<TerrainCode, string> = { 0: '#5fa84a', 1: '#e2cf8f', 2: '#8a6844', 3: '#8d939a', 4: '#f2f6fa' };

const MODES: readonly LandMode[] = ['raise', 'lower', 'smooth', 'corner', 'level', 'paint'];
const TERRAINS: readonly TerrainCode[] = [Terrain.Grass, Terrain.Sand, Terrain.Dirt, Terrain.Rock, Terrain.Snow];
/** Test ids by terrain code (fixed, whatever the language). */
const TERRAIN_IDS: readonly string[] = ['grass', 'sand', 'dirt', 'rock', 'snow'];

function selectTool(ctx: UiContext, tool: 'land' | 'water'): void {
  const t = ctx.game.tool;
  t.tool = tool;
  t.defId = null;
  t.ghost = null;
  t.drag = null;
  // Phones: the bottom sheet would cover the tool bar and the map.
  if (ctx.root.dataset.layout === 'bottom') ctx.closePanel();
}

function backToInspect(ctx: UiContext): void {
  const t = ctx.game.tool;
  t.tool = 'inspect';
  t.defId = null;
  t.ghost = null;
  t.drag = null;
}

function pointerKind(t: string): PointerKind {
  return t === 'mouse' ? 'mouse' : t === 'pen' ? 'pen' : 'touch';
}

/** An action button: a tap applies once, press and hold repeats; keyboard activation applies once. */
function actionButton(ctx: UiContext, action: LandAction, label: string, testId: string, iconEl: Element | null, primary = false): HTMLButtonElement {
  const tool = ctx.game.tool;
  const b = h('button', { type: 'button', class: primary ? 'btn primary' : 'btn', 'data-testid': testId, 'aria-label': label }, iconEl, h('span', { class: 'land-action-label', text: label }));
  let pointerId = -1;
  b.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    pointerId = e.pointerId;
    try {
      b.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic pointers cannot always be captured.
    }
    pressLandButton(tool, action);
    e.preventDefault();
  });
  const release = (e: PointerEvent): void => {
    if (e.pointerId !== pointerId) return;
    pointerId = -1;
    releaseLandButton(tool);
  };
  b.addEventListener('pointerup', release);
  b.addEventListener('pointercancel', release);
  b.addEventListener('lostpointercapture', release);
  // Keyboard (Enter / Space) gives a click with detail 0; pointer clicks were handled on pointerdown.
  b.addEventListener('click', (e) => {
    if (e.detail === 0) queueLandAction(tool, action);
  });
  return b;
}

function titleOf(tool: ToolState, water: WaterMode): string {
  if (tool.tool === 'water') return text(water === 'raise' ? 'landUi.title.raiseWater' : 'landUi.title.lowerWater');
  const m = tool.land.mode;
  if (m === 'paint') return text('landUi.title.paint', { terrain: text(`landUi.terrain.${tool.land.paint}`) });
  return text(`landUi.title.${m}`);
}

/** Bar-only layout rules (scoped to `.land-bar`; the shared look comes from the tool-status and segmented styles). */
const LAND_BAR_CSS = `
.land-bar .seg-btn { min-width: var(--touch); padding: 4px 8px; }
.land-bar .land-level { align-items: center; }
.land-bar .land-target { min-width: 84px; text-align: center; }
.land-bar .land-swatch { flex: none; }
@media (max-width: 599px) {
  .land-bar .seg-btn { padding: 4px 5px; font-size: calc(13px * var(--ts, 1)); }
  .land-bar .segmented { gap: 3px; }
}`;

function injectStyle(): void {
  if (document.getElementById('tc-land-bar-style')) return;
  const s = document.createElement('style');
  s.id = 'tc-land-bar-style';
  s.textContent = LAND_BAR_CSS;
  document.head.append(s);
}

function createLandBar(ctx: UiContext): UiPart {
  injectStyle();
  const { game } = ctx;
  const tool = game.tool;
  const st = landToolOf(tool);

  const okIcon = icon('check', 'icon state-icon ok');
  const badIcon = icon('cross', 'icon state-icon bad');
  const title = h('span', { class: 'status-text', 'data-testid': 'land-title' });
  const detail = h('span', { class: 'status-detail', 'data-testid': 'land-detail' });
  const hint = h('span', { class: 'status-detail land-hint' });

  const modes = segmented<LandMode>(
    text('landUi.modes'),
    MODES.map((m) => ({ value: m, label: text(`landUi.mode.${m}`), testId: `land-mode-${m}` })),
    (m) => setLandMode(tool, m),
    'compact',
  );
  const waterModes = segmented<WaterMode>(
    text('landUi.waterModes'),
    [
      { value: 'raise', label: text('landUi.mode.raise'), testId: 'water-mode-raise' },
      { value: 'lower', label: text('landUi.mode.lower'), testId: 'water-mode-lower' },
    ],
    (m) => {
      st.waterMode = m;
    },
    'compact',
  );
  const sizes = segmented<BrushSize>(
    text('landUi.sizes'),
    BRUSH_SIZES.map((n) => ({ value: n, label: text('landUi.size', { n }), testId: `land-size-${n}` })),
    (n) => {
      tool.land.size = n;
    },
    'compact',
  );
  const paints = segmented<TerrainCode>(
    text('landUi.terrains'),
    TERRAINS.map((t) => ({ value: t, label: text(`landUi.terrain.${t}`), testId: `land-paint-${TERRAIN_IDS[t]}` })),
    (t) => {
      tool.land.paint = t;
    },
    'compact',
  );
  paints.buttons.forEach((b, k) => {
    const sw = h('span', { class: 'land-swatch', 'aria-hidden': 'true' });
    sw.style.cssText = `display:inline-block;width:14px;height:14px;border-radius:3px;border:1px solid rgba(0,0,0,0.45);background:${SWATCH[TERRAINS[k] as TerrainCode]}`;
    b.prepend(sw);
  });

  const raise = actionButton(ctx, 'raise', text('landUi.action.raise'), 'land-raise', lineIcon('raise'), true);
  const lower = actionButton(ctx, 'lower', text('landUi.action.lower'), 'land-lower', lineIcon('lower'), true);
  const apply = actionButton(ctx, 'apply', text('landUi.action.smooth'), 'land-apply', null, true);
  const targetDown = actionButton(ctx, 'lower', text('landUi.level.down'), 'land-level-down', lineIcon('minus'));
  const targetUp = actionButton(ctx, 'raise', text('landUi.level.up'), 'land-level-up', lineIcon('plus'));
  for (const b of [targetDown, targetUp]) {
    // Icon-only steppers; the aria-label names them.
    (b.querySelector('.land-action-label') as HTMLElement).hidden = true;
  }
  const target = h('span', { class: 'status-text land-target', 'data-testid': 'land-level-target', 'aria-live': 'polite' });
  const confirm = actionButton(ctx, 'confirm', text('landUi.confirm'), 'land-confirm', icon('check'), true);
  const done = h('button', { type: 'button', class: 'btn', 'data-testid': 'land-done', onclick: () => backToInspect(ctx) }, icon('check'), h('span', { text: text('landUi.done') }));
  const level = h('div', { class: 'status-actions land-level', role: 'group', 'aria-label': text('landUi.mode.level') }, targetDown, target, targetUp, confirm);
  const actions = h('div', { class: 'status-actions wrap', role: 'group', 'aria-label': text('landUi.actions') }, raise, lower, apply, level, done);

  const el = h(
    'div',
    { class: 'tool-status mgmt-bar land-bar', role: 'region', 'aria-label': text('landUi.bar.land'), 'data-testid': 'land-bar', hidden: true },
    h('div', { class: 'status-line', 'aria-live': 'polite' }, okIcon, badIcon, h('span', { class: 'status-texts' }, title, detail, hint)),
    h('div', { class: 'status-actions wrap' }, modes.el, waterModes.el),
    h('div', { class: 'status-actions wrap' }, sizes.el, paints.el),
    actions,
  );

  // Browser glue: presses on the map canvas reach the tool before the gesture recognizer (capture phase).
  const canvas = document.getElementById('game');
  let pressId = -1;
  window.addEventListener(
    'pointerdown',
    (e) => {
      if (!canvas || e.target !== canvas) return;
      if (e.pointerType === 'mouse' && e.button === 0) pressId = e.pointerId;
      noteLandPointerDown(tool, pointerKind(e.pointerType), e.button, e.shiftKey);
    },
    true,
  );
  const up = (e: PointerEvent): void => {
    if (e.pointerId !== pressId) return;
    pressId = -1;
    noteLandPointerUp(tool);
  };
  window.addEventListener('pointerup', up, true);
  window.addEventListener('pointercancel', up, true);
  window.addEventListener('blur', () => {
    pressId = -1;
    noteLandPointerUp(tool);
    releaseLandButton(tool);
  });
  const measure = (): void => {
    if (!canvas) return;
    const r = canvas.getBoundingClientRect();
    st.viewW = r.width;
    st.viewH = r.height;
  };
  if (canvas && typeof ResizeObserver !== 'undefined') new ResizeObserver(measure).observe(canvas);
  measure();
  game.onWorldChanged(() => resetLandTransient(st));

  return {
    el,
    update() {
      const on = isTerrainTool(tool.tool);
      if (el.hidden === on) el.hidden = !on;
      if (!on) return;
      const water = tool.tool === 'water';
      const mode = tool.land.mode;
      const touch = st.pointer !== 'mouse';
      setAttr(el, 'aria-label', text(water ? 'landUi.bar.water' : 'landUi.bar.land'));
      modes.el.hidden = water;
      waterModes.el.hidden = !water;
      modes.set(mode);
      waterModes.set(st.waterMode);
      const brushMode = water || (mode !== 'corner' && mode !== 'level');
      sizes.el.hidden = !brushMode;
      sizes.set(tool.land.size);
      paints.el.hidden = water || mode !== 'paint';
      paints.set(tool.land.paint);

      const t = titleOf(tool, st.waterMode);
      setText(title, brushMode ? text('landUi.title.size', { title: t, n: tool.land.size }) : t);
      const b = tool.brush;
      let valid: boolean | null = null;
      if (b) {
        valid = b.valid;
        if (!b.valid) setText(detail, localizeReason(b.reason ?? ''));
        else if (b.cost === 0) setText(detail, text('landUi.nothing'));
        else if (b.reason) setText(detail, text('landUi.costWarn', { cost: formatMoney(b.cost), warning: localizeReason(b.reason) }));
        else setText(detail, text('landUi.cost', { cost: formatMoney(b.cost) }));
      } else {
        setText(detail, '');
      }
      okIcon.style.display = valid === true ? '' : 'none';
      badIcon.style.display = valid === false ? '' : 'none';
      toggleClass(el, 'valid', valid === true);
      toggleClass(el, 'invalid', valid === false);

      // Actions by mode.
      const isLevel = !water && mode === 'level';
      const corner = !water && mode === 'corner';
      const updown = water || mode === 'raise' || mode === 'lower' || corner;
      raise.hidden = !updown;
      lower.hidden = !updown;
      const rl = corner ? text('landUi.action.raiseCorner') : text('landUi.action.raise');
      const ll = corner ? text('landUi.action.lowerCorner') : text('landUi.action.lower');
      setAttr(raise, 'aria-label', rl);
      setAttr(lower, 'aria-label', ll);
      apply.hidden = water || (mode !== 'smooth' && mode !== 'paint');
      const applyLabel = text(mode === 'paint' ? 'landUi.action.paint' : 'landUi.action.smooth');
      setAttr(apply, 'aria-label', applyLabel);
      setText(apply.querySelector('.land-action-label') as HTMLElement, applyLabel);
      level.hidden = !isLevel;
      if (isLevel) {
        const tgt = tool.land.levelTarget;
        setText(target, tgt === null ? '' : text('landUi.level.target', { h: tgt }));
        confirm.toggleAttribute('disabled', st.rectStart < 0 && tgt === null);
      }
      let hintText: string;
      if (isLevel) hintText = text(touch ? 'landUi.hint.levelTouch' : 'landUi.hint.levelMouse');
      else if (corner) hintText = text(touch ? 'landUi.hint.cornerTouch' : 'landUi.hint.cornerMouse');
      else if (!touch) hintText = text('landUi.hint.mouse');
      else if (updown) hintText = text('landUi.hint.touch');
      else hintText = text('landUi.hint.touchApply', { action: applyLabel });
      setText(hint, hintText);
    },
  };
}

export const landUi: UiExtension = {
  toolbar: [
    {
      id: 'land',
      get label() {
        return text('landUi.tool.land');
      },
      icon: () => lineIcon('land'),
      onClick: (ctx) => selectTool(ctx, 'land'),
      pressed: (ctx) => ctx.game.tool.tool === 'land',
    },
    {
      id: 'water',
      get label() {
        return text('landUi.tool.water');
      },
      icon: () => lineIcon('water'),
      onClick: (ctx) => selectTool(ctx, 'water'),
      pressed: (ctx) => ctx.game.tool.tool === 'water',
    },
  ],
  bars: createLandBar,
};
