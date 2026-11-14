import { expect, test } from '@playwright/test';

/**
 * Stage 1 bench smoke (`?art=real&bench=quick`). Needs a VITE_ART=real build:
 *
 *   VITE_ART=real npx playwright test tests/e2e/real-bench.spec.ts --trace off
 *
 * Without baked art the realistic boot cannot fetch `art/real/index.json`: one error line, today's look. The smoke
 * checks the Run button, the results card with a row per park, and that the console has no errors other than that
 * missing index. Numbers are not asserted (headless timings are noise). `quick` runs every step at a tenth of its
 * length; the real run on a phone is `?bench=1`.
 */
const REAL = process.env.VITE_ART === 'real';

test.describe('stage 1 bench (VITE_ART=real build)', () => {
  test.skip(!REAL, 'needs a VITE_ART=real build (set VITE_ART=real)');

  test('Run benchmark shows the results card, no console errors but the missing index', async ({ page, context }) => {
    test.setTimeout(360_000);
    const errors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(`${m.text()} @ ${m.location().url}`);
    });
    page.on('pageerror', (e) => errors.push(e.message));
    await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => undefined);

    await page.goto('/?art=real&bench=quick');
    // Today's look with the one error line (no baked art yet).
    await expect(page.getByRole('alert')).toBeVisible();
    const run = page.getByTestId('real-bench-run');
    await expect(run).toBeVisible();
    // No save may be written while the bench runs.
    const keysBefore = await page.evaluate(() => Object.keys(localStorage).sort());
    await run.click();

    const card = page.getByTestId('real-bench-card');
    await expect(card).toBeVisible({ timeout: 340_000 });
    // The four parks and the scale park (round 3 item 7).
    for (const id of ['build1', 'build2', 'phone', 'coaster', 'scale']) await expect(card.locator(`table[data-scene="${id}"]`)).toBeVisible();
    await expect(card.locator('tr[data-check="S3"]')).toHaveCount(5);
    await expect(card.locator('tr[data-check="S6g"]')).toHaveCount(5);
    const result = await page.evaluate(() => (window as unknown as { __tcBench: { scenes: Array<{ id: string; error?: string; turns: unknown[]; placements: number }> } }).__tcBench);
    expect(result.scenes.map((s) => s.id)).toEqual(['build1', 'build2', 'phone', 'coaster', 'scale']);
    for (const s of result.scenes) {
      expect(s.error).toBeUndefined();
      expect(s.turns).toHaveLength(4);
      expect(s.placements).toBe(20);
    }
    // No save written. The only possible new key is the test build's own settings (autosave off for the run, then
    // back on); every key carries the test build's prefix.
    const keysAfter = await page.evaluate(() => Object.keys(localStorage).sort());
    expect(keysAfter.filter((k) => k !== 'tcreal:tc.settings')).toEqual(keysBefore.filter((k) => k !== 'tcreal:tc.settings'));
    expect(keysAfter.some((k) => k.includes('tc.save'))).toBe(false);
    expect(keysAfter.every((k) => k.startsWith('tcreal:'))).toBe(true);
    expect(await page.evaluate(() => (window as unknown as { __tc: { settings: { get(k: string): unknown } } }).__tc.settings.get('autosave'))).toBe(true);

    // The card fits a 390 px phone: no sideways scrolling inside it.
    await page.setViewportSize({ width: 390, height: 844 });
    const overflow = await card.evaluate((c) => {
      const box = c.firstElementChild as HTMLElement;
      return box.scrollWidth - box.clientWidth;
    });
    expect(overflow).toBeLessThanOrEqual(0);

    await page.getByTestId('real-bench-copy').click();
    await expect(page.getByTestId('real-bench-copy')).not.toHaveText('Copy results');

    // The only error: the browser's line for the missing art index (HTTP 404).
    const unexpected = errors.filter((e) => !(/404/.test(e) && /art\/real\/index\.json/.test(e)));
    expect(unexpected).toEqual([]);
  });

  test("today's look runs the same bench (?art=classic): n/a memory, turn and start bands, frame times measured", async ({ page }) => {
    test.setTimeout(360_000);
    const errors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(`${m.text()} @ ${m.location().url}`);
    });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/?art=classic&bench=quick');
    const run = page.getByTestId('real-bench-run');
    await expect(run).toBeVisible();
    await run.click();
    const card = page.getByTestId('real-bench-card');
    await expect(card).toBeVisible({ timeout: 340_000 });
    await expect(card.locator('tr[data-look="classic"]')).toBeVisible();
    for (const check of ['S2', 'S3']) for (const cell of await card.locator(`tr[data-check="${check}"] td[data-band]`).all()) await expect(cell).toHaveAttribute('data-band', 'n/a');
    const result = await page.evaluate(() => (window as unknown as { __tcBench: { look: string; scenes: Array<{ frames: number; frameP95: number }> } }).__tcBench);
    expect(result.look).toBe('classic');
    for (const s of result.scenes) {
      expect(s.frames).toBeGreaterThan(0);
      expect(s.frameP95).toBeGreaterThan(0);
    }
    // Every key the test build writes carries its prefix.
    expect((await page.evaluate(() => Object.keys(localStorage))).every((k) => k.startsWith('tcreal:'))).toBe(true);
    expect(errors).toEqual([]);
  });
});
