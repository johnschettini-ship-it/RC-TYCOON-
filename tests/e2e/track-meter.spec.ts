/**
 * R5 / R7 (owner 2026-11-12; plan ride-work-1 Task 6): the live meter in the track builder. While a piece is selected the
 * builder shows the projected top speed, the strongest car's vertical G range and sideways G on that piece (or where the
 * train stops), each with a level (a word for screen readers and an icon, never colour alone). A piece over a hard safety
 * limit cannot be built: Build is disabled, the line shows the reason, the meter marks the value over the limit, and Enter
 * builds nothing. Also checks the Task 3 ride panel "Show on map" button and the danger outline in the browser.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { isPhone, newPark, pickCard, scan, showTile, watchErrors } from './helpers';
import { defaultSettings, serializeSettings } from '../../src/settings/schema';

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
const boxGap = (a: Box, b: Box): number => Math.hypot(Math.max(0, a.x - (b.x + b.width), b.x - (a.x + a.width)), Math.max(0, a.y - (b.y + b.height), b.y - (a.y + a.height)));

const SHOT = process.env.TC_METER_SHOT;
const UNSAFE = /^Over the safety limit: \d+\.\d\d G \(max 6\.00 G\)$/;

async function frames(page: Page, n = 2): Promise<void> {
  for (let i = 0; i < n; i++) await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => done())));
}

interface MeterTc {
  setSpeed(n: number): void;
  step(n: number): void;
  dispatch(cmd: Record<string, unknown>): { ok: boolean; reason?: string };
  world: { state: { park: { cash: number }; rides: Array<{ id: number; kind: string; status: string }>; track: { rides: Record<string, { pieces: unknown[] }> } } };
}
const tc = <T>(page: Page, fn: (g: MeterTc) => T): Promise<T> => page.evaluate(`(${fn.toString()})(window.__tc)`) as Promise<T>;

async function shot(page: Page, name: string): Promise<void> {
  if (SHOT) await page.screenshot({ path: `${SHOT}-${name}.png` });
}

async function press(page: Page, touch: boolean, id: string): Promise<void> {
  const el = page.getByTestId(id);
  if (touch) await el.tap();
  else await el.click();
}

/** A new park at the size, a Steel Coaster station placed at (30, 30) through the UI: the builder in its pieces step. */
async function steelBuilder(page: Page, touch: boolean, width: number, height: number, settings?: string): Promise<void> {
  if (settings) await page.addInitScript((d) => window.localStorage.setItem('tc.settings', d), settings);
  await page.setViewportSize({ width, height });
  await newPark(page);
  await tc(page, (g) => g.setSpeed(0));
  await pickCard(page, 'track', 'steel_coaster', { tap: touch });
  const builder = page.getByTestId('track-builder');
  await expect(builder).toHaveAttribute('data-phase', 'station');
  const p = await showTile(page, 30, 30);
  await frames(page);
  if (touch) {
    await page.touchscreen.tap(p.x, p.y);
    await frames(page);
    await page.getByTestId('track-confirm').tap();
  } else {
    await page.mouse.move(p.x, p.y);
    await frames(page);
    await page.mouse.click(p.x, p.y);
  }
  await expect(builder).toHaveAttribute('data-phase', 'pieces');
}

/**
 * Add the pieces of the unit tests' `UNSAFE_DROP_PIECES` (a 70 m chained climb into a steep valley) after the station,
 * up to piece `upTo` (exclusive, counting the placed station as piece 0), through `window.__tc.dispatch`.
 */
async function climbTo(page: Page, upTo: number): Promise<void> {
  const failed = await page.evaluate((n) => {
    const g = (window as unknown as { __tc: MeterTc }).__tc;
    const st = g.world.state;
    st.park.cash = 50_000_000;
    const r = st.rides.find((x) => x.kind === 'track')!;
    const c = (id: string): [string, boolean] => [id, true];
    const s = (id: string): [string, boolean] => [id, false];
    const t = (k: number, p: [string, boolean]): Array<[string, boolean]> => Array.from({ length: k }, () => p);
    const specs: Array<[string, boolean]> = [
      s('station'), s('station'), c('flat_to_gentle_up'), c('gentle_to_steep_up'), ...t(9, c('steep_up')), c('steep_to_gentle_up'),
      c('gentle_up_to_flat'), s('straight'), s('straight'), s('turn_medium_right'), s('flat_to_gentle_down'), s('gentle_to_steep_down'),
      ...t(9, s('steep_down')), s('steep_to_gentle_down'), s('gentle_down_to_flat'),
    ];
    const have = st.track.rides[String(r.id)]!.pieces.length;
    const out: string[] = [];
    for (const [defId, chain] of specs.slice(have - 1, n - 1)) {
      const res = g.dispatch({ type: 'addTrackPiece', rideId: r.id, defId, chain });
      if (!res.ok) out.push(`${defId}: ${res.reason}`);
    }
    return out;
  }, upTo);
  expect(failed).toEqual([]);
}

async function pieceCount(page: Page): Promise<number> {
  return tc(page, (g) => {
    const r = g.world.state.rides.find((x) => x.kind === 'track');
    return r ? (g.world.state.track.rides[String(r.id)]?.pieces.length ?? 0) : 0;
  });
}

async function selectPiece(page: Page, touch: boolean, defId: string): Promise<void> {
  await press(page, touch, 'track-builder-group-slopes');
  await press(page, touch, `track-piece-${defId}`);
  if (!touch) await page.mouse.move(640, 300);
  await frames(page, 3);
}

/** Text clipped by an element of the meter (scrolling or hidden overflow). */
async function clipped(el: Locator): Promise<string[]> {
  return el.evaluate((root) => {
    const out: string[] = [];
    for (const e of [root, ...root.querySelectorAll<HTMLElement>('*')]) {
      if (e.closest('.sr-only, [hidden]')) continue;
      if (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1) out.push(`${e.className} ${e.scrollWidth}/${e.clientWidth}`);
      const r = e.getBoundingClientRect();
      const p = root.getBoundingClientRect();
      if (r.width > 0 && (r.left < p.left - 0.5 || r.right > p.right + 0.5)) out.push(`${e.className} outside`);
    }
    return out;
  });
}

const SIZES = [
  { w: 390, h: 844, phone: true },
  { w: 844, h: 390, phone: true },
  { w: 1280, h: 800, phone: false },
] as const;

for (const size of SIZES) {
  test(`${size.w} × ${size.h}: the meter shows speed and G; an over-limit piece disables Build and Enter builds nothing`, async ({ page }, info) => {
    test.skip(isPhone(info) !== size.phone, size.phone ? 'phone sizes' : 'desktop');
    const watch = watchErrors(page);
    const touch = size.phone;
    await steelBuilder(page, touch, size.w, size.h);
    const meter = page.getByTestId('track-meter');

    // Down the drop: three items with the speed and G, levels as data and words.
    await climbTo(page, 21);
    await selectPiece(page, touch, 'steep_down');
    await expect(meter).toBeVisible();
    await expect(meter).toHaveAttribute('aria-label', 'On this piece');
    await expect(meter.locator('[data-testid^="track-meter-"]:visible')).toHaveCount(3);
    await expect(page.getByTestId('track-meter-speed')).toHaveText(/^Top \d+\.\d m\/s \(\d+ km\/h\)/);
    await expect(page.getByTestId('track-meter-vertical')).toHaveText(/^−?\d+\.\d\d G to −?\d+\.\d\d G/);
    await expect(page.getByTestId('track-meter-lateral')).toHaveText(/^\d+\.\d\d G sideways/);
    for (const id of ['speed', 'vertical', 'lateral']) await expect(page.getByTestId(`track-meter-${id}`)).toHaveAttribute('data-level', /^(ok|warn|over)$/);
    await expect(page.getByTestId('track-build')).toBeEnabled();
    expect(await clipped(meter)).toEqual([]);
    await shot(page, `${size.w}x${size.h}-valid`);
    if (size.w === 390) {
      const plate = (await page.getByTestId('track-builder').boundingBox())!;
      // Task 22's 240 px plate is the Mini Railway's (no Chain lift row); see the Mini Railway test below.
      expect(plate.y + plate.height).toBeLessThanOrEqual(844.5);
    }

    // The piece that ends the valley: over 6.00 G for the strongest car.
    await climbTo(page, 31);
    await selectPiece(page, touch, 'gentle_down_to_flat');
    const build = page.getByTestId('track-build');
    const reason = page.getByTestId('track-reason');
    await expect(build).toBeDisabled();
    await expect(reason).toBeVisible();
    await expect(reason).toHaveText(UNSAFE);
    await expect(build).toHaveAccessibleDescription(UNSAFE);
    const vertical = page.getByTestId('track-meter-vertical');
    await expect(vertical).toHaveAttribute('data-level', 'over');
    // Not colour alone: the cross icon and the words for screen readers.
    await expect(vertical.locator('svg:visible')).toHaveCount(1);
    await expect(vertical.locator('.sr-only')).toHaveText('Over the safety limit');
    // The meter and the reason show the same value.
    const g = (await reason.textContent())!.match(/(\d+\.\d\d) G/)![1]!;
    await expect(vertical).toContainText(`${g} G`);
    expect(await clipped(meter)).toEqual([]);
    await shot(page, `${size.w}x${size.h}-over`);
    const n = await pieceCount(page);
    await build.dispatchEvent('click');
    await page.keyboard.press('Enter');
    await frames(page, 4);
    expect(await pieceCount(page)).toBe(n);

    if (size.w === 390) {
      // Every visible control of the panel: 44 × 44 or more, 8 px apart.
      const boxes: Array<{ name: string; box: Box }> = [];
      for (const c of await page.getByTestId('track-builder').locator('button:visible').all()) {
        boxes.push({ name: (await c.getAttribute('data-testid')) ?? '', box: (await c.boundingBox())! });
      }
      for (const a of boxes) {
        expect(a.box.width, a.name).toBeGreaterThanOrEqual(44);
        expect(a.box.height, a.name).toBeGreaterThanOrEqual(44);
        for (const b of boxes) if (a !== b) expect(boxGap(a.box, b.box), `${a.name} to ${b.name}`).toBeGreaterThanOrEqual(7.9);
      }
      await scan(page, 'track builder with the meter, a piece over the limit');
    }
    watch.expectNoErrors();
  });
}

test('390 × 844: the Mini Railway panel with the meter stays at most 240 px high', async ({ page }, info) => {
  test.skip(!isPhone(info), 'phone');
  await page.setViewportSize({ width: 390, height: 844 });
  await newPark(page);
  await tc(page, (g) => g.setSpeed(0));
  await pickCard(page, 'track', 'mini_railway', { tap: true });
  const p = await showTile(page, 30, 30);
  await frames(page);
  await page.touchscreen.tap(p.x, p.y);
  await frames(page);
  await page.getByTestId('track-confirm').tap();
  await expect(page.getByTestId('track-builder')).toHaveAttribute('data-phase', 'pieces');
  await page.getByTestId('track-builder-group-slopes').tap();
  await page.getByTestId('track-piece-flat_to_gentle_up').tap();
  await frames(page, 3);
  await expect(page.getByTestId('track-meter')).toBeVisible();
  await shot(page, '390x844-mini-railway');
  const plate = (await page.getByTestId('track-builder').boundingBox())!;
  console.log(`mini railway plate ${plate.height}`);
  expect(plate.height).toBeLessThanOrEqual(240.5);
});

test('390 × 844 at 175% text in en-XA: no meter text is clipped', async ({ page }, info) => {
  test.skip(!isPhone(info), 'phone');
  const doc = serializeSettings({ ...defaultSettings(), locale: 'en-XA', textScale: 175 });
  await page.addInitScript((d) => window.localStorage.setItem('tc.settings', d), doc);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-XA');
  await page.getByTestId('title-new').click();
  await page.getByTestId('title-size-64').click();
  await page.getByTestId('title-start').click();
  await expect(page.locator('.title-screen')).toBeHidden();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await tc(page, (g) => g.setSpeed(0));
  await pickCard(page, 'track', 'steel_coaster', { tap: true });
  const p = await showTile(page, 30, 30);
  await frames(page);
  await page.touchscreen.tap(p.x, p.y);
  await frames(page);
  await page.getByTestId('track-confirm').tap();
  await climbTo(page, 31);
  await page.getByTestId('track-builder-group-slopes').tap();
  await page.getByTestId('track-piece-gentle_down_to_flat').tap();
  await frames(page, 3);
  const meter = page.getByTestId('track-meter');
  await expect(meter).toBeVisible();
  await expect(page.getByTestId('track-meter-vertical')).toHaveAttribute('data-level', 'over');
  // The meter texts come from the string table (accented in en-XA).
  await expect(page.getByTestId('track-meter-lateral')).not.toContainText('sideways');
  await shot(page, '390x844-175-xa-over');
  expect(await clipped(meter)).toEqual([]);
  for (const b of await page.getByTestId('track-builder').locator('button:visible').all()) {
    await b.scrollIntoViewIfNeeded();
    const box = (await b.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
});

test('an unsafe test: Open is refused, the ride panel shows the place on the map, and Show on map centres it', async ({ page }, info) => {
  const touch = isPhone(info);
  const watch = watchErrors(page);
  await page.setViewportSize(touch ? { width: 390, height: 844 } : { width: 1280, height: 800 });
  await newPark(page);
  // Built with real commands: a 52 m drop and two brakes, safe for the default 4 cars; then 7 cars, whose rear cars take
  // the turn after the brakes over 3.00 G sideways (each car's own window). Build checks the train it has at the time.
  const res = await page.evaluate(() => {
    const g = (window as unknown as { __tc: MeterTc }).__tc;
    g.setSpeed(0);
    const st = g.world.state;
    st.park.cash = 50_000_000;
    const placed = g.dispatch({ type: 'placeStation', typeId: 'steel_coaster', x: 30, y: 30, dir: 1 }) as { ok: boolean; id?: number; reason?: string };
    if (!placed.ok) return { error: placed.reason };
    const id = placed.id!;
    const c = (p: string): [string, boolean, number?] => [p, true];
    const s = (p: string): [string, boolean, number?] => [p, false];
    const t = (k: number, p: [string, boolean, number?]): Array<[string, boolean, number?]> => Array.from({ length: k }, () => p);
    const specs: Array<[string, boolean, number?]> = [
      ...t(4, s('station')), c('flat_to_gentle_up'), c('gentle_to_steep_up'), ...t(7, c('steep_up')), c('steep_to_gentle_up'),
      c('gentle_up_to_flat'), s('straight'), s('straight'), s('turn_medium_right'), s('flat_to_gentle_down'), s('gentle_to_steep_down'),
      ...t(7, s('steep_down')), s('steep_to_gentle_down'), s('gentle_down_to_flat'), ['brakes', false, 8], ['brakes', false, 8],
      s('turn_medium_right'), ...t(18, s('straight')), s('turn_medium_right'), ...t(13, s('straight')), s('turn_medium_right'),
    ];
    for (const [defId, chain, brakeSpeed] of specs) {
      const r = g.dispatch({ type: 'addTrackPiece', rideId: id, defId, chain, ...(brakeSpeed ? { brakeSpeed } : {}) });
      if (!r.ok) return { error: `${defId}: ${r.reason}` };
    }
    const steps = [
      g.dispatch({ type: 'placeTrackGate', rideId: id, kind: 'entrance', x: 30, y: 31 }),
      g.dispatch({ type: 'placeTrackGate', rideId: id, kind: 'exit', x: 31, y: 31 }),
      g.dispatch({ type: 'setTrainConfig', rideId: id, trains: 1, carsPerTrain: 7 }),
      g.dispatch({ type: 'startTestRun', rideId: id }),
    ];
    if (steps.some((x) => !x.ok)) return { error: steps.map((x) => x.reason ?? 'ok').join(' / ') };
    g.step(2400);
    const open = g.dispatch({ type: 'setRideOpen', rideId: id, open: true });
    return { id, open: open.ok ? null : (open.reason ?? '') };
  });
  expect(res).not.toHaveProperty('error');
  expect(res.open).toMatch(/^Too hard sideways: \d+\.\d\d G on piece 33 \(limit 3\.00 G\)$/);
  // Open the ride panel from the map: the station.
  const p = await showTile(page, 31, 30);
  await frames(page);
  if (touch) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
  const show = page.getByTestId('track-trouble-show');
  await expect(show).toBeVisible();
  await expect(show).toHaveText('Show on map');
  const box = (await show.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  await shot(page, `${touch ? 'phone' : 'desktop'}-show-on-map-panel`);
  const camera = (): Promise<number[]> =>
    page.evaluate(() => {
      const g = (window as unknown as { __tc: { camera: { centerX: number; centerY: number } } }).__tc;
      return [g.camera.centerX, g.camera.centerY];
    });
  const before = await camera();
  await press(page, touch, 'track-trouble-show');
  await frames(page, 4);
  expect(await camera()).not.toEqual(before);
  await shot(page, `${touch ? 'phone' : 'desktop'}-show-on-map-outline`);
  watch.expectNoErrors();
});
