import { expect, test, type Page } from '@playwright/test';
import { getShowSiteDef } from '../../src/data/catalog';
import { buildShowPlan } from '../../src/render/shows/timeline';
import { centerOn, isPhone, newPark, openTool, setSpeed, tilePoint, watchErrors } from './helpers';

/**
 * After Dark shows (W4-C, Phase 6 §4.4, §7, §9).
 * - Desktop: the Shows picker lists both sites; a site placed on the map opens its panel from Inspect; the panel's
 *   steppers, every-N-days picker, and switch set the schedule; at night guests gather, the show runs, the `shows`
 *   ledger line is charged, beams and fireworks draw, and the panel counts the watchers. Without cash the show is
 *   cancelled with the toast "Not enough cash for the show".
 * - Phone: the picker is a bottom sheet and the panel controls are ≥ 44 × 44 px; with reduced motion the fireworks
 *   draw glow circles, never particles (Phase 6 §9; runs once W4-F wires `prefers-reduced-motion` into the display
 *   prefs, skipped until then).
 * - `TC_SCREENSHOT=1`: saves docs/screenshots/wave4-shows.png (desktop, device scale 2), a night show with guests.
 *
 * Show sites are Phase 6 content, locked until W4-D raises the build phase: when the picker card is locked the spec
 * writes the site into the state through the debug hook (as the Wave 3 screenshots do with lamps); once the card is
 * unlocked it builds through the picker and a click on the map.
 */

interface ShowSiteState {
  id: number;
  defId: string;
  status: string;
  startTick: number;
  lastWatchers: number;
  totals: { shows: number; cost: number; watchers: number };
  schedule: { hour: number; minute: number; everyNDays: number; enabled: boolean };
}

interface ShowGame {
  world: {
    state: {
      tick: number;
      nextId: number;
      park: { cash: number; afterDark: boolean };
      map: { width: number; content: Uint8Array; contentRef: Int32Array; pathItem: Uint8Array };
      management: { weather: { current: string } };
      economy: { ledger: Array<{ lines: Record<string, number> }> };
      guests: Array<{ state: string; showTarget: number }>;
      shows: ShowSiteState[];
    };
  };
  camera: { centerX: number; centerY: number; zoom: number };
  tool: { tool: string };
  settings: { set(key: string, value: unknown): void };
  dispatch(cmd: Record<string, unknown>): { ok: boolean; reason?: string; id?: number };
  step(n: number): void;
  setSpeed(n: number): void;
}

interface ShowDebug {
  frame: { beams: number; rockets: number; particles: number; flashes: number; glows: number };
  totals: { beams: number; rockets: number; particles: number; flashes: number; glows: number; frames: number; reduced: boolean };
}

const DAY = 1200;
const HOUR = 50;
const TOWER = { x: 25, y: 43 };
const LAUNCHER = { x: 38, y: 43 };

/**
 * A small night park through the debug hook: an avenue from the entrance, a loop of paths, four open rides with
 * queues, three stalls, lamps, free entry, open. `lamps` adds the lamps (Phase 4 path items, written directly).
 */
async function buildPark(page: Page, lamps: boolean): Promise<void> {
  await page.evaluate((withLamps) => {
    const g = (window as unknown as { __tc: ShowGame }).__tc;
    g.setSpeed(0);
    const run = (c: Record<string, unknown>): { id?: number } => {
      const r = g.dispatch(c);
      if (!r.ok) throw new Error(`${String(c.type)}: ${r.reason} ${JSON.stringify(c)}`);
      return r;
    };
    const line = (x0: number, y0: number, x1: number, y1: number, kind = 'footpath'): void => {
      run({ type: 'buildPathLine', x0, y0, x1, y1, kind });
    };
    run({ type: 'borrow', amount: 1_000_000 });
    line(31, 59, 31, 40);
    line(20, 48, 42, 48);
    line(20, 40, 42, 40);
    line(20, 41, 20, 47);
    line(42, 41, 42, 47);
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
    if (withLamps) {
      const map = g.world.state.map;
      for (const [x, y] of [[31, 57], [31, 53], [31, 50], [25, 48], [29, 48], [34, 48], [38, 48], [31, 43], [26, 40], [36, 40], [20, 44], [42, 44]] as const) {
        map.pathItem[y * map.width + x] = 3;
      }
    }
    run({ type: 'setEntranceFee', fee: 0 });
    run({ type: 'setParkOpen', open: true });
  }, lamps);
}

/**
 * Write a show site into the state (the picker card is locked until W4-D), then rebuild a path tile so the pathing
 * network refreshes, as `placeShowSite` does with `markNetworkDirty`.
 */
async function writeSite(page: Page, defId: string, x: number, y: number): Promise<number> {
  return page.evaluate(
    ([d, sx, sy]) => {
      const g = (window as unknown as { __tc: ShowGame }).__tc;
      const s = g.world.state;
      const size = d === 'lightshow_tower' ? 2 : 1;
      const id = s.nextId++;
      const site = {
        id,
        defId: d,
        x: sx,
        y: sy,
        rotation: 0,
        schedule: { hour: 21, minute: 0, everyNDays: 1, enabled: false },
        status: 'idle',
        nextShowTick: -1,
        startTick: -1,
        lastWatchers: 0,
        totals: { shows: 0, cost: 0, watchers: 0 },
        totalBuildCost: d === 'lightshow_tower' ? 250_000 : 150_000,
        builtTick: s.tick,
      };
      (s.shows as unknown[]).push(site);
      for (let dy = 0; dy < size; dy++) {
        for (let dx = 0; dx < size; dx++) {
          const t = (sy + dy) * s.map.width + sx + dx;
          s.map.content[t] = 3;
          s.map.contentRef[t] = id;
        }
      }
      // A spur west of the loop, one tile per site written.
      const spur = 43 + s.shows.length;
      const r = g.dispatch({ type: 'buildPathLine', x0: 19, y0: spur, x1: 19, y1: spur, kind: 'footpath' });
      if (!r.ok) throw new Error(r.reason);
      return id;
    },
    [defId, x, y] as const,
  );
}

/** Place a site with the picker and a click when the picker card is unlocked; else write it (see `writeSite`). */
async function placeSite(page: Page, defId: 'lightshow_tower' | 'fireworks_launcher', x: number, y: number): Promise<number> {
  await openTool(page, 'shows');
  const picker = page.getByTestId('show-picker');
  await expect(picker).toBeVisible();
  const card = page.getByTestId(`show-card-${defId}`);
  if (await card.isDisabled()) {
    await expect(card).toContainText('Research Scenery to unlock');
    await page.getByTestId('show-picker-close').click();
    await expect(picker).toBeHidden();
    return writeSite(page, defId, x, y);
  }
  await card.click();
  await expect(picker).toBeHidden();
  await expect(page.getByTestId('show-status')).toContainText(defId === 'lightshow_tower' ? 'Lightshow Tower' : 'Fireworks Launcher');
  await centerOn(page, x, y);
  const p = await tilePoint(page, x, y);
  await page.mouse.move(p.x, p.y);
  await page.mouse.click(p.x, p.y);
  return page.evaluate(() => {
    const shows = (window as unknown as { __tc: ShowGame }).__tc.world.state.shows;
    return (shows[shows.length - 1] as ShowSiteState).id;
  });
}

/** Run the clock to `hour` (and `minute`) of the next day that has it, plus `extra` ticks. */
async function clockTo(page: Page, hour: number, minute = 0, extra = 0): Promise<void> {
  await page.evaluate(
    ([h, m, x, day, hr]) => {
      const g = (window as unknown as { __tc: ShowGame }).__tc;
      const now = g.world.state.tick;
      const tod = h * hr + (m * hr) / 60;
      let target = Math.floor(now / day) * day + tod;
      if (target < now) target += day;
      g.step(target - now + x);
      g.world.state.management.weather.current = 'sunny';
    },
    [hour, minute, extra, DAY, HOUR] as const,
  );
}

async function site(page: Page, id: number): Promise<ShowSiteState> {
  return page.evaluate((sid) => {
    const s = (window as unknown as { __tc: ShowGame }).__tc.world.state.shows.find((x) => x.id === sid);
    if (!s) throw new Error('no site');
    return JSON.parse(JSON.stringify(s)) as ShowSiteState;
  }, id);
}

async function debug(page: Page): Promise<ShowDebug> {
  return page.evaluate(async () => {
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    return JSON.parse(JSON.stringify((window as unknown as { __tcShows: ShowDebug }).__tcShows)) as ShowDebug;
  });
}

test.describe('After Dark shows: desktop', () => {
  test.beforeEach(() => test.skip(isPhone(test.info()), 'desktop flow'));

  test('picker, site panel schedule, and a night show that gathers guests and charges the shows line', async ({ page }) => {
    test.setTimeout(120_000);
    const watch = watchErrors(page);
    await newPark(page, 'Show Park');
    await setSpeed(page, 'Pause');
    await openTool(page, 'shows');
    await expect(page.getByTestId('show-picker')).toBeVisible();
    await expect(page.getByTestId('show-card-lightshow_tower')).toContainText('Lightshow Tower');
    await expect(page.getByTestId('show-card-lightshow_tower')).toContainText('$150 per show');
    await expect(page.getByTestId('show-card-fireworks_launcher')).toContainText('Fireworks Launcher');
    await expect(page.getByTestId('show-card-fireworks_launcher')).toContainText('12 tile view');
    await page.getByTestId('show-picker-close').click();

    await buildPark(page, false);
    const tower = await placeSite(page, 'lightshow_tower', TOWER.x, TOWER.y);

    // Inspect the tower: its panel opens with a switched-off schedule.
    await openTool(page, 'inspect');
    await centerOn(page, TOWER.x, TOWER.y);
    const p = await tilePoint(page, TOWER.x + 1, TOWER.y + 1);
    await page.mouse.click(p.x, p.y);
    const panel = page.getByTestId('show-panel');
    await expect(panel).toBeVisible();
    await expect(page.getByTestId('show-state')).toHaveText('Off');
    await expect(page.getByTestId('show-hour')).toHaveText('21');
    await expect(page.getByTestId('show-minute')).toHaveText('00');
    await expect(page.getByTestId('show-minute-down')).toBeDisabled();
    await page.getByTestId('show-hour-down').click();
    await page.getByTestId('show-minute-up').click();
    await expect(page.getByTestId('show-hour')).toHaveText('20');
    await expect(page.getByTestId('show-minute')).toHaveText('30');
    await expect(page.getByTestId('show-hour-down')).toBeDisabled();
    await page.getByTestId('show-days-2').click();
    await expect(page.getByTestId('show-days-2')).toHaveAttribute('aria-checked', 'true');
    await page.getByTestId('show-days-1').click();
    const sw = page.getByTestId('show-enabled');
    await expect(sw).toHaveText('Shows: Off');
    await sw.click();
    await expect(sw).toHaveText('Shows: On');
    await expect(sw).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('show-state')).toHaveText(/^Next show (today|tomorrow) at 20:30$/);
    await expect(page.getByTestId('show-cost-per-show')).toContainText('$150');
    expect((await site(page, tower)).schedule).toEqual({ hour: 20, minute: 30, everyNDays: 1, enabled: true });

    // Evening: guests gather at the announcement, then the show runs.
    await clockTo(page, 19, 30, 1);
    await expect(page.getByTestId('show-state')).toHaveText('Guests are gathering for the 20:30 show');
    const gathered = await page.evaluate((id) => (window as unknown as { __tc: ShowGame }).__tc.world.state.guests.filter((x) => x.showTarget === id).length, tower);
    expect(gathered).toBeGreaterThan(0);
    const shows0 = await page.evaluate(() => (window as unknown as { __tc: ShowGame }).__tc.world.state.economy.ledger.reduce((a, m) => a + (m.lines.shows ?? 0), 0));
    await clockTo(page, 20, 30, 60);
    await expect(page.getByTestId('show-state')).toHaveText('Show running');
    await expect(page.getByTestId('show-total-cost')).toContainText('$150');
    const running = await site(page, tower);
    expect(running.status).toBe('running');
    expect(running.totals.cost).toBe(15_000);
    const shows1 = await page.evaluate(() => (window as unknown as { __tc: ShowGame }).__tc.world.state.economy.ledger.reduce((a, m) => a + (m.lines.shows ?? 0), 0));
    expect(shows1 - shows0).toBeLessThanOrEqual(-15_000);
    const watching = await page.evaluate(() => (window as unknown as { __tc: ShowGame }).__tc.world.state.guests.filter((x) => x.state === 'watchingShow').length);
    expect(watching).toBeGreaterThan(0);
    // The beams draw.
    await centerOn(page, TOWER.x, TOWER.y);
    const before = await debug(page);
    const after = await debug(page);
    expect(after.totals.beams).toBeGreaterThan(before.totals.beams);
    expect(after.frame.beams).toBe(6);

    // After the show: the watchers are counted.
    await clockTo(page, 3, 0, 0);
    const done = await site(page, tower);
    expect(done.totals.shows).toBe(1);
    expect(done.lastWatchers).toBeGreaterThan(0);
    await expect(page.getByTestId('show-last-watchers')).toContainText(String(done.lastWatchers));
    watch.expectNoErrors();
  });

  test('a show without cash is cancelled with the toast "Not enough cash for the show"', async ({ page }) => {
    test.setTimeout(90_000);
    const watch = watchErrors(page);
    await newPark(page, 'Broke Park');
    await setSpeed(page, 'Pause');
    await buildPark(page, false);
    const launcher = await placeSite(page, 'fireworks_launcher', LAUNCHER.x, LAUNCHER.y);
    await page.evaluate((id) => {
      const g = (window as unknown as { __tc: ShowGame }).__tc;
      g.dispatch({ type: 'setShowSchedule', id, hour: 21, minute: 0, everyNDays: 1 });
      g.dispatch({ type: 'setShowEnabled', id, enabled: true });
    }, launcher);
    await clockTo(page, 20, 30, 24);
    await page.evaluate(() => {
      (window as unknown as { __tc: ShowGame }).__tc.world.state.park.cash = 100;
    });
    await clockTo(page, 21, 0, 2);
    await expect(page.getByTestId('toast').filter({ hasText: 'Not enough cash for the show' })).toBeVisible();
    const s = await site(page, launcher);
    expect(s.totals).toEqual({ shows: 0, cost: 0, watchers: 0 });
    expect(s.status).toBe('idle');
    watch.expectNoErrors();
  });
});

test.describe('After Dark shows: phone', () => {
  test.beforeEach(() => test.skip(!isPhone(test.info()), 'phone flow'));

  test('the picker is a bottom sheet; the show site panel controls are at least 44 × 44 px', async ({ page }) => {
    test.setTimeout(90_000);
    const watch = watchErrors(page);
    await newPark(page, 'Pocket Shows');
    await setSpeed(page, 'Pause');
    await openTool(page, 'shows');
    const picker = page.getByTestId('show-picker');
    await expect(picker).toBeVisible();
    const vp = page.viewportSize();
    const box = await picker.boundingBox();
    if (!vp || !box) throw new Error('no layout');
    expect(box.width).toBeGreaterThan(vp.width - 4);
    for (const id of ['show-card-lightshow_tower', 'show-card-fireworks_launcher', 'show-picker-close']) {
      const b = await page.getByTestId(id).boundingBox();
      expect(b?.width ?? 0).toBeGreaterThanOrEqual(44);
      expect(b?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
    await page.getByTestId('show-picker-close').click();
    await buildPark(page, false);
    const tower = await placeSite(page, 'lightshow_tower', TOWER.x, TOWER.y);
    await page.evaluate((id) => {
      (window as unknown as { __tc: { tool: { selectedEntity: unknown } } }).__tc.tool.selectedEntity = { kind: 'showSite', id };
    }, tower);
    await expect(page.getByTestId('show-panel')).toBeVisible();
    for (const id of ['show-hour-down', 'show-hour-up', 'show-minute-down', 'show-minute-up', 'show-days-1', 'show-days-2', 'show-days-3', 'show-enabled']) {
      const el = page.getByTestId(id);
      await el.scrollIntoViewIfNeeded();
      const b = await el.boundingBox();
      expect(b?.width ?? 0, id).toBeGreaterThanOrEqual(44);
      expect(b?.height ?? 0, id).toBeGreaterThanOrEqual(44);
    }
    await page.getByTestId('show-enabled').tap();
    await expect(page.getByTestId('show-enabled')).toHaveText('Shows: On');
    watch.expectNoErrors();
  });

  test('reduced motion: the fireworks draw glow circles instead of bursts', async ({ page }) => {
    test.setTimeout(120_000);
    const watch = watchErrors(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await newPark(page, 'Calm Night');
    await setSpeed(page, 'Pause');
    await page.evaluate(() => (window as unknown as { __tc: ShowGame }).__tc.settings.set('reducedMotion', 'on'));
    await buildPark(page, false);
    const launcher = await writeSite(page, 'fireworks_launcher', LAUNCHER.x, LAUNCHER.y);
    await page.evaluate((id) => {
      const g = (window as unknown as { __tc: ShowGame }).__tc;
      g.dispatch({ type: 'setShowSchedule', id, hour: 21, minute: 0, everyNDays: 1 });
      g.dispatch({ type: 'setShowEnabled', id, enabled: true });
    }, launcher);
    await centerOn(page, LAUNCHER.x, LAUNCHER.y - 6);
    const probe = await debug(page);
    test.skip(!probe.totals.reduced, 'display prefs follow prefers-reduced-motion once W4-F wires mountA11y');
    await clockTo(page, 21, 0, 0);
    const before = await debug(page);
    // Step through the show a few ticks per frame and let each frame draw.
    for (let k = 0; k < 60; k++) {
      await page.evaluate(() => (window as unknown as { __tc: ShowGame }).__tc.step(6));
      await debug(page);
    }
    const after = await debug(page);
    expect((await site(page, launcher)).totals.shows).toBe(1);
    expect(after.totals.particles - before.totals.particles).toBe(0);
    expect(after.totals.rockets - before.totals.rockets).toBe(0);
    expect(after.totals.glows - before.totals.glows).toBeGreaterThan(0);
    watch.expectNoErrors();
  });
});

test.describe('After Dark shows screenshot', () => {
  test.use({ deviceScaleFactor: 2 });
  test('a night show with beams, fireworks, and guests watching', async ({ page }, info) => {
    test.skip(!process.env.TC_SCREENSHOT || info.project.name !== 'desktop', 'set TC_SCREENSHOT=1 to refresh the screenshot');
    test.setTimeout(240_000);
    const errors = watchErrors(page);
    await newPark(page, 'Starlight Park');
    await setSpeed(page, 'Pause');
    await buildPark(page, true);
    const tower = await writeSite(page, 'lightshow_tower', TOWER.x, TOWER.y);
    const launcher = await writeSite(page, 'fireworks_launcher', LAUNCHER.x, LAUNCHER.y);
    await page.evaluate(
      ([t, l]) => {
        const g = (window as unknown as { __tc: ShowGame }).__tc;
        for (const id of [t, l]) {
          g.dispatch({ type: 'setShowSchedule', id, hour: 21, minute: 0, everyNDays: 1 });
          g.dispatch({ type: 'setShowEnabled', id, enabled: true });
        }
      },
      [tower, launcher] as const,
    );
    // Let the park fill through the day and the next evening, then start the shows.
    await clockTo(page, 21, 0, DAY);
    await page.evaluate(() => {
      const g = (window as unknown as { __tc: ShowGame }).__tc;
      g.camera.zoom = 1;
      g.camera.centerX = (31 - 40) * 32;
      g.camera.centerY = (31 + 40) * 16 - 8 * 8 - 160;
    });
    // The show is the same every replay (render RNG seeded by the site id and start tick): pick the finale tick with
    // the most sparks spread out mid-burst while the beams still sweep, and step there.
    const start = await page.evaluate(() => (window as unknown as { __tc: ShowGame }).__tc.world.state.tick);
    const def = getShowSiteDef('fireworks_launcher');
    if (!def) throw new Error('no def');
    const plan = buildShowPlan({ id: launcher, startTick: start, defId: def.id }, def);
    let bestT = 260;
    let best = -1;
    for (let t = 200; t < 290; t++) {
      let score = 0;
      for (const k of plan.rockets) if (t - k.burstAt >= 12 && t - k.burstAt <= 26) score += k.count;
      if (score > best) {
        best = score;
        bestT = t;
      }
    }
    await page.evaluate((n) => {
      const g = (window as unknown as { __tc: ShowGame }).__tc;
      g.step(n);
      g.world.state.management.weather.current = 'sunny';
    }, bestT);
    const shown = await debug(page);
    expect(shown.frame.beams).toBe(6);
    expect(shown.frame.particles).toBeGreaterThan(40);
    const summary = await page.evaluate(() => {
      const s = (window as unknown as { __tc: ShowGame }).__tc.world.state;
      return { watching: s.guests.filter((g) => g.state === 'watchingShow').length, guests: s.guests.length, statuses: s.shows.map((x) => x.status) };
    });
    expect(summary.statuses).toEqual(['running', 'running']);
    expect(summary.watching).toBeGreaterThan(5);
    await page.waitForTimeout(3500);
    const dismiss = page.locator('.msg-toast:not([hidden]) .icon-btn');
    while ((await dismiss.count()) > 0) await dismiss.first().click();
    await page.screenshot({ path: 'docs/screenshots/wave4-shows.png' });
    errors.expectNoErrors();
  });
});
