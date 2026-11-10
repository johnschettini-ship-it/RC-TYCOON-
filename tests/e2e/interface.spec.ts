import { expect, test } from '@playwright/test';
import { newPark } from './helpers';

test('the game loads the bundled font and asks no other host for anything', async ({ page, baseURL }) => {
  const foreign: string[] = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.protocol.startsWith('http') && u.origin !== new URL(baseURL as string).origin) foreign.push(r.url());
  });
  await newPark(page);
  const loaded = await page.evaluate(() => [...document.fonts].some((f) => f.family.replace(/["']/g, '') === 'Fredoka' && f.status === 'loaded'));
  expect(loaded).toBe(true);
  expect(foreign).toEqual([]);
});

test('the mood bar names the balance and toggles the Temperament overlay', async ({ page }, info) => {
  await newPark(page);
  const bar = page.getByTestId('hud-balance');
  await expect(bar).toHaveAttribute('aria-label', 'Thrill/Chill balance: no guests yet, No guests yet');
  if (info.project.name === 'desktop') await expect(page.getByTestId('mood-text')).toHaveText('No guests yet');
  const overlay = () => page.evaluate(() => (window as unknown as { __tc: { tool: { overlay: string } } }).__tc.tool.overlay);
  await bar.click();
  await expect(bar).toHaveAttribute('aria-pressed', 'true');
  expect(await overlay()).toBe('temperament');
  await bar.click();
  await expect(bar).toHaveAttribute('aria-pressed', 'false');
  expect(await overlay()).toBe('none');
});
