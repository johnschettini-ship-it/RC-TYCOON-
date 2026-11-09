/**
 * Marketing panel (Phase 3 §7.1): 7 campaign cards with cost, duration, effect, a target pick for Ride
 * Spotlight and Snack Deal, and Start. Running campaigns show the time left. A refused start shows the
 * command's exact reason as a toast (the UI never pre-empts the sim). Owner: W2-B.
 */
import { CAMPAIGNS, getCampaignDef, type CampaignDef } from '../../data/tuning/management';
import { text } from '../../data/strings/en';
import { contentName } from '../contentName';
import type { PanelView, UiContext } from '../context';
import { h, newId, setText, toggleClass } from '../dom';
import { formatMoney } from '../format';
import { section } from '../widgets';
import { campaignDurationText, campaignEffectText, campaignStartCommand, campaignTargets, campaignTimeLeftText, runningCampaign } from './marketing';

interface Card {
  def: CampaignDef;
  el: HTMLElement;
  running: HTMLElement;
  select: HTMLSelectElement | null;
  targetsKey: string;
}

export function createMarketingPanel(ctx: UiContext): PanelView {
  const { game } = ctx;

  const runningList = h('ul', { class: 'plain-list', 'data-testid': 'campaigns-running' });
  const noneRunning = h('p', { class: 'muted', text: text('ui.marketing.noneRunning') });
  let runningKey = '';

  const cards: Card[] = CAMPAIGNS.map((def) => {
    const cost = formatMoney(def.cost);
    const running = h('span', { class: 'chip running-chip' });
    let select: HTMLSelectElement | null = null;
    let targetBlock: HTMLElement | null = null;
    if (def.target !== 'park') {
      const id = newId('campaign-target');
      select = h('select', { id, class: 'select', 'data-testid': `campaign-target-${def.id}` });
      targetBlock = h('div', { class: 'field-block' }, h('label', { class: 'row-label', for: id, text: text('ui.marketing.target') }), select);
    }
    const start = h('button', {
      type: 'button',
      class: 'btn primary',
      'data-testid': `campaign-start-${def.id}`,
      'aria-label': text('ui.marketing.startLabel', { name: contentName(def.id), cost }),
      text: text('ui.marketing.start'),
      onclick: () => {
        const raw = select?.value ?? '';
        const targetId = raw === '' ? undefined : Number(raw);
        game.dispatch(campaignStartCommand(def, targetId));
      },
    });
    const el = h(
      'article',
      { class: 'campaign-card', 'data-campaign': def.id },
      h('div', { class: 'campaign-head' }, h('h4', { class: 'campaign-name', text: contentName(def.id) }), running),
      h('p', { class: 'campaign-effect', text: campaignEffectText(def) }),
      h(
        'div',
        { class: 'campaign-meta' },
        h('span', {}, h('span', { class: 'row-label', text: `${text('ui.marketing.cost')} ` }), h('strong', { text: cost })),
        h('span', {}, h('span', { class: 'row-label', text: `${text('ui.marketing.duration')} ` }), h('strong', { text: campaignDurationText(def.durationTicks) })),
      ),
      targetBlock,
      start,
    );
    return { def, el, running, select, targetsKey: '' };
  });

  const syncTargets = (card: Card): void => {
    const sel = card.select;
    if (!sel) return;
    const targets = campaignTargets(game.world, card.def);
    const key = targets.map((t) => `${t.id}:${t.name}`).join('|');
    if (key === card.targetsKey) return;
    card.targetsKey = key;
    const prev = sel.value;
    if (targets.length === 0) {
      sel.replaceChildren(h('option', { value: '', text: text(card.def.target === 'ride' ? 'ui.marketing.noRides' : 'ui.marketing.noStalls') }));
      return;
    }
    sel.replaceChildren(
      h('option', { value: '', text: text(card.def.target === 'ride' ? 'ui.marketing.pickRide' : 'ui.marketing.pickStall') }),
      ...targets.map((t) => h('option', { value: String(t.id), text: t.name })),
    );
    // Keep the player's pick; else default to the first target.
    sel.value = targets.some((t) => String(t.id) === prev) ? prev : String(targets[0]?.id ?? '');
  };

  const body = h(
    'div',
    { class: 'panel-content' },
    section(text('ui.marketing.runningList'), runningList, noneRunning),
    section(null, h('div', { class: 'campaign-list' }, ...cards.map((c) => c.el))),
  );

  return {
    kind: 'marketing',
    id: null,
    title: text('ui.marketing.title'),
    body,
    update() {
      const world = game.world;
      for (const card of cards) {
        syncTargets(card);
        const c = runningCampaign(world, card.def.id);
        card.running.hidden = !c;
        toggleClass(card.el, 'is-running', !!c);
        if (c) setText(card.running, text('ui.marketing.running', { left: campaignTimeLeftText(world, c) }));
      }
      const camps = world.state.management.campaigns;
      const key = camps.map((c) => `${c.type}:${c.targetId}:${campaignTimeLeftText(world, c)}`).join('|');
      if (key !== runningKey) {
        runningKey = key;
        runningList.replaceChildren(
          ...camps.map((c) => {
            const def = getCampaignDef(c.type);
            const target = c.targetId >= 0 ? (world.state.rides.find((r) => r.id === c.targetId)?.name ?? world.state.stalls.find((s) => s.id === c.targetId)?.name ?? '') : '';
            const label = `${def ? contentName(def.id) : c.type}${target ? ` · ${target}` : ''}`;
            return h('li', {}, h('span', { text: label }), h('span', { class: 'muted', text: ` · ${text('ui.marketing.running', { left: campaignTimeLeftText(world, c) })}` }));
          }),
        );
        noneRunning.hidden = camps.length > 0;
      }
      return true;
    },
  };
}
