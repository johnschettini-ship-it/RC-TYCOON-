/**
 * Track rides in the Rides picker (phase-2 §7.1 step 1): a Track Rides tab with a card per unlocked track type
 * (tag colour, drive, height, seats, base cost). Phase 3 types appear once researched. Owner: W2-A.
 */
import { getTrackRideDef } from '../../data/catalog/trackRides';
import { text } from '../../data/strings/en';
import { contentName } from '../contentName';
import type { TrackTypeDef } from '../../data/track';
import { drawTrackPreview } from '../../render/track';
import type { UiContext } from '../context';
import { h, newId, setAttr } from '../dom';
import { formatMoney } from '../format';
import { minStationTiles, pickableTrackTypes, stationCost, startStation } from './builder';

const PREVIEW_W = 112;
const PREVIEW_H = 80;

function preview(typeId: string): HTMLCanvasElement {
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const c = h('canvas', { class: 'card-preview', width: Math.round(PREVIEW_W * dpr), height: Math.round(PREVIEW_H * dpr), 'aria-hidden': 'true' });
  const g = c.getContext('2d');
  if (g) {
    g.scale(dpr, dpr);
    try {
      drawTrackPreview(g, typeId, PREVIEW_W, PREVIEW_H);
    } catch (e) {
      console.warn('drawTrackPreview failed', typeId, e);
    }
  }
  return c;
}

function trackCard(ctx: UiContext, type: TrackTypeDef): HTMLElement {
  const cat = getTrackRideDef(type.id);
  const name = cat ? contentName(type.id) : type.id;
  const tagId = cat?.tag ?? 'thrill';
  const tag = text(`ui.tag.${tagId}`);
  const cost = formatMoney(stationCost(type, minStationTiles(type, type.vehicle.defaultCars)));
  return h(
    'button',
    {
      type: 'button',
      class: `card tag-${tagId} track-card`,
      'data-def': type.id,
      'data-testid': `track-card-${type.id}`,
      'aria-label': text('ui.track.card', { name, tag, cost }),
      onclick: () => {
        startStation(ctx.game, type.id);
        ctx.closePanel();
      },
    },
    preview(type.id),
    h('span', { class: 'card-name', text: name }),
    h('span', { class: 'tag-chip', text: tag }),
    h('span', { class: 'card-stat', text: text(`ui.track.drive.${cat?.drive ?? type.drive}`) }),
    h('span', { class: 'card-stat', text: text('ui.track.maxHeight', { n: type.maxHeightM }) }),
    h('span', { class: 'card-stat', text: text('ui.track.seats', { n: type.vehicle.seatsPerCar }) }),
    h('span', { class: 'card-cost', text: text('ui.track.from', { cost }) }),
  );
}

/** Cards for every track type the player can build now. */
export function trackRideCards(ctx: UiContext): HTMLElement[] {
  return pickableTrackTypes(ctx.game.world).map((t) => trackCard(ctx, t));
}

let lastTab: 'flat' | 'track' = 'flat';

/** The Rides picker body with Flat Rides and Track Rides tabs; `flat` is the existing flat ride content. */
export function ridePickerTabs(ctx: UiContext, flat: HTMLElement): HTMLElement {
  const cards = trackRideCards(ctx);
  const trackBody = cards.length ? h('div', { class: 'card-grid' }, ...cards) : h('p', { class: 'muted', text: text('ui.picker.empty') });
  const ids = { flat: newId('tab'), track: newId('tab'), flatPanel: newId('tabpanel'), trackPanel: newId('tabpanel') };
  const flatPanel = h('div', { id: ids.flatPanel, role: 'tabpanel', 'aria-labelledby': ids.flat }, flat);
  const trackPanel = h('div', { id: ids.trackPanel, role: 'tabpanel', 'aria-labelledby': ids.track, class: 'panel-content' }, trackBody);
  const tabFlat = h('button', { type: 'button', role: 'tab', id: ids.flat, class: 'tab', 'aria-controls': ids.flatPanel, 'data-testid': 'picker-tab-flat', text: text('ui.track.tabFlat') });
  const tabTrack = h('button', { type: 'button', role: 'tab', id: ids.track, class: 'tab', 'aria-controls': ids.trackPanel, 'data-testid': 'picker-tab-track', text: text('ui.track.tabTrack') });
  const show = (which: 'flat' | 'track'): void => {
    lastTab = which;
    flatPanel.hidden = which !== 'flat';
    trackPanel.hidden = which !== 'track';
    setAttr(tabFlat, 'aria-selected', which === 'flat' ? 'true' : 'false');
    setAttr(tabTrack, 'aria-selected', which === 'track' ? 'true' : 'false');
  };
  tabFlat.addEventListener('click', () => show('flat'));
  tabTrack.addEventListener('click', () => show('track'));
  show(lastTab);
  return h('div', { class: 'picker-tabs' }, h('div', { class: 'tabs', role: 'tablist', 'aria-label': text('ui.track.tabs') }, tabFlat, tabTrack), flatPanel, trackPanel);
}
