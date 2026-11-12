/**
 * Mood bar (Phase 7 §4.3): one button with three segments (Chill, Family, Thrill) and a knot for the lean. It turns the
 * Temperament overlay on and off. The accessible name carries the data, and the title the lean text. The percentages
 * show in the segments on the desktop only. The two mascot faces at its ends were removed by the owner (Task 23): the
 * track takes their width.
 *
 * The upright phone (Task 21, not the low layout) shows the same button as a 44 × 44 mood circle: a plain round button
 * in the colour of the group that leads now, with its share as large text (the Temperament icon with no guests). Its
 * name and title also hold the park rating.
 */
import { MOOD_UPDATE_MS } from '../../data/tuning/interface';
import { text } from '../../data/strings/en';
import type { UiContext } from '../context';
import { h, setAttr, setText, toggleClass } from '../dom';
import type { UiPart } from '../extensions';
import { sharePercents, temperamentShares } from '../format';
import { icon } from '../icons';
import { knotPercent, leadShare, leanTextId, segmentLabel } from './model';

/** The upright phone's compact top row (Task 21): the phone layout, not the low one. */
export function compactTop(root: HTMLElement): boolean {
  return root.dataset.layout === 'bottom' && root.dataset.low !== '1';
}

export function createMoodBar(ctx: UiContext): UiPart {
  const { game } = ctx;
  const segChill = h('i', { class: 'seg seg-chill' });
  const segFamily = h('i', { class: 'seg seg-family' });
  const segThrill = h('i', { class: 'seg seg-thrill' });
  const knot = h('i', { class: 'mood-knot', 'aria-hidden': 'true' });
  const track = h('span', { class: 'mood-track' }, segChill, segFamily, segThrill, knot);
  // The mood circle's parts (shown on the upright phone only, by CSS): the leading share, or the icon with no guests.
  const emptyIcon = icon('temperament', 'icon mood-empty');
  const count = h('span', { class: 'mood-count', 'data-testid': 'mood-count', 'aria-hidden': 'true', hidden: true });
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
    track,
    emptyIcon,
    count,
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

  /** The accessible name: the guest mix and the lean text (and the park rating on the upright phone). */
  const nameOf = (shares: ReturnType<typeof temperamentShares>, p: ReturnType<typeof sharePercents>, lean: string, rating: number | null = null): string => {
    const balance = shares.total === 0 ? text('ui.hud.balanceEmpty') : text('ui.hud.balance', p);
    return rating === null ? text('ui.mood.name', { balance, lean }) : text('ui.mood.nameRating', { balance, lean, rating });
  };
  // The button has its name from the start: a scan before the first frame finds no unnamed button.
  {
    const shares = temperamentShares(game.world.state.guests);
    const p = sharePercents(shares);
    const lean = text(leanTextId(p, shares.total));
    setAttr(el, 'aria-label', nameOf(shares, p, lean));
    setAttr(el, 'title', lean);
  }

  let last = -Infinity;
  let lastCompact: boolean | null = null;
  return {
    el,
    update(now: number) {
      setAttr(el, 'aria-pressed', game.tool.overlay === 'temperament' ? 'true' : 'false');
      const compact = compactTop(ctx.root);
      // A change of layout shows the new form at once, not after the next 500 ms step.
      if (compact !== lastCompact) {
        lastCompact = compact;
        last = -Infinity;
      }
      if (now - last < MOOD_UPDATE_MS) return;
      last = now;
      const phone = ctx.root.dataset.layout === 'bottom';
      const shares = temperamentShares(game.world.state.guests);
      const p = sharePercents(shares);
      const lean = text(leanTextId(p, shares.total));
      if (compact) {
        // The circle: the name and the title hold the mix, the lean text and the rating (the pill shows no rating).
        const name = nameOf(shares, p, lean, game.world.state.park.rating);
        setAttr(el, 'aria-label', name);
        setAttr(el, 'title', name);
        const f = leadShare(p, shares.total);
        if (count.hidden !== (f.group === null)) count.hidden = f.group === null;
        setText(count, f.group === null ? '' : text('ui.mood.percent', { n: f.share }));
        setAttr(el, 'data-group', f.group);
        toggleClass(el, 'empty', shares.total === 0);
        return;
      }
      setAttr(el, 'aria-label', nameOf(shares, p, lean));
      setAttr(el, 'title', lean);
      // The percentages grow with the text: the label rule works in 100% text px, so its room and the knot's grow too.
      const ts = Number(ctx.root.dataset.textScale ?? 100) / 100 || 1;
      const width = track.clientWidth / ts;
      segs.forEach((s, i) => {
        const v = p[s.key];
        const grow = String(v);
        if (s.el.style.flexGrow !== grow) s.el.style.flexGrow = grow;
        // The percentage keeps clear of the knot (it moves to the larger part of its segment beside the knot). The phone
        // shows no percentages: its track is too slim for them.
        const label = phone ? { show: false, padStart: 0, padEnd: 0 } : segmentLabel(p, s.key, width);
        setText(s.num, label.show ? text('ui.mood.percent', { n: v }) : '');
        // Centred in the room left by padStart / padEnd: a shift by half their difference, with no change of layout size.
        const dx = label.show ? Math.round(((label.padStart - label.padEnd) * ts) / 2) : 0;
        const shift = dx !== 0 ? `translateX(${dx}px)` : '';
        if (shifts[i] !== shift) {
          shifts[i] = shift;
          s.num.style.transform = shift;
        }
      });
      toggleClass(el, 'empty', shares.total === 0);
      const left = `${knotPercent(p)}%`;
      if (knot.style.left !== left) knot.style.left = left;
    },
  };
}
