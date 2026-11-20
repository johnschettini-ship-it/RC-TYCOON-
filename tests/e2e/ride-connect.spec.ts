/**
 * Auto-connect in the reach status line (owner 2026-11-19, review fixes 2026-11-20): one status line with Show me and
 * "Connect it ($cost)"; the confirm panel with the cost; Cancel builds nothing; Build connects and charges the cost;
 * Undo takes it back with a full refund; no route and a short purse say why. A placed ride's panel never covers the
 * queue builder. RC_SHOTS=<dir> saves screenshots.
 */
import { expect, test, type Page } from '@playwright/test';
import { isPhone, newPark, pickCard, scan, showTile, watchErrors } from './helpers';

interface Ride {
  id: number;
  status: string;
  entrance?: { gate: number; outside: number };
}
interface RcTc {
  dispatch(c: Record<string, unknown>): { ok: boolean; reason?: string; id?: number };
  setSpeed(n: number): void;
  tool: { tool: string; selectedEntity: { kind: string; id: number } | null };
  world: { state: { park: { cash: number }; map: { width: number; content: ArrayLike<number> }; rides: Ride[] } };
}
const tc = <T, A>(page: Page, fn: (g: RcTc, a: A) => T, arg: A): Promise<T> =>
  page.evaluate(([src, a]) => new Function('g', 'a', `return (${src as string})(g, a);`)((window as unknown as { __tc: RcTc }).__tc, a), [fn.toString(), arg] as const) as Promise<T>;

async function shot(page: Page, name: string, phone: boolean): Promise<void> {
  const dir = process.env.RC_SHOTS;
  if (dir) await page.screenshot({ path: `${dir}/${name}-${phone ? 'phone' : 'desktop'}.png` });
}

/** A road from the park entrance north to row 44, then along it; a carousel south of it, no queue. */
async function buildPark(page: Page, road = true): Promise<{ ride: number; ox: number; oy: number }> {
  return tc(
    page,
    (g, withRoad) => {
      g.setSpeed(0);
      const st = g.world.state;
      const w = st.map.width;
      const run = (c: Record<string, unknown>): { id?: number } => {
        const r = g.dispatch(c);
        if (!r.ok) throw new Error(`${String(c.type)}: ${r.reason}`);
        return r;
      };
      if (withRoad) {
        run({ type: 'buildPathLine', x0: 31, y0: 59, x1: 31, y1: 44, kind: 'footpath' });
        run({ type: 'buildPathLine', x0: 20, y0: 44, x1: 42, y1: 44, kind: 'footpath' });
      }
      const id = run({ type: 'placeRide', defId: 'carousel', x: 24, y: withRoad ? 49 : 20, rotation: 2 }).id as number;
      const o = (st.rides.find((q) => q.id === id) as Ride).entrance!.outside;
      return { ride: id, ox: o % w, oy: Math.floor(o / w) };
    },
    road,
  );
}

async function openRide(page: Page, id: number): Promise<void> {
  await tc(page, (g, rid) => void (g.tool.selectedEntity = { kind: 'ride', id: rid }), id);
  await expect(page.getByTestId('reach-status')).toBeVisible();
}

const cash = (page: Page): Promise<number> => tc(page, (g) => g.world.state.park.cash, null);
const status = (page: Page): Promise<string | null> => page.getByTestId('reach-status').getAttribute('data-status');

async function press(page: Page, testId: string, phone: boolean): Promise<void> {
  const b = page.getByTestId(testId);
  if (phone) await b.tap();
  else await b.click();
}

test.describe('auto-connect in the reach status line', () => {
  test('one line: status, Show me and Connect it ($cost); confirm with the cost, Cancel, Build, Undo', async ({ page }, info) => {
    const phone = isPhone(info);
    const watch = watchErrors(page);
    await newPark(page);
    const { ride, ox, oy } = await buildPark(page);
    await showTile(page, ox, oy - 2);
    await openRide(page, ride);
    const panel = page.locator('.panel');
    // One status line in the panel, holding both actions; the old separate section is gone.
    await expect(panel.getByTestId('reach-status')).toHaveCount(1);
    await expect(panel.getByTestId('path-connect-hint')).toHaveCount(0);
    const row = panel.getByTestId('reach-status');
    await expect(row).toHaveAttribute('data-status', 'noQueue');
    await expect(row.getByTestId('reach-show-me')).toBeVisible();
    const connect = row.getByTestId('reach-connect');
    await expect(connect).toBeVisible();
    await expect(connect).toHaveText(/^Connect it \(\$\d+\)$/);
    const cost = Number((await connect.textContent())!.replace(/\D/g, '')) * 100;
    expect(cost).toBeGreaterThan(0);
    const box = (await connect.boundingBox())!;
    if (phone) expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
    await shot(page, '1-connect-offer', phone);
    await scan(page, 'reach line with Connect');

    // The confirm panel says the cost; Cancel builds nothing.
    const before = await cash(page);
    await press(page, 'reach-connect', phone);
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.dialog-title')).toHaveText(`Build the paths this ride needs for $${cost / 100}?`);
    await expect(dialog.getByTestId('connect-detail')).toHaveText(/^Queue: \d+ tiles · Footpath: \d+ tiles$/);
    await shot(page, '2-connect-confirm', phone);
    await scan(page, 'connect confirm');
    await press(page, 'confirm-no', phone);
    await expect(dialog).toBeHidden();
    expect(await cash(page)).toBe(before);
    expect(await status(page)).toBe('noQueue');

    // Build: the ride is reached, the cost is paid once, Undo shows.
    await press(page, 'reach-connect', phone);
    await press(page, 'confirm-yes', phone);
    await expect(row).toHaveAttribute('data-status', 'closed');
    expect(before - (await cash(page))).toBe(cost);
    await expect(row.getByTestId('reach-connect')).toBeHidden();
    await expect(row.getByTestId('reach-connect-undo')).toBeVisible();
    await shot(page, '3-connected', phone);

    // Undo: everything back, in full.
    await press(page, 'reach-connect-undo', phone);
    await expect(row).toHaveAttribute('data-status', 'noQueue');
    expect(await cash(page)).toBe(before);
    await expect(row.getByTestId('reach-connect-undo')).toBeHidden();
    await expect(row.getByTestId('reach-connect')).toBeVisible();
    watch.expectNoErrors();
  });

  test('no route nearby: the line says why and offers no Connect; a short purse is refused before building', async ({ page }, info) => {
    const phone = isPhone(info);
    const watch = watchErrors(page);
    await newPark(page);
    // A ride far from any footpath: no route within the limit.
    const far = await buildPark(page, false);
    await openRide(page, far.ride);
    const row = page.locator('.panel').getByTestId('reach-status');
    await expect(row.getByTestId('reach-connect-why')).toHaveText('No free route nearby: build it with the queue or footpath tool');
    await expect(row.getByTestId('reach-connect')).toBeHidden();
    await scan(page, 'reach line with no route');

    // A ride near the road, but the park has $1.
    await newPark(page);
    const near = await buildPark(page);
    await tc(page, (g) => void (g.world.state.park.cash = 100), null);
    await openRide(page, near.ride);
    const content = await tc(page, (g) => Array.from(g.world.state.map.content), null);
    await press(page, 'reach-connect', phone);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByTestId('toast')).toContainText('Not enough cash: the paths cost $');
    expect(await tc(page, (g) => Array.from(g.world.state.map.content), null)).toEqual(content);
    expect(await cash(page)).toBe(100);
    watch.expectNoErrors();
  });

  test('a placed ride: the queue builder opens at its entrance and no panel covers it', async ({ page }, info) => {
    const phone = isPhone(info);
    const watch = watchErrors(page);
    await newPark(page);
    await tc(page, (g) => g.setSpeed(0), null);
    await pickCard(page, 'flat', 'carousel', { tap: phone });
    const p = await showTile(page, 30, 40);
    if (phone) await page.touchscreen.tap(p.x, p.y);
    else await page.mouse.move(p.x, p.y);
    await expect.poll(() => tc(page, (g) => (g.tool as unknown as { ghost: unknown }).ghost !== null, null)).toBe(true);
    const confirm = page.getByRole('button', { name: 'Confirm', exact: true });
    if (phone) await confirm.tap();
    else await confirm.click();
    await expect.poll(() => tc(page, (g) => g.tool.tool, null)).toBe('queue');
    const builder = page.getByTestId('path-panel');
    await expect(builder).toBeVisible();
    const panel = page.locator('.panel');
    if (phone) {
      await expect(panel).toBeHidden();
    } else {
      // The desktop docks the new ride's panel at the left, beside the builder.
      await expect(panel.getByTestId('reach-status')).toBeVisible();
      const a = (await panel.boundingBox())!;
      const b = (await builder.boundingBox())!;
      const apart = a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
      expect(apart, `panel ${JSON.stringify(a)} builder ${JSON.stringify(b)}`).toBe(true);
    }
    await page.getByTestId('path-forward').click();
    const outside = await tc(page, (g) => g.world.state.rides[0]?.entrance?.outside ?? -1, null);
    await expect.poll(() => tc(page, (g, t) => g.world.state.map.content[t], outside)).toBe(2);
    watch.expectNoErrors();
  });
});
