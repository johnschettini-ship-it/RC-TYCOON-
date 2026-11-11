/**
 * Mascot tips (Phase 7 §4.8): one tip at a time in a bubble with a small face; its button opens the place the tip
 * names; Close hides it; the Mascot tips setting, an open menu, the Tutorial, and a held card hide it.
 */
import { expect, test } from '@playwright/test';
import { newPark, openTool, pickCard } from './helpers';

test('a new park shows the noRide tip; its button opens the Rides deck; Close hides it', async ({ page }) => {
  await newPark(page, 'Tip Park');
  const tip = page.getByTestId('tip');
  await expect(tip).toBeVisible({ timeout: 4000 });
  await expect(tip).toHaveAttribute('data-tip', 'noRide');
  await expect(page.getByTestId('tip-text')).toHaveText('Build a ride and open it. Guests come for rides');
  await page.getByTestId('deck-paths').click();
  await page.getByTestId('tip-action').click();
  await expect(page.getByTestId('hand')).toHaveAttribute('data-deck', 'rides');
  await page.getByTestId('tip-close').click();
  await expect(tip).toBeHidden();
  await page.waitForTimeout(2500);
  await expect(tip).toBeHidden();
});

test('negative cash shows cashLow first; Open Finance opens the Finance panel', async ({ page }) => {
  await newPark(page, 'Tip Park');
  await page.evaluate(() => ((window as unknown as { __tc: { world: { state: { park: { cash: number } } } } }).__tc.world.state.park.cash = -100));
  await expect(page.getByTestId('tip')).toHaveAttribute('data-tip', 'cashLow', { timeout: 4000 });
  await page.getByTestId('tip-action').click();
  await expect(page.locator('.panel-title')).toHaveText(/Finance/);
});

test('the Mascot tips setting turns the tips off', async ({ page }) => {
  await newPark(page, 'Tip Park');
  await expect(page.getByTestId('tip')).toBeVisible({ timeout: 4000 });
  await page.evaluate(() => (window as unknown as { __tc: { settings: { set(k: string, v: boolean): boolean } } }).__tc.settings.set('mascotTips', false));
  await expect(page.getByTestId('tip')).toBeHidden({ timeout: 4000 });
});

test('the Tutorial shows no tip, and an open menu hides the tip', async ({ page }) => {
  await newPark(page, 'Tip Park');
  await expect(page.getByTestId('tip')).toBeVisible({ timeout: 4000 });
  await openTool(page, 'menu');
  await expect(page.getByTestId('tip')).toBeHidden();
  // The start steps of tutorial.spec.ts.
  await page.goto('/');
  await page.getByTestId('title-new').click();
  await page.getByTestId('title-tutorial').click();
  await expect(page.locator('.title-screen')).toBeHidden();
  await expect(page.getByTestId('tutorial-bubble')).toBeVisible();
  await page.waitForTimeout(2500);
  await expect(page.getByTestId('tip')).toBeHidden();
});

test('a held card hides the tip; putting it back shows the tip again', async ({ page }) => {
  await newPark(page, 'Tip Park');
  const tip = page.getByTestId('tip');
  await expect(tip).toHaveAttribute('data-tip', 'noRide', { timeout: 4000 });
  await expect(tip).toBeVisible();
  await pickCard(page, 'flat', 'carousel');
  await expect(tip).toBeHidden();
  await openTool(page, 'inspect');
  await expect(tip).toBeVisible();
  await expect(tip).toHaveAttribute('data-tip', 'noRide');
});

test('underServed: Spark asks for Thrill rides; Show Thrill rides opens the Rides deck at the Thrill zone', async ({ page }) => {
  await newPark(page, 'Tip Park');
  // One open Chill ride and 25 Thrill guests: the Thrill share is 100%, its share of open rides 0% (rule 3).
  await page.evaluate(() => {
    const g = (window as unknown as {
      __tc: {
        setSpeed(s: number): void;
        dispatch(c: unknown): { ok: boolean };
        world: { state: { map: { content: ArrayLike<number> }; rides: Array<{ status: string }>; guests: unknown[]; nextId: number } };
      };
    }).__tc;
    g.setSpeed(0);
    const s = g.world.state;
    if (!g.dispatch({ type: 'placeRide', defId: 'big_wheel', x: 26, y: 40, rotation: 0 }).ok) throw new Error('no ride');
    (s.rides[s.rides.length - 1] as { status: string }).status = 'open';
    let tile = 0;
    for (let i = 0; i < s.map.content.length; i++) if (s.map.content[i] === 1) { tile = i; break; }
    for (let n = 0; n < 25; n++) {
      const id = s.nextId++;
      s.guests.push({
        id, tile, z: 8, wetUntilTick: -1, nextTile: -1, progress: 0, dir: 0, lane: id % 4, state: 'walking', stateTicks: 0, target: null,
        cash: 8000, needs: { hunger: 40, thirst: 40, bladder: 20, energy: 230, happiness: 180, nausea: 0 },
        temperament: 80, thoughts: [], thoughtCooldowns: {}, ridden: {}, spent: 0,
        items: { map: false, umbrella: false, balloon: false }, nextDecisionTick: 1e9, lostSinceTick: -1,
        noRideStreak: 0, seat: null, activityId: -1, trashTimer: 0, withdrawals: 0, lostSteps: 0, bestDistance: -1, lostTarget: null,
      });
    }
  });
  const tip = page.getByTestId('tip');
  await expect(tip).toHaveAttribute('data-tip', 'underServed.thrill', { timeout: 6000 });
  await expect(tip).toBeVisible();
  await expect(tip).toHaveAttribute('data-speaker', 'spark');
  await expect(page.getByTestId('tip-text')).toHaveText('My Thrill guests need a wild ride');
  const action = page.getByTestId('tip-action');
  await expect(action).toHaveText('Show Thrill rides');
  // Another deck is open: the button opens the Rides deck, which starts at its first card, then goes to the zone.
  await page.getByTestId('deck-paths').click();
  await expect(page.getByTestId('hand')).toHaveAttribute('data-deck', 'paths');
  await action.click();
  const hand = page.getByTestId('hand');
  await expect(hand).toHaveAttribute('data-deck', 'rides');
  const first = hand.locator('.hand-group[data-zone="thrill"] .content-card').first();
  await expect(first).toBeVisible();
  await expect
    .poll(() =>
      first.evaluate((el) => {
        const s = (el.closest('.hand-scroll') as HTMLElement).getBoundingClientRect();
        const r = el.getBoundingClientRect();
        return r.left >= s.left - 0.5 && r.right <= s.right + 0.5;
      }),
    )
    .toBe(true);
});
