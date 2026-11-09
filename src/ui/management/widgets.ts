/** Small widgets for the Phase 3 panels and tool bars. Owner: W2-B. Browser only. */
import type { UiContext } from '../context';
import { h, setAttr, toggleClass } from '../dom';
import { tileToScreen } from '../../render/iso';
import { mgmtIcon, type MgmtIconName } from './icons';
import type { LocateTarget } from './messages';

export interface SegmentOption<T extends string | number> {
  value: T;
  label: string;
  /** Second line (cost, count). */
  detail?: string;
  icon?: MgmtIconName;
  ariaLabel?: string;
  testId?: string;
}

/**
 * A row of toggle buttons where one is pressed (segmented control). Buttons are at least 44 × 44 px
 * and report their state with `aria-pressed` (colour is never the only signal).
 */
export function segmented<T extends string | number>(
  label: string,
  options: readonly SegmentOption<T>[],
  onPick: (value: T) => void,
  className = '',
): { el: HTMLElement; set(value: T | null): void; buttons: HTMLButtonElement[] } {
  const buttons = options.map((o) =>
    h(
      'button',
      {
        type: 'button',
        class: 'btn seg-btn',
        'aria-pressed': 'false',
        'aria-label': o.ariaLabel ?? null,
        'data-testid': o.testId ?? null,
        'data-value': String(o.value),
        onclick: () => onPick(o.value),
      },
      o.icon ? mgmtIcon(o.icon) : null,
      h('span', { class: 'seg-label' }, h('span', { text: o.label }), o.detail ? h('span', { class: 'seg-detail', text: o.detail }) : null),
    ),
  );
  const el = h('div', { class: `segmented ${className}`, role: 'group', 'aria-label': label }, ...buttons);
  return {
    el,
    buttons,
    set(value) {
      options.forEach((o, k) => {
        const b = buttons[k] as HTMLButtonElement;
        const on = o.value === value;
        setAttr(b, 'aria-pressed', on ? 'true' : 'false');
        toggleClass(b, 'on', on);
      });
    },
  };
}

/** Centre the camera on a tile (keeps the zoom). */
export function centreOnTile(ctx: UiContext, tile: number): void {
  const map = ctx.game.world.state.map;
  const n = map.width * map.height;
  if (tile < 0 || tile >= n) return;
  const p = tileToScreen((tile % map.width) + 0.5, Math.floor(tile / map.width) + 0.5, map.heights[tile] ?? 0);
  ctx.game.camera.centerX = p.sx;
  ctx.game.camera.centerY = p.sy;
}

/** Go to a message target: move the camera, then open the target's panel (Phase 3 §4.14). */
export function goToTarget(ctx: UiContext, target: LocateTarget): void {
  if (target.tile !== null) centreOnTile(ctx, target.tile);
  const p = target.panel;
  if (!p) return;
  if ('defId' in p) {
    ctx.openPanel(p.kind);
    const card = ctx.root.querySelector<HTMLElement>(`.panel [data-def="${CSS.escape(p.defId)}"]`);
    if (card) {
      card.scrollIntoView({ block: 'nearest' });
      card.focus();
    }
    return;
  }
  // Opening an entity panel also selects the entity (see `openPanel` in ui/index.ts).
  ctx.openPanel(p.kind, p.id);
}
