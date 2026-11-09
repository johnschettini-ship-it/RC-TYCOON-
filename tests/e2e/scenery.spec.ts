import { expect, test, type Page } from '@playwright/test';
import { centerOn, isPhone, newPark, tilePoint, watchErrors } from './helpers';

/**
 * Scenery tool (Phase 4 §7, §9.5): desktop picks an item from the theme grid, clicks to place (cash drops),
 * Shift-click keeps the tool, R rotates, Remove refunds; phone taps an item, taps the map, and places with Confirm.
 * `TC_SCREENSHOT=1` also saves docs/screenshots/wave3-scenery.png (all 6 themes and the base set).
 */

interface SceneryGame {
  world: {
    state: {
      park: { cash: number };
      scenery: Array<{ id: number; defId: string; x: number; y: number; rotation: number; edge: number }>;
      management: { research: { unlocked: string[] } };
      map: { width: number };
    };
  };
  camera: { centerX: number; centerY: number; zoom: number };
  tool: { tool: string; rotation: number };
  dispatch(cmd: Record<string, unknown>): { ok: boolean; reason?: string; id?: number };
  setSpeed(n: number): void;
  step(n: number): void;
}

async function scenery(page: Page): Promise<SceneryGame['world']['state']['scenery']> {
  return page.evaluate(() => (window as unknown as { __tc: SceneryGame }).__tc.world.state.scenery.map((s) => ({ ...s })));
}

async function cash(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __tc: SceneryGame }).__tc.world.state.park.cash);
}

async function researchThemes(page: Page): Promise<void> {
  await page.evaluate(() => {
    const g = (window as unknown as { __tc: SceneryGame }).__tc;
    g.world.state.management.research.unlocked.push('frost_peaks', 'volcano_ridge', 'spooky_hollow', 'jungle_lagoon', 'starport');
  });
}

test.describe('scenery tool', () => {
  test('desktop: pick, click to place, Shift-click keeps the tool, R rotates, Remove refunds', async ({ page }, info) => {
    test.skip(isPhone(info), 'desktop flow');
    const errors = watchErrors(page);
    await newPark(page, 'Garden Park');
    await page.evaluate(() => (window as unknown as { __tc: SceneryGame }).__tc.setSpeed(0));
    await centerOn(page, 24, 40);

    await page.getByTestId('tool-scenery').click();
    await expect(page.getByTestId('scenery-picker')).toBeVisible();
    // Locked theme: marked, cards disabled.
    await page.getByTestId('scenery-tab-frost_peaks').click();
    await expect(page.getByTestId('scenery-locked')).toHaveText('Research Scenery to unlock Frost Peaks');
    await expect(page.getByTestId('scenery-item-statue_frost')).toBeDisabled();

    await page.getByTestId('scenery-tab-base').click();
    await page.getByTestId('scenery-item-oak_round').click();
    await expect(page.getByTestId('scenery-status')).toHaveText('Round Oak · $40');
    const before = await cash(page);
    const p = await tilePoint(page, 22, 40);
    await page.mouse.move(p.x, p.y);
    await expect(page.getByTestId('scenery-status-detail')).toContainText('Ready to place');
    await page.mouse.click(p.x, p.y);
    await expect.poll(() => scenery(page)).toEqual([expect.objectContaining({ defId: 'oak_round', x: 22, y: 40 })]);
    expect(await cash(page)).toBe(before - 4_000);
    // Without Shift the tool ends.
    await expect(page.getByTestId('tool-scenery')).toHaveAttribute('aria-pressed', 'false');

    // Researched theme, Shift-click keeps the tool, R turns the next statue.
    await researchThemes(page);
    await page.getByTestId('tool-scenery').click();
    await page.getByTestId('scenery-tab-frost_peaks').click();
    await page.getByTestId('scenery-item-statue_frost').click();
    const q = await tilePoint(page, 24, 40);
    await page.mouse.move(q.x, q.y);
    await page.keyboard.down('Shift');
    await page.mouse.click(q.x, q.y);
    await page.keyboard.up('Shift');
    await expect(page.getByTestId('tool-scenery')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('r');
    const r = await tilePoint(page, 26, 40);
    await page.mouse.move(r.x, r.y);
    await page.mouse.click(r.x, r.y);
    await expect.poll(async () => (await scenery(page)).map((s) => [s.defId, s.x, s.rotation])).toEqual([
      ['oak_round', 22, 0],
      ['statue_frost', 24, 0],
      ['statue_frost', 26, 1],
    ]);

    // Remove mode: click the oak for a $20 refund.
    await page.getByTestId('tool-scenery').click();
    await page.getByTestId('scenery-close').click();
    await page.getByTestId('scenery-remove').click();
    const c0 = await cash(page);
    const o = await tilePoint(page, 22, 40);
    await page.mouse.move(o.x, o.y);
    await expect(page.getByTestId('scenery-status-detail')).toHaveText('Remove Round Oak · +$20');
    await page.mouse.click(o.x, o.y);
    await expect.poll(() => cash(page)).toBe(c0 + 2_000);
    expect((await scenery(page)).map((s) => s.defId)).toEqual(['statue_frost', 'statue_frost']);
    errors.expectNoErrors();
  });

  test('phone: tap an item, tap the map, Confirm', async ({ page }, info) => {
    test.skip(!isPhone(info), 'phone flow');
    const errors = watchErrors(page);
    await newPark(page, 'Pocket Garden');
    await page.evaluate(() => (window as unknown as { __tc: SceneryGame }).__tc.setSpeed(0));
    await centerOn(page, 28, 44);
    await page.getByTestId('tool-scenery').tap();
    await expect(page.getByTestId('scenery-picker')).toBeVisible();
    await page.getByTestId('scenery-tab-classic_fair').tap();
    await page.getByTestId('scenery-item-balloon_cluster').tap();
    // The sheet closes so the map is free; the status bar asks for a tap.
    await expect(page.getByTestId('scenery-picker')).toBeHidden();
    await expect(page.getByTestId('scenery-status-detail')).toHaveText('Tap the map, then Confirm');
    const p = await tilePoint(page, 28, 44);
    await page.touchscreen.tap(p.x, p.y);
    await expect(page.getByTestId('scenery-status-detail')).toContainText('Ready to place');
    expect(await scenery(page)).toEqual([]);
    await page.getByTestId('scenery-repeat').tap();
    await page.getByTestId('scenery-confirm').tap();
    await expect.poll(() => scenery(page)).toEqual([expect.objectContaining({ defId: 'balloon_cluster', x: 28, y: 44 })]);
    await expect(page.getByTestId('tool-scenery')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('scenery-rotate').tap();
    await page.getByTestId('scenery-done').tap();
    await expect(page.getByTestId('tool-scenery')).toHaveAttribute('aria-pressed', 'false');
    errors.expectNoErrors();
  });
});

test.describe('Wave 3 scenery screenshot', () => {
  test.use({ deviceScaleFactor: 2 });
  test('all 6 themes and the base set placed around a garden walk', async ({ page }, info) => {
    test.skip(!process.env.TC_SCREENSHOT || info.project.name !== 'desktop', 'set TC_SCREENSHOT=1 to refresh the screenshot');
    test.setTimeout(120_000);
    const errors = watchErrors(page);
    await newPark(page, 'Six Lands Park');
    await researchThemes(page);
    const placed = await page.evaluate(() => {
      const g = (window as unknown as { __tc: SceneryGame }).__tc;
      g.setSpeed(0);
      const run = (c: Record<string, unknown>): void => {
        const r = g.dispatch(c);
        if (!r.ok) throw new Error(`${String(c.type)}: ${r.reason} ${JSON.stringify(c)}`);
      };
      run({ type: 'borrow', amount: 1_000_000 });
      const line = (x0: number, y0: number, x1: number, y1: number): void => run({ type: 'buildPathLine', x0, y0, x1, y1, kind: 'footpath' });
      // A main walk north from the entrance and a cross walk: each theme gets a plot along them.
      line(31, 59, 31, 30);
      line(14, 44, 48, 44);
      const put = (defId: string, x: number, y: number, rotation = 2, edge = -1): void => run({ type: 'placeScenery', defId, x, y, rotation, edge });
      // Base set (south-west).
      put('oak_round', 24, 50);
      put('pine_tall', 22, 52);
      put('birch_silver', 26, 52);
      put('willow', 24, 54);
      put('fountain_garden', 28, 50);
      put('bed_mixed', 28, 52);
      put('bed_tulip', 29, 52);
      put('shrub_flowering', 28, 54);
      put('boulder', 26, 55);
      put('hedge_low', 30, 50, 0, 1);
      put('hedge_low', 30, 51, 0, 1);
      put('fence_wood', 22, 55, 0, 2);
      put('rail_iron', 23, 55, 0, 2);
      // Classic Fair (south-east).
      put('tent_red', 33, 50);
      put('tent_blue', 36, 52);
      put('bandstand', 33, 54);
      put('fountain_carved', 36, 48);
      put('bunting_pole', 32, 48);
      put('flower_tub', 32, 46);
      put('lamp_globe', 32, 45);
      put('picnic_table', 39, 50);
      put('balloon_cluster', 39, 48);
      put('park_clock', 39, 46);
      put('ticket_arch', 31, 52, 2);
      put('fence_painted', 33, 47, 0, 2);
      // Frost Peaks (north-west of the cross).
      put('snow_pine', 26, 40);
      put('snow_pine_small', 24, 41);
      put('igloo', 22, 38);
      put('fountain_frozen', 27, 37);
      put('statue_frost', 29, 41);
      put('ice_crystals', 29, 39);
      put('snowman', 25, 42);
      put('snowdrift', 23, 42);
      put('aurora_lantern', 30, 42);
      put('sled_rack', 27, 42);
      put('ice_arch', 20, 44, 1);
      put('wall_ice', 22, 40, 0, 2);
      // Volcano Ridge (north-east of the cross).
      put('lava_crag', 33, 39);
      put('magma_pool', 36, 41);
      put('statue_spark', 32, 42);
      put('steam_vent', 35, 39);
      put('glow_crystal', 33, 42);
      put('ember_torch', 32, 41);
      put('fire_fern', 38, 39);
      put('ash_palm', 38, 41);
      put('basalt_columns', 36, 38);
      put('lava_rock', 39, 42);
      put('volcano_gate', 40, 44, 1);
      put('wall_basalt', 35, 43, 0, 2);
      // Spooky Hollow (far west, along the cross walk).
      put('tree_bare', 15, 41);
      put('tree_twisted', 17, 42);
      put('pumpkin_patch', 16, 46);
      put('pumpkin_lantern', 15, 45);
      put('ghost_lantern', 18, 45);
      put('statue_boo', 17, 46);
      put('old_well', 19, 41);
      put('fog_pot', 19, 42);
      put('owl_perch', 15, 43);
      put('mossy_stones', 18, 47);
      put('gate_crooked', 16, 44, 1);
      put('fence_spiked', 14, 46, 0, 2);
      // Jungle Lagoon (north, along the main walk).
      put('lagoon_palm', 29, 33);
      put('rock_waterfall', 27, 31);
      put('bamboo_grove', 29, 35);
      put('giant_leaf', 30, 36);
      put('bed_tropical', 30, 34);
      put('lily_pond', 29, 37);
      put('mossy_pillar', 26, 34);
      put('parrot_perch', 30, 32);
      put('fern_cluster', 27, 35);
      put('rope_bridge_decor', 25, 36, 0);
      put('ruin_arch', 31, 34, 0);
      put('wall_vine', 26, 33, 0, 2);
      // Starport (far east, along the cross walk).
      put('rocket_model', 44, 41);
      put('satellite_dish', 46, 40);
      put('planet_globe', 43, 42);
      put('statue_robot', 45, 42);
      put('neon_post', 42, 42);
      put('crater', 43, 46);
      put('moon_rock', 46, 45);
      put('star_beacon', 47, 42);
      put('hologram_pad', 45, 46);
      put('radar_tower', 48, 41);
      put('neon_arch', 46, 44, 1);
      put('wall_hull', 42, 43, 0, 2);
      // Frame every plot: Spooky Hollow (west) to Starport (east), Jungle Lagoon (north) to the base set (south).
      g.camera.zoom = 0.82;
      g.camera.centerX = -502;
      g.camera.centerY = 1052;
      return g.world.state.scenery.length;
    });
    expect(placed).toBe(85);
    await page.waitForTimeout(800);
    await page.screenshot({ path: 'docs/screenshots/wave3-scenery.png' });
    errors.expectNoErrors();
  });
});
