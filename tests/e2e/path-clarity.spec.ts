/**
 * Path clarity (spec 2026-11-18): the reach status line in the ride panel and the queue card for every status, Show me
 * (closes the panel, brings the spot into view, pulses it), the path tools' glows and dimming, and the one-time tip.
 * Axe with each status; the status line and the tip fit 390 × 844, 360 × 640 and 812 × 375 at normal and large text.
 * PC_SHOTS=<dir> saves screenshots.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { isPhone, newPark, pickCard, presetSettings, scan, showTile, stepPx, watchErrors } from './helpers';
import { defaultSettings, serializeSettings } from '../../src/settings/schema';

interface Ride {
  id: number;
  name: string;
  status: string;
  entrance?: { gate: number; outside: number };
}
interface PcTc {
  dispatch(c: Record<string, unknown>): { ok: boolean; reason?: string; id?: number };
  setSpeed(n: number): void;
  camera: { centerX: number; centerY: number; zoom: number };
  tool: { tool: string; selectedEntity: { kind: string; id: number } | null; pathFocus: { tile: number; until: number } | null };
  world: { state: { map: { width: number; heights: ArrayLike<number>; content: ArrayLike<number> }; rides: Ride[] } };
}
const tc = <T, A>(page: Page, fn: (g: PcTc, a: A) => T, arg: A): Promise<T> =>
  page.evaluate(([src, a]) => new Function('g', 'a', `return (${src as string})(g, a);`)((window as unknown as { __tc: PcTc }).__tc, a), [fn.toString(), arg] as const) as Promise<T>;

async function frames(page: Page, n = 3): Promise<void> {
  for (let k = 0; k < n; k++) await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => done())));
}

const canvasData = (page: Page, key: string): Promise<string | undefined> => page.evaluate((k) => (document.getElementById('game') as HTMLCanvasElement).dataset[k], key);

async function shot(page: Page, name: string, phone: boolean): Promise<void> {
  const dir = process.env.PC_SHOTS;
  if (dir) await page.screenshot({ path: `${dir}/${name}-${phone ? 'phone' : 'desktop'}.png` });
}

/** The road from the park entrance (north to row 44, then along it) and a carousel south of it with no queue yet. */
interface Park {
  ride: number;
  /** The tile outside the entrance gate (x, y). */
  ox: number;
  oy: number;
}
async function buildPark(page: Page): Promise<Park> {
  return tc(
    page,
    (g) => {
      g.setSpeed(0);
      const st = g.world.state;
      const w = st.map.width;
      const run = (c: Record<string, unknown>): { id?: number } => {
        const r = g.dispatch(c);
        if (!r.ok) throw new Error(`${String(c.type)}: ${r.reason} ${JSON.stringify(c)}`);
        return r;
      };
      run({ type: 'buildPathLine', x0: 31, y0: 59, x1: 31, y1: 44, kind: 'footpath' });
      run({ type: 'buildPathLine', x0: 20, y0: 44, x1: 42, y1: 44, kind: 'footpath' });
      const id = run({ type: 'placeRide', defId: 'carousel', x: 24, y: 49, rotation: 2 }).id as number;
      const r = st.rides.find((q) => q.id === id) as Ride;
      r.name = 'Merry Spin';
      const o = (r.entrance as { outside: number }).outside;
      return { ride: id, ox: o % w, oy: Math.floor(o / w) };
    },
    null,
  );
}

const run = (page: Page, c: Record<string, unknown>): Promise<void> =>
  tc(page, (g, cmd) => {
    const r = g.dispatch(cmd);
    if (!r.ok) throw new Error(`${String(cmd.type)}: ${r.reason}`);
  }, c);

async function openRide(page: Page, id: number): Promise<void> {
  await tc(page, (g, rid) => void (g.tool.selectedEntity = { kind: 'ride', id: rid }), id);
  await expect(page.getByTestId('reach-status')).toBeVisible();
}

async function expectStatus(scope: Locator, status: string, text: string, showMe: boolean): Promise<void> {
  const row = scope.getByTestId('reach-status');
  await expect(row).toHaveAttribute('data-status', status);
  await expect(row.getByTestId('reach-text')).toHaveText(text);
  if (showMe) await expect(row.getByTestId('reach-show-me')).toBeVisible();
  else await expect(row.getByTestId('reach-show-me')).toBeHidden();
}

/** Texts an element of `root` clips, and parts that leave the window. */
async function badFit(root: Locator): Promise<string[]> {
  return root.evaluate((el) => {
    const out: string[] = [];
    const vw = window.innerWidth;
    for (const e of [el as HTMLElement, ...el.querySelectorAll<HTMLElement>('*')]) {
      if (e.closest('[hidden], .sr-only')) continue;
      const r = e.getBoundingClientRect();
      if (r.width > 0 && (r.left < -1 || r.right > vw + 1)) out.push(`${e.className} leaves the window`);
      const cs = getComputedStyle(e);
      if ((cs.overflowX !== 'visible' || cs.overflowY !== 'visible') && (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1) && (e.textContent ?? '').trim()) out.push(`${e.className} clips its text`);
    }
    return out;
  });
}

test.describe('path clarity', () => {
  test('the ride panel and the queue card show each status in turn, first failing step first', async ({ page }, info) => {
    const phone = isPhone(info);
    const watch = watchErrors(page);
    await newPark(page);
    const { ride, ox, oy } = await buildPark(page);
    await showTile(page, ox, oy - 2);
    await openRide(page, ride);
    const panel = page.locator('.panel');
    await expectStatus(panel, 'noQueue', 'No queue at the entrance', true);
    await shot(page, '1-no-queue', phone);
    await scan(page, 'status: no queue');
    // A queue that stops short of the road.
    await run(page, { type: 'buildPathLine', x0: ox, y0: oy, x1: ox, y1: 46, kind: 'queue' });
    await expectStatus(panel, 'noFootpath', 'No footpath reaches the queue', true);
    await shot(page, '2-no-footpath', phone);
    await scan(page, 'status: no footpath');
    // One footpath tile joins the queue's end to the road.
    await run(page, { type: 'buildPathLine', x0: ox, y0: 45, x1: ox, y1: 45, kind: 'footpath' });
    await expectStatus(panel, 'closed', 'The ride is closed', false);
    await shot(page, '3-closed', phone);
    await scan(page, 'status: closed');
    await run(page, { type: 'setRideOpen', rideId: ride, open: true });
    await expectStatus(panel, 'ok', 'Guests can reach this ride', false);
    await shot(page, '4-ok', phone);
    await scan(page, 'status: ok');
    // The queue card of the same line says the same.
    const key = (oy * 64 + ox) * 1024;
    await tc(page, (g, k) => void (g.tool.selectedEntity = { kind: 'queue', id: k }), key);
    await expect(page.getByTestId('queue-card')).toBeVisible();
    await expectStatus(page.getByTestId('queue-card'), 'ok', 'Guests can reach this ride', false);
    await run(page, { type: 'setRideOpen', rideId: ride, open: false });
    await expectStatus(page.getByTestId('queue-card'), 'closed', 'The ride is closed', false);
    await scan(page, 'queue card with status');
    watch.expectNoErrors();
  });

  test('Show me closes the panel, brings the gap into view and pulses it for a few seconds', async ({ page }, info) => {
    const phone = isPhone(info);
    const watch = watchErrors(page);
    await newPark(page);
    const { ride, ox, oy } = await buildPark(page);
    await run(page, { type: 'buildPathLine', x0: ox, y0: oy, x1: ox, y1: 46, kind: 'queue' });
    // Look somewhere else first.
    await showTile(page, 50, 20);
    await openRide(page, ride);
    await expectStatus(page.locator('.panel'), 'noFootpath', 'No footpath reaches the queue', true);
    const button = page.getByTestId('reach-show-me');
    if (phone) await button.tap();
    else await button.click();
    await expect(page.locator('.panel')).toBeHidden();
    await expect(page.getByTestId('reach-status')).toHaveCount(0);
    expect(await tc(page, (g) => g.tool.selectedEntity, null)).toBeNull();
    const end = 46 * 64 + ox;
    await expect.poll(() => canvasData(page, 'pathFocus')).toBe(String(end));
    await frames(page);
    // The queue's open end is on screen, well inside the window.
    const step = await stepPx(page);
    const p = await page.evaluate(([tx, ty, sp]) => {
      const g = (window as unknown as { __tc: PcTc }).__tc;
      const h = g.world.state.map.heights[ty * 64 + tx] ?? 0;
      const r = (document.getElementById('game') as HTMLCanvasElement).getBoundingClientRect();
      return { x: r.left + ((tx - ty) * 32 - g.camera.centerX) * g.camera.zoom + r.width / 2, y: r.top + ((tx + ty + 1) * 16 - h * sp - g.camera.centerY) * g.camera.zoom + r.height / 2 };
    }, [ox, 46, step] as const);
    const vp = page.viewportSize() as { width: number; height: number };
    expect(p.x).toBeGreaterThan(vp.width * 0.2);
    expect(p.x).toBeLessThan(vp.width * 0.8);
    expect(p.y).toBeGreaterThan(vp.height * 0.15);
    expect(p.y).toBeLessThan(vp.height * 0.75);
    await page.waitForTimeout(250);
    await shot(page, '5-show-me', phone);
    // The pulse ends after about 3 s.
    await expect.poll(() => canvasData(page, 'pathFocus'), { timeout: 6000 }).toBe('');
    // No queue at all: Show me points at the tile outside the entrance.
    await run(page, { type: 'demolish', x: ox, y: oy });
    await openRide(page, ride);
    await expectStatus(page.locator('.panel'), 'noQueue', 'No queue at the entrance', true);
    await page.getByTestId('reach-show-me').click();
    await expect.poll(() => canvasData(page, 'pathFocus')).toBe(String(oy * 64 + ox));
    watch.expectNoErrors();
  });

  test('the path tools make entrances with no queue and unreached queue ends glow and dim cut-off footpaths', async ({ page }, info) => {
    const phone = isPhone(info);
    const watch = watchErrors(page);
    await newPark(page);
    const { ox, oy } = await buildPark(page);
    // Merry Spin's queue stops short of the road; Sky Swing has no queue; a footpath beside them reaches nothing.
    await run(page, { type: 'buildPathLine', x0: ox, y0: oy, x1: ox, y1: 46, kind: 'queue' });
    await tc(page, (g) => {
      const r = g.dispatch({ type: 'placeRide', defId: 'swing_tower', x: 34, y: 49, rotation: 2 });
      if (!r.ok) throw new Error(String(r.reason));
      g.dispatch({ type: 'buildPathLine', x0: 21, y0: 47, x1: 21, y1: 49, kind: 'footpath' });
    }, null);
    await showTile(page, 28, 47);
    await frames(page);
    expect(await canvasData(page, 'pathGlows')).toBe('0');
    expect(await canvasData(page, 'pathDimmed')).toBe('0');
    for (const tool of ['footpath', 'queue']) {
      await tc(page, (g, t) => void (g.tool.tool = t), tool);
      await expect.poll(() => canvasData(page, 'pathGlows')).toBe('2');
      await expect.poll(() => canvasData(page, 'pathDimmed')).toBe('3');
    }
    await shot(page, '6-queue-tool', phone);
    // Joining the cut-off footpath and the queue end to the road takes their marks away.
    await run(page, { type: 'buildPathLine', x0: 21, y0: 45, x1: 21, y1: 46, kind: 'footpath' });
    await expect.poll(() => canvasData(page, 'pathDimmed')).toBe('0');
    await run(page, { type: 'buildPathLine', x0: ox, y0: 45, x1: ox, y1: 45, kind: 'footpath' });
    await expect.poll(() => canvasData(page, 'pathGlows')).toBe('1');
    await tc(page, (g) => void (g.tool.tool = 'inspect'), null);
    await expect.poll(() => canvasData(page, 'pathGlows')).toBe('0');
    watch.expectNoErrors();
  });

  test('the first ride placed shows the tip once, in the queue builder', async ({ page }, info) => {
    const phone = isPhone(info);
    const watch = watchErrors(page);
    await newPark(page);
    await tc(page, (g) => g.setSpeed(0), null);
    const tip = page.getByTestId('chain-tip');
    await pickCard(page, 'flat', 'carousel', { tap: phone });
    const p = await showTile(page, 30, 40);
    await frames(page);
    if (phone) await page.touchscreen.tap(p.x, p.y);
    else await page.mouse.click(p.x, p.y);
    // A tap holds the ride on the map for Confirm; a mouse click places it at once.
    if (phone) await page.getByRole('button', { name: 'Confirm', exact: true }).tap();
    await expect.poll(() => tc(page, (g) => g.tool.tool, null)).toBe('queue');
    await expect(tip).toBeVisible();
    await expect(tip).toHaveText('Guests walk: park entrance → footpath → queue → ride. Build a queue from the glowing entrance, then a footpath to its end. Dimmed paths are not connected to the park entrance');
    // The Shift tip waits while this one shows.
    await expect(page.getByTestId('path-tip')).toBeHidden();
    await expect.poll(() => canvasData(page, 'pathGlows')).toBe('1');
    await shot(page, '7-tip', phone);
    await scan(page, 'chain tip');
    await page.getByTestId('chain-tip-close').click();
    await expect(tip).toBeHidden();
    // A second ride, then a new page load: it never comes back.
    await page.getByTestId('path-done').click();
    await tc(page, (g) => g.dispatch({ type: 'placeRide', defId: 'swing_tower', x: 40, y: 40, rotation: 0 }), null);
    await tc(page, (g) => void (g.tool.tool = 'queue'), null);
    await frames(page);
    await expect(tip).toBeHidden();
    await newPark(page);
    await tc(page, (g) => {
      g.dispatch({ type: 'placeRide', defId: 'carousel', x: 30, y: 40, rotation: 0 });
      g.tool.tool = 'queue';
    }, null);
    await frames(page);
    await expect(page.getByTestId('path-panel')).toBeVisible();
    await expect(tip).toBeHidden();
    watch.expectNoErrors();
  });

  for (const vp of [
    { width: 390, height: 844 },
    { width: 360, height: 640 },
    { width: 812, height: 375 },
  ]) {
    for (const large of [false, true]) {
      test(`the status line and the tip fit ${vp.width} x ${vp.height}${large ? ' at large pseudo-locale text' : ''}`, async ({ page }, info) => {
        test.skip(!isPhone(info), 'phone sizes');
        if (large) await presetSettings(page, serializeSettings({ ...defaultSettings(), locale: 'en-XA', textScale: 175 }));
        await page.setViewportSize(vp);
        await newPark(page);
        const { ride, ox, oy } = await buildPark(page);
        await run(page, { type: 'buildPathLine', x0: ox, y0: oy, x1: ox, y1: 46, kind: 'queue' });
        await openRide(page, ride);
        const row = page.getByTestId('reach-status');
        await expect(row.getByTestId('reach-show-me')).toBeVisible();
        await shot(page, `fit-status-${vp.width}x${vp.height}${large ? '-large' : ''}`, true);
        // The status shows without scrolling the panel (it is the panel's first row). Show me too, except in the
        // short half sheet of a 360 × 640 phone at large text, where it is one short scroll down.
        const panel = await page.locator('.panel').boundingBox();
        const inside = async (el: Locator): Promise<boolean> => {
          const b = await el.boundingBox();
          return !!b && !!panel && b.y >= panel.y - 1 && b.y + b.height <= panel.y + panel.height + 1;
        };
        expect(await inside(row.getByTestId('reach-text')), 'status inside the open panel').toBe(true);
        if (!(large && vp.height < 700)) expect(await inside(row.getByTestId('reach-show-me')), 'Show me inside the open panel').toBe(true);
        else {
          await row.getByTestId('reach-show-me').scrollIntoViewIfNeeded();
          expect(await row.getByTestId('reach-show-me').isVisible()).toBe(true);
        }
        expect(await badFit(row)).toEqual([]);
        await scan(page, `status ${vp.width}x${vp.height}`);
        // The tip in the path builder row.
        await page.locator('.panel .panel-close').click();
        await tc(page, (g) => {
          g.dispatch({ type: 'placeRide', defId: 'swing_tower', x: 36, y: 49, rotation: 2 });
          g.tool.tool = 'queue';
        }, null);
        const tip = page.getByTestId('chain-tip');
        await expect(tip).toBeVisible();
        expect(await badFit(page.getByTestId('path-panel'))).toEqual([]);
        const tb = await tip.boundingBox();
        expect(tb && tb.y >= 0 && tb.y + tb.height <= vp.height, 'tip inside the window').toBe(true);
        await shot(page, `fit-tip-${vp.width}x${vp.height}${large ? '-large' : ''}`, true);
        // en-XA only: the path builder's Slope button (not this feature) has a visible label that is not part of its
        // pseudo-localised accessible name; the English scan of the same row is clean.
        if (!large) await scan(page, `tip ${vp.width}x${vp.height}`);
      });
    }
  }
});
