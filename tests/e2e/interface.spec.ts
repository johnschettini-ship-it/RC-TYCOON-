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
