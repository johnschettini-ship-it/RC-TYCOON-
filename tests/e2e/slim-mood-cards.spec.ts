/**
 * Slim mood bar and smaller cards (Phase 7 §4.3, §4.5, Task 18): after the owner's test play on a phone, the mood bar
 * is a 44 px plate (no lean line under the track, the percentages on the desktop only) and the cards of the hand are
 * about 12% smaller. Base numbers (before this task, 100% text): mood bar 512 × 62 px (desktop) and 374 × 50 px
 * (phone 390 × 844); `--hud-bottom` 176 px on the phone; ride card 128 × 172 / 104 × 140 px, tool card 104 × 124 /
 * 92 × 108 px; hand with the Rides deck 231 px (desktop) and 196 px (phone) high.
 */
import { expect, test, type Page } from '@playwright/test';
import { isPhone, newPark } from './helpers';

type Box = { left: number; top: number; right: number; bottom: number; width: number; height: number };

/** The box of the first element that matches `sel`. */
async function boxOf(page: Page, sel: string): Promise<Box> {
  return page.evaluate((s) => {
    const r = (document.querySelector(s) as HTMLElement).getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
  }, sel);
}

/** Sets the text scale setting and waits until the UI has it. */
async function textScale(page: Page, scale: 100 | 175): Promise<void> {
  await page.evaluate((s) => (window as unknown as { __tc: { settings: { set(k: string, v: unknown): void } } }).__tc.settings.set('textScale', s), scale);
  await expect(page.locator('#ui')).toHaveAttribute('data-text-scale', String(scale));
  await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
}

/** 3 Chill, 4 Family, 3 Thrill guests on the first path tile: a 30 / 40 / 30 mix with the knot at 50%. */
async function mix304030(page: Page): Promise<void> {
  await page.evaluate(() => {
    const g = (window as unknown as { __tc: { world: { state: { map: { content: ArrayLike<number> }; guests: unknown[]; nextId: number } } } }).__tc;
    const s = g.world.state;
    let tile = 0;
    for (let i = 0; i < s.map.content.length; i++) if (s.map.content[i] === 1) { tile = i; break; }
    for (const temperament of [20, 20, 20, 50, 50, 50, 50, 80, 80, 80]) {
      const id = s.nextId++;
      s.guests.push({
        id, tile, z: 8, wetUntilTick: -1, nextTile: -1, progress: 0, dir: 0, lane: id % 4, state: 'walking', stateTicks: 0, target: null,
        cash: 8000, needs: { hunger: 40, thirst: 40, bladder: 20, energy: 230, happiness: 180, nausea: 0 },
        temperament, thoughts: [], thoughtCooldowns: {}, ridden: {}, spent: 0,
        items: { map: false, umbrella: false, balloon: false }, nextDecisionTick: 1e9, lostSinceTick: -1,
        noRideStreak: 0, seat: null, activityId: -1, trashTimer: 0, withdrawals: 0, lostSteps: 0, bestDistance: -1, lostTarget: null,
      });
    }
  });
  await expect(page.getByTestId('hud-balance')).toHaveAttribute('aria-label', /30% Chill/);
}

test('the mood bar is a 44 px plate with 30 px faces; on the desktop it is at most 400 px wide and centred on the window', async ({ page }, info) => {
  if (isPhone(info)) await page.setViewportSize({ width: 390, height: 844 });
  await newPark(page);
  const bar = await boxOf(page, '[data-testid="hud-balance"]');
  expect(Math.abs(bar.height - 44), `mood bar height ${bar.height}`).toBeLessThanOrEqual(1);
  const faces = await page.evaluate(() => [...document.querySelectorAll('.mood-face canvas')].map((c) => c.getBoundingClientRect().height));
  expect(faces).toEqual([30, 30]);
  const track = await boxOf(page, '.mood-track');
  expect(track.height).toBe(isPhone(info) ? 14 : 16);
  // The lean line under the track is gone (its text is in the name and the title).
  await expect(page.locator('.mood-text')).toHaveCount(0);
  if (!isPhone(info)) {
    expect(bar.width).toBeLessThanOrEqual(400);
    // The base centres the mood slot on the window (equal side columns at 1280 px): the centre stays there.
    expect(Math.abs((bar.left + bar.right) / 2 - 640)).toBeLessThanOrEqual(2);
  }
});

test('phone 390 × 844: the top region ends at least 12 px higher than at the base (176 px)', async ({ page }, info) => {
  test.skip(!isPhone(info), 'phone layout');
  await page.setViewportSize({ width: 390, height: 844 });
  await newPark(page);
  await expect
    .poll(() => page.evaluate(() => parseFloat(getComputedStyle(document.getElementById('ui') as HTMLElement).getPropertyValue('--hud-bottom'))))
    .toBeLessThanOrEqual(164);
});

test('at 30/40/30 the segments are in proportion; the desktop numbers fit their segment and keep clear of the knot, the phone shows none', async ({ page }, info) => {
  await newPark(page);
  await mix304030(page);
  const m = await page.evaluate(() => {
    const track = document.querySelector('.mood-track') as HTMLElement;
    const knot = (track.querySelector('.mood-knot') as HTMLElement).getBoundingClientRect();
    const segs = [...track.querySelectorAll<HTMLElement>('.seg')].map((s) => {
      const r = s.getBoundingClientRect();
      const num = s.querySelector('.seg-num') as HTMLElement;
      const n = num.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, text: num.textContent ?? '', num: { left: n.left, right: n.right, top: n.top, bottom: n.bottom }, cut: num.scrollWidth > num.clientWidth };
    });
    return { inner: track.clientWidth, knot: { left: knot.left, right: knot.right }, segs };
  });
  [0.3, 0.4, 0.3].forEach((share, i) => expect(Math.abs(m.segs[i]!.width - share * m.inner), `segment ${i}`).toBeLessThanOrEqual(1));
  if (isPhone(info)) {
    expect(m.segs.map((s) => s.text)).toEqual(['', '', '']);
    return;
  }
  expect(m.segs.map((s) => s.text)).toEqual(['30%', '40%', '30%']);
  for (const s of m.segs) {
    expect(s.cut, `${s.text} cut`).toBe(false);
    expect(s.num.left).toBeGreaterThanOrEqual(s.left - 0.5);
    expect(s.num.right).toBeLessThanOrEqual(s.right + 0.5);
    expect(s.num.right <= m.knot.left || s.num.left >= m.knot.right, `${s.text} under the knot`).toBe(true);
  }
});

test('the mood bar name holds the three percentages and the lean text; the title holds the lean text', async ({ page }) => {
  await newPark(page);
  const bar = page.getByTestId('hud-balance');
  await expect(bar).toHaveAttribute('title', 'No guests yet');
  await mix304030(page);
  await expect(bar).toHaveAttribute('aria-label', /30% Chill.*40% Family.*30% Thrill.*The park is in balance/);
  await expect(bar).toHaveAttribute('title', /The park is in balance/);
});

test('cards are about 12% smaller and the hand is at least 12 px lower than at the base', async ({ page }, info) => {
  const phone = isPhone(info);
  if (phone) await page.setViewportSize({ width: 390, height: 844 });
  await newPark(page);
  await expect(page.getByTestId('hand')).toHaveAttribute('data-deck', 'rides');
  const ride = await boxOf(page, '.card.content-card');
  expect(ride.width).toBeLessThanOrEqual(phone ? 92 : 112);
  expect(ride.height).toBeLessThanOrEqual(phone ? 124 : 152);
  const hand = await boxOf(page, '[data-testid="hand"]');
  expect(hand.height, 'hand height').toBeLessThanOrEqual(phone ? 184 : 219);
  // All ride cards of the deck keep one height.
  const heights = await page.evaluate(() => [...new Set([...document.querySelectorAll('.card.content-card')].map((c) => c.getBoundingClientRect().height))]);
  expect(heights).toHaveLength(1);
  await page.getByTestId('deck-paths').click();
  await expect(page.getByTestId('hand')).toHaveAttribute('data-deck', 'paths');
  const tool = await boxOf(page, '.card.tool-card');
  expect(tool.width).toBeLessThanOrEqual(phone ? 82 : 92);
  expect(tool.height).toBeLessThanOrEqual(phone ? 96 : 110);
});

for (const scale of [100, 175] as const) {
  test(`${scale}% text: no card clips its name, its cost, or its picture`, async ({ page }, info) => {
    if (isPhone(info)) await page.setViewportSize({ width: 390, height: 844 });
    await newPark(page);
    await textScale(page, scale);
    const problems = async (): Promise<string[]> =>
      page.evaluate((least) => {
        const out: string[] = [];
        for (const card of document.querySelectorAll<HTMLElement>('.hand .card')) {
          const c = card.getBoundingClientRect();
          const id = card.dataset.testid ?? card.textContent?.slice(0, 20);
          for (const part of card.querySelectorAll<HTMLElement>('.card-band, .card-name, .card-cost, .card-track, .tool-card-label, .card-preview, .tool-card-art')) {
            const r = part.getBoundingClientRect();
            if (r.left < c.left - 0.5 || r.right > c.right + 0.5 || r.top < c.top - 0.5 || r.bottom > c.bottom + 0.5) out.push(`${id}: ${part.className} outside the card`);
            // A picture keeps at least 18 px (100% text) and grows with the text.
            if (part.tagName === 'CANVAS' || part.classList.contains('tool-card-art')) {
              if (r.height < least - 0.5) out.push(`${id}: ${part.className} ${Math.round(r.height)} px high`);
              continue;
            }
            // scrollHeight and clientHeight are whole numbers: a line box of 28.17 px reads 29 against 28 (1 px of rounding).
            if (part.scrollWidth > part.clientWidth || part.scrollHeight > part.clientHeight + 1) out.push(`${id}: ${part.className} cut`);
          }
        }
        return out;
      }, (18 * scale) / 100);
    expect(await problems(), 'Rides deck').toEqual([]);
    // The deck buttons, not a tool card: a pressed card tucks the phone hand away.
    for (const deck of ['stalls', 'paths'] as const) {
      await page.getByTestId(`deck-${deck}`).click();
      await expect(page.getByTestId('hand')).toHaveAttribute('data-deck', deck);
      expect(await problems(), `${deck} deck`).toEqual([]);
    }
  });
}
