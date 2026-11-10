import { expect, test, type Page } from '@playwright/test';
import { isPhone, newPark, openTool, toolControl } from './helpers';

const tc = <T>(page: Page, f: string): Promise<T> => page.evaluate(`(() => { const g = window.__tc; return ${f}; })()`) as Promise<T>;
const toolNow = (page: Page): Promise<string> => tc<string>(page, 'g.tool.tool');

test.beforeEach(async ({ page }) => newPark(page, 'Deck Park'));

test('the Rides deck is open at the start; a press on the open deck closes the hand', async ({ page }) => {
  const hand = page.getByTestId('hand');
  await expect(hand).toBeVisible();
  await expect(hand).toHaveAttribute('data-deck', 'rides');
  await expect(page.getByTestId('deck-rides')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('deck-rides').click();
  await expect(hand).toBeHidden();
  await page.getByTestId('deck-paths').click();
  await expect(hand).toHaveAttribute('data-deck', 'paths');
  await expect(page.getByRole('group', { name: 'Paths cards' })).toBeVisible();
});

const TOOL_STATES: Array<[string, string]> = [['footpath', 'footpath'], ['queue', 'queue'], ['pathItems', 'pathItem'], ['scenery', 'scenery'], ['land', 'land'], ['water', 'water'], ['buyLand', 'buyLand'], ['demolish', 'demolish']];
for (const [id, state] of TOOL_STATES) {
  test(`${id} selects its tool from its new place`, async ({ page }) => {
    await openTool(page, id);
    expect(await toolNow(page)).toBe(state);
    await expect(await toolControl(page, id)).toHaveAttribute('aria-pressed', 'true');
  });
}

const PANELS: Array<[string, RegExp]> = [['staff', /Staff/], ['research', /Research/], ['marketing', /Marketing/], ['finance', /Finance/], ['park', /Deck Park/], ['messages', /Messages/], ['rides', /Rides/], ['stalls', /Stalls/]];
for (const [id, title] of PANELS) {
  test(`${id} opens its panel from its new place`, async ({ page }) => {
    await openTool(page, id);
    await expect(page.locator('.panel-title')).toHaveText(title);
  });
}

test('overlays, shows, temperament, and menu work from their new places', async ({ page }) => {
  await openTool(page, 'overlays');
  await expect(await toolControl(page, 'overlays')).toHaveAttribute('aria-pressed', 'true');
  await openTool(page, 'overlays');
  await openTool(page, 'shows');
  await expect(await toolControl(page, 'shows')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await openTool(page, 'temperament');
  expect(await tc<string>(page, 'g.tool.overlay')).toBe('temperament');
  await openTool(page, 'menu');
  await expect(page.getByTestId('menu-resume')).toBeVisible();
});

test('Put back, Esc, and Cancel select Inspect', async ({ page }) => {
  await openTool(page, 'footpath');
  // The phone tucks the hand while the card is held: the card is made visible first.
  await toolControl(page, 'footpath');
  await page.getByTestId('card-put-back').click();
  expect(await toolNow(page)).toBe('inspect');
  await openTool(page, 'footpath');
  await page.keyboard.press('Escape');
  expect(await toolNow(page)).toBe('inspect');
  await openTool(page, 'footpath');
  await page.getByRole('region', { name: 'Tool options' }).getByRole('button', { name: 'Cancel' }).click();
  expect(await toolNow(page)).toBe('inspect');
  await expect(page.getByTestId('card-put-back')).toHaveCount(0);
});

test('no toolbar named Tools is on the screen', async ({ page }) => {
  await expect(page.getByRole('toolbar', { name: 'Tools' })).toHaveCount(0);
  await expect(page.getByRole('toolbar', { name: 'Card decks' })).toBeVisible();
});

test.describe('the hand tucks away on the phone while a card is pressed', () => {
  test.beforeEach(() => test.skip(!isPhone(test.info()), 'phone layout'));

  test('a held Footpath card tucks the hand; Cancel brings it back with the Paths deck', async ({ page }) => {
    const hand = page.getByTestId('hand');
    await openTool(page, 'footpath');
    expect(await toolNow(page)).toBe('footpath');
    await expect(hand).toBeHidden();
    await expect(page.getByTestId('deck-paths')).toHaveAttribute('aria-pressed', 'false');
    await page.getByRole('region', { name: 'Tool options' }).getByRole('button', { name: 'Cancel' }).click();
    await expect(hand).toBeVisible();
    await expect(hand).toHaveAttribute('data-deck', 'paths');
    await expect(page.getByTestId('deck-paths')).toHaveAttribute('aria-pressed', 'true');
  });

  test('a press on the Paths chip while tucked shows the hand with the held card', async ({ page }) => {
    const hand = page.getByTestId('hand');
    await openTool(page, 'footpath');
    await expect(hand).toBeHidden();
    await page.getByTestId('deck-paths').click();
    await expect(hand).toBeVisible();
    await expect(hand).toHaveAttribute('data-deck', 'paths');
    await expect(page.getByTestId('tool-footpath')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('card-put-back')).toBeVisible();
    // It stays visible while the card is held.
    await page.waitForTimeout(300);
    await expect(hand).toBeVisible();
  });

  test('the Finance card tucks the hand; closing the panel brings it back', async ({ page }) => {
    const hand = page.getByTestId('hand');
    await openTool(page, 'finance');
    await expect(page.locator('.panel-title')).toHaveText('Finance');
    await expect(hand).toBeHidden();
    await page.locator('.panel-close').click();
    await expect(page.locator('.panel')).toBeHidden();
    await expect(hand).toBeVisible();
    await expect(hand).toHaveAttribute('data-deck', 'manage');
  });
});

test('desktop: a held Footpath card keeps the hand visible', async ({ page }) => {
  test.skip(isPhone(test.info()), 'desktop layout');
  await openTool(page, 'footpath');
  expect(await toolNow(page)).toBe('footpath');
  await page.waitForTimeout(300);
  await expect(page.getByTestId('hand')).toBeVisible();
  await expect(page.getByTestId('tool-footpath')).toHaveAttribute('aria-pressed', 'true');
});
