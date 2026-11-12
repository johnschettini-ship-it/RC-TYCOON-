/**
 * Mood bar (Phase 7 §4.3): one button with Frost, three segments (Chill, Family, Thrill), a knot for the lean, and Spark.
 * It turns the Temperament overlay on and off. The portraits are decoration; the accessible name carries the data, and
 * the title the lean text. The percentages show in the segments on the desktop only.
 *
 * The upright phone (Task 21, not the low layout) shows the same button as a 44 × 44 mood circle: the face of the group
 * that leads now and a counter with its share. Its name and title also hold the park rating.
 */
import { MOOD_UPDATE_MS } from '../../data/tuning/interface';
import { text } from '../../data/strings/en';
import type { UiContext } from '../context';
import { h, setAttr, setText, toggleClass } from '../dom';
import type { UiPart } from '../extensions';
import { sharePercents, temperamentShares } from '../format';
import { mascotCanvas } from '../scenario/mascotArt';
import { tipInput, underServedGroup } from '../tips/model';
import { faceMoods, knotPercent, leadFace, leanTextId, segmentLabel, type LeadFace } from './model';

/** Height of the two faces in CSS px, on both layouts (the plate is 44 px high at 100%). */
const FACE_PX = 30;
/** Height of the mood circle's face (one mascot), and of the pair shown when both lead together. */
const LEAD_PX = 30;
const LEAD_BOTH_PX = 20;

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
  const frostSlot = h('span', { class: 'mood-face', 'aria-hidden': 'true' });
  const sparkSlot = h('span', { class: 'mood-face', 'aria-hidden': 'true' });
  // The mood circle's parts (shown on the upright phone only, by CSS).
  const leadSlot = h('span', { class: 'mood-lead', 'aria-hidden': 'true' });
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
    frostSlot,
    track,
    sparkSlot,
    leadSlot,
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

  // The circle's face is drawn again only when the leading mascot, its mood, or its size changes.
  let leadKey = '';
  const drawLead = (f: LeadFace): void => {
    const px = f.who === 'both' ? LEAD_BOTH_PX : LEAD_PX;
    const key = `${f.who}:${f.mood}@${px}`;
    if (leadKey === key) return;
    leadKey = key;
    leadSlot.dataset.face = f.who;
    leadSlot.replaceChildren(mascotCanvas(f.who, f.mood, px, ''));
    const c = leadSlot.firstElementChild;
    if (c) {
      c.removeAttribute('role');
      c.removeAttribute('aria-label');
    }
  };

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
      // The faces follow the rule of section 4.8, not the tip bubble: the tips setting does not matter.
      const moods = faceMoods(underServedGroup(tipInput(game.world, true)));
      const shares = temperamentShares(game.world.state.guests);
      const p = sharePercents(shares);
      const lean = text(leanTextId(p, shares.total));
      if (compact) {
        // The circle: the name and the title hold the mix, the lean text and the rating (the pill shows no rating).
        const name = nameOf(shares, p, lean, game.world.state.park.rating);
        setAttr(el, 'aria-label', name);
        setAttr(el, 'title', name);
        const f = leadFace(p, shares.total, moods);
        drawLead(f);
        if (count.hidden !== (f.group === null)) count.hidden = f.group === null;
        setText(count, f.group === null ? '' : String(f.share));
        setAttr(count, 'data-group', f.group);
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
      portrait('frost', frostSlot, moods.frost, FACE_PX);
      portrait('spark', sparkSlot, moods.spark, FACE_PX);
    },
  };
}
