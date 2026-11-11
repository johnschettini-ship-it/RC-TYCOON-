/**
 * Mood bar (Phase 7 §4.3): one button with Frost, three segments (Chill, Family, Thrill), a knot for the lean, and Spark.
 * It turns the Temperament overlay on and off. The portraits are decoration; the accessible name carries the data.
 */
import { MOOD_UPDATE_MS } from '../../data/tuning/interface';
import { text } from '../../data/strings/en';
import type { UiContext } from '../context';
import { h, setAttr, setText, toggleClass } from '../dom';
import type { UiPart } from '../extensions';
import { sharePercents, temperamentShares } from '../format';
import { mascotCanvas } from '../scenario/mascotArt';
import { tipInput, underServedGroup } from '../tips/model';
import { faceMoods, knotPercent, leanTextId, segmentLabel } from './model';

const PORTRAIT_PX = { side: 48, bottom: 40 } as const;

export function createMoodBar(ctx: UiContext): UiPart {
  const { game } = ctx;
  const segChill = h('i', { class: 'seg seg-chill' });
  const segFamily = h('i', { class: 'seg seg-family' });
  const segThrill = h('i', { class: 'seg seg-thrill' });
  const knot = h('i', { class: 'mood-knot', 'aria-hidden': 'true' });
  const track = h('span', { class: 'mood-track' }, segChill, segFamily, segThrill, knot);
  const frostSlot = h('span', { class: 'mood-face', 'aria-hidden': 'true' });
  const sparkSlot = h('span', { class: 'mood-face', 'aria-hidden': 'true' });
  const line = h('span', { class: 'mood-text', 'data-testid': 'mood-text' });
  const el = h(
    'button',
    {
      type: 'button',
      class: 'mood-bar',
      'data-testid': 'hud-balance',
      'data-tool': 'temperament',
      'aria-pressed': 'false',
      onclick: () => {
        game.tool.overlay = game.tool.overlay === 'temperament' ? 'none' : 'temperament';
      },
    },
    frostSlot,
    h('span', { class: 'mood-middle' }, track, line),
    sparkSlot,
  );

  // The percentage is an inner span: moving it beside the knot must not change the segment's width (§4.3).
  const segs = [
    { el: segChill, num: h('span', { class: 'seg-num' }), key: 'chill' },
    { el: segFamily, num: h('span', { class: 'seg-num' }), key: 'family' },
    { el: segThrill, num: h('span', { class: 'seg-num' }), key: 'thrill' },
  ] as const;
  for (const s of segs) s.el.append(s.num);
  /** The shift each percentage has now (written only when it changes). */
  const shifts = ['', '', ''];

  // A portrait is drawn again only when its mood or its size changes.
  const drawn = { frost: '', spark: '' };
  const portrait = (who: 'frost' | 'spark', slot: HTMLElement, mood: 'happy' | 'sad', px: number): void => {
    const key = `${mood}@${px}`;
    if (drawn[who] === key) return;
    drawn[who] = key;
    slot.replaceChildren(mascotCanvas(who, mood, px, ''));
    const c = slot.firstElementChild;
    if (c) {
      c.removeAttribute('role');
      c.removeAttribute('aria-label');
    }
  };

  /** The accessible name: the guest mix and the lean text. */
  const nameOf = (shares: ReturnType<typeof temperamentShares>, p: ReturnType<typeof sharePercents>, lean: string): string =>
    `${shares.total === 0 ? text('ui.hud.balanceEmpty') : text('ui.hud.balance', p)}, ${lean}`;
  // The button has its name from the start: a scan before the first frame finds no unnamed button.
  {
    const shares = temperamentShares(game.world.state.guests);
    const p = sharePercents(shares);
    setAttr(el, 'aria-label', nameOf(shares, p, text(leanTextId(p, shares.total))));
  }

  let last = -Infinity;
  return {
    el,
    update(now: number) {
      setAttr(el, 'aria-pressed', game.tool.overlay === 'temperament' ? 'true' : 'false');
      if (now - last < MOOD_UPDATE_MS) return;
      last = now;
      const px = ctx.root.dataset.layout === 'bottom' ? PORTRAIT_PX.bottom : PORTRAIT_PX.side;
      // The faces follow the rule of section 4.8, not the tip bubble: the tips setting does not matter.
      const moods = faceMoods(underServedGroup(tipInput(game.world, true)));
      const shares = temperamentShares(game.world.state.guests);
      const p = sharePercents(shares);
      const lean = text(leanTextId(p, shares.total));
      setAttr(el, 'aria-label', nameOf(shares, p, lean));
      setText(line, lean);
      const width = track.clientWidth;
      segs.forEach((s, i) => {
        const v = p[s.key];
        const grow = String(v);
        if (s.el.style.flexGrow !== grow) s.el.style.flexGrow = grow;
        // The percentage keeps clear of the knot (it moves to the larger part of its segment beside the knot).
        const label = segmentLabel(p, s.key, width);
        setText(s.num, label.show ? `${v}%` : '');
        // Centred in the room left by padStart / padEnd: a shift by half their difference, with no change of layout size.
        const dx = label.show ? Math.round((label.padStart - label.padEnd) / 2) : 0;
        const shift = dx !== 0 ? `translateX(${dx}px)` : '';
        if (shifts[i] !== shift) {
          shifts[i] = shift;
          s.num.style.transform = shift;
        }
      });
      toggleClass(el, 'empty', shares.total === 0);
      const left = `${knotPercent(p)}%`;
      if (knot.style.left !== left) knot.style.left = left;
      portrait('frost', frostSlot, moods.frost, px);
      portrait('spark', sparkSlot, moods.spark, px);
    },
  };
}
