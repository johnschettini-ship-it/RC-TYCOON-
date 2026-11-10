import { expect, test, type Page } from '@playwright/test';
import { centerOn, isPhone, newPark, openTool, setSpeed, watchErrors } from './helpers';

/**
 * After Dark (W3-F, Phase 4 §9.5 brightness step and §7 park panel switch).
 * - Desktop: the park panel switch turns After Dark off and on; turning it on with dark paths shows the toast;
 *   the clock set to 22:00 and then 12:00 gives a lower mean canvas brightness at 22:00.
 * - Phone: tap the switch in the park panel sheet.
 * - `TC_PERF=1`: measures the light pass (frame time at 22:00 minus 12:00, with a still and a moving camera).
 * - `TC_SCREENSHOT=1`: saves docs/screenshots/wave3-after-dark.png (desktop, device scale 2), a night park with
 *   lamps, lit rides, and stalls. Lamps are Phase 4 content (unlocked when W3-D raises the build phase), so the
 *   picture writes them into the map through the debug hook.
 */

interface NightGame {
  world: {
    state: {
      tick: number;
      park: { afterDark: boolean; cash: number };
      map: { width: number; pathItem: Uint8Array };
      management: { weather: { current: string }; research: { unlocked: string[] } };
      guests: unknown[];
      rides: Array<{ id: number; status: string }>;
    };
  };
  camera: { centerX: number; centerY: number; zoom: number };
  tool: { overlay: string };
  dispatch(cmd: Record<string, unknown>): { ok: boolean; reason?: string; id?: number; warnings?: string[] };
  step(n: number): void;
  setSpeed(n: number): void;
  frame(now: number): void;
}

const DAY = 1200;
const HOUR = 50;

/** Move the clock forward to `hour` (whole ticks through the simulation) and keep the sky clear. */
async function clockTo(page: Page, hour: number): Promise<void> {
  await page.evaluate(
    ([h, day, hr]) => {
      const g = (window as unknown as { __tc: NightGame }).__tc;
      const now = g.world.state.tick;
      const target = Math.floor(now / day) * day + h * hr;
      g.step(target > now ? target - now : target + day - now);
      g.world.state.management.weather.current = 'sunny';
    },
    [hour, DAY, HOUR] as const,
  );
}

/** Mean brightness (0–255) of the game canvas after two fresh frames. */
async function meanBrightness(page: Page): Promise<number> {
  return page.evaluate(async () => {
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    const canvas = document.getElementById('game') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    const { width, height } = canvas;
    const data = ctx.getImageData(0, 0, width, height).data;
    let sum = 0;
    let n = 0;
    for (let i = 0; i < data.length; i += 4 * 7) {
      sum += 0.2126 * (data[i] as number) + 0.7152 * (data[i + 1] as number) + 0.0722 * (data[i + 2] as number);
      n++;
    }
    return sum / n;
  });
}

async function openParkPanel(page: Page): Promise<void> {
  await openTool(page, 'park');
  await expect(page.getByTestId('after-dark-section')).toBeVisible();
}

test.describe('After Dark: desktop', () => {
  test.beforeEach(() => test.skip(isPhone(test.info()), 'desktop flow'));

  test('the park panel switch, the dark-path toast, and darker canvas at 22:00 than at 12:00', async ({ page }) => {
    test.setTimeout(90_000);
    const watch = watchErrors(page);
    await newPark(page, 'Night Park');
    await setSpeed(page, 'Pause');
    // An unlit footpath away from the entrance light: most paths are dark.
    await page.evaluate(() => {
      const g = (window as unknown as { __tc: NightGame }).__tc;
      const r = g.dispatch({ type: 'buildPathLine', x0: 10, y0: 20, x1: 30, y1: 20, kind: 'footpath' });
      if (!r.ok) throw new Error(r.reason);
    });
    await openParkPanel(page);
    const sw = page.getByTestId('after-dark-switch');
    await expect(sw).toHaveText('After Dark: On');
    await expect(sw).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('after-dark-help')).toHaveText(/At night guests want lit paths/);
    await sw.click();
    await expect(sw).toHaveText('After Dark: Off');
    await expect(sw).toHaveAttribute('aria-pressed', 'false');
    expect(await page.evaluate(() => (window as unknown as { __tc: NightGame }).__tc.world.state.park.afterDark)).toBe(false);
    await sw.click();
    await expect(sw).toHaveText('After Dark: On');
    await expect(page.getByTestId('toast')).toHaveText('Guests dislike dark paths. Build lamps');
    // Keyboard: the switch is a button.
    await sw.focus();
    await page.keyboard.press('Enter');
    await expect(sw).toHaveText('After Dark: Off');
    await page.keyboard.press('Enter');
    await expect(sw).toHaveText('After Dark: On');
    await openTool(page, 'park');

    await centerOn(page, 31, 50);
    await clockTo(page, 22);
    const night = await meanBrightness(page);
    // The HUD shows a clear night as the moon, not the sun.
    const weather = page.getByTestId('hud-weather');
    await expect(weather).toHaveAttribute('data-night', 'true');
    await expect(weather.locator('.weather-now svg')).toHaveClass(/weather-night/);
    await clockTo(page, 12);
    const noon = await meanBrightness(page);
    expect(night).toBeLessThan(noon * 0.8);
    await expect(weather).toHaveAttribute('data-night', 'false');
    await expect(weather.locator('.weather-now svg')).not.toHaveClass(/weather-night/);

    // After Dark off: 22:00 looks like the day.
    await page.evaluate(() => (window as unknown as { __tc: NightGame }).__tc.dispatch({ type: 'setAfterDark', on: false }));
    await clockTo(page, 22);
    const offNight = await meanBrightness(page);
    expect(Math.abs(offNight - noon)).toBeLessThan(noon * 0.05);
    await expect(weather).toHaveAttribute('data-night', 'false');
    watch.expectNoErrors();
  });

  test('the Light overlay draws and the light pass stays within budget (TC_PERF=1 to print timings)', async ({ page }) => {
    test.setTimeout(120_000);
    const watch = watchErrors(page);
    await newPark(page, 'Perf Night');
    await setSpeed(page, 'Pause');
    const result = await page.evaluate(
      ([day, hour]) => {
        const g = (window as unknown as { __tc: NightGame }).__tc;
        const s = g.world.state;
        s.park.cash = 100_000_000;
        // A path grid with a lamp on every third tile and 10 open rides: about 300 light sources.
        for (const v of [20, 26, 32, 38, 44, 50, 56]) {
          g.dispatch({ type: 'buildPathLine', x0: 4, y0: v, x1: 58, y1: v, kind: 'footpath' });
          g.dispatch({ type: 'buildPathLine', x0: v, y0: 4, x1: v, y1: 58, kind: 'footpath' });
        }
        const map = s.map;
        let lamps = 0;
        for (let y = 4; y <= 58; y++) {
          for (let x = 4; x <= 58; x++) {
            const i = y * map.width + x;
            if ((x + y) % 3 === 0 && (x % 6 === 2 || y % 6 === 2)) {
              map.pathItem[i] = 3;
              lamps++;
            }
          }
        }
        for (let k = 0; k < 10; k++) {
          const r = g.dispatch({ type: 'placeRide', defId: 'carousel', x: 6 + (k % 5) * 10, y: k < 5 ? 8 : 14, rotation: 0 });
          if (r.ok) {
            const ride = s.rides.find((q) => q.id === r.id);
            if (ride) ride.status = 'open';
          }
        }
        const timeFrames = (hourOfDay: number, moving: boolean): number => {
          s.tick = Math.floor(s.tick / day) * day + day + hourOfDay * hour;
          const n = 60;
          const t0 = performance.now();
          for (let k = 0; k < n; k++) {
            if (moving) g.camera.centerX += 1;
            g.frame(t0 + k * 16);
          }
          return (performance.now() - t0) / n;
        };
        g.camera.zoom = 0.5;
        timeFrames(12, false);
        const dayStill = timeFrames(12, false);
        const nightStill = timeFrames(22, false);
        const dayMoving = timeFrames(12, true);
        const nightMoving = timeFrames(22, true);
        g.tool.overlay = 'light';
        const overlay = timeFrames(12, false);
        g.tool.overlay = 'none';
        return { lamps, dayStill, nightStill, dayMoving, nightMoving, overlay };
      },
      [DAY, HOUR] as const,
    );
    if (process.env.TC_PERF) console.log(`[after-dark perf] ${JSON.stringify(result)}`);
    expect(result.lamps).toBeGreaterThan(100);
    // Generous bound for software-raster CI: the pass must not dominate a frame.
    expect(result.nightStill - result.dayStill).toBeLessThan(20);
    watch.expectNoErrors();
  });
});

test.describe('After Dark: phone', () => {
  test.beforeEach(() => test.skip(!isPhone(test.info()), 'phone flow'));

  test('tap the After Dark switch in the park sheet', async ({ page }) => {
    test.setTimeout(60_000);
    const watch = watchErrors(page);
    await newPark(page, 'Phone Night');
    await setSpeed(page, 'Pause');
    await openParkPanel(page);
    const sw = page.getByTestId('after-dark-switch');
    await sw.scrollIntoViewIfNeeded();
    const box = await sw.boundingBox();
    expect(box && box.width >= 44 && box.height >= 44).toBe(true);
    await sw.tap();
    await expect(sw).toHaveText('After Dark: Off');
    await sw.tap();
    await expect(sw).toHaveText('After Dark: On');
    watch.expectNoErrors();
  });
});

test.describe('After Dark screenshot', () => {
  test.use({ deviceScaleFactor: 2 });
  test('a night park with lamps, lit rides, and stalls', async ({ page }, info) => {
    test.skip(!process.env.TC_SCREENSHOT || info.project.name !== 'desktop', 'set TC_SCREENSHOT=1 to refresh the screenshot');
    test.setTimeout(240_000);
    const errors = watchErrors(page);
    await newPark(page, 'Moonlight Park');
    const summary = await page.evaluate(
      ([day, hour]) => {
        const g = (window as unknown as { __tc: NightGame }).__tc;
        g.setSpeed(0);
        const s = g.world.state;
        const run = (c: Record<string, unknown>): { id?: number } => {
          const r = g.dispatch(c);
          if (!r.ok) throw new Error(`${String(c.type)}: ${r.reason} ${JSON.stringify(c)}`);
          return r;
        };
        const line = (x0: number, y0: number, x1: number, y1: number, kind = 'footpath'): void => {
          run({ type: 'buildPathLine', x0, y0, x1, y1, kind });
        };
        run({ type: 'borrow', amount: 1_000_000 });
        // Main avenue from the entrance, a cross street, and two loops.
        line(31, 59, 31, 40);
        line(20, 48, 42, 48);
        line(20, 40, 42, 40);
        line(20, 41, 20, 47);
        line(42, 41, 42, 47);
        // Flat rides facing the cross street, each with a short queue.
        const rides: Array<[string, number, number, number]> = [
          ['carousel', 22, 50, 2],
          ['teacup_twirl', 36, 50, 2],
          ['big_wheel', 23, 36, 0],
          ['swing_tower', 35, 36, 0],
        ];
        for (const [defId, x, y, rotation] of rides) {
          const id = run({ type: 'placeRide', defId, x, y, rotation }).id as number;
          if (rotation === 2) line(x + 1, y - 1, x + 1, y - 1, 'queue');
          else line(x + 1, y + 3, x + 1, y + 3, 'queue');
          run({ type: 'setRideOpen', rideId: id, open: true });
        }
        for (const [defId, x, y, rotation] of [['snack_shack', 30, 46, 1], ['fizz_stand', 32, 44, 3], ['restrooms', 27, 47, 2]] as const) {
          run({ type: 'placeStall', defId, x, y, rotation });
        }
        // Lamps along the avenue and the cross street (Phase 4 path item, written directly), and one dark corner.
        const map = s.map;
        for (const [x, y] of [[31, 57], [31, 53], [31, 50], [25, 48], [29, 48], [34, 48], [38, 48], [31, 43], [26, 40], [36, 40], [20, 44]] as const) {
          map.pathItem[y * map.width + x] = 3;
        }
        for (const staffType of ['groundskeeper', 'performer']) run({ type: 'hireStaff', staffType });
        run({ type: 'setEntranceFee', fee: 0 });
        run({ type: 'setParkOpen', open: true });
        // Let guests fill the park through the evening, then stop at 22:30 with a clear sky.
        const target = Math.floor(s.tick / day) * day + day + 21 * hour;
        g.step(target - s.tick);
        g.step(25);
        s.management.weather.current = 'sunny';
        g.camera.zoom = 1.25;
        g.camera.centerX = (31 - 46) * 32;
        g.camera.centerY = (31 + 46) * 16 - 8 * 8;
        return { guests: s.guests.length, open: s.rides.filter((r) => r.status === 'open').length, afterDark: s.park.afterDark, tick: s.tick };
      },
      [DAY, HOUR] as const,
    );
    expect(summary.afterDark).toBe(true);
    expect(summary.open).toBeGreaterThanOrEqual(3);
    expect(summary.guests).toBeGreaterThan(10);
    await page.waitForTimeout(3500);
    const dismiss = page.locator('.msg-toast:not([hidden]) .icon-btn');
    while ((await dismiss.count()) > 0) await dismiss.first().click();
    await page.screenshot({ path: 'docs/screenshots/wave3-after-dark.png' });
    errors.expectNoErrors();
  });
});
