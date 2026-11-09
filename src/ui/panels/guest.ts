/** Guest panel (Phase 1 §7): needs, cash, temperament dial, thoughts, target, follow. Owner: W1-B. */
import { text } from '../../data/strings/en';
import type { NeedKey } from '../../data/catalog/types';
import type { PanelView, UiContext } from '../context';
import { h, newId, setAttr, setText } from '../dom';
import { formatMoney } from '../format';
import { icon } from '../icons';
import { guestTargetLabel, guestThoughtLines, temperamentLabel } from '../info';
import { meterBar, section, statRow } from '../widgets';

const SVG_NS = 'http://www.w3.org/2000/svg';
/** Need order on the panel. For the first four, high is bad; for energy and happiness, high is good. */
const NEEDS: ReadonlyArray<{ key: NeedKey; warnAt?: number }> = [
  { key: 'happiness' },
  { key: 'energy' },
  { key: 'hunger', warnAt: 160 },
  { key: 'thirst', warnAt: 160 },
  { key: 'bladder', warnAt: 160 },
  { key: 'nausea', warnAt: 120 },
];

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

/** Half-dial from Chill (left, cool) to Thrill (right, warm) with a needle. */
function temperamentDial(): { el: HTMLElement; set(t: number): void } {
  const gid = newId('dial');
  const root = svg('svg', { viewBox: '0 0 100 58', class: 'dial', 'aria-hidden': 'true' });
  const defs = svg('defs', {});
  const grad = svg('linearGradient', { id: gid, x1: 0, x2: 1, y1: 0, y2: 0 });
  for (const [off, col] of [['0', '#4fb3d9'], ['0.5', '#5fbf6a'], ['1', '#f07a3a']] as const) grad.append(svg('stop', { offset: off, 'stop-color': col }));
  defs.append(grad);
  root.append(defs);
  root.append(svg('path', { d: 'M 8 52 A 42 42 0 0 1 92 52', fill: 'none', stroke: `url(#${gid})`, 'stroke-width': 10, 'stroke-linecap': 'round' }));
  // Group borders at T = 35 and 65.
  for (const t of [35, 65]) {
    const a = Math.PI - (t / 100) * Math.PI;
    root.append(svg('line', { x1: 50 + 36 * Math.cos(a), y1: 52 - 36 * Math.sin(a), x2: 50 + 48 * Math.cos(a), y2: 52 - 48 * Math.sin(a), stroke: '#12202e', 'stroke-width': 1.5 }));
  }
  const needle = svg('line', { x1: 50, y1: 52, x2: 50, y2: 16, stroke: 'currentColor', 'stroke-width': 3, 'stroke-linecap': 'round' });
  root.append(needle, svg('circle', { cx: 50, cy: 52, r: 4, fill: 'currentColor' }));
  const label = h('span', { class: 'dial-label' });
  const el = h('div', { class: 'dial-wrap', role: 'img' }, root, label);
  return {
    el,
    set(t: number) {
      const a = Math.PI - (Math.max(0, Math.min(100, t)) / 100) * Math.PI;
      needle.setAttribute('x2', (50 + 36 * Math.cos(a)).toFixed(2));
      needle.setAttribute('y2', (52 - 36 * Math.sin(a)).toFixed(2));
      const l = temperamentLabel(t);
      setText(label, l);
      setAttr(el, 'aria-label', `${text('ui.guest.temperament')} ${l}`);
    },
  };
}

export function createGuestPanel(ctx: UiContext, guestId: number): PanelView {
  const { game } = ctx;
  const find = () => game.world.state.guests.find((g) => g.id === guestId);

  const state = statRow(text('ui.guest.state'));
  const target = statRow(text('ui.guest.target'));
  const cash = statRow(text('ui.guest.cash'));
  const dial = temperamentDial();
  const needs = NEEDS.map((n) => ({
    key: n.key,
    bar: meterBar(text(`ui.guest.need.${n.key}`), { max: 255, format: (v) => String(v), warnAt: n.warnAt }),
  }));
  const thoughts = h('ol', { class: 'thoughts', 'aria-live': 'polite' });
  const followLabel = h('span');
  const follow = h(
    'button',
    {
      type: 'button',
      class: 'btn',
      onclick: () => {
        ctx.follow.guestId = ctx.follow.guestId === guestId ? null : guestId;
      },
    },
    icon('follow'),
    followLabel,
  );
  let lastThoughts = '';

  const body = h(
    'div',
    { class: 'panel-content' },
    section(null, state.el, target.el, cash.el, follow),
    section(text('ui.guest.temperament'), dial.el),
    section(text('ui.guest.needs'), ...needs.map((n) => n.bar.el)),
    section(text('ui.guest.thoughts'), thoughts),
  );

  return {
    kind: 'guest',
    id: guestId,
    title: text('ui.guest.title', { id: guestId }),
    body,
    update() {
      const g = find();
      if (!g) return false;
      state.set(text(`ui.guest.state.${g.state}`));
      target.set(guestTargetLabel(game.world, g));
      cash.set(formatMoney(g.cash));
      dial.set(g.temperament);
      for (const n of needs) n.bar.set(g.needs[n.key]);
      const lines = guestThoughtLines(g);
      const key = lines.join('\n');
      if (key !== lastThoughts) {
        lastThoughts = key;
        thoughts.replaceChildren(...(lines.length ? lines.map((l) => h('li', { text: l })) : [h('li', { class: 'muted', text: text('ui.guest.noThoughts') })]));
      }
      const following = ctx.follow.guestId === guestId;
      setText(followLabel, text(following ? 'ui.guest.following' : 'ui.guest.follow'));
      setAttr(follow, 'aria-pressed', following ? 'true' : 'false');
      return true;
    },
  };
}
