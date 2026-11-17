import { expect, test, type Page } from '@playwright/test';
import { isPhone, newPark, openTool, pickCard, scan, toolControl, watchErrors } from './helpers';

/**
 * Realistic card frames (realistic title and cards, Task 3). Needs a VITE_ART=real build with baked card art in
 * `art/real/` next to the page:
 *
 *   VITE_ART=real npx vite build && cp -r <dist-art>/real dist/art/real
 *   VITE_ART=real npx playwright test tests/e2e/cards-real.spec.ts --trace off
 *
 * Every card keeps today's markup and text sizes; the realistic stylesheet (`src/styles/realCards.css`) gives it a
 * frame: a soft shadow, a thin warm-cream edge, a narrow category stripe at the top, the picture under it, and the name
 * (and price) on a dark translucent band over the bottom of the picture, in white.
 */
const REAL = process.env.VITE_ART === 'real';

type Rgba = [number, number, number, number];

/** Relative luminance (WCAG 2) of an opaque colour. */
function lum([r, g, b]: Rgba): number {
  const f = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function over([r, g, b, a]: Rgba, [R, G, B]: Rgba): Rgba {
  return [r * a + R * (1 - a), g * a + G * (1 - a), b * a + B * (1 - a), 1];
}
function contrast(a: Rgba, b: Rgba): number {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
}
function parse(css: string): Rgba {
  const m = css.match(/rgba?\(([^)]+)\)/);
  if (!m) throw new Error(`not a colour: ${css}`);
  const p = (m[1] as string).split(/[ ,/]+/).filter(Boolean).map(Number);
  return [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0, p[3] ?? 1];
}
const WHITE: Rgba = [255, 255, 255, 1];
const BLACK: Rgba = [0, 0, 0, 1];

/** Worst contrast of text colour `fg` on the band `band` laid over any picture (white or black behind it). */
function worstOnBand(fg: string, band: string): number {
  const b = parse(band);
  return Math.min(contrast(parse(fg), over(b, WHITE)), contrast(parse(fg), over(b, BLACK)));
}

interface CardLook {
  card: DOMRect;
  stripe: { top: number; bottom: number; height: number; bg: string } | null;
  picture: DOMRect | null;
  art: DOMRect | null;
  icon: DOMRect | null;
  band: { top: number; bottom: number; bg: string; left: number; right: number };
  name: { top: number; color: string; overflowWrap: string; whiteSpace: string; textOverflow: string; fontSize: string; cut: boolean };
  price: { color: string; fontSize: string } | null;
  border: string;
  shadow: string;
  radius: string;
}

/** What the frame of a card looks like, read from the page. */
async function look(page: Page, selector: string): Promise<CardLook> {
  return page.locator(selector).first().evaluate((card: HTMLElement) => {
    const rect = (e: Element | null): DOMRect | null => (e ? e.getBoundingClientRect() : null);
    const cs = getComputedStyle(card);
    const after = getComputedStyle(card, '::after');
    const stripeEl = card.querySelector<HTMLElement>('.card-band');
    const stripeCs = stripeEl ? getComputedStyle(stripeEl) : getComputedStyle(card, '::before');
    const c = card.getBoundingClientRect();
    let stripe: CardLook['stripe'] = null;
    if (stripeEl) {
      const r = stripeEl.getBoundingClientRect();
      stripe = { top: r.top, bottom: r.bottom, height: r.height, bg: stripeCs.backgroundColor };
    } else if (stripeCs.content !== 'none') {
      const h = parseFloat(stripeCs.height);
      const top = c.top + parseFloat(cs.borderTopWidth);
      stripe = { top, bottom: top + h, height: h, bg: stripeCs.backgroundColor };
    }
    const name = card.querySelector<HTMLElement>('.card-name, .tool-card-label') as HTMLElement;
    const nameCs = getComputedStyle(name);
    const nr = name.getBoundingClientRect();
    const priceEl = card.querySelector<HTMLElement>('.card-cost');
    // The band is the card's ::after, a grid item over the rows of the name (and price): it starts at the name's box.
    const bandTop = nr.top;
    return {
      card: c,
      stripe,
      picture: rect(card.querySelector('.card-preview')),
      art: rect(card.querySelector('.tool-card-art')),
      icon: rect(card.querySelector('.tool-card-art svg, .tool-card-art .icon')),
      band: { top: bandTop, bottom: c.bottom - parseFloat(cs.borderBottomWidth), bg: after.backgroundColor, left: c.left, right: c.right },
      name: {
        top: nr.top,
        color: nameCs.color,
        overflowWrap: nameCs.overflowWrap,
        whiteSpace: nameCs.whiteSpace,
        textOverflow: nameCs.textOverflow,
        fontSize: nameCs.fontSize,
        cut: name.scrollWidth > name.clientWidth || name.scrollHeight > name.clientHeight + 1,
      },
      price: priceEl ? { color: getComputedStyle(priceEl).color, fontSize: getComputedStyle(priceEl).fontSize } : null,
      border: `${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor}`,
      shadow: cs.boxShadow,
      radius: cs.borderTopLeftRadius,
    } as unknown as CardLook;
  });
}

/** The band's top as the layout places it: the top of the first band line (name), for a check against the stripe. */
async function bandTop(page: Page, selector: string): Promise<{ band: number; stripeBottom: number; nameTop: number }> {
  return page.locator(selector).first().evaluate((card: HTMLElement) => {
    const band = card.querySelector<HTMLElement>('.card-name, .tool-card-label') as HTMLElement;
    const stripe = card.querySelector<HTMLElement>('.card-band');
    const c = card.getBoundingClientRect();
    const sb = stripe ? stripe.getBoundingClientRect().bottom : c.top + parseFloat(getComputedStyle(card).borderTopWidth) + parseFloat(getComputedStyle(card, '::before').height || '0');
    // The band starts at the name's box (its padding included).
    return { band: band.getBoundingClientRect().top, stripeBottom: sb, nameTop: band.getBoundingClientRect().top };
  });
}

async function textScale(page: Page, scale: 100 | 175): Promise<void> {
  await page.evaluate((s) => (window as unknown as { __tc: { settings: { set(k: string, v: unknown): void } } }).__tc.settings.set('textScale', s), scale);
  await expect(page.locator('#ui')).toHaveAttribute('data-text-scale', String(scale));
}

async function setCash(page: Page, cents: number): Promise<void> {
  await page.evaluate((c) => {
    (window as unknown as { __tc: { world: { state: { park: { cash: number } } } } }).__tc.world.state.park.cash = c;
  }, cents);
}

/** The card picture set is drawn on the ride cards (not today's preview): the realistic look booted with its art. */
async function expectRealLook(page: Page): Promise<void> {
  expect(await page.evaluate(() => Boolean((window as unknown as { __tcReal?: unknown }).__tcReal)), 'the realistic look booted').toBe(true);
}

test.describe('realistic card frames (VITE_ART=real build)', () => {
  test.skip(!REAL, 'needs a VITE_ART=real build (set VITE_ART=real)');

  test('a ride card: picture, a dark band with the white name and the price over its bottom, a zone stripe, a framed face', async ({ page }) => {
    const watch = watchErrors(page);
    await newPark(page, 'Frame Park');
    await expectRealLook(page);
    const sel = '[data-testid="card-carousel"]';
    await expect(page.locator(sel)).toBeVisible();
    const l = await look(page, sel);
    // The picture fills the card under the stripe, edge to edge inside the frame.
    expect(l.picture, 'picture').not.toBeNull();
    const pic = l.picture as DOMRect;
    expect(pic.width).toBeGreaterThanOrEqual(l.card.width - 8);
    expect(pic.top).toBeGreaterThanOrEqual((l.stripe as { bottom: number }).bottom - 0.5);
    // The band lies over the bottom of the picture.
    expect(l.band.top).toBeLessThan(pic.bottom - 4);
    expect(l.band.top).toBeGreaterThan(pic.top + pic.height * 0.3);
    // Dark translucent band, white name, price readable: ≥ 4.5:1 over any picture.
    const band = parse(l.band.bg);
    expect(band[3], 'band is translucent').toBeLessThan(1);
    expect(band[3], 'band is dark enough').toBeGreaterThan(0.6);
    expect(l.name.color).toBe('rgb(255, 255, 255)');
    expect(worstOnBand(l.name.color, l.band.bg)).toBeGreaterThanOrEqual(4.5);
    expect(worstOnBand((l.price as { color: string }).color, l.band.bg)).toBeGreaterThanOrEqual(4.5);
    // Category stripe: the zone colour, narrow, at the top.
    expect(l.stripe).not.toBeNull();
    const stripe = l.stripe as { top: number; height: number; bg: string };
    expect(stripe.height).toBeGreaterThanOrEqual(3);
    expect(stripe.height).toBeLessThanOrEqual(8);
    expect(stripe.top - l.card.top).toBeLessThanOrEqual(3);
    expect(stripe.bg).toBe('rgb(47, 179, 138)'); // --accent-family
    // Frame: thin warm-cream edge, soft (blurred) shadow, round corners as today.
    expect(l.border).toMatch(/^(1|1\.5|2)px solid rgb\(2[2-5]\d, 2[0-4]\d, 1[6-9]\d\)$/);
    expect(l.shadow).toMatch(/rgba\(.*\) 0px \d+px [1-9]\d*px/);
    expect(l.radius).toBe('18px');
    // Text sizes unchanged.
    expect(l.name.fontSize).toBe(isPhone(test.info()) ? '13px' : '14px');
    expect((l.price as { fontSize: string }).fontSize).toBe(isPhone(test.info()) ? '12px' : '13px');
    // The accessible name is today's: zone, name, cost.
    await expect(page.locator(sel)).toHaveAccessibleName('Family, Carousel, $1,200');
    // axe: no serious issues (colour contrast included) on the hand of ride cards and of stall cards.
    await scan(page, 'rides');
    await openTool(page, 'stalls');
    const st = await look(page, '.card.content-card[data-kind="stall"]');
    expect(st.stripe?.bg, 'stall stripe').not.toBe('rgba(0, 0, 0, 0)');
    await scan(page, 'stalls');
    watch.expectNoErrors();
  });

  test('every ride card in the hand shows its price on the same line and its name from the same top; "Track" is a chip on the picture, not a third band line', async ({ page }) => {
    await newPark(page, 'Line Park');
    await expectRealLook(page);
    const rows = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.hand .content-card')].map((c) => ({
        id: c.getAttribute('data-def'),
        // A locked preview card (owner, 2026-11-17) has its lock and "Research" on the price line.
        price: Math.round((c.querySelector('.card-cost, .card-research') as HTMLElement).getBoundingClientRect().top),
        // The band holds two name lines on every card (owner, 2026-11-17): a two-line name starts where a one-line name does.
        name: Math.round((c.querySelector('.card-name') as HTMLElement).getBoundingClientRect().top),
        lines: (() => { const n = c.querySelector('.card-name') as HTMLElement; const range = document.createRange(); range.selectNodeContents(n); return new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size; })(),
        track: (() => { const t = c.querySelector<HTMLElement>('.card-track'); if (!t) return null; const r = t.getBoundingClientRect(); const pic = (c.querySelector('.card-name') as HTMLElement).getBoundingClientRect(); return { bottom: r.bottom, nameTop: pic.top }; })(),
      })),
    );
    expect(rows.length).toBeGreaterThan(2);
    const prices = new Set(rows.map((r) => r.price));
    expect([...prices], JSON.stringify(rows)).toHaveLength(1);
    expect([...new Set(rows.map((r) => r.name))], JSON.stringify(rows)).toHaveLength(1);
    // The hand holds names of one line and of two (Observation Tower): the check is not empty.
    expect(rows.some((r) => r.lines === 2), JSON.stringify(rows)).toBe(true);
    expect(rows.some((r) => r.lines === 1), JSON.stringify(rows)).toBe(true);
    for (const r of rows) if (r.track) expect(r.track.bottom, `${r.id} track chip above the band`).toBeLessThanOrEqual(r.track.nameTop);
  });

  test('a long name wraps as today (no ellipsis), the band grows and never covers the stripe', async ({ page }) => {
    await newPark(page, 'Long Park');
    await expectRealLook(page);
    const sel = '[data-testid="card-carousel"]';
    const before = await bandTop(page, sel);
    await page.locator(`${sel} .card-name`).evaluate((n) => {
      (n.firstChild as Text).data = 'Grand Imperial Supercalifragilistic Carousel';
    });
    const after = await bandTop(page, sel);
    const l = await look(page, sel);
    expect(l.name.overflowWrap).toBe('break-word');
    expect(l.name.whiteSpace).toBe('normal');
    expect(l.name.textOverflow).toBe('clip');
    expect(l.name.cut, 'name cut').toBe(false);
    // The band grows upward with the name …
    expect(after.band).toBeLessThan(before.band - 8);
    // … and stops under the stripe.
    expect(after.band).toBeGreaterThanOrEqual(after.stripeBottom - 0.5);
    for (const s of ['.card-name', '.card-price-row'])
      expect(await page.locator(`${sel} ${s}`).evaluate((e) => {
        const c = (e.closest('.card') as HTMLElement).getBoundingClientRect();
        const r = e.getBoundingClientRect();
        return r.left >= c.left - 0.5 && r.right <= c.right + 0.5 && r.bottom <= c.bottom + 0.5;
      }), s).toBe(true);
  });

  test('selected: lifted with a gold edge; unaffordable: dimmed picture, price in the warning colour', async ({ page }) => {
    await newPark(page, 'State Park');
    await expectRealLook(page);
    const sel = '[data-testid="card-carousel"]';
    const price = page.locator(`${sel} .card-cost`);
    const normalPrice = await price.evaluate((e) => getComputedStyle(e).color);
    const pictureFilter = (): Promise<string> => page.locator(`${sel} .card-preview`).evaluate((e) => getComputedStyle(e).filter);
    expect(await pictureFilter()).toBe('none');
    // Unaffordable.
    await setCash(page, 0);
    await expect(page.locator(sel)).toHaveAttribute('data-afford', 'no');
    // Screen readers hear it too: a description after the card's name (the name itself is today's); still pressable.
    await expect(page.locator(sel)).toHaveAttribute('aria-description', 'Not enough cash');
    await expect(page.locator(sel)).toHaveAccessibleDescription('Not enough cash');
    await expect(page.locator(sel)).toHaveAccessibleName('Family, Carousel, $1,200');
    await expect(page.locator(sel)).toBeEnabled();
    await expect.poll(pictureFilter).toMatch(/^grayscale\(0\.7\) brightness\(0\.8\)$/);
    const shortPrice = await price.evaluate((e) => getComputedStyle(e).color);
    expect(shortPrice).not.toBe(normalPrice);
    const band = await page.locator(sel).evaluate((c) => getComputedStyle(c, '::after').backgroundColor);
    expect(worstOnBand(shortPrice, band)).toBeGreaterThanOrEqual(4.5);
    if (!isPhone(test.info())) await page.locator(sel).screenshot({ path: test.info().outputPath('unaffordable.png') });
    await setCash(page, 100_000_00);
    await expect(page.locator(sel)).not.toHaveAttribute('data-afford', 'no');
    await expect(page.locator(sel)).not.toHaveAttribute('aria-description', /.*/);
    await expect.poll(pictureFilter).toBe('none');
    // Selected (held).
    await pickCard(page, 'flat', 'carousel');
    const wrap = page.locator(`.card-wrap:has(${sel})`);
    await expect(wrap).toHaveClass(/held/);
    const held = await page.locator(sel).evaluate((c) => ({ shadow: getComputedStyle(c).boxShadow, lift: getComputedStyle(c.parentElement as HTMLElement).transform }));
    expect(held.shadow).toContain('rgb(255, 193, 46)');
    // The phone tucks the hand away while a card is held (as today): the lift is measured where the hand shows.
    if (await wrap.isVisible()) expect(held.lift).not.toBe('none');
  });

  test('a tool card shows only its name on the band, its icon centred in the picture area, inside the frame', async ({ page }) => {
    await newPark(page, 'Tool Park');
    await expectRealLook(page);
    await toolControl(page, 'footpath');
    const sel = '[data-testid="tool-footpath"]';
    const l = await look(page, sel);
    await expect(page.locator(`${sel} .card-cost, ${sel} .card-price-row`)).toHaveCount(0);
    expect(l.name.color).toBe('rgb(255, 255, 255)');
    expect(worstOnBand(l.name.color, l.band.bg)).toBeGreaterThanOrEqual(4.5);
    expect(l.name.fontSize).toBe('14px');
    const art = l.art as DOMRect;
    // The picture area (where the icon sits) fills the card from the stripe to the band; the picture's backdrop goes on
    // under the band (a baked picture there fills the card under the stripe, the band over its bottom).
    expect(art.width).toBeGreaterThanOrEqual(l.card.width - 8);
    expect(art.top).toBeGreaterThanOrEqual((l.stripe as { bottom: number }).bottom - 0.5);
    expect(art.bottom).toBeLessThanOrEqual(l.band.top + 0.5);
    expect(await page.locator(sel).evaluate((c) => getComputedStyle(c).backgroundImage)).toContain('gradient');
    expect(l.stripe).not.toBeNull();
    expect(l.border).toMatch(/^(1|1\.5|2)px solid /);
    await expect(page.locator(sel)).toHaveAccessibleName('Footpath');
  });

  test('card pictures that decode after the cards were drawn replace the icon and today\'s preview', async ({ page }) => {
    test.setTimeout(60_000);
    // The boot waits 3 s for the card set: hold its sheet back 8 s, so the first cards are drawn without it.
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    await page.route('**/art/real/preview-cards-*.webp', async (route) => {
      await held;
      await route.continue();
    });
    const timer = setTimeout(() => release(), 8_000);
    try {
      await newPark(page, 'Late Park');
      await expectRealLook(page);
      const cardSet = (): Promise<string> =>
        page.evaluate(() => (window as unknown as { __tcReal: { sets: { state(k: string): string } } }).__tcReal.sets.state('preview:cards:d2:rall'));
      expect(await cardSet()).not.toBe('ready');
      const openDeck = async (deck: string): Promise<void> => {
        const hand = page.getByTestId('hand');
        if ((await hand.getAttribute('data-deck')) !== deck || !(await hand.isVisible())) await page.getByTestId(`deck-${deck}`).click();
        await expect(hand).toHaveAttribute('data-deck', deck);
      };
      const preview = (): Promise<string> => page.locator('[data-testid="card-carousel"] canvas.card-preview').evaluate((c) => (c as HTMLCanvasElement).toDataURL());
      await openDeck('rides');
      const before = await preview();
      await toolControl(page, 'footpath');
      const sel = '[data-testid="tool-footpath"]';
      await expect(page.locator(`${sel} .tool-card-picture`)).toHaveCount(0);
      release();
      await expect.poll(cardSet, { timeout: 15_000 }).toBe('ready');
      // The open deck's tool card takes its baked picture.
      await expect(page.locator(`${sel} .tool-card-picture`)).toHaveCount(1, { timeout: 5_000 });
      // A deck drawn before: its ride cards show their baked pictures when shown again.
      await openDeck('rides');
      await expect.poll(preview, { timeout: 5_000 }).not.toBe(before);
    } finally {
      clearTimeout(timer);
      release();
    }
  });

  for (const [w, h] of [
    [390, 844],
    [360, 640],
  ] as const) {
    test(`${w} × ${h}: no tool card name breaks inside a word ("Marketin/g"), normal and large text, high contrast too`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await newPark(page, 'Word Park');
      await expectRealLook(page);
      await toolControl(page, 'marketing');
      for (const hc of [false, true]) {
        await page.evaluate((v) => (window as unknown as { __tc: { settings: { set(k: string, v: unknown): void } } }).__tc.settings.set('highContrast', v), hc);
        for (const scale of [100, 175] as const) {
          await textScale(page, scale);
          await page.evaluate(() => document.fonts.ready.then(() => undefined));
          // Lines of each label against its words: a word broken across lines gives more lines than words.
          const broken = await page.evaluate(() =>
            [...document.querySelectorAll<HTMLElement>('.hand .tool-card-label')]
              .map((l) => {
                const r = document.createRange();
                r.selectNodeContents(l);
                const lines = new Set([...r.getClientRects()].map((q) => Math.round(q.top))).size;
                return { name: l.textContent ?? '', lines, words: (l.textContent ?? '').trim().split(/\s+/).length };
              })
              .filter((x) => x.lines > x.words),
          );
          expect(broken, `${scale}%${hc ? ', high contrast' : ''}`).toEqual([]);
        }
      }
    });
  }

  test('an extension card without a picture shows its icon centred in the frame, no broken image', async ({ page }) => {
    await newPark(page, 'Icon Park');
    await expectRealLook(page);
    for (const id of ['land', 'water', 'overlays']) {
      await toolControl(page, id);
      const sel = `[data-testid="tool-${id}"]`;
      const l = await look(page, sel);
      expect(l.icon, `${id} icon`).not.toBeNull();
      const icon = l.icon as DOMRect;
      const art = l.art as DOMRect;
      // Centred in the picture area above the band.
      const areaBottom = Math.min(art.bottom, l.band.top);
      expect(Math.abs((icon.left + icon.right) / 2 - (art.left + art.right) / 2), `${id} x`).toBeLessThanOrEqual(2);
      expect(Math.abs((icon.top + icon.bottom) / 2 - (art.top + areaBottom) / 2), `${id} y`).toBeLessThanOrEqual(3);
      expect(icon.top).toBeGreaterThanOrEqual(art.top);
      expect(icon.bottom).toBeLessThanOrEqual(l.band.top + 0.5);
      expect(icon.width).toBeGreaterThanOrEqual(20);
      await expect(page.locator(`${sel} img`)).toHaveCount(0);
    }
  });

  for (const [w, h] of [
    [390, 844],
    [360, 640],
    [812, 375],
  ] as const) {
    for (const scale of [100, 175] as const) {
      test(`${w} × ${h}, ${scale}% text: every card keeps its parts inside the frame, nothing cut, band under the stripe`, async ({ page }) => {
        test.setTimeout(90_000);
        await page.setViewportSize({ width: w, height: h });
        await newPark(page, 'Fit Park');
        await expectRealLook(page);
        await textScale(page, scale);
        const problems = async (): Promise<string[]> =>
          page.evaluate((least) => {
            const out: string[] = [];
            for (const card of document.querySelectorAll<HTMLElement>('.hand .card')) {
              const c = card.getBoundingClientRect();
              const id = card.dataset.testid ?? '';
              const stripe = card.querySelector('.card-band');
              const stripeBottom = stripe ? stripe.getBoundingClientRect().bottom : c.top + parseFloat(getComputedStyle(card, '::before').height || '0');
              for (const part of card.querySelectorAll<HTMLElement>('.card-name, .card-cost, .card-research, .card-track, .tool-card-label, .card-preview, .tool-card-art')) {
                const r = part.getBoundingClientRect();
                if (r.left < c.left - 0.5 || r.right > c.right + 0.5 || r.top < c.top - 0.5 || r.bottom > c.bottom + 0.5) out.push(`${id}: ${part.className} outside the card`);
                if (part.tagName === 'CANVAS' || part.classList.contains('tool-card-art')) {
                  if (r.height < least - 0.5) out.push(`${id}: ${part.className} ${Math.round(r.height)} px high`);
                  continue;
                }
                if (r.top < stripeBottom - 0.5) out.push(`${id}: ${part.className} over the stripe`);
                if (part.scrollWidth > part.clientWidth || part.scrollHeight > part.clientHeight + 1) out.push(`${id}: ${part.className} cut`);
              }
            }
            return out;
          }, (18 * scale) / 100);
        for (const deck of ['rides', 'stalls', 'paths', 'scenery', 'manage'] as const) {
          const hand = page.getByTestId('hand');
          if ((await hand.getAttribute('data-deck')) !== deck || !(await hand.isVisible())) {
            const b = page.getByTestId(`deck-${deck}`);
            await b.scrollIntoViewIfNeeded();
            await b.click();
          }
          await expect(hand).toHaveAttribute('data-deck', deck);
          await expect(hand).toBeVisible();
          expect(await problems(), `${deck} deck`).toEqual([]);
          if (scale === 100 && deck === 'rides') await scan(page, `${w}x${h} rides`);
          if (!isPhone(test.info())) await hand.screenshot({ path: test.info().outputPath(`hand-${deck}.png`) });
        }
      });
    }
  }
});
