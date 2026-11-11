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

test('the card details panel shows the data of the held card', async ({ page }, info) => {
  await pickCard(page, 'flat', 'carousel');
  if (info.project.name === 'phone') await page.getByTestId('status-details').click();
  const panel = page.locator('.panel');
  await expect(panel.locator('.panel-title')).toHaveText('Carousel');
  await expect(panel).toContainText('Seats');
  await expect(panel).toContainText('16');
  await expect(panel).toContainText('2.50');
  await panel.getByRole('button', { name: 'Close' }).click();
  expect(await toolNow(page)).toBe('placeRide');
  // The phone tucks the hand while the card is held: the card is made visible first.
  await cardOf(page, 'flat', 'carousel');
  await page.getByTestId('card-put-back').click();
  await expect(page.getByTestId('status-details')).toBeHidden();
});

test('desktop: the details panel opens by itself; after Close it stays closed until another card is held', async ({ page }) => {
  test.skip(isPhone(test.info()), 'desktop layout');
  const panel = page.locator('.panel');
  await pickCard(page, 'flat', 'carousel');
  await expect(panel.locator('.panel-title')).toHaveText('Carousel');
  await expect(panel).toContainText('Drag the card to the map. Or press the card, then press the map');
  // The Details button is for the phone.
  await expect(page.getByRole('region', { name: 'Tool options' })).toBeVisible();
  await expect(page.getByTestId('status-details')).toBeHidden();
  await panel.getByRole('button', { name: 'Close' }).click();
  await page.waitForTimeout(400);
  await expect(panel).toBeHidden();
  expect(await toolNow(page)).toBe('placeRide');
  await pickCard(page, 'flat', 'big_wheel');
  await expect(panel.locator('.panel-title')).toHaveText('Big Wheel');
  // No held card: the panel closes.
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  expect(await toolNow(page)).toBe('inspect');
});

test('phone: the details panel opens from the Details button, above the deck chips', async ({ page }) => {
  test.skip(!isPhone(test.info()), 'phone layout');
  const panel = page.locator('.panel');
  const details = page.getByTestId('status-details');
  await expect(details).toBeHidden();
  await pickCard(page, 'flat', 'carousel');
  await expect(details).toBeVisible();
  await expect(details).toHaveText('Details');
  // It does not open by itself.
  await page.waitForTimeout(400);
  await expect(panel).toBeHidden();
  await details.click();
  await expect(panel.locator('.panel-title')).toHaveText('Carousel');
  await expect(panel).toContainText('Tap the map to place it');
  const sheet = (await panel.boundingBox())!;
  const chips = (await page.getByTestId('deck-rides').boundingBox())!;
  expect(sheet.y + sheet.height).toBeLessThanOrEqual(chips.y);
  // Put back closes the panel and takes the button away.
  await cardOf(page, 'flat', 'carousel');
  await page.getByTestId('card-put-back').click();
  await expect(panel).toBeHidden();
  await expect(details).toBeHidden();
});

test('a held stall card shows its type, its price, and its running cost', async ({ page }) => {
  await pickCard(page, 'stall', 'snack_shack');
  if (isPhone(test.info())) await page.getByTestId('status-details').click();
  const panel = page.locator('.panel');
  await expect(panel.locator('.panel-title')).toHaveText('Snack Shack');
  await expect(panel.locator('.details-zone')).toHaveText('Food');
  await expect(panel.locator('.details-cost')).toHaveText('$400');
  await expect(panel.locator('.details-rows')).toHaveText(/Type\s*Food\s*Ticket\s*\$3\.00\s*Running cost per month\s*\$20$/);
});

test('a held track ride card shows its four values, and the station builder stays', async ({ page }) => {
  const phone = isPhone(test.info());
  const panel = page.locator('.panel');
  const builder = page.getByTestId('track-builder');
  await pickCard(page, 'track', 'junior_coaster');
  await expect(builder).toBeVisible();
  // The phone opens the panel from the builder, which is the tool status bar of a track card.
  if (phone) await page.getByTestId('track-details').click();
  else await expect(page.getByTestId('track-details')).toBeHidden();
  await expect(panel.locator('.panel-title')).toHaveText('Junior Coaster');
  // The "From" cost is the build cost of a track ride: it shows in the place of the cost.
  await expect(panel.locator('.details-lines li')).toHaveText(['Gravity', 'Up to 12 m high', '2 seats per car']);
  await expect(panel.locator('.details-cost')).toHaveText('From $1,584');
  expect(await toolNow(page)).toBe('track');
  if (phone) {
    // The sheet lies where the builder is: the builder comes back when the sheet closes.
    await expect(builder).toBeHidden();
  } else {
    const a = (await panel.boundingBox())!;
    const b = (await builder.boundingBox())!;
    expect(b.x + b.width).toBeLessThanOrEqual(a.x);
  }
  await panel.getByRole('button', { name: 'Close' }).click();
  await expect(panel).toBeHidden();
  await expect(builder).toBeVisible();
  expect(await toolNow(page)).toBe('track');
});

/** Sets the text scale setting and waits until the UI has it. */
async function textScale(page: Page, scale: 100 | 175): Promise<void> {
  await tc(page, `g.settings.set('textScale', ${scale})`);
  await expect(page.locator('#ui')).toHaveAttribute('data-text-scale', String(scale));
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
/** The free space between two boxes in px (0 when they touch or overlap). */
const boxGap = (a: Box, b: Box): number => Math.hypot(Math.max(0, a.x - (b.x + b.width), b.x - (a.x + a.width)), Math.max(0, a.y - (b.y + b.height), b.y - (a.y + a.height)));

for (const scale of [100, 175] as const) {
  test(`phone, ${scale}% text: the Details button of the station builder is 8 px or more from each control near it`, async ({ page }) => {
    test.skip(!isPhone(test.info()), 'phone layout');
    await textScale(page, scale);
    await pickCard(page, 'track', 'junior_coaster');
    const builder = page.getByTestId('track-builder');
    await expect(builder).toBeVisible();
    const details = (await page.getByTestId('track-details').boundingBox())!;
    expect(details.width).toBeGreaterThanOrEqual(44);
    expect(details.height).toBeGreaterThanOrEqual(44);
    // The button is on the screen, in the first line of the station controls (next to Rotate).
    expect(details.x).toBeGreaterThanOrEqual(0);
    expect(details.x + details.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    expect(details.y).toBe((await page.getByTestId('track-rotate').boundingBox())!.y);
    // Leave, Rotate, Shorter station, Longer station, Cancel, Confirm.
    const others = builder.locator('button:visible:not([data-testid="track-details"])');
    await expect(others).toHaveCount(6);
    for (const other of await others.all()) {
      const name = (await other.getAttribute('aria-label')) ?? (await other.textContent());
      expect(boxGap(details, (await other.boundingBox())!), `Details to ${name}`).toBeGreaterThanOrEqual(7.9);
    }
  });
}

test('desktop: a details panel that does not fit above the hand runs to the bottom, and the hand ends at its left edge', async ({ page }) => {
  test.skip(isPhone(test.info()), 'desktop layout');
  const ui = page.locator('#ui');
  const panel = page.locator('.panel');
  const hand = page.getByTestId('hand');
  const right = (box: Box): number => box.x + box.width;
  const bottom = (box: Box): number => box.y + box.height;

  // 100% text on a high screen: the panel fits above the hand, and the hand keeps its place.
  await page.setViewportSize({ width: 1280, height: 900 });
  const handBefore = (await hand.boundingBox())!;
  await pickCard(page, 'flat', 'carousel');
  await expect(panel.locator('.panel-title')).toHaveText('Carousel');
  await expect(ui).not.toHaveAttribute('data-details');
  expect(bottom((await panel.boundingBox())!)).toBeLessThanOrEqual(handBefore.y);
  expect(await hand.boundingBox()).toEqual(handBefore);
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();

  // 175% text on 1280 × 800: above the hand the panel has room for the title and one row only.
  await page.setViewportSize({ width: 1280, height: 800 });
  await textScale(page, 175);
  const wide = (await hand.boundingBox())!;
  await pickCard(page, 'flat', 'carousel');
  await expect(panel.locator('.panel-title')).toHaveText('Carousel');
  await expect(ui).toHaveAttribute('data-details', 'tall');
  let p = (await panel.boundingBox())!;
  let h = (await hand.boundingBox())!;
  expect(bottom(p)).toBeGreaterThan(h.y);
  expect(bottom(p)).toBeLessThanOrEqual(800 - 10);
  expect(right(h)).toBeLessThanOrEqual(p.x - 8);
  // The hand keeps its left edge (its cards do not move) and its height (the bars above it do not move).
  expect(h.x).toBe(wide.x);
  expect(h.height).toBe(wide.height);
  // The whole panel shows with no scroll: the seven rows and the hint.
  expect(await panel.locator('.panel-body').evaluate((el) => el.scrollHeight - el.clientHeight)).toBe(0);
  await expect(panel.locator('.details-rows .row')).toHaveCount(7);
  expect(bottom((await panel.locator('.details-hint').boundingBox())!)).toBeLessThanOrEqual(bottom(p));
  // The held card stays in view in the narrower hand, with its Put back button.
  const view = (await hand.locator('.hand-scroll').boundingBox())!;
  const card = (await page.getByTestId('card-carousel').boundingBox())!;
  expect(card.x).toBeGreaterThanOrEqual(view.x);
  expect(right(card)).toBeLessThanOrEqual(right(view));

  // 1280 × 720 (the size of spec §4.10): the panel ends 10 px above the bottom, and every data row is in view.
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect.poll(async () => bottom((await panel.boundingBox())!)).toBe(720 - 10);
  await expect(ui).toHaveAttribute('data-details', 'tall');
  p = (await panel.boundingBox())!;
  h = (await hand.boundingBox())!;
  expect(right(h)).toBeLessThanOrEqual(p.x - 8);
  expect(bottom((await panel.locator('.details-rows .row').last().boundingBox())!)).toBeLessThanOrEqual(bottom(p));

  // Close: the hand takes its width back. A panel of another kind ends above the hand.
  await page.setViewportSize({ width: 1280, height: 800 });
  await panel.getByRole('button', { name: 'Close' }).click();
  await expect(panel).toBeHidden();
  await expect(ui).not.toHaveAttribute('data-details');
  await expect.poll(() => hand.boundingBox()).toEqual(wide);
  await pickCard(page, 'flat', 'big_wheel');
  await expect(ui).toHaveAttribute('data-details', 'tall');
  await openTool(page, 'finance');
  await expect(panel.locator('.panel-title')).toHaveText('Finance');
  await expect(ui).not.toHaveAttribute('data-details');
  expect(bottom((await panel.boundingBox())!)).toBeLessThanOrEqual((await hand.boundingBox())!.y);
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
