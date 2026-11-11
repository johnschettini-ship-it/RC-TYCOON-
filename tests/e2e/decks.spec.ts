import { expect, test, type Page } from '@playwright/test';
import { cardOf, centerOn, isPhone, newPark, openTool, pickCard, setSpeed, tilePoint, toolControl } from './helpers';

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

const PANELS: Array<[string, RegExp]> = [['staff', /Staff/], ['research', /Research/], ['marketing', /Marketing/], ['finance', /Finance/], ['park', /Deck Park/], ['messages', /Messages/]];
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

test('Put back on the Finance card closes its panel and keeps Inspect', async ({ page }) => {
  await openTool(page, 'finance');
  await expect(page.locator('.panel-title')).toHaveText('Finance');
  // The phone tucks the hand while the card is pressed: the card is made visible first.
  await toolControl(page, 'finance');
  await page.locator('.card-wrap:has([data-tool="finance"]) [data-testid="card-put-back"]').click();
  await expect(page.locator('.panel')).toBeHidden();
  expect(await toolNow(page)).toBe('inspect');
  await expect(page.getByTestId('tool-finance')).toHaveAttribute('aria-pressed', 'false');
});

test('Put back on the held Carousel card selects Inspect', async ({ page }) => {
  await pickCard(page, 'flat', 'carousel');
  expect(await toolNow(page)).toBe('placeRide');
  // The phone tucks the hand while the card is held: the card is made visible first.
  const card = await cardOf(page, 'flat', 'carousel');
  await expect(card).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.card-wrap:has([data-testid="card-carousel"]) [data-testid="card-put-back"]').click();
  await expect.poll(() => toolNow(page)).toBe('inspect');
  await expect(page.locator('.panel')).toBeHidden();
  await expect(page.getByTestId('card-carousel')).toHaveAttribute('aria-pressed', 'false');
});

/** Unlocks Spiral Slide (a flat ride that research unlocks) through the research state that `isUnlocked` reads. */
async function unlockOneFlatRide(page: Page): Promise<string> {
  const id = 'spiral_slide';
  await expect(page.getByTestId(`card-${id}`)).toHaveCount(0);
  await page.evaluate((i) => (window as unknown as { __tc: { world: { state: { management: { research: { unlocked: string[] } } } } } }).__tc.world.state.management.research.unlocked.push(i), id);
  return id;
}

test('hold the Carousel card and place it: one ride, cash falls by $1,200', async ({ page }, info) => {
  await setSpeed(page, 'Pause');
  const cash0 = await tc<number>(page, 'g.world.state.park.cash');
  await pickCard(page, 'flat', 'carousel');
  await expect(await cardOf(page, 'flat', 'carousel')).toHaveAttribute('aria-pressed', 'true');
  expect(await toolNow(page)).toBe('placeRide');
  await centerOn(page, 31, 56);
  const pt = await tilePoint(page, 31, 56);
  if (info.project.name === 'phone') {
    await page.touchscreen.tap(pt.x, pt.y);
    await page.getByRole('region', { name: 'Tool options' }).getByRole('button', { name: 'Confirm' }).click();
  } else {
    await page.mouse.click(pt.x, pt.y);
  }
  expect(await tc<number>(page, 'g.world.state.rides.length')).toBe(1);
  expect(cash0 - (await tc<number>(page, 'g.world.state.park.cash'))).toBe(120_000);
});

test('a track ride card starts the station builder', async ({ page }) => {
  const id = await tc<string>(page, `document.querySelector('[data-kind="track"]').dataset.def`);
  await pickCard(page, 'track', id);
  expect(await toolNow(page)).toBe('track');
});

test('ride cards are in zone order; each card names its zone and its cost', async ({ page }) => {
  const zones = await page.locator('[data-testid="hand"] .hand-zone').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.zone));
  expect(zones).toEqual(['chill', 'family', 'thrill'].filter((z) => zones.includes(z)));
  await expect(await cardOf(page, 'flat', 'carousel')).toHaveAccessibleName(/Family.*Carousel.*\$1,200/);
  await expect(page.locator('[data-testid="hand"] [data-tool="shows"]')).toHaveCount(1);
});

test('a research unlock adds its card with no reload', async ({ page }) => {
  const id = await unlockOneFlatRide(page);
  await expect(page.getByTestId(`card-${id}`)).toHaveCount(1, { timeout: 1500 });
});

test('loading a save rebuilds the hand and holds no card', async ({ page }) => {
  await openTool(page, 'menu');
  await page.getByTestId('menu-save').click();
  await page.getByTestId('slot-1').click();
  await pickCard(page, 'flat', 'carousel');
  await openTool(page, 'menu');
  await page.getByTestId('menu-load').click();
  await page.getByTestId('slot-1').click();
  expect(await toolNow(page)).toBe('inspect');
  await expect(page.getByTestId('hand')).toHaveAttribute('data-deck', 'rides');
  await expect(page.getByTestId('card-carousel')).toHaveAttribute('aria-pressed', 'false');
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
