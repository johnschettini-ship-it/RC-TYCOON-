import { expect, test, type Page } from '@playwright/test';
import { cardOf, pickCard, showTile } from './helpers';

/**
 * Water rides smoke (Phase 4 §4.4, §9.1; W3-C "Done"): build a Log Flume and a Rapids Raft through the builder on
 * desktop (mouse, Build button) and on a phone (taps, Confirm and Build), place the gates, test, open, and let guests
 * ride and get wet. Water rides are Phase 4 research content: the test marks them researched with the debug hook, and
 * skips while `BUILD_MAX_PHASE` is still 3 (W3-D raises it to 4).
 */

/** The parts of the `(window as unknown as { __tc: WaterTc }).__tc` debug hook this spec reads (cast inline: other specs declare their own shapes). */
interface WaterTc {
  camera: { centerX: number; centerY: number; zoom: number };
  world: {
    state: {
      map: { width: number; heights: Uint8Array };
      rides: Array<{ id: number; status: string; kind: string; defId: string; totals: { riders: number } }>;
      guests: Array<{ wetUntilTick: number }>;
      track: { rides: Record<string, { pieces: unknown[]; test: { passed: boolean } | null }> };
      management: { research: { unlocked: string[] } };
    };
  };
  dispatch(cmd: Record<string, unknown>): { ok: boolean; reason?: string; id?: number };
  step(n: number): void;
  setSpeed(n: number): void;
}

async function newPark(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByTestId('title-new').click();
  // The classic 64 × 64 Build 1 layout these tile coordinates use (New Park starts on 96 × 96).
  await page.getByTestId('title-size-64').click();
  await page.getByTestId('title-start').click();
  await expect(page.locator('.title-screen')).toBeHidden();
}

/** Mark both water rides researched, then lay the paths: entrance road, a queue to (10, 8), a footpath to (11, 8). */
async function setUp(page: Page): Promise<void> {
  await page.evaluate(() => {
    const g = (window as unknown as { __tc: WaterTc }).__tc;
    g.setSpeed(0);
    g.world.state.management.research.unlocked.push('log_flume', 'rapids_raft');
    const run = (c: Record<string, unknown>): void => {
      const r = g.dispatch(c);
      if (!r.ok) throw new Error(`${String(c.type)}: ${r.reason}`);
    };
    run({ type: 'buildPathLine', x0: 31, y0: 59, x1: 31, y1: 6, kind: 'footpath' });
    run({ type: 'buildPathLine', x0: 30, y0: 6, x1: 11, y1: 6, kind: 'footpath' });
    run({ type: 'buildPathLine', x0: 11, y0: 7, x1: 11, y1: 8, kind: 'footpath' });
    run({ type: 'buildPathLine', x0: 10, y0: 6, x1: 10, y1: 8, kind: 'queue' });
  });
}

async function hitTile(page: Page, phone: boolean, x: number, y: number): Promise<void> {
  const p = await showTile(page, x, y);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
  if (phone) await page.touchscreen.tap(p.x, p.y);
  else {
    await page.mouse.move(p.x, p.y);
    await page.mouse.click(p.x, p.y);
  }
}

async function press(page: Page, phone: boolean, testId: string): Promise<void> {
  const b = page.getByTestId(testId);
  if (phone) await b.tap();
  else await b.click();
}

async function pieceCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const r = (window as unknown as { __tc: WaterTc }).__tc.world.state.rides.find((x) => x.kind === 'track');
    return r ? ((window as unknown as { __tc: WaterTc }).__tc.world.state.track.rides[String(r.id)]?.pieces.length ?? 0) : 0;
  });
}

type Step = { group: string; piece: string };

/** The unit-test circuit (tests/unit/track/waterRides.test.ts) after the 2-tile station, as palette steps. */
function steps(set: 'flume' | 'rapids'): Step[] {
  const s = (group: string, piece: string): Step => ({ group, piece: `${set}_${piece}` });
  const feature = set === 'flume' ? [s('slopes', 'drop'), s('special', 'splashdown')] : [s('slopes', 'waterfall'), s('special', 'rough'), s('special', 'whirlpool')];
  return [
    s('slopes', 'lift'),
    s('slopes', 'lift'),
    s('slopes', 'lift'),
    s('straight', 'straight'),
    s('turns', 'turn_small_r'),
    ...feature,
    s('turns', 'turn_small_r'),
    ...Array.from({ length: 6 }, () => s('straight', 'straight')),
    s('turns', 'turn_small_r'),
    ...Array.from({ length: 3 }, () => s('straight', 'straight')),
    s('turns', 'turn_small_r'),
  ];
}

for (const [set, typeId, name] of [
  ['flume', 'log_flume', 'Log Flume'],
  ['rapids', 'rapids_raft', 'Rapids Raft'],
] as const) {
  test.describe(name, () => {
    let errors: string[] = [];

    test.beforeEach(async ({ page }) => {
      errors = [];
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });
      page.on('pageerror', (e) => errors.push(e.message));
      await newPark(page);
    });

    test.afterEach(() => {
      expect(errors).toEqual([]);
    });

    test(`build a ${name} through the builder, test, open, and carry guests`, async ({ page }, info) => {
      test.setTimeout(180_000);
      const phone = info.project.name === 'phone';
      await setUp(page);

      const card = await cardOf(page, 'track', typeId, { tap: phone });
      test.skip((await card.count()) === 0, 'water rides unlock once BUILD_MAX_PHASE reaches 4 (W3-D)');
      await pickCard(page, 'track', typeId, { tap: phone });
      const builder = page.getByTestId('track-builder');
      await expect(builder).toBeVisible();
      // One boat is one tile long: the station starts at 1 tile; make it 2.
      await expect(page.getByTestId('track-station-length')).toHaveText('1 tile');
      const longer = builder.getByRole('button', { name: 'Longer station' });
      if (phone) await longer.tap();
      else await longer.click();
      await expect(page.getByTestId('track-station-length')).toHaveText('2 tiles');

      // Station at (10, 10) heading east.
      await hitTile(page, phone, 10, 10);
      if (phone) await press(page, phone, 'track-confirm');
      await expect.poll(() => pieceCount(page)).toBe(2);
      await expect(builder).toHaveAttribute('data-phase', 'pieces');

      for (const [i, s] of steps(set).entries()) {
        await press(page, phone, `track-builder-group-${s.group}`);
        await press(page, phone, `track-piece-${s.piece}`);
        await expect(page.getByTestId('track-status')).toContainText('✓');
        await press(page, phone, 'track-build');
        await expect.poll(() => pieceCount(page)).toBe(3 + i);
      }

      // Gates, then the ride panel's Test tab.
      await expect(builder).toHaveAttribute('data-phase', 'entrance');
      await hitTile(page, phone, 10, 9);
      if (phone) await press(page, phone, 'track-confirm');
      await expect(builder).toHaveAttribute('data-phase', 'exit');
      await hitTile(page, phone, 11, 9);
      if (phone) await press(page, phone, 'track-confirm');
      await expect(builder).toBeHidden();
      await press(page, phone, 'track-test');
      await page.evaluate(() => (window as unknown as { __tc: WaterTc }).__tc.step(2000));
      await expect(page.getByTestId('track-test-status')).toHaveText('Test passed', { timeout: 30_000 });
      await expect(page.getByTestId('track-rating-excitement').locator('.meter-value')).toHaveText(/^\d\.\d\d$/);
      await press(page, phone, 'track-open');
      await expect(page.getByTestId('track-open')).toHaveText('Close ride');

      // Guests arrive, ride, and leave wet.
      const result = await page.evaluate((id) => {
        const g = (window as unknown as { __tc: WaterTc }).__tc;
        g.dispatch({ type: 'setParkOpen', open: true });
        const ride = g.world.state.rides.find((r) => r.defId === id)!;
        let wet = 0;
        for (let t = 0; t < 30_000 && (ride.totals.riders < 3 || wet === 0); t += 50) {
          g.step(50);
          wet = g.world.state.guests.filter((x) => x.wetUntilTick >= 0).length;
        }
        return { riders: ride.totals.riders, wet, status: ride.status };
      }, typeId);
      expect(result.status).toBe('open');
      expect(result.riders).toBeGreaterThan(0);
      expect(result.wet).toBeGreaterThan(0);
    });
  });
}
