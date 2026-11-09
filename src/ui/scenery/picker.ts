/**
 * Scenery picker (Phase 4 §7): theme tabs and an item grid. Locked themes are marked and their cards disabled until
 * the Scenery research unlocks them (catalog §6). Desktop: a side panel that stays open while placing; phone: a
 * bottom sheet that closes when an item is picked (the status bar's Items button reopens it). Owner: W3-D.
 */
import { SCENERY_THEMES, sceneryOfTheme, type SceneryDef, type SceneryThemeId } from '../../data/catalog';
import { text } from '../../data/strings/en';
import { contentName } from '../contentName';
import { chooseSceneryItem } from '../../input/scenery';
import { drawSceneryPreview } from '../../render/scenery/preview';
import { isUnlocked } from '../../sim/research/api';
import type { UiContext } from '../context';
import { h, setAttr, setText } from '../dom';
import { formatMoney } from '../format';
import { icon } from '../icons';

const PREVIEW_W = 96;
const PREVIEW_H = 72;

/** Catalog §6 moods (tab accent colour). */
const MOOD: Readonly<Record<SceneryThemeId, 'neutral' | 'family' | 'chill' | 'thrill'>> = {
  base: 'neutral',
  classic_fair: 'family',
  frost_peaks: 'chill',
  volcano_ridge: 'thrill',
  spooky_hollow: 'chill',
  jungle_lagoon: 'chill',
  starport: 'thrill',
};

export interface Picker {
  el: HTMLElement;
  open(): void;
  close(): void;
  isOpen(): boolean;
  update(): void;
}

function preview(defId: string): HTMLCanvasElement {
  const dpr = Math.min(3, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
  const c = h('canvas', { width: Math.round(PREVIEW_W * dpr), height: Math.round(PREVIEW_H * dpr), 'aria-hidden': 'true' });
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.scale(dpr, dpr);
    try {
      drawSceneryPreview(ctx, defId, PREVIEW_W, PREVIEW_H);
    } catch (e) {
      console.warn('scenery preview failed', defId, e);
    }
  }
  return c;
}

function fieldsLine(def: SceneryDef): string {
  const parts: string[] = [];
  if (def.calm > 0) parts.push(text('scenery.picker.calm', { n: def.calm }));
  if (def.buzz > 0) parts.push(text('scenery.picker.buzz', { n: def.buzz }));
  if (def.edge) parts.push(text('scenery.flag.edge'));
  else if (def.overPath) parts.push(text('scenery.flag.arch'));
  if (def.needsWater) parts.push(text('scenery.flag.water'));
  if (def.light) parts.push(text('scenery.flag.light'));
  return parts.join(' · ');
}

export function createPicker(ctx: UiContext): Picker {
  const { game } = ctx;
  let theme: SceneryThemeId = 'base';
  let lastUnlocked = -1;
  let lastWorld = game.world;
  let lastChosen: string | null = null;
  const tabs = new Map<SceneryThemeId, { el: HTMLButtonElement; lock: HTMLElement }>();
  const cards = new Map<string, { el: HTMLButtonElement; def: SceneryDef }>();
  const grid = h('div', { class: 'scn-grid', role: 'tabpanel', 'data-testid': 'scenery-grid' });
  const note = h('p', { class: 'scn-note', 'data-testid': 'scenery-locked', hidden: true });

  const close = h('button', { type: 'button', class: 'btn', 'aria-label': text('scenery.picker.close'), 'data-testid': 'scenery-close', onclick: () => api.close() }, icon('cross'));
  const tablist = h('div', { class: 'scn-tabs', role: 'tablist', 'aria-label': text('scenery.picker.themes') });
  for (const t of SCENERY_THEMES) {
    const lock = h('span', { class: 'scn-lock', text: text('scenery.picker.lockedShort'), hidden: true });
    const el = h(
      'button',
      { type: 'button', role: 'tab', class: `scn-tab scn-mood-${MOOD[t.id]}`, 'aria-selected': 'false', 'data-testid': `scenery-tab-${t.id}`, onclick: () => showTheme(t.id) },
      h('span', { text: contentName(t.id) }),
      lock,
    );
    tabs.set(t.id, { el, lock });
    tablist.append(el);
  }
  const el = h(
    'section',
    { class: 'scn-picker', role: 'dialog', 'aria-label': text('scenery.picker.title'), 'data-testid': 'scenery-picker', hidden: true },
    h('div', { class: 'scn-head' }, h('h2', { text: text('scenery.picker.title') }), close),
    tablist,
    note,
    grid,
  );

  function locked(id: string): boolean {
    return !isUnlocked(game.world, id);
  }

  function pick(def: SceneryDef): void {
    chooseSceneryItem(game, def.id);
    // Phones: the sheet would cover the map; desktop keeps the panel open beside it.
    if (ctx.root.dataset.layout === 'bottom') api.close();
    refreshCards();
  }

  function showTheme(id: SceneryThemeId): void {
    theme = id;
    grid.replaceChildren();
    cards.clear();
    for (const def of sceneryOfTheme(id)) {
      const cost = formatMoney(def.buildCost);
      const card = h(
        'button',
        {
          type: 'button',
          class: 'scn-card',
          'data-testid': `scenery-item-${def.id}`,
          'aria-pressed': 'false',
          // Phase 6 §4.7: the visible name, cost, and Calm / Buzz line are the accessible name.
          onclick: () => pick(def),
        },
        preview(def.id),
        h('span', { class: 'scn-name', text: contentName(def.id) }),
        h('span', { class: 'scn-cost', text: cost }),
        h('span', { class: 'scn-fields', text: fieldsLine(def) }),
      );
      cards.set(def.id, { el: card, def });
      grid.append(card);
    }
    for (const [tid, tab] of tabs) setAttr(tab.el, 'aria-selected', tid === id ? 'true' : 'false');
    refreshCards();
  }

  function refreshCards(): void {
    const themeDef = SCENERY_THEMES.find((t) => t.id === theme);
    const themeLocked = locked(theme);
    note.hidden = !themeLocked;
    if (themeLocked && themeDef) setText(note, text('scenery.picker.locked', { theme: contentName(themeDef.id) }));
    const chosen = game.tool.tool === 'scenery' ? game.tool.scenery.defId : null;
    for (const { el: card, def } of cards.values()) {
      card.disabled = locked(def.id);
      setAttr(card, 'aria-pressed', chosen === def.id ? 'true' : 'false');
    }
    for (const [tid, tab] of tabs) tab.lock.hidden = !locked(tid);
  }

  const api: Picker = {
    el,
    open() {
      if (!el.hidden) return;
      el.hidden = false;
      // The picker and an entity panel would share the right side (desktop) or the bottom sheet (phone).
      ctx.closePanel();
      if (cards.size === 0) showTheme(theme);
      else refreshCards();
    },
    close() {
      el.hidden = true;
    },
    isOpen: () => !el.hidden,
    update() {
      if (el.hidden) return;
      const n = game.world.state.management.research.unlocked.length;
      const chosen = game.tool.tool === 'scenery' ? game.tool.scenery.defId : null;
      if (n !== lastUnlocked || game.world !== lastWorld || chosen !== lastChosen) {
        lastUnlocked = n;
        lastWorld = game.world;
        lastChosen = chosen;
        refreshCards();
      }
    },
  };
  return api;
}
