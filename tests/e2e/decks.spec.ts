import { expect, test, type Page } from '@playwright/test';
import { cardOf, centerOn, isPhone, newPark, openTool, pickCard, setSpeed, tilePoint, toolControl, touch } from './helpers';

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

test('a track ride card pressed while the Finance panel is open starts the station builder and closes the panel', async ({ page }) => {
  const panel = page.locator('.panel');
  const builder = page.getByTestId('track-builder');
  await openTool(page, 'finance');
  await expect(panel.locator('.panel-title')).toHaveText('Finance');
  await pickCard(page, 'track', 'junior_coaster');
  await expect(builder).toBeVisible();
  // The builder stays: no later frame leaves the track tool.
  await page.waitForTimeout(300);
  expect(await toolNow(page)).toBe('track');
  await expect(builder).toBeVisible();
  // Desktop shows the details of the held card in the place of Finance; the phone shows no panel.
  if (isPhone(test.info())) await expect(panel).toBeHidden();
  else await expect(panel.locator('.panel-title')).toHaveText('Junior Coaster');
});

/** The tile index of (x, y) in the 64 × 64 park. */
const tileOf = (x: number, y: number): number => y * 64 + x;

test.describe('card drag (mouse)', () => {
  test.skip(() => isPhone(test.info()), 'a mouse drag on the desktop layout');

  const CARD = '[data-testid="card-carousel"]';
  const rides = (page: Page): Promise<number> => tc<number>(page, 'g.world.state.rides.length');
  /** Presses the mouse on the middle of a card (the Carousel card by default); the button stays down. */
  const pressCard = async (page: Page, kind: 'flat' | 'track' | 'stall' = 'flat', id = 'carousel'): Promise<{ x: number; y: number }> => {
    const box = (await (await cardOf(page, kind, id)).boundingBox())!;
    const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    // The id of the pointer of this press (the mouse): `pointercancel` and the pointer capture name it.
    await page.evaluate(() => window.addEventListener('pointerdown', (e) => ((window as unknown as { dragPointer: number }).dragPointer = e.pointerId), { capture: true, once: true }));
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    return at;
  };
  const drag = async (page: Page, to: { x: number; y: number }, end: 'up' | 'cancel' | 'lost' = 'up'): Promise<void> => {
    await pressCard(page);
    await page.mouse.move(to.x, to.y, { steps: 8 });
    if (end === 'up') await page.mouse.up();
    else if (end === 'cancel') {
      await page.evaluate((card) => {
        const pointerId = (window as unknown as { dragPointer: number }).dragPointer;
        document.querySelector(card)!.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerType: 'mouse', pointerId }));
      }, CARD);
    } else {
      await page.evaluate((card) => document.querySelector(card)!.releasePointerCapture((window as unknown as { dragPointer: number }).dragPointer), CARD);
    }
  };

  test('a drop on a valid tile builds the ride', async ({ page }) => {
    await setSpeed(page, 'Pause');
    const cash0 = await tc<number>(page, 'g.world.state.park.cash');
    await centerOn(page, 31, 56);
    await drag(page, await tilePoint(page, 31, 56));
    expect(await rides(page)).toBe(1);
    expect(cash0 - (await tc<number>(page, 'g.world.state.park.cash'))).toBe(120_000);
    // The ride stands where the ghost was: its 3 × 3 footprint has the drop tile in its middle.
    expect(await tc<number[]>(page, '[g.world.state.rides[0].x, g.world.state.rides[0].y]')).toEqual([30, 55]);
  });

  test('during a drag the card is held and the ghost follows the pointer over the map', async ({ page }) => {
    await centerOn(page, 31, 56);
    const a = await tilePoint(page, 31, 56);
    const b = await tilePoint(page, 27, 52);
    await pressCard(page);
    expect(await toolNow(page)).toBe('inspect');
    await page.mouse.move(a.x, a.y, { steps: 8 });
    expect(await toolNow(page)).toBe('placeRide');
    await expect(page.locator(CARD)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator(CARD)).toHaveClass(/dragging/);
    await expect.poll(() => tc(page, 'g.tool.ghost && [g.tool.hoverTile, g.tool.ghost.tile, g.tool.ghost.valid]')).toEqual([tileOf(31, 56), tileOf(30, 55), true]);
    await expect(page.getByTestId('tool-status-detail')).toHaveText('Can build here');
    await page.mouse.move(b.x, b.y, { steps: 4 });
    await expect.poll(() => tc(page, 'g.tool.ghost && [g.tool.hoverTile, g.tool.ghost.tile]')).toEqual([tileOf(27, 52), tileOf(26, 51)]);
    // Nothing is built before the release.
    expect(await rides(page)).toBe(0);
    await page.mouse.up();
    await expect(page.locator(CARD)).not.toHaveClass(/dragging/);
    expect(await tc<number[]>(page, 'g.world.state.rides.map((r) => r.y * 64 + r.x)')).toEqual([tileOf(26, 51)]);
  });

  test('a drop on a blocked tile builds nothing and shows the reason', async ({ page }) => {
    await centerOn(page, 31, 56);
    await drag(page, await tilePoint(page, 31, 56));
    // The commands that the second drop sends.
    await page.evaluate(() => {
      const w = window as unknown as { sent: string[]; __tc: { onCommand(cb: (cmd: { type: string }) => void): void } };
      w.sent = [];
      w.__tc.onCommand((cmd) => w.sent.push(cmd.type));
    });
    await drag(page, await tilePoint(page, 31, 56));
    expect(await rides(page)).toBe(1);
    // No command is sent (the reason shows in the tool status bar, not in a toast of a failed command).
    expect(await page.evaluate(() => (window as unknown as { sent: string[] }).sent)).toEqual([]);
    await expect(page.getByTestId('tool-status-detail')).toHaveText('Something is in the way');
    await expect(page.getByRole('region', { name: 'Tool options' })).toHaveClass(/invalid/);
    expect(await tc<number>(page, 'g.tool.hoverTile')).toBe(tileOf(31, 56));
    await expect(await cardOf(page, 'flat', 'carousel')).toHaveAttribute('aria-pressed', 'true');
  });

  test('a drop on the UI builds nothing', async ({ page }) => {
    const pill = (await page.getByTestId('status-pill').boundingBox())!;
    await drag(page, { x: pill.x + 10, y: pill.y + 10 });
    expect(await rides(page)).toBe(0);
    expect(await toolNow(page)).toBe('placeRide');
  });

  test('pointercancel ends the drag and builds nothing', async ({ page }) => {
    await centerOn(page, 31, 56);
    const pt = await tilePoint(page, 31, 56);
    await drag(page, pt, 'cancel');
    await expect(page.locator(CARD)).not.toHaveClass(/dragging/);
    await page.mouse.up();
    await page.mouse.move(pt.x + 40, pt.y);
    expect(await rides(page)).toBe(0);
    expect(await toolNow(page)).toBe('placeRide');
  });

  test('a lost pointer capture ends the drag and builds nothing', async ({ page }) => {
    await centerOn(page, 31, 56);
    const pt = await tilePoint(page, 31, 56);
    await drag(page, pt, 'lost');
    await page.mouse.up();
    await expect(page.locator(CARD)).not.toHaveClass(/dragging/);
    expect(await rides(page)).toBe(0);
    expect(await toolNow(page)).toBe('placeRide');
  });

  test('the click that follows a drag does not put the card back; a press on the held card does', async ({ page }) => {
    // A drag that ends on the card itself: the browser sends a click to the card.
    const at = await pressCard(page);
    await page.mouse.move(at.x + 4, at.y - 30, { steps: 3 });
    await page.mouse.up();
    expect(await toolNow(page)).toBe('placeRide');
    await expect(page.locator(CARD)).toHaveAttribute('aria-pressed', 'true');
    // The focus leaves the card, so that Space pauses the game and does not press the card.
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
    // A press with a move of less than 8 px is a press: it puts the held card back.
    const again = await pressCard(page);
    await page.mouse.move(again.x + 5, again.y - 5);
    await page.mouse.up();
    expect(await toolNow(page)).toBe('inspect');
  });

  test('a drag of the held card keeps the rotation that the player chose', async ({ page }) => {
    await pickCard(page, 'flat', 'carousel');
    await page.keyboard.press('r');
    expect(await tc<number>(page, 'g.tool.rotation')).toBe(1);
    await centerOn(page, 31, 56);
    await drag(page, await tilePoint(page, 31, 56));
    expect(await tc<number[]>(page, 'g.world.state.rides.map((r) => r.rotation)')).toEqual([1]);
  });

  test('a stall card drags to the map', async ({ page }) => {
    await setSpeed(page, 'Pause');
    await centerOn(page, 31, 56);
    const box = (await (await cardOf(page, 'stall', 'snack_shack')).boundingBox())!;
    const pt = await tilePoint(page, 31, 56);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(pt.x, pt.y, { steps: 8 });
    expect(await toolNow(page)).toBe('placeStall');
    await page.mouse.up();
    // The stall faces the viewer, as a pressed stall card does (rotation 2).
    expect(await tc<number[][]>(page, 'g.world.state.stalls.map((s) => [s.x, s.y, s.rotation])')).toEqual([[31, 56, 2]]);
  });

  test('a pen drags a card as the mouse does', async ({ page }) => {
    await setSpeed(page, 'Pause');
    await centerOn(page, 31, 56);
    const box = (await (await cardOf(page, 'flat', 'carousel')).boundingBox())!;
    const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const to = await tilePoint(page, 31, 56);
    const cdp = await page.context().newCDPSession(page);
    const pen = (type: 'mousePressed' | 'mouseMoved' | 'mouseReleased', at: { x: number; y: number }, buttons: number): Promise<unknown> =>
      cdp.send('Input.dispatchMouseEvent', { type, x: at.x, y: at.y, button: type === 'mouseMoved' ? 'none' : 'left', buttons, clickCount: type === 'mouseMoved' ? 0 : 1, pointerType: 'pen' });
    await pen('mouseMoved', from, 0);
    await pen('mousePressed', from, 1);
    for (let k = 1; k <= 8; k++) await pen('mouseMoved', { x: from.x + ((to.x - from.x) * k) / 8, y: from.y + ((to.y - from.y) * k) / 8 }, 1);
    expect(await toolNow(page)).toBe('placeRide');
    await expect(page.locator(CARD)).toHaveClass(/dragging/);
    await pen('mouseReleased', to, 0);
    expect(await tc<number[]>(page, 'g.world.state.rides.map((r) => r.y * 64 + r.x)')).toEqual([tileOf(30, 55)]);
    await expect(page.locator(CARD)).toHaveAttribute('aria-pressed', 'true');
  });

  test('a drag on a track ride card is a press: it starts the station builder and builds nothing', async ({ page }) => {
    const at = await pressCard(page, 'track', 'junior_coaster');
    await page.mouse.move(at.x + 4, at.y - 30, { steps: 3 });
    await expect(page.locator('[data-testid="card-junior_coaster"]')).not.toHaveClass(/dragging/);
    await page.mouse.up();
    expect(await toolNow(page)).toBe('track');
    expect(await tc<string>(page, 'g.tool.hoverTile')).toBeNull();
    expect(await rides(page)).toBe(0);
  });

  test('175% text: a drag works while the tall details panel makes the hand narrower, and it does not scroll the strip', async ({ page }) => {
    await textScale(page, 175);
    const ui = page.locator('#ui');
    const strip = page.locator('[data-testid="hand"] .hand-scroll');
    const left = (): Promise<number> => strip.evaluate((el) => el.scrollLeft);
    // The tile is drawn above the middle of the screen, clear of the tool status bar.
    await centerOn(page, 35, 60);
    const pt = await tilePoint(page, 31, 56);
    const at = await pressCard(page);
    // The card becomes held: the details panel opens, runs to the bottom, and takes the end of the hand.
    await page.mouse.move(at.x + 6, at.y - 40, { steps: 3 });
    await expect(ui).toHaveAttribute('data-details', 'tall');
    await expect(page.locator('.panel .panel-title')).toHaveText('Carousel');
    await page.mouse.move(pt.x, pt.y, { steps: 8 });
    await expect.poll(() => tc(page, 'g.tool.ghost && [g.tool.ghost.tile, g.tool.ghost.valid]')).toEqual([tileOf(30, 55), true]);
    await page.mouse.up();
    expect(await rides(page)).toBe(1);
    // A sideways drag of a card is a card drag: the strip keeps its place.
    const before = await left();
    const again = await pressCard(page);
    await page.mouse.move(again.x - 120, again.y, { steps: 6 });
    await expect(page.locator(CARD)).toHaveClass(/dragging/);
    expect(await left()).toBe(before);
    await page.mouse.up();
    expect(await left()).toBe(before);
    expect(await rides(page)).toBe(1);
    await expect(page.locator(CARD)).toHaveAttribute('aria-pressed', 'true');
  });
});

test('phone: a touch drag from a card to the map holds no card and builds nothing', async ({ page }) => {
  test.skip(!isPhone(test.info()), 'touch input');
  const box = (await (await cardOf(page, 'flat', 'carousel', { tap: true })).boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const cdp = await page.context().newCDPSession(page);
  await touch(cdp, 'touchStart', [{ x, y, id: 1 }]);
  for (let k = 1; k <= 10; k++) await touch(cdp, 'touchMove', [{ x: x + 2 * k, y: y - 30 * k, id: 1 }]);
  await touch(cdp, 'touchEnd', []);
  expect(await toolNow(page)).toBe('inspect');
  expect(await tc<number>(page, 'g.world.state.rides.length')).toBe(0);
  await expect(page.getByTestId('card-carousel')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('hand')).toBeVisible();
});
