/**
 * Queue clarity (spec 2026-11-18): no ride name sign over an entrance (path clarity removed it), the card of a tapped queue tile (ride name,
 * "Queue: N guests", Open ride) with the queue highlighted, the unlinked-queue marker while a path tool is on, the
 * touching-queues message and card warning, and a line that fills with guests standing along it. Axe with the card
 * open; the card fits 390 × 844 and 812 × 375 at large pseudo-locale text. QC_SHOTS=<dir> saves screenshots.
 */
import { expect, test, type Page } from '@playwright/test';
import { isPhone, newPark, presetSettings, scan, showTile, watchErrors } from './helpers';
import { defaultSettings, serializeSettings } from '../../src/settings/schema';

interface Ride {
  id: number;
  name: string;
  queue: number[];
  entrance?: { gate: number; outside: number };
}
interface QcTc {
  dispatch(c: Record<string, unknown>): { ok: boolean; reason?: string; id?: number };
  step(n: number): void;
  setSpeed(n: number): void;
  camera: { centerX: number; centerY: number; zoom: number };
  tool: { tool: string; selectedEntity: { kind: string; id: number } | null };
  world: { state: { map: { width: number; content: ArrayLike<number> }; rides: Ride[]; guests: Array<{ id: number; state: string }> } };
}
const tc = <T, A>(page: Page, fn: (g: QcTc, a: A) => T, arg: A): Promise<T> =>
  page.evaluate(([src, a]) => new Function('g', 'a', `return (${src as string})(g, a);`)((window as unknown as { __tc: QcTc }).__tc, a), [fn.toString(), arg] as const) as Promise<T>;

/** Park: a road from the entrance, two rides south of it with 4-tile queues up to the road. Returns ride ids and queue tiles. */
interface Built {
  a: number;
  b: number;
  /** Queue tiles (x, y) of ride a, entrance first. */
  qa: Array<[number, number]>;
  qb: Array<[number, number]>;
}
async function buildPark(page: Page): Promise<Built> {
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
      const ride = (defId: string, x: number, name: string): { id: number; q: Array<[number, number]> } => {
        const id = run({ type: 'placeRide', defId, x, y: 49, rotation: 2 }).id as number;
        const r = st.rides.find((q) => q.id === id) as Ride;
        // There is no rename command yet; the sign reads `ride.name` live, as the ride panel title does.
        r.name = name;
        const o = (r.entrance as { outside: number }).outside;
        const ox = o % w;
        const oy = Math.floor(o / w);
        run({ type: 'buildPathLine', x0: ox, y0: oy, x1: ox, y1: 45, kind: 'queue' });
        const q: Array<[number, number]> = [];
        for (let y = oy; y >= 45; y--) q.push([ox, y]);
        run({ type: 'setRideOpen', rideId: id, open: true });
        return { id, q };
      };
      const a = ride('carousel', 24, 'Merry Spin');
      const b = ride('swing_tower', 34, 'Sky Swing');
      return { a: a.id, b: b.id, qa: a.q, qb: b.q };
    },
    null,
  );
}

/** A third ride, Loop Lane, whose entrance queue runs into Merry Spin's line (a queue that touches another's). */
async function addTouchingRide(page: Page, qa: Array<[number, number]>): Promise<void> {
  await tc(page, (g, q) => {
    const st = g.world.state;
    const w = st.map.width;
    const run = (c: Record<string, unknown>): { id?: number } => {
      const res = g.dispatch(c);
      if (!res.ok) throw new Error(`${String(c.type)}: ${res.reason} ${JSON.stringify(c)}`);
      return res;
    };
    const id = run({ type: 'placeRide', defId: 'carousel', x: 28, y: 49, rotation: 2 }).id as number;
    const r = st.rides.find((x) => x.id === id) as Ride;
    r.name = 'Loop Lane';
    const o = (r.entrance as { outside: number }).outside;
    const [qx] = q[0] as [number, number];
    // Up to row 46, then west until it meets Merry Spin's line.
    run({ type: 'buildPathLine', x0: o % w, y0: Math.floor(o / w), x1: o % w, y1: 46, kind: 'queue' });
    run({ type: 'buildPathLine', x0: o % w, y0: 46, x1: qx + 1, y1: 46, kind: 'queue' });
  }, qa);
}

async function frames(page: Page, n = 3): Promise<void> {
  for (let k = 0; k < n; k++) await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => done())));
}

const canvasData = (page: Page, key: string): Promise<string | undefined> => page.evaluate((k) => (document.getElementById('game') as HTMLCanvasElement).dataset[k], key);

/** Page point of map point (fx, fy) on the ground of its tile, `lift` CSS px above it. */
async function mapPoint(page: Page, fx: number, fy: number, lift = 0): Promise<{ x: number; y: number }> {
  return page.evaluate(
    ([px, py, up]) => {
      const g = (window as unknown as { __tc: QcTc & { world: { state: { map: { heights: ArrayLike<number> } } } } }).__tc;
      const map = g.world.state.map;
      const h = map.heights[Math.floor(py) * map.width + Math.floor(px)] ?? 0;
      const canvas = document.getElementById('game') as HTMLCanvasElement;
      const r = canvas.getBoundingClientRect();
      const wx = (px - py) * 32;
      const wy = (px + py) * 16 - h * 8;
      return { x: r.left + (wx - g.camera.centerX) * g.camera.zoom + r.width / 2, y: r.top + (wy - g.camera.centerY) * g.camera.zoom + r.height / 2 - up };
    },
    [fx, fy, lift] as const,
  );
}

/** Tap map point (x + ox, y + oy) of tile (x, y) after bringing the tile into a clear part of the screen. */
async function tapTile(page: Page, x: number, y: number, phone: boolean, ox = 0.5, oy = 0.5, lift = 0): Promise<void> {
  // Toasts (build warnings; large text makes them wide) can sit over the tile: dismiss them first.
  const toast = page.locator('button.toast');
  for (let k = 0; k < 10; k++) {
    await page.waitForTimeout(250);
    if (!(await toast.isVisible())) break;
    await toast.click();
  }
  await showTile(page, x, y);
  await frames(page);
  // The canvas may not start at the window's corner (large text moves it): aim with its own rectangle.
  const p = await mapPoint(page, x + ox, y + oy, lift);
  if (phone) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
  await frames(page);
}

async function shot(page: Page, name: string, phone: boolean): Promise<void> {
  const dir = process.env.QC_SHOTS;
  if (dir) await page.screenshot({ path: `${dir}/${name}-${phone ? 'phone' : 'desktop'}.png` });
}

test.describe('queue clarity', () => {
  test('no name sign over a ride entrance (path clarity removed it)', async ({ page }) => {
    const watch = watchErrors(page);
    await newPark(page);
    await buildPark(page);
    await tc(page, (g) => {
      g.camera.zoom = 1;
      g.camera.centerX = (29 - 47) * 32;
      g.camera.centerY = (29 + 47 + 1) * 16 - 64;
    }, null);
    await frames(page);
    expect(await canvasData(page, 'queueSigns')).toBeUndefined();
    watch.expectNoErrors();
  });

  test('a tap on a queue tile opens its card with the queue highlighted; Open ride opens the ride panel', async ({ page }, info) => {
    const phone = isPhone(info);
    const watch = watchErrors(page);
    await newPark(page);
    const { a, qa } = await buildPark(page);
    const [x, y] = qa[2] as [number, number];
    await tapTile(page, x, y, phone);
    const card = page.getByTestId('queue-card');
    await expect(card).toBeVisible();
    await expect(page.locator('.panel')).toContainText('Merry Spin');
    await expect(page.getByTestId('queue-count')).toHaveText('Queue: 0 guests');
    const sel = await tc(page, (g) => g.tool.selectedEntity, null);
    expect(sel?.kind).toBe('queue');
    // On the phone the card opens low (peek), so the highlighted line stays in view above it.
    if (phone) {
      await expect(page.locator('.panel')).toHaveAttribute('data-sheet', 'peek');
      // The low sheet is no taller than its content: no empty band under its last row (the ride's reach status, path
      // clarity), and Open ride shows above it.
      const panel = await page.locator('.panel').boundingBox();
      const last = await page.getByTestId('reach-status').boundingBox();
      const button = await page.getByTestId('queue-open-ride').boundingBox();
      expect(panel && last && panel.y + panel.height - (last.y + last.height), 'space under the last row').toBeLessThan(40);
      expect(panel && button && button.y + button.height <= panel.y + panel.height, 'Open ride inside the card').toBe(true);
    }
    await shot(page, 'tap-card', phone);
    await scan(page, 'queue card open');
    await page.getByTestId('queue-open-ride').click();
    await expect(page.getByTestId('ride-status')).toBeVisible();
    // The ride panel opens at the usual height again.
    if (phone) await expect(page.locator('.panel')).toHaveAttribute('data-sheet', 'half');
    expect(await tc(page, (g) => g.tool.selectedEntity, null)).toEqual({ kind: 'ride', id: a });
    watch.expectNoErrors();
  });

  test('a queue that reaches no ride: the card says so, and a marker shows while a path tool is on', async ({ page }, info) => {
    const phone = isPhone(info);
    const watch = watchErrors(page);
    await newPark(page);
    await buildPark(page);
    await tc(page, (g) => g.dispatch({ type: 'buildPathLine', x0: 38, y0: 38, x1: 40, y1: 38, kind: 'queue' }), null);
    await tapTile(page, 39, 38, phone);
    await expect(page.getByTestId('queue-card')).toContainText('This queue reaches no ride');
    await expect(page.getByTestId('queue-open-ride')).toBeHidden();
    await expect(page.getByTestId('queue-count')).toBeHidden();
    expect(await canvasData(page, 'queueWarnings')).toBe('0');
    await tc(page, (g) => {
      g.tool.selectedEntity = null;
      g.tool.tool = 'queue';
    }, null);
    await showTile(page, 39, 38);
    await expect.poll(() => canvasData(page, 'queueWarnings')).toBe('1');
    await shot(page, 'unlinked', phone);
    watch.expectNoErrors();
  });

  test('touching queues: a one-time message and a card warning name both rides', async ({ page }, info) => {
    const phone = isPhone(info);
    const watch = watchErrors(page);
    await newPark(page);
    const { qa } = await buildPark(page);
    // A third ride whose entrance queue runs into Merry Spin's line.
    const msg = 'The Loop Lane line touches the Merry Spin line. Guests in it only go to Merry Spin';
    await addTouchingRide(page, qa);
    await expect(page.getByTestId('toast')).toHaveText(msg);
    await page.waitForTimeout(400);
    const [x, y] = qa[1] as [number, number];
    await tapTile(page, x, y, phone);
    await expect(page.getByTestId('queue-card')).toContainText(msg);
    await shot(page, 'touching', phone);
    watch.expectNoErrors();
  });

  test('a busy line fills: every queueing guest stands on the line and the card counts them', async ({ page }, info) => {
    test.setTimeout(120_000);
    const phone = isPhone(info);
    const watch = watchErrors(page);
    await newPark(page);
    const { a, qa } = await buildPark(page);
    const n = await tc(page, (g, id) => {
      g.dispatch({ type: 'setParkOpen', open: true });
      const r = () => g.world.state.rides.find((x) => x.id === id) as Ride;
      for (let k = 0; k < 1500 && r().queue.length < 10; k++) g.step(10);
      return r().queue.length;
    }, a);
    expect(n).toBeGreaterThanOrEqual(10);
    const [x, y] = qa[1] as [number, number];
    // A full line covers the middle of its tiles with guests: tap the queue beside them (the tile's south corner side).
    await tapTile(page, x, y, phone, 0.9, 0.9);
    const counts = await tc(page, (g) => g.world.state.rides.map((r) => r.queue.length), null);
    const total = counts.reduce((s, c) => s + c, 0);
    await expect.poll(() => canvasData(page, 'queueGuests')).toBe(String(total));
    const mine = await tc(page, (g, id) => (g.world.state.rides.find((r) => r.id === id) as Ride).queue.length, a);
    await expect(page.getByTestId('queue-count')).toHaveText(`Queue: ${mine} guests`);
    await shot(page, 'full-line', phone);
    // The front guest stands a third of a tile from the entrance gate, on the first queue tile: a tap on its body opens
    // that guest, although its sim tile is wherever it joined the line.
    await page.locator('.panel .panel-close').click();
    const { front, gx, gy } = await tc(page, (g, id) => {
      const r = g.world.state.rides.find((x) => x.id === id) as Ride;
      const w = g.world.state.map.width;
      const gate = (r.entrance as { gate: number }).gate;
      return { front: r.queue[0] as number, gx: gate % w, gy: Math.floor(gate / w) };
    }, a);
    const [fx, fy] = qa[0] as [number, number];
    await tc(page, (g) => void (g.camera.zoom = 2), null);
    await tapTile(page, fx, fy, phone, 0.5 + (gx - fx) / 3, 0.5 + (gy - fy) / 3, 20);
    expect(await tc(page, (g) => g.tool.selectedEntity, null)).toEqual({ kind: 'guest', id: front });
    await expect(page.getByTestId('queue-card')).toHaveCount(0);
    watch.expectNoErrors();
  });

  for (const [name, vp] of [['390 x 844', { width: 390, height: 844 }], ['812 x 375', { width: 812, height: 375 }]] as const) {
    test(`the queue card fits ${name} at large pseudo-locale text`, async ({ page }, info) => {
      await presetSettings(page, serializeSettings({ ...defaultSettings(), locale: 'en-XA', textScale: 175 }));
      await page.setViewportSize(vp);
      await newPark(page);
      const { qa } = await buildPark(page);
      // The longest card: a touching-queue warning above the count and the button.
      await addTouchingRide(page, qa);
      await tapTile(page, (qa[1] as [number, number])[0], (qa[1] as [number, number])[1], isPhone(info));
      await shot(page, `fit-${vp.width}x${vp.height}`, isPhone(info));
      await expect(page.getByTestId('queue-card')).toBeVisible();
      // Count and Open ride show without scrolling the card.
      const panel = await page.locator('.panel').boundingBox();
      for (const id of ['queue-count', 'queue-open-ride']) {
        const b = await page.getByTestId(id).boundingBox();
        expect(b && panel && b.y >= panel.y && b.y + b.height <= panel.y + panel.height + 1, `${id} inside the open card`).toBe(true);
      }
      const clipped = await page.getByTestId('queue-card').evaluate((root) => {
        const out: string[] = [];
        const vw = window.innerWidth;
        for (const e of [root, ...root.querySelectorAll<HTMLElement>('*')]) {
          if (e.closest('[hidden]')) continue;
          const r = e.getBoundingClientRect();
          if (r.width > 0 && (r.left < -1 || r.right > vw + 1)) out.push(`${e.className} leaves the window`);
          const cs = getComputedStyle(e);
          if ((cs.overflowX !== 'visible' || cs.overflowY !== 'visible') && e.scrollWidth > e.clientWidth + 1 && (e.textContent ?? '').trim()) out.push(`${e.className} clips its text`);
        }
        return out;
      });
      expect(clipped).toEqual([]);
      await scan(page, `queue card ${name} large`);
    });
  }
});
