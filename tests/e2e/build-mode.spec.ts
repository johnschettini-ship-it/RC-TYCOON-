/**
 * Task 22 (the owner's test play): build mode. While the track builder is open (the station step and the piece steps) the
 * deck chips row (the deck list on desktop) and the hand are hidden, and the UI root has `data-build-mode="1"`; on the
 * phone and in the low layout the top region also hides Messages and the objectives flag. The piece-building panel of
 * the phone and the low layout is condensed (one header row, one tab row, one row of small piece tiles, a small status
 * line, Undo / Build with the price / Done), and Build is disabled while the piece cannot be built (the map ghost shows ✕),
 * with the reason in the line and as its accessible description, and no toast with the same text.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { isPhone, newPark, pickCard, scan, showTile, watchErrors } from './helpers';
import { defaultSettings, serializeSettings } from '../../src/settings/schema';

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The free space between two boxes in px (0 when they touch or overlap). */
const boxGap = (a: Box, b: Box): number => Math.hypot(Math.max(0, a.x - (b.x + b.width), b.x - (a.x + a.width)), Math.max(0, a.y - (b.y + b.height), b.y - (a.y + a.height)));

const TOO_HIGH = 'Climbs too high for this ride type (max 8 m above the station)';
const SHOT = process.env.TC_BUILD_SHOT;

async function frames(page: Page, n = 2): Promise<void> {
  for (let i = 0; i < n; i++) await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => done())));
}

interface BuildTc {
  tool: { tool: string };
  setSpeed(n: number): void;
  dispatch(cmd: Record<string, unknown>): { ok: boolean };
  world: { state: { rides: Array<{ id: number; kind: string }>; track: { rides: Record<string, { pieces: unknown[] }> } } };
}
const tc = <T>(page: Page, fn: (g: BuildTc) => T): Promise<T> => page.evaluate(`(${fn.toString()})(window.__tc)`) as Promise<T>;

async function park(page: Page, width: number, height: number): Promise<void> {
  await page.setViewportSize({ width, height });
  await newPark(page);
  await tc(page, (g) => g.setSpeed(0));
  await frames(page);
}

async function shot(page: Page, name: string): Promise<void> {
  if (SHOT) await page.screenshot({ path: `${SHOT}-${name}.png` });
}

/** Hold a track ride card and put its station ghost on tile (x, y): a tap on touch, a mouse move on desktop. */
async function station(page: Page, touch: boolean, typeId = 'mini_railway', x = 30, y = 30): Promise<void> {
  await pickCard(page, 'track', typeId, { tap: touch });
  const builder = page.getByTestId('track-builder');
  await expect(builder).toBeVisible();
  await expect(builder).toHaveAttribute('data-phase', 'station');
  const p = await showTile(page, x, y);
  await frames(page);
  if (touch) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.move(p.x, p.y);
  await frames(page);
}

/** The station placed: the builder in its pieces phase. */
async function pieces(page: Page, touch: boolean, typeId = 'mini_railway'): Promise<void> {
  await station(page, touch, typeId);
  const builder = page.getByTestId('track-builder');
  if (touch) await page.getByTestId('track-confirm').tap();
  else {
    const p = await showTile(page, 30, 30);
    await page.mouse.click(p.x, p.y);
  }
  await expect(builder).toHaveAttribute('data-phase', 'pieces');
  await frames(page);
}

async function pieceCount(page: Page): Promise<number> {
  return tc(page, (g) => {
    const r = g.world.state.rides.find((x) => x.kind === 'track');
    return r ? (g.world.state.track.rides[String(r.id)]?.pieces.length ?? 0) : 0;
  });
}

/** The text of an element is clipped by it or by one of its children (ellipsis and hidden overflow count). */
async function clippedText(control: Locator): Promise<string[]> {
  return control.evaluate((el) => {
    const out: string[] = [];
    for (const e of [el, ...el.querySelectorAll<HTMLElement>('*')]) {
      if (e.closest('.sr-only, [hidden]')) continue;
      if (e.classList.contains('tb-title')) continue;
      const cs = getComputedStyle(e);
      const clips = cs.overflowX === 'hidden' || cs.overflowX === 'clip' || cs.overflowY === 'hidden' || cs.overflowY === 'clip';
      if (clips && (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1) && (e.textContent ?? '').trim() !== '') out.push(`${e.className} ${e.scrollWidth}/${e.clientWidth} ${e.scrollHeight}/${e.clientHeight}`);
    }
    return out;
  });
}

/** The control is inside the window and a press at its centre reaches it. */
async function reachable(control: Locator): Promise<boolean> {
  return control.evaluate((el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.left < -0.5 || r.top < -0.5 || r.right > window.innerWidth + 0.5 || r.bottom > window.innerHeight + 0.5) return false;
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return top !== null && el.contains(top);
  });
}

/** No visible toast says `message`. */
async function noToastWith(page: Page, message: string): Promise<void> {
  const toasts = page.locator('.toast-host .toast:visible');
  for (const t of await toasts.all()) expect(await t.textContent()).not.toContain(message);
}

test.describe('build mode (Task 22): phone and low layout', () => {
  test.beforeEach(({ page: _ }, info) => {
    test.skip(!isPhone(info), 'the phone and the low layout');
  });

  for (const [w, h] of [[390, 844], [844, 390]] as const) {
    test(`${w} × ${h}: the builder hides the deck chips row, the hand, and Messages; Done and Cancel bring them back`, async ({ page }) => {
      const watch = watchErrors(page);
      await park(page, w, h);
      const ui = page.locator('#ui');
      const chips = page.locator('.deck-list');
      const hand = page.getByTestId('hand');
      const messages = page.getByTestId('tool-messages');
      await expect(ui).not.toHaveAttribute('data-build-mode', /.*/);
      await expect(chips).toBeVisible();
      await expect(messages).toBeVisible();
      const handOpen = await hand.isVisible();

      await station(page, true);
      await shot(page, `${w}x${h}-station`);
      await expect(ui).toHaveAttribute('data-build-mode', '1');
      await expect(chips).toBeHidden();
      await expect(hand).toBeHidden();
      await expect(messages).toBeHidden();
      for (const id of ['speed-toggle', 'view-rotate-left', 'view-rotate-right', 'tool-menu']) await expect(page.getByTestId(id), id).toBeVisible();
      // The hand cannot open while building: a deck chip pressed by code leaves it hidden.
      await page.evaluate(() => (document.querySelector('[data-testid="deck-stalls"]') as HTMLElement).click());
      await frames(page);
      await expect(hand).toBeHidden();
      // The builder ends at the bottom of the window (no chips row under it).
      const plate = (await page.getByTestId('track-builder').boundingBox())!;
      expect(Math.abs(plate.y + plate.height - h), 'the station row at the bottom').toBeLessThanOrEqual(h < 500 ? 9 : 1);

      // "⋯" → Cancel ends build mode.
      await page.getByTestId('track-more').tap();
      await page.getByTestId('track-cancel').tap();
      await expect(page.getByTestId('track-builder')).toBeHidden();
      await expect(ui).not.toHaveAttribute('data-build-mode', /.*/);
      await expect(chips).toBeVisible();
      await expect(messages).toBeVisible();

      // Station, then the pieces: still build mode; Done brings everything back.
      await pieces(page, true);
      await shot(page, `${w}x${h}-pieces`);
      await expect(ui).toHaveAttribute('data-build-mode', '1');
      await expect(chips).toBeHidden();
      await expect(hand).toBeHidden();
      await expect(messages).toBeHidden();
      for (const id of ['track-done', 'track-build', 'track-undo', 'track-follow', 'track-leave']) expect(await reachable(page.getByTestId(id)), id).toBe(true);
      await page.getByTestId('track-done').tap();
      await expect(page.getByTestId('track-builder')).toBeHidden();
      await expect(ui).not.toHaveAttribute('data-build-mode', /.*/);
      await expect(chips).toBeVisible();
      await expect(messages).toBeVisible();
      if (handOpen) {
        // The ride panel opens on the phone after Done; closing it shows the hand again.
        const panel = page.locator('.panel');
        if (await panel.isVisible()) await panel.getByRole('button', { name: 'Close' }).tap();
        await expect(hand).toBeVisible();
      }
      watch.expectNoErrors();
    });
  }

  test('390 × 844: the condensed piece panel is at most 240 px high; its controls are 44 px with 8 px gaps; the rows scroll sideways', async ({ page }) => {
    await park(page, 390, 844);
    await pieces(page, true);
    await page.getByTestId('track-builder-group-slopes').tap();
    await page.getByTestId('track-piece-flat_to_gentle_up').tap();
    await frames(page);
    await shot(page, '390x844-piece-ok');
    const builder = page.getByTestId('track-builder');
    const plate = (await builder.boundingBox())!;
    expect(plate.height, 'the plate of the piece panel').toBeLessThanOrEqual(240.5);
    expect(plate.y + plate.height).toBeLessThanOrEqual(844.5);

    // Header: the name (whole in the heading), the count chip, Follow and close as round 44 px buttons.
    await expect(page.getByTestId('track-builder-title')).toHaveText('Mini Railway 1');
    await expect(page.getByTestId('track-follow')).toHaveAccessibleName('Follow');
    await expect(page.getByTestId('track-undo')).toHaveAccessibleName('Undo');
    await expect(builder.locator('.tb-count')).toHaveText('3 pieces');

    // Every visible control: 44 × 44 or more, 8 px from each other.
    const boxes: Array<{ name: string; box: Box }> = [];
    for (const c of await builder.locator('button:visible').all()) {
      const box = (await c.boundingBox())!;
      boxes.push({ name: (await c.getAttribute('data-testid')) ?? '', box });
    }
    expect(boxes.length).toBeGreaterThanOrEqual(10);
    for (const a of boxes) {
      expect(a.box.width, a.name).toBeGreaterThanOrEqual(44);
      expect(a.box.height, a.name).toBeGreaterThanOrEqual(44);
      for (const b of boxes) if (a !== b) expect(boxGap(a.box, b.box), `${a.name} to ${b.name}`).toBeGreaterThanOrEqual(7.9);
    }
    // Rows: the header buttons, the tabs, the tiles, the actions; each on one line.
    const top = (id: string): number => boxes.find((b) => b.name === id)!.box.y;
    expect(top('track-follow')).toBe(top('track-leave'));
    expect(top('track-builder-group-straight')).toBe(top('track-builder-group-special'));
    const tileTops = boxes.filter((b) => b.name.startsWith('track-piece-')).map((b) => b.box.y);
    expect(tileTops.length).toBeGreaterThanOrEqual(2);
    expect(new Set(tileTops).size, 'one row of tiles').toBe(1);
    expect(top('track-undo')).toBe(top('track-done'));
    // The piece tiles are small: about 72 wide, at most 64 high; their names are on two lines at most and not clipped.
    const tile = page.getByTestId('track-piece-flat_to_gentle_up');
    const tb = (await tile.boundingBox())!;
    expect(tb.height).toBeLessThanOrEqual(64);
    expect(tb.width).toBeLessThanOrEqual(96);
    for (const name of await builder.locator('.tb-piece:visible .tb-piece-name').all()) {
      const lines = await name.evaluate((el) => Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)));
      expect(lines, await name.textContent() ?? '').toBeLessThanOrEqual(2);
    }
    expect(await clippedText(builder)).toEqual([]);
    // The status line sits between the tiles and the action row.
    const reason = page.getByTestId('track-reason');
    await expect(reason).toBeVisible();
    await expect(reason).toHaveText(/^Height \+\d+ m$/);
    const rb = (await reason.boundingBox())!;
    expect(rb.y).toBeGreaterThanOrEqual(tb.y + tb.height);
    expect(rb.y + rb.height).toBeLessThanOrEqual(top('track-undo'));

    // The tab row and the tile row scroll sideways when they overflow; every tab can be reached.
    for (const sel of ['.tb-groups', '.tb-palette']) {
      const ox = await builder.locator(sel).evaluate((el) => getComputedStyle(el).overflowX);
      expect(['auto', 'scroll'], sel).toContain(ox);
    }
    for (const g of ['straight', 'slopes', 'turns', 'banking', 'special']) {
      const tab = page.getByTestId(`track-builder-group-${g}`);
      await tab.scrollIntoViewIfNeeded();
      expect(await reachable(tab), g).toBe(true);
    }
  });

  test('390 × 844: a long piece row scrolls sideways and its last tile can be reached (Steel Coaster)', async ({ page }) => {
    await park(page, 390, 844);
    await pieces(page, true, 'steel_coaster');
    await page.getByTestId('track-builder-group-turns').tap();
    await expect(page.getByTestId('track-builder-group-turns')).toHaveAttribute('aria-selected', 'true');
    await frames(page);
    const palette = page.getByTestId('track-builder').locator('.tb-palette');
    const m = await palette.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth, h: el.getBoundingClientRect().height }));
    expect(m.sw, 'the row overflows').toBeGreaterThan(m.cw);
    expect(m.h, 'one row of tiles').toBeLessThanOrEqual(72);
    const last = palette.locator('.tb-piece:visible').last();
    await last.scrollIntoViewIfNeeded();
    expect(await reachable(last)).toBe(true);
    await shot(page, '390x844-steel-turns');
    // The Steel Coaster adds its Chain lift row; the panel stays inside the window, its controls in reach.
    const plate = (await page.getByTestId('track-builder').boundingBox())!;
    expect(plate.y + plate.height).toBeLessThanOrEqual(844.5);
    for (const id of ['track-chain', 'track-build', 'track-undo', 'track-done']) expect(await reachable(page.getByTestId(id)), id).toBe(true);
  });

  test('390 × 844: a piece that is too high disables Build; the line shows the reason; no toast says it; Enter builds nothing', async ({ page }) => {
    await park(page, 390, 844);
    await pieces(page, true);
    const ok = await tc(page, (g) => {
      const r = g.world.state.rides.find((x) => x.kind === 'track') as { id: number };
      return ['flat_to_gentle_up', 'gentle_up', 'gentle_up', 'gentle_up'].map((defId) => g.dispatch({ type: 'addTrackPiece', rideId: r.id, defId }).ok);
    });
    expect(ok).toEqual([true, true, true, true]);
    await page.getByTestId('track-builder-group-slopes').tap();
    await page.getByTestId('track-piece-gentle_up').tap();
    const build = page.getByTestId('track-build');
    const reason = page.getByTestId('track-reason');
    await expect(reason).toHaveText(TOO_HIGH);
    await expect(reason).toBeVisible();
    await expect(build).toBeDisabled();
    await expect(build).toHaveAccessibleDescription(TOO_HIGH);
    // The warning colour of the line.
    const colours = await reason.evaluate((el) => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--danger-text)';
      document.body.append(probe);
      const want = getComputedStyle(probe).color;
      probe.remove();
      return { got: getComputedStyle(el).color, want };
    });
    expect(colours.got).toBe(colours.want);
    await shot(page, '390x844-piece-too-high');
    const n = await pieceCount(page);
    await build.dispatchEvent('click');
    await page.keyboard.press('Enter');
    await frames(page, 4);
    expect(await pieceCount(page)).toBe(n);
    await noToastWith(page, TOO_HIGH);

    // A piece that fits: Build carries the price, and a press builds it.
    await page.getByTestId('track-piece-gentle_up_to_flat').tap();
    await expect(build).toBeEnabled();
    await expect(build).toHaveText(/Build · \$\d/);
    await expect(build).not.toHaveAttribute('aria-describedby', /.*/);
    await build.tap();
    await expect.poll(() => pieceCount(page)).toBe(n + 1);
  });

  test('844 × 390: a valid piece puts the price on Build, and a press builds it', async ({ page }) => {
    await park(page, 844, 390);
    await pieces(page, true);
    await page.getByTestId('track-builder-group-slopes').tap();
    await page.getByTestId('track-piece-flat_to_gentle_up').tap();
    const build = page.getByTestId('track-build');
    await expect(build).toBeEnabled();
    await expect(build).toHaveText(/Build · \$\d/);
    await shot(page, '844x390-piece-ok');
    const n = await pieceCount(page);
    await build.tap();
    await expect.poll(() => pieceCount(page)).toBe(n + 1);
    for (const id of ['track-done', 'track-build', 'track-undo', 'track-follow', 'track-leave']) expect(await reachable(page.getByTestId(id)), id).toBe(true);
  });

  test('390 × 844 at 175% text with en-XA: nothing in the piece panel clips its text; every control can be reached', async ({ page }) => {
    const doc = serializeSettings({ ...defaultSettings(), locale: 'en-XA', textScale: 175 });
    await page.addInitScript((d) => window.localStorage.setItem('tc.settings', d), doc);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en-XA');
    await page.getByTestId('title-new').click();
    await page.getByTestId('title-size-64').click();
    await page.getByTestId('title-start').click();
    await expect(page.locator('.title-screen')).toBeHidden();
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    await tc(page, (g) => g.setSpeed(0));
    await pieces(page, true);
    await page.getByTestId('track-builder-group-slopes').tap();
    await page.getByTestId('track-piece-flat_to_gentle_up').tap();
    await frames(page);
    await shot(page, '390x844-175-piece');
    const builder = page.getByTestId('track-builder');
    expect(await clippedText(builder)).toEqual([]);
    for (const b of await builder.locator('button:visible').all()) {
      await b.scrollIntoViewIfNeeded();
      expect(await reachable(b), (await b.getAttribute('data-testid')) ?? '').toBe(true);
      const box = (await b.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    for (const name of await builder.locator('.tb-piece:visible .tb-piece-name').all()) {
      const lines = await name.evaluate((el) => Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)));
      expect(lines).toBeLessThanOrEqual(2);
    }
  });

  test('390 × 844: an axe scan of build mode finds no serious or critical issue', async ({ page }) => {
    await park(page, 390, 844);
    await station(page, true);
    await scan(page, 'build mode, station step');
    await page.getByTestId('track-confirm').tap();
    await expect(page.getByTestId('track-builder')).toHaveAttribute('data-phase', 'pieces');
    await page.getByTestId('track-builder-group-slopes').tap();
    await page.getByTestId('track-piece-flat_to_gentle_up').tap();
    await frames(page);
    await scan(page, 'build mode, a piece that fits');
    await tc(page, (g) => {
      const r = g.world.state.rides.find((x) => x.kind === 'track') as { id: number };
      for (const defId of ['flat_to_gentle_up', 'gentle_up', 'gentle_up', 'gentle_up']) g.dispatch({ type: 'addTrackPiece', rideId: r.id, defId });
    });
    await page.getByTestId('track-piece-gentle_up').tap();
    await expect(page.getByTestId('track-build')).toBeDisabled();
    await scan(page, 'build mode, a piece that is too high');
  });
});

test.describe('build mode (Task 22): desktop', () => {
  test.beforeEach(({ page: _ }, info) => {
    test.skip(isPhone(info), 'the desktop layout');
  });

  test('the builder hides the deck list and the hand; Done brings them back; the builder builds as before', async ({ page }) => {
    const watch = watchErrors(page);
    await park(page, 1280, 800);
    const ui = page.locator('#ui');
    const list = page.locator('.deck-list');
    const hand = page.getByTestId('hand');
    await expect(list).toBeVisible();
    await station(page, false);
    await shot(page, '1280x800-station');
    await expect(ui).toHaveAttribute('data-build-mode', '1');
    await expect(list).toBeHidden();
    await expect(hand).toBeHidden();
    // The top region stays as it is on desktop.
    await expect(page.getByTestId('tool-messages')).toBeVisible();
    await page.evaluate(() => (document.querySelector('[data-testid="deck-stalls"]') as HTMLElement).click());
    await frames(page);
    await expect(hand).toBeHidden();

    const p = await showTile(page, 30, 30);
    await page.mouse.click(p.x, p.y);
    const builder = page.getByTestId('track-builder');
    await expect(builder).toHaveAttribute('data-phase', 'pieces');
    await expect(list).toBeHidden();
    await expect(hand).toBeHidden();
    await page.getByTestId('track-builder-group-slopes').click();
    await page.getByTestId('track-piece-flat_to_gentle_up').click();
    await page.mouse.move(640, 300);
    const build = page.getByTestId('track-build');
    await expect(build).toBeEnabled();
    await expect(build).toHaveText('Build');
    await shot(page, '1280x800-pieces');
    const n = await pieceCount(page);
    await build.click();
    await expect.poll(() => pieceCount(page)).toBe(n + 1);

    // Too high: Build disabled, the reason as its description, Enter builds nothing, no toast.
    await tc(page, (g) => {
      const r = g.world.state.rides.find((x) => x.kind === 'track') as { id: number };
      for (const defId of ['gentle_up', 'gentle_up', 'gentle_up']) g.dispatch({ type: 'addTrackPiece', rideId: r.id, defId });
    });
    await page.getByTestId('track-piece-gentle_up').click();
    await page.mouse.move(640, 300);
    await expect(page.getByTestId('track-reason')).toHaveText(TOO_HIGH);
    await expect(build).toBeDisabled();
    await expect(build).toHaveAccessibleDescription(TOO_HIGH);
    await shot(page, '1280x800-piece-too-high');
    const m = await pieceCount(page);
    await page.keyboard.press('Enter');
    await frames(page, 4);
    expect(await pieceCount(page)).toBe(m);
    await noToastWith(page, TOO_HIGH);

    await page.getByTestId('track-done').click();
    await expect(builder).toBeHidden();
    await expect(ui).not.toHaveAttribute('data-build-mode', /.*/);
    await expect(list).toBeVisible();
    await expect(hand).toBeVisible();
    watch.expectNoErrors();
  });
});
