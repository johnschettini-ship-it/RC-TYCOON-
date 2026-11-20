/** Ride panel (Phase 1 §7). Owner: W1-B. */
import { getFlatRideDef, getTrackRideDef } from '../../data/catalog';
import { text } from '../../data/strings/en';
import type { UiContext, PanelView } from '../context';
import { h, setAttr, setText } from '../dom';
import { formatMoney, formatPrice, formatRating } from '../format';
import { rideWarnings } from '../info';
import { meterBar, priceSlider, section, statRow, toggleButton, warningList } from '../widgets';
import { createMaintenanceSection } from '../management/maintenanceSection';
import { createTrackRidePanel } from '../track/ridePanel';
import { createReachStatus } from '../rides/reachStatus';
import { RIDE_COLOUR_CHOICES } from '../../data/catalog/flatRides';
import { TRACK_PALETTE } from '../../render/track/colours';

/** Price range $0–$20 in $0.10 steps (Phase 1 §4.5). */
export const RIDE_PRICE_MAX = 2000;
export const RIDE_PRICE_STEP = 10;

export interface RideColourOption {
  /** Palette index, or null for Original. */
  colour: number | null;
  /** Swatch fill, or null for Original (drawn as a striped swatch). */
  hex: string | null;
  label: string;
}

/** The swatches of a flat ride, Original first, then `RIDE_COLOUR_CHOICES` in order. */
export function rideColourOptions(): RideColourOption[] {
  const pick = (name: string): string => text('ui.ride.colourPick', { colour: name });
  const original = text('ui.ride.colourOriginal');
  return [
    { colour: null, hex: null, label: pick(original) },
    ...RIDE_COLOUR_CHOICES.map((i) => ({ colour: i, hex: TRACK_PALETTE[i] as string, label: pick(text(`ui.track.colour.${i}`)) })),
  ];
}

function rideColourRow(onPick: (colour: number | null) => void): { el: HTMLElement; set(colour: number | null): void } {
  const options = rideColourOptions();
  const name = text('ui.ride.colour');
  const buttons = options.map((o) => {
    const b = h('button', {
      type: 'button',
      class: o.hex === null ? 'swatch swatch-original' : 'swatch',
      'aria-label': o.label,
      title: o.label,
      'aria-pressed': 'false',
      'data-testid': `ride-colour-${o.colour ?? 'original'}`,
      onclick: () => onPick(o.colour),
    });
    if (o.hex !== null) b.style.background = o.hex;
    return b;
  });
  const el = h(
    'div',
    { class: 'swatch-row ride-colour-row', 'data-testid': 'ride-colour-row' },
    h('span', { class: 'row-label', text: name }),
    h('div', { class: 'swatches ride-colours', role: 'group', 'aria-label': name }, ...buttons),
  );
  return {
    el,
    set(colour) {
      options.forEach((o, k) => setAttr(buttons[k] as HTMLElement, 'aria-pressed', o.colour === colour ? 'true' : 'false'));
    },
  };
}

export function createRidePanel(ctx: UiContext, rideId: number): PanelView {
  const { game } = ctx;
  const find = () => game.world.state.rides.find((r) => r.id === rideId);
  const ride0 = find();
  if (ride0?.kind === 'track') return createTrackRidePanel(ctx, rideId);
  const tag = ride0 ? (getFlatRideDef(ride0.defId) ?? getTrackRideDef(ride0.defId))?.tag ?? 'family' : 'family';

  const status = h('span', { class: 'chip', 'data-testid': 'ride-status' });
  const openBtn = toggleButton(() => {
    const r = find();
    if (r) game.dispatch({ type: 'setRideOpen', rideId, open: r.status !== 'open' });
  });
  const price = priceSlider(text('ui.ride.price'), {
    max: RIDE_PRICE_MAX,
    step: RIDE_PRICE_STEP,
    format: formatPrice,
    onCommit: (cents) => game.dispatch({ type: 'setRidePrice', rideId, price: cents }),
  });
  const bars = {
    excitement: meterBar(text('ui.stat.excitement'), { max: 1000, format: formatRating, tone: tag }),
    intensity: meterBar(text('ui.stat.intensity'), { max: 1000, format: formatRating, tone: tag }),
    nausea: meterBar(text('ui.stat.nausea'), { max: 1000, format: formatRating, tone: tag }),
  };
  const noRatings = h('p', { class: 'muted', text: text('ui.ride.noRatings') });
  const queue = statRow(text('ui.ride.queue'));
  const riding = statRow(text('ui.ride.riding'));
  const riders = statRow(text('ui.ride.riders'));
  const ridersTotal = statRow(text('ui.ride.ridersTotal'));
  const income = statRow(text('ui.ride.income'));
  const incomeTotal = statRow(text('ui.ride.incomeTotal'));
  const colour = rideColourRow((c) => game.dispatch({ type: 'setRideColour', rideId, colour: c }));
  const warnings = warningList();
  const reach = createReachStatus(ctx, rideId);
  const maintenance = createMaintenanceSection(ctx, rideId);

  const body = h(
    'div',
    { class: 'panel-content' },
    reach.el,
    warnings.el,
    section(null, h('div', { class: 'row' }, h('span', { class: 'row-label', text: text('ui.ride.status') }), status), openBtn.el),
    section(null, price.el),
    section(null, colour.el),
    section(text('ui.ride.ratings'), bars.excitement.el, bars.intensity.el, bars.nausea.el, noRatings),
    maintenance.el,
    section(null, queue.el, riding.el, riders.el, ridersTotal.el, income.el, incomeTotal.el),
  );

  return {
    kind: 'ride',
    id: rideId,
    title: ride0?.name ?? '',
    body,
    titleNow: () => find()?.name ?? '',
    update() {
      const r = find();
      if (!r) return false;
      setText(status, text(`ui.ride.status.${r.status}`));
      status.dataset.status = r.status;
      openBtn.set(text(r.status === 'open' ? 'ui.ride.close' : 'ui.ride.open'), r.status === 'open');
      price.set(r.price);
      colour.set(r.colour ?? null);
      if (r.stats) {
        bars.excitement.set(r.stats.excitement);
        bars.intensity.set(r.stats.intensity);
        bars.nausea.set(r.stats.nausea);
      }
      noRatings.hidden = r.stats !== null;
      for (const b of Object.values(bars)) b.el.hidden = r.stats === null;
      queue.set(text('ui.ride.queueValue', { count: r.queue.length }));
      riding.set(String(r.riders.length));
      riders.set(String(r.totals.ridersThisMonth));
      ridersTotal.set(String(r.totals.riders));
      income.set(formatMoney(r.totals.incomeThisMonth));
      incomeTotal.set(formatMoney(r.totals.income));
      reach.update();
      warnings.set(rideWarnings(game.world, r));
      maintenance.update(r);
      return true;
    },
  };
}
