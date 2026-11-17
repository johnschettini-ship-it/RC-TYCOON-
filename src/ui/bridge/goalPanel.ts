/**
 * The "Make the poster real" goal panel (VITE_ART=real build with the realistic look only; title-to-play bridge §4).
 * A small panel at the top right under the speed controls: open on desktop, a chip on phones (both toggle). It shows
 * "Make the poster real · n of 5", a copy of the title poster drawn in grey with the done goals' areas in colour (a
 * soft edge), a progress bar and the five goals as real text ("Big wheel: done" / "Big wheel: to do"). The goals are
 * worked out every `GOAL_CHECK_MS` from the park (`./goals.ts`); none is saved.
 *
 * - All five done: a toast "The poster is real!" (once, when the last one lands), the full-colour poster and "Poster
 *   complete", and a close button; closing it is stored (`DISMISS_KEY`, `tcreal:` in this build), so the panel does
 *   not come back in later parks.
 * - Shown in sandbox and free-play parks only (not in scenarios with objectives, nor the tutorial), never over the
 *   title, and not while a side panel is open on desktop (CSS). On phones it moves below a tip that would cover it.
 * - The thumbnail: the poster already shipped (`art/real/title/`), decoded small (`createImageBitmap` resize) into a
 *   colour and a grey copy, about 0.3 MB each; made when the panel opens and freed when it collapses or hides. The
 *   thumbnail is decorative (`aria-hidden`); the list carries the meaning.
 */
import { text } from '../../data/strings/en';
import type { UiContext } from '../context';
import { h, newId, setAttr, setText } from '../dom';
import { titleOpen } from '../scenario/shared';
import { checkCoverIndex, type CoverIndex } from '../titleScreen/real/layout';
import { TITLE_ART_BASE } from '../titleScreen/real/view';
import type { ToolbarPlacement } from '../layout';
import { CROWD_NEEDED, GOAL_CHECK_MS, GOAL_IDS, STALLS_NEEDED, doneCount, goalInScope, goalStartsOpen, goalsDone, litShapes, readDismissed, storeDismissed, type GoalId, type GoalState } from './goals';

/** The thumbnail's width, CSS px, and its most canvas px per CSS px (three copies of it stay under 1 MB). */
const THUMB_W = 188;
const THUMB_DENSITY = 2;
/** The lit areas' soft edge: the mask's blur, canvas px. */
const SOFT_EDGE = 4;

interface Thumb {
  idx: CoverIndex;
  grey: HTMLCanvasElement;
  colour: HTMLCanvasElement;
}

function canvasOf(w: number, hgt: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = hgt;
  return c;
}
const free = (c: HTMLCanvasElement | null | undefined): void => {
  if (!c) return;
  c.width = 0;
  c.height = 0;
};

/** The poster, small, as a colour and a grey copy (null when it cannot be had: no panel picture, no error shown). */
async function loadThumb(w: number, hgt: number): Promise<Thumb | null> {
  try {
    const res = await fetch(`${TITLE_ART_BASE}index.json`);
    if (!res.ok) return null;
    const idx = checkCoverIndex(await res.json());
    if (idx instanceof Error || !idx.goals) return null;
    const file = await fetch(TITLE_ART_BASE + idx.wide.file);
    if (!file.ok) return null;
    const bmp = await createImageBitmap(await file.blob(), { resizeWidth: w, resizeHeight: hgt, resizeQuality: 'high' });
    const colour = canvasOf(w, hgt);
    const grey = canvasOf(w, hgt);
    colour.getContext('2d')?.drawImage(bmp, 0, 0);
    const g = grey.getContext('2d');
    if (g) {
      g.filter = 'grayscale(1) contrast(0.85) brightness(1.1)';
      g.drawImage(bmp, 0, 0);
    }
    bmp.close();
    return { idx, grey, colour };
  } catch (err) {
    console.warn('[art=real] poster goal thumbnail', err);
    return null;
  }
}

export interface GoalPanel {
  el: HTMLElement;
  /** Every frame: works the goals out every GOAL_CHECK_MS. */
  update(now: number): void;
}

export function createGoalPanel(ctx: UiContext): GoalPanel {
  const { game, root } = ctx;
  const store = ((): Storage | null => {
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  })();
  const titleId = newId('poster-goal');
  const bodyId = newId('poster-goal-body');
  const count = h('span', { class: 'tc-goal-count', 'data-testid': 'poster-goal-count' });
  const head = h(
    'button',
    { type: 'button', class: 'tc-goal-head', 'aria-expanded': 'false', 'aria-controls': bodyId, 'data-testid': 'poster-goal-toggle', onclick: () => setOpen(!open, true) },
    h('span', { id: titleId, class: 'tc-goal-title', text: text('ui.goal.title') }),
    count,
  );
  const thumb = h('canvas', { class: 'tc-goal-thumb', 'aria-hidden': 'true', 'data-testid': 'poster-goal-thumb' });
  const fill = h('div', { class: 'tc-goal-fill' });
  const bar = h('div', { class: 'tc-goal-bar', 'aria-hidden': 'true' }, fill);
  const rows = new Map<GoalId, { li: HTMLElement; state: HTMLElement; hint: HTMLElement }>();
  const list = h(
    'ul',
    { class: 'tc-goal-list' },
    ...GOAL_IDS.map((id) => {
      const state = h('span', { class: 'sr-only' });
      const hint = h('span', { class: 'tc-goal-hint' });
      const li = h('li', { 'data-goal': id }, h('span', { class: 'tc-goal-mark', 'aria-hidden': 'true' }), h('span', { class: 'tc-goal-name', text: text(`ui.goal.${id}`) }, state), hint);
      rows.set(id, { li, state, hint });
      return li;
    }),
  );
  const complete = h('p', { class: 'tc-goal-complete', 'data-testid': 'poster-goal-complete', text: text('ui.goal.complete'), hidden: true });
  const close = h('button', { type: 'button', class: 'btn tc-goal-close', 'data-testid': 'poster-goal-close', text: text('ui.goal.dismiss'), hidden: true, onclick: () => dismiss() });
  const body = h('div', { id: bodyId, class: 'tc-goal-body', hidden: true }, thumb, bar, list, complete, close);
  const el = h('aside', { class: 'tc-goal', 'aria-labelledby': titleId, 'data-testid': 'poster-goal', hidden: true }, head, body);

  let open = false;
  /** The player toggled it in this park (the default no longer applies). */
  let chosen = false;
  let dismissed = readDismissed(store);
  let state: GoalState | null = null;
  let lastCheck = -Infinity;
  let pic: Thumb | null = null;
  let loading = 0;
  let drawnKey = '';
  let lastTip = '';

  const layout = (): ToolbarPlacement => (root.dataset.layout === 'bottom' ? 'bottom' : 'side');

  const freeThumb = (): void => {
    loading++;
    if (pic) {
      free(pic.grey);
      free(pic.colour);
    }
    pic = null;
    free(thumb);
    drawnKey = '';
  };

  const draw = (): void => {
    if (!pic || !state) return;
    const g = state;
    const key = GOAL_IDS.map((id) => (g[id] ? '1' : '0')).join('');
    if (key === drawnKey) return;
    const { grey, colour, idx } = pic;
    const w = colour.width;
    const hh = colour.height;
    if (thumb.width !== w || thumb.height !== hh) {
      thumb.width = w;
      thumb.height = hh;
    }
    const c = thumb.getContext('2d');
    if (!c) return;
    c.clearRect(0, 0, w, hh);
    const all = doneCount(g) === GOAL_IDS.length;
    c.drawImage(all ? colour : grey, 0, 0);
    const shapes = all ? [] : litShapes(idx, g);
    if (shapes.length > 0) {
      // The colour copy through a soft mask of the lit areas.
      const k = w / idx.wide.w;
      const tmp = canvasOf(w, hh);
      const m = tmp.getContext('2d');
      if (m) {
        m.filter = `blur(${SOFT_EDGE}px)`;
        m.fillStyle = '#000';
        for (const s of shapes) {
          m.beginPath();
          if ('ellipse' in s) m.ellipse(s.ellipse.cx * k, s.ellipse.cy * k, s.ellipse.rx * k, s.ellipse.ry * k, 0, 0, 2 * Math.PI);
          else m.rect(s.rect.x * k, s.rect.y * k, s.rect.w * k, s.rect.h * k);
          m.fill();
        }
        m.filter = 'none';
        m.globalCompositeOperation = 'source-in';
        m.drawImage(colour, 0, 0);
        c.drawImage(tmp, 0, 0);
      }
      free(tmp);
    }
    drawnKey = key;
    thumb.dataset.lit = GOAL_IDS.filter((id) => g[id]).join(' ');
  };

  const wantThumb = (): void => {
    if (pic || el.hidden || !open) return;
    const ticket = ++loading;
    const k = Math.min(THUMB_DENSITY, Math.max(1, window.devicePixelRatio || 1));
    const w = Math.round(THUMB_W * k);
    const hh = Math.round((w * 768) / 1376);
    void loadThumb(w, hh).then((t) => {
      if (!t) return;
      if (ticket !== loading || el.hidden || !open) {
        free(t.grey);
        free(t.colour);
        return;
      }
      pic = t;
      // The index's own aspect (the default above is the stand-in poster's).
      const ratio = t.idx.wide.h / t.idx.wide.w;
      thumb.style.aspectRatio = String(1 / ratio);
      draw();
    });
  };

  function setOpen(next: boolean, byPlayer = false): void {
    if (byPlayer) chosen = true;
    open = next;
    setAttr(head, 'aria-expanded', open ? 'true' : 'false');
    setAttr(el, 'data-open', open ? 'true' : null);
    body.hidden = !open;
    if (open) wantThumb();
    else freeThumb();
  }

  function dismiss(): void {
    dismissed = true;
    storeDismissed(store);
    // The focus leaves with the panel: back to the page (the map keys).
    if (document.activeElement instanceof HTMLElement && el.contains(document.activeElement)) document.activeElement.blur();
    show(false);
  }

  function show(visible: boolean): void {
    if (el.hidden === !visible) return;
    el.hidden = !visible;
    if (!visible) freeThumb();
    else if (open) wantThumb();
  }

  const render = (g: GoalState): void => {
    const n = doneCount(g);
    const total = GOAL_IDS.length;
    setText(count, ` · ${text('ui.goal.count', { n, total })}`);
    fill.style.width = `${(100 * n) / total}%`;
    const s = game.world.state;
    for (const id of GOAL_IDS) {
      const r = rows.get(id);
      if (!r) continue;
      setAttr(r.li, 'data-done', g[id] ? 'true' : null);
      setText(r.state, `: ${text(g[id] ? 'ui.goal.done' : 'ui.goal.todo')}`);
      const hint =
        g[id] ? '' : id === 'stalls' ? text('ui.goal.stallsHint', { n: s.stalls.length, total: STALLS_NEEDED }) : id === 'crowd' ? text('ui.goal.crowdHint', { n: s.guests.length, total: CROWD_NEEDED }) : text(`ui.goal.${id}Hint`);
      setText(r.hint, hint);
      r.hint.hidden = hint === '';
    }
    complete.hidden = n < total;
    close.hidden = n < total;
    setAttr(el, 'data-complete', n === total ? 'true' : null);
    draw();
  };

  /** On phones, below a tip that would cover it. */
  const avoidTip = (): void => {
    let top = '';
    const tip = root.querySelector<HTMLElement>('.tip-bubble');
    if (tip && !tip.hidden && !el.hidden) {
      const t = tip.getBoundingClientRect();
      const me = el.getBoundingClientRect();
      if (t.left < me.right && me.left < t.right && t.top < me.bottom + 1 && me.top < t.bottom + 8) top = `${Math.ceil(t.bottom + 8)}px`;
    }
    if (el.style.top !== top) el.style.top = top;
  };

  const check = (): void => {
    const s = game.world.state;
    const visible = !dismissed && !titleOpen() && goalInScope(s.scenario.kind);
    show(visible);
    if (!visible) return;
    const g = goalsDone(s);
    const before = state;
    state = g;
    // The last goal landing: the toast, once (a park that opens complete shows the panel's state only).
    if (before && doneCount(before) < GOAL_IDS.length && doneCount(g) === GOAL_IDS.length) ctx.toast(text('ui.goal.toast'), 'info');
    render(g);
    if (layout() === 'bottom') avoidTip();
    else if (el.style.top) el.style.top = '';
  };

  game.onWorldChanged(() => {
    // A new park: its own state, the default open or collapsed form, and the check at once.
    state = null;
    chosen = false;
    freeThumb();
    setOpen(goalStartsOpen(layout()));
    lastCheck = -Infinity;
  });

  setOpen(goalStartsOpen(layout()));

  return {
    el,
    update(now) {
      // The layout can change (a rotation): the default follows it until the player chooses.
      if (!chosen && open !== goalStartsOpen(layout())) setOpen(goalStartsOpen(layout()));
      // Phones: a tip that shows or changes moves the panel below it at once (not at the next check).
      if (layout() === 'bottom' && !el.hidden) {
        const tip = root.querySelector<HTMLElement>('.tip-bubble');
        const tipKey = tip && !tip.hidden ? `${tip.dataset.tip ?? ''}|${tip.offsetHeight}` : '';
        if (tipKey !== lastTip) {
          lastTip = tipKey;
          avoidTip();
        }
      }
      if (now - lastCheck < GOAL_CHECK_MS) return;
      lastCheck = now;
      check();
    },
  };
}
