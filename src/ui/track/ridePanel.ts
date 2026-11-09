/**
 * Ride panel for track rides (phase-2 §7.4): Overview, Track, Trains, and Test tabs. Owner: W2-A. Browser only.
 */
import { getTrackRideDef } from '../../data/catalog/trackRides';
import { text } from '../../data/strings/en';
import { getTrackTypeDef } from '../../data/track';
import { LAPS_RANGE, MAX_DWELL_RANGE_S, MIN_DWELL_RANGE_S, TICKS_PER_S } from '../../data/tuning/track';
import { TRACK_PALETTE } from '../../render/track/colours';
import type { Command } from '../../sim/commands/types';
import { canOpenTrackRide, trackHighestPointM, trackRunningCostMonthly, trackThroughputPerHour, trackWarnings } from '../../sim/rides/track/api';
import { findRide, refundShare, trackData } from '../../sim/rides/track/common';
import { getLayout } from '../../sim/rides/track/layout';
import type { Ride } from '../../sim/rides/types';
import type { PanelView, UiContext } from '../context';
import { openDialog } from '../dialogs';
import { h, newId, setAttr, setText, toggleClass } from '../dom';
import { formatMoney, formatPrice, formatRating } from '../format';
import { icon } from '../icons';
import { rideWarnings } from '../info';
import { meterBar, priceSlider, section, statRow, toggleButton, warningList } from '../widgets';
import { editTrackRide } from './builder';
import { createTestChart } from './chart';
import { takeTrackTab, type TrackTab } from './tabRequest';
import { formatMetres, formatSeconds, testRows, testStatus } from './testFormat';

const TABS: readonly TrackTab[] = ['overview', 'track', 'trains', 'test'];
/** Ride price range $0–$20 in $0.10 steps (Phase 1 §4.5, the same as the flat ride panel). */
const RIDE_PRICE_MAX = 2000;
const RIDE_PRICE_STEP = 10;

function stepper(label: string, testId: string, onLess: () => void, onMore: () => void): { el: HTMLElement; set(value: string, canLess: boolean, canMore: boolean): void } {
  const value = h('output', { class: 'stepper-value', 'data-testid': `${testId}-value` });
  const less = h('button', { type: 'button', class: 'btn step', 'aria-label': text('ui.track.less', { name: label }), 'data-testid': `${testId}-less`, onclick: onLess }, '−');
  const more = h('button', { type: 'button', class: 'btn step', 'aria-label': text('ui.track.more', { name: label }), 'data-testid': `${testId}-more`, onclick: onMore }, '+');
  const el = h('div', { class: 'row stepper-row', role: 'group', 'aria-label': label }, h('span', { class: 'row-label', text: label }), h('span', { class: 'stepper' }, less, value, more));
  return {
    el,
    set(v, canLess, canMore) {
      setText(value, v);
      less.toggleAttribute('disabled', !canLess);
      more.toggleAttribute('disabled', !canMore);
    },
  };
}

function swatches(part: 'track' | 'supports' | 'cars', onPick: (i: number) => void): { el: HTMLElement; set(i: number): void } {
  const partName = text(`ui.track.part.${part}`);
  const buttons = TRACK_PALETTE.map((hex, i) => {
    const colour = text(`ui.track.colour.${i}`);
    const label = text('ui.track.colourPick', { part: partName, colour });
    const b = h('button', { type: 'button', class: 'swatch', 'aria-label': label, title: label, 'aria-pressed': 'false', onclick: () => onPick(i) });
    b.style.background = hex;
    return b;
  });
  const el = h('div', { class: 'swatch-row' }, h('span', { class: 'row-label', text: partName }), h('div', { class: 'swatches', role: 'group', 'aria-label': partName }, ...buttons));
  return {
    el,
    set(i) {
      buttons.forEach((b, k) => setAttr(b, 'aria-pressed', k === i ? 'true' : 'false'));
    },
  };
}

export function createTrackRidePanel(ctx: UiContext, rideId: number): PanelView {
  const { game } = ctx;
  const find = (): Ride | undefined => findRide(game.world, rideId);
  const ride0 = find();
  const data0 = trackData(game.world, rideId);
  const type = data0 ? getTrackTypeDef(data0.typeId) : undefined;
  const tag = ride0 ? (getTrackRideDef(ride0.defId)?.tag ?? 'thrill') : 'thrill';
  let view: PanelView | null = null;
  const dispatch = (cmd: Command): void => {
    game.dispatch(cmd);
    view?.update();
  };

  // ---------- tabs
  let current: TrackTab = takeTrackTab(rideId) ?? (ride0?.status === 'building' ? 'track' : 'overview');
  const tabButtons = new Map<TrackTab, HTMLButtonElement>();
  const panels = new Map<TrackTab, HTMLElement>();
  const tablist = h('div', { class: 'tabs', role: 'tablist', 'aria-label': text('ui.track.tablist') });
  for (const t of TABS) {
    const id = newId('tab');
    const pid = newId('tabpanel');
    const b = h('button', { type: 'button', role: 'tab', id, class: 'tab', 'aria-controls': pid, 'data-testid': `track-tab-${t}`, text: text(`ui.track.tab.${t}`) });
    b.addEventListener('click', () => {
      current = t;
      view?.update();
    });
    tabButtons.set(t, b);
    panels.set(t, h('div', { id: pid, role: 'tabpanel', 'aria-labelledby': id, class: 'tab-panel' }));
  }
  tablist.append(...tabButtons.values());

  // ---------- overview
  const warnings = warningList();
  const nextStep = h('p', { class: 'next-step muted', 'data-testid': 'track-next-step' });
  const status = h('span', { class: 'chip', 'data-testid': 'ride-status' });
  const openBtn = toggleButton(() => {
    const r = find();
    if (r) dispatch({ type: 'setRideOpen', rideId, open: r.status !== 'open' });
  });
  const price = priceSlider(text('ui.ride.price'), { max: RIDE_PRICE_MAX, step: RIDE_PRICE_STEP, format: formatPrice, onCommit: (cents) => dispatch({ type: 'setRidePrice', rideId, price: cents }) });
  const mkBars = (): Record<'excitement' | 'intensity' | 'nausea', ReturnType<typeof meterBar>> => ({
    excitement: meterBar(text('ui.stat.excitement'), { max: 1000, format: formatRating, tone: tag }),
    intensity: meterBar(text('ui.stat.intensity'), { max: 1000, format: formatRating, tone: tag }),
    nausea: meterBar(text('ui.stat.nausea'), { max: 1000, format: formatRating, tone: tag }),
  });
  const bars = mkBars();
  const noRatings = h('p', { class: 'muted', text: text('ui.ride.noRatings') });
  const queue = statRow(text('ui.ride.queue'));
  const riding = statRow(text('ui.ride.riding'));
  const riders = statRow(text('ui.ride.riders'));
  const ridersTotal = statRow(text('ui.ride.ridersTotal'));
  const income = statRow(text('ui.ride.income'));
  const incomeTotal = statRow(text('ui.ride.incomeTotal'));
  const throughput = statRow(text('ui.track.throughput'));
  panels.get('overview')!.append(
    warnings.el,
    nextStep,
    section(null, h('div', { class: 'row' }, h('span', { class: 'row-label', text: text('ui.ride.status') }), status), openBtn.el),
    section(null, price.el),
    section(text('ui.ride.ratings'), bars.excitement.el, bars.intensity.el, bars.nausea.el, noRatings),
    section(null, queue.el, riding.el, riders.el, ridersTotal.el, income.el, incomeTotal.el, throughput.el),
  );

  // ---------- track
  const pieces = statRow(text('ui.track.pieceCount'));
  const circuit = statRow(text('ui.track.circuit'));
  const length = statRow(text('ui.track.length'));
  const highest = statRow(text('ui.track.highest'));
  const buildCost = statRow(text('ui.track.buildCost'));
  const running = statRow(text('ui.track.runningCost'));
  const edit = h('button', { type: 'button', class: 'btn', 'data-testid': 'track-edit', onclick: () => {
    if (editTrackRide(game, rideId)) ctx.closePanel();
    else view?.update();
  } });
  const demolish = h('button', { type: 'button', class: 'btn danger', 'data-testid': 'track-demolish', onclick: () => {
    const r = find();
    const d = trackData(game.world, rideId);
    if (!r) return;
    const refund = formatMoney(Math.floor(r.totalBuildCost * (d ? refundShare(d) : 0.5)));
    const dlg = openDialog(ctx.root, {
      title: text('ui.track.demolishConfirm', { name: r.name, refund }),
      actions: [
        { label: text('ui.track.demolish'), kind: 'danger', testId: 'track-demolish-yes', onClick: () => {
          dlg.close();
          const res = game.dispatch({ type: 'demolish', x: r.x, y: r.y });
          if (res.ok) ctx.closePanel();
        } },
        { label: text('ui.track.keep'), kind: 'plain', onClick: () => dlg.close() },
      ],
    });
  } }, text('ui.track.demolish'));
  panels.get('track')!.append(section(null, pieces.el, circuit.el, length.el, highest.el, buildCost.el, running.el), section(null, h('div', { class: 'tb-row' }, edit, demolish)));

  // ---------- trains
  const cfg = (): { trains: number; cars: number } => {
    const d = trackData(game.world, rideId);
    return { trains: d?.trainConfig.trains ?? 1, cars: d?.trainConfig.carsPerTrain ?? 1 };
  };
  const op = (): { min: number; max: number; laps: number } => {
    const d = trackData(game.world, rideId);
    return { min: Math.round((d?.operation.minDwellTicks ?? 0) / TICKS_PER_S), max: Math.round((d?.operation.maxDwellTicks ?? 0) / TICKS_PER_S), laps: d?.operation.laps ?? 1 };
  };
  const setOp = (o: { min: number; max: number; laps: number }): void => dispatch({ type: 'setTrackOperation', rideId, minDwellS: o.min, maxDwellS: o.max, laps: o.laps });
  const trains = stepper(text('ui.track.trains'), 'track-trains', () => dispatch({ type: 'setTrainConfig', rideId, trains: cfg().trains - 1, carsPerTrain: cfg().cars }), () => dispatch({ type: 'setTrainConfig', rideId, trains: cfg().trains + 1, carsPerTrain: cfg().cars }));
  const cars = stepper(text('ui.track.cars'), 'track-cars', () => dispatch({ type: 'setTrainConfig', rideId, trains: cfg().trains, carsPerTrain: cfg().cars - 1 }), () => dispatch({ type: 'setTrainConfig', rideId, trains: cfg().trains, carsPerTrain: cfg().cars + 1 }));
  const minDwell = stepper(text('ui.track.minDwell'), 'track-min-dwell', () => setOp({ ...op(), min: op().min - 1 }), () => setOp({ ...op(), min: op().min + 1 }));
  const maxDwell = stepper(text('ui.track.maxDwell'), 'track-max-dwell', () => setOp({ ...op(), max: op().max - 5 }), () => setOp({ ...op(), max: op().max + 5 }));
  const laps = stepper(text('ui.track.laps'), 'track-laps', () => setOp({ ...op(), laps: op().laps - 1 }), () => setOp({ ...op(), laps: op().laps + 1 }));
  const bestLap = statRow(text('ui.track.bestLap'));
  const colourCmd = (part: 'track' | 'supports' | 'cars', i: number): void => {
    const d = trackData(game.world, rideId);
    if (!d) return;
    dispatch({ type: 'setTrackColours', rideId, ...d.colours, [part]: i });
  };
  const colTrack = swatches('track', (i) => colourCmd('track', i));
  const colSupports = swatches('supports', (i) => colourCmd('supports', i));
  const colCars = swatches('cars', (i) => colourCmd('cars', i));
  panels.get('trains')!.append(
    section(null, trains.el, cars.el, minDwell.el, maxDwell.el, laps.el, bestLap.el),
    section(text('ui.track.colours'), colTrack.el, colSupports.el, colCars.el),
  );

  // ---------- test
  const okIcon = icon('check', 'icon state-icon ok');
  const badIcon = icon('cross', 'icon state-icon bad');
  const testLine = h('span', { class: 'status-text', 'data-testid': 'track-test-status' });
  const testState = h('div', { class: 'tb-status' }, okIcon, badIcon, testLine);
  const testBtn = h('button', { type: 'button', class: 'btn primary', 'data-testid': 'track-test', onclick: () => dispatch({ type: 'startTestRun', rideId }) }, text('ui.track.test.run'));
  const openTest = h('button', { type: 'button', class: 'btn', 'data-testid': 'track-open', onclick: () => {
    const r = find();
    if (r) dispatch({ type: 'setRideOpen', rideId, open: r.status !== 'open' });
  } });
  const tBars = mkBars();
  tBars.excitement.el.dataset.testid = 'track-rating-excitement';
  tBars.intensity.el.dataset.testid = 'track-rating-intensity';
  tBars.nausea.el.dataset.testid = 'track-rating-nausea';
  const ratingsBox = section(text('ui.ride.ratings'), tBars.excitement.el, tBars.intensity.el, tBars.nausea.el);
  const testWarnings = warningList();
  const measured = h('dl', { class: 'measured', 'data-testid': 'track-measured' });
  const measuredBox = section(text('ui.track.test.measured'), measured);
  const chart = createTestChart();
  const chartBox = section(text('ui.track.chart.title'), chart.el);
  panels.get('test')!.append(section(null, testState, h('div', { class: 'tb-row' }, testBtn, openTest)), testWarnings.el, ratingsBox, measuredBox, chartBox);
  let measuredFor: unknown = undefined;

  const body = h('div', { class: 'panel-content track-panel' }, tablist, ...panels.values());

  view = {
    kind: 'ride',
    id: rideId,
    title: ride0?.name ?? '',
    body,
    titleNow: () => find()?.name ?? '',
    update() {
      const r = find();
      const d = trackData(game.world, rideId);
      if (!r || !d) return false;
      for (const t of TABS) {
        const on = t === current;
        setAttr(tabButtons.get(t)!, 'aria-selected', on ? 'true' : 'false');
        const p = panels.get(t)!;
        if (p.hidden === on) p.hidden = !on;
      }
      const block = r.status === 'open' ? null : canOpenTrackRide(game.world, r);
      const tw = trackWarnings(game.world, rideId);

      if (current === 'overview') {
        setText(status, text(`ui.ride.status.${r.status}`));
        status.dataset.status = r.status;
        openBtn.set(text(r.status === 'open' ? 'ui.ride.close' : 'ui.ride.open'), r.status === 'open');
        price.set(r.price);
        for (const k of ['excitement', 'intensity', 'nausea'] as const) {
          if (r.stats) bars[k].set(r.stats[k]);
          bars[k].el.hidden = r.stats === null;
        }
        noRatings.hidden = r.stats !== null;
        warnings.set([...rideWarnings(game.world, r), ...(d.test?.passed ? tw : [])]);
        nextStep.hidden = block === null || r.status === 'testing';
        if (block) setText(nextStep, `${text('ui.track.nextStep')}: ${block}`);
        queue.set(text('ui.ride.queueValue', { count: r.queue.length }));
        riding.set(String(r.riders.length));
        riders.set(String(r.totals.ridersThisMonth));
        ridersTotal.set(String(r.totals.riders));
        income.set(formatMoney(r.totals.incomeThisMonth));
        incomeTotal.set(formatMoney(r.totals.income));
        const tp = trackThroughputPerHour(game.world, rideId);
        throughput.el.hidden = tp === null;
        if (tp !== null) throughput.set(String(Math.round(tp)));
      } else if (current === 'track') {
        pieces.set(String(d.pieces.length));
        circuit.set(text(d.circuitClosed ? 'ui.track.circuitClosed' : 'ui.track.circuitOpen'));
        length.set(formatMetres(getLayout(d).lengthMm));
        highest.set(text('ui.track.fmt.metres', { m: String(trackHighestPointM(game.world, rideId)) }));
        buildCost.set(formatMoney(r.totalBuildCost));
        running.set(text('ui.track.perMonth', { cost: formatMoney(trackRunningCostMonthly(game.world, r)) }));
        setText(edit, text(r.status === 'building' ? 'ui.track.continue' : 'ui.track.edit'));
      } else if (current === 'trains') {
        const v = type?.vehicle;
        const c = d.trainConfig;
        const fixed = r.status === 'open' || r.status === 'testing';
        trains.set(String(c.trains), !fixed && c.trains > 1, !fixed && !!v && c.trains < v.maxTrains);
        cars.set(String(c.carsPerTrain), !fixed && !!v && c.carsPerTrain > v.carsMin, !fixed && !!v && c.carsPerTrain < v.carsMax);
        cars.el.hidden = !!v && v.carsMin === v.carsMax;
        const o = op();
        minDwell.set(text('ui.track.seconds', { n: o.min }), o.min > MIN_DWELL_RANGE_S.min, o.min < MIN_DWELL_RANGE_S.max);
        maxDwell.set(text('ui.track.seconds', { n: o.max }), o.max - 5 >= MAX_DWELL_RANGE_S.min, o.max + 5 <= MAX_DWELL_RANGE_S.max);
        const karts = type?.drive === 'guestDriven';
        laps.el.hidden = !karts;
        laps.set(String(o.laps), o.laps > LAPS_RANGE.min, o.laps < LAPS_RANGE.max);
        bestLap.el.hidden = !karts || d.bestLapTicks === null;
        if (d.bestLapTicks !== null) bestLap.set(formatSeconds(d.bestLapTicks));
        colTrack.set(d.colours.track);
        colSupports.set(d.colours.supports);
        colCars.set(d.colours.cars);
      } else {
        const ts = testStatus(d.test, d.testRun);
        setText(testLine, ts.text);
        okIcon.style.display = ts.kind === 'passed' ? '' : 'none';
        badIcon.style.display = ts.kind === 'failed' ? '' : 'none';
        toggleClass(testState, 'valid', ts.kind === 'passed');
        toggleClass(testState, 'invalid', ts.kind === 'failed');
        testBtn.toggleAttribute('disabled', r.status === 'open' || r.status === 'testing' || !d.circuitClosed);
        setText(openTest, text(r.status === 'open' ? 'ui.ride.close' : 'ui.ride.open'));
        setAttr(openTest, 'aria-pressed', r.status === 'open' ? 'true' : 'false');
        const t = d.test;
        ratingsBox.hidden = !t || !t.passed;
        if (t && t.passed) {
          tBars.excitement.set(t.excitement);
          tBars.intensity.set(t.intensity);
          tBars.nausea.set(t.nausea);
        }
        testWarnings.set(t ? tw : block && r.status !== 'testing' && d.circuitClosed ? [block] : []);
        measuredBox.hidden = !t || !t.passed;
        if (t && t.passed && measuredFor !== t) {
          measuredFor = t;
          measured.replaceChildren(
            ...testRows(t, type?.drive === 'guestDriven').flatMap((row) => [h('dt', { text: row.label }), h('dd', { text: row.value, 'data-testid': `track-measure-${row.key}` })]),
          );
        }
        chart.set(t);
        chartBox.hidden = !t || !t.passed;
      }
      return true;
    },
  };
  return view;
}
