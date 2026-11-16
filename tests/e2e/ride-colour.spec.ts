/**
 * Ride colour swatches in the flat ride panel: 7 swatches (Original first), the current one pressed, a tap sends
 * `setRideColour` (Original sends null), a track ride's panel has no such row, and the panel fits a 390 × 844 phone and
 * an 812 × 375 phone held sideways at large text.
 */
import { expect, test, type Page } from '@playwright/test';
import { newPark, scan, watchErrors } from './helpers';
import { defaultSettings, serializeSettings } from '../../src/settings/schema';

interface Tc {
  dispatch(c: unknown): { ok: boolean };
  setSpeed(s: number): void;
  tool: { selectedEntity: { kind: string; id: number } | null };
  world: { state: { rides: Array<{ id: number; kind: string; colour?: number | null }> } };
}

const NAMES = ['Original', 'Cherry', 'Sunset', 'Lemon', 'Leaf', 'Sky', 'Grape'];

async function placeAndSelect(page: Page, kind: 'flat' | 'track'): Promise<number> {
  const id = await page.evaluate((k) => {
    const g = (window as unknown as { __tc: Tc }).__tc;
    g.setSpeed(0);
    if (k === 'flat') g.dispatch({ type: 'placeRide', defId: 'carousel', x: 26, y: 40, rotation: 0 });
    const r = g.world.state.rides.filter((x) => x.kind === k);
    return r[r.length - 1]?.id ?? -1;
  }, kind);
  if (id < 0) return id;
  await page.evaluate((i) => {
    (window as unknown as { __tc: Tc }).__tc.tool.selectedEntity = { kind: 'ride', id: i };
  }, id);
  await expect(page.locator('.panel')).toBeVisible();
  return id;
}

const colourOf = (page: Page, id: number): Promise<number | null | undefined> =>
  page.evaluate((i) => (window as unknown as { __tc: Tc }).__tc.world.state.rides.find((r) => r.id === i)?.colour, id);

/** Everything in the panel's row sits inside the viewport and the swatches do not overlap. */
async function rowFits(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const row = document.querySelector('[data-testid="ride-colour-row"]');
    if (!row) return ['no row'];
    row.scrollIntoView({ block: 'nearest' });
    const panel = document.querySelector('.panel') as HTMLElement;
    const pr = panel.getBoundingClientRect();
    const rects = [...row.querySelectorAll('.swatch')].map((b) => b.getBoundingClientRect());
    rects.forEach((r, i) => {
      if (r.left < pr.left - 1 || r.right > pr.right + 1 || r.right > window.innerWidth + 1) out.push(`swatch ${i} leaves the panel: ${Math.round(r.left)}..${Math.round(r.right)} of ${Math.round(pr.left)}..${Math.round(pr.right)}`);
      if (r.width < 28 || r.height < 28) out.push(`swatch ${i} is small: ${Math.round(r.width)}x${Math.round(r.height)}`);
      const n = rects[i + 1];
      if (n && n.left < r.right - 0.5 && n.top < r.bottom) out.push(`swatch ${i} overlaps the next`);
    });
    const label = row.querySelector('.row-label') as HTMLElement;
    if (label.scrollWidth > label.clientWidth + 1) out.push('label clipped');
    return out;
  });
}

test.describe('ride colour swatches', () => {
  test('seven swatches, Original first and pressed; a tap changes the colour; Original sends null', async ({ page }) => {
    const watch = watchErrors(page);
    await newPark(page);
    const id = await placeAndSelect(page, 'flat');
    const row = page.getByTestId('ride-colour-row');
    await expect(row.getByRole('button')).toHaveCount(7);
    for (const [i, n] of NAMES.entries()) await expect(row.getByRole('button').nth(i)).toHaveAttribute('aria-label', `Ride colour: ${n}`);
    await expect(row.getByRole('button').nth(0)).toHaveAttribute('aria-pressed', 'true');
    await row.getByRole('button', { name: 'Ride colour: Grape' }).click();
    expect(await colourOf(page, id)).toBe(7);
    await expect(row.getByRole('button', { name: 'Ride colour: Grape' })).toHaveAttribute('aria-pressed', 'true');
    await expect(row.getByRole('button', { name: 'Ride colour: Original' })).toHaveAttribute('aria-pressed', 'false');
    await row.getByRole('button', { name: 'Ride colour: Cherry' }).click();
    expect(await colourOf(page, id)).toBe(0);
    await row.getByRole('button', { name: 'Ride colour: Original' }).click();
    expect(await colourOf(page, id)).toBeNull();
    await expect(row.getByRole('button', { name: 'Ride colour: Original' })).toHaveAttribute('aria-pressed', 'true');
    await scan(page, 'ride panel with colour row');
    watch.expectNoErrors();
  });

  test('a track ride panel has no ride colour row', async ({ page }) => {
    await newPark(page);
    const id = await page.evaluate(() => {
      const g = (window as unknown as { __tc: Tc }).__tc;
      g.setSpeed(0);
      const r = g.dispatch({ type: 'placeStation', typeId: 'steel_coaster', x: 4, y: 2, dir: 1 }) as { ok: boolean; id?: number };
      return r.ok ? (r.id ?? -1) : -1;
    });
    expect(id, 'a track ride was placed').toBeGreaterThan(-1);
    await page.evaluate((i) => {
      (window as unknown as { __tc: Tc }).__tc.tool.selectedEntity = { kind: 'ride', id: i };
    }, id);
    await expect(page.locator('.panel')).toBeVisible();
    await expect(page.getByTestId('ride-colour-row')).toHaveCount(0);
  });

  for (const [name, vp] of [['360 x 640', { width: 360, height: 640 }], ['390 x 844', { width: 390, height: 844 }], ['812 x 375', { width: 812, height: 375 }]] as const) {
    for (const large of [false, true]) {
      test(`fits ${name} at ${large ? 'large' : 'normal'} text`, async ({ page }, info) => {
        if (large) {
          const doc = serializeSettings({ ...defaultSettings(), locale: 'en-XA', textScale: 175 });
          await page.addInitScript((d) => window.localStorage.setItem('tc.settings', d), doc);
        }
        await page.setViewportSize(vp);
        await newPark(page);
        await placeAndSelect(page, 'flat');
        await page.waitForTimeout(200);
        expect(await rowFits(page)).toEqual([]);
        const dir = process.env.RC_SHOTS;
        if (dir) await page.screenshot({ path: `${dir}/ride-panel-${vp.width}x${vp.height}-${large ? 'large' : 'normal'}-${info.project.name}.png` });
      });
    }
  }

  test('a rejected setRideColour leaves the pressed swatch unchanged', async ({ page }) => {
    await newPark(page);
    const id = await placeAndSelect(page, 'flat');
    const row = page.getByTestId('ride-colour-row');
    await row.getByRole('button', { name: 'Ride colour: Grape' }).click();
    await expect(row.getByRole('button', { name: 'Ride colour: Grape' })).toHaveAttribute('aria-pressed', 'true');
    // 5 is a palette index outside the six choices.
    const bad = await page.evaluate((i) => (window as unknown as { __tc: Tc }).__tc.dispatch({ type: 'setRideColour', rideId: i, colour: 5 }), id);
    expect(bad.ok).toBe(false);
    await page.waitForTimeout(300);
    expect(await colourOf(page, id)).toBe(7);
    await expect(row.getByRole('button', { name: 'Ride colour: Grape' })).toHaveAttribute('aria-pressed', 'true');
    await expect(row.locator('[aria-pressed="true"]')).toHaveCount(1);
  });

  test('screenshot at normal text', async ({ page }, info) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await newPark(page);
    await placeAndSelect(page, 'flat');
    expect(await rowFits(page)).toEqual([]);
    const dir = process.env.RC_SHOTS;
    if (dir) await page.screenshot({ path: `${dir}/ride-panel-normal-${info.project.name}.png` });
  });
});
