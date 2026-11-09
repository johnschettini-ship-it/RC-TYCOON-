import { expect, test } from '@playwright/test';
import { newPark, watchErrors } from './helpers';

/**
 * `TC_SCREENSHOT=1`: save docs/screenshots/build3-overview.png (desktop, device scale 2). One Build 3 park at dusk
 * (After Dark on, between 20:00 and 21:00, a Lightshow Tower and a Fireworks Launcher show running): terrain with a lake, an elevated
 * path across it, Frost Peaks and Volcano Ridge scenery, an Inverted Coaster with its corkscrew and helix, a Log
 * Flume, lamps, flat rides and stalls, staff, and guests. Built with commands through the debug hook; the Phase 4–6
 * research items are marked researched and the cash is written in (a picture, not a playthrough).
 */

interface OverviewTc {
  world: {
    state: {
      tick: number;
      map: { width: number; heights: ArrayLike<number>; water: ArrayLike<number> };
      park: { cash: number; afterDark: boolean };
      management: { research: { unlocked: string[] }; weather: { current: string } };
      rides: Array<{ id: number; kind: string; status: string; entrance: { gate: number; outside: number } | null; exit: { gate: number; outside: number } | null }>;
      track: { rides: Record<string, { test: { passed: boolean } | null }> };
      shows: Array<{ id: number; status: string }>;
      scenery: unknown[];
      elevatedPaths: unknown[];
      staff: { members: unknown[] };
      guests: unknown[];
    };
  };
  camera: { centerX: number; centerY: number; zoom: number };
  dispatch(cmd: Record<string, unknown>): { ok: boolean; reason?: string; id?: number };
  step(n: number): void;
  setSpeed(n: number): void;
}

const UNLOCK = ['log_flume', 'frost_peaks', 'volcano_ridge', 'kiddie_cars', 'smoothie_bar', 'magic_carpet', 'lightshow_tower', 'noodle_bar', 'fireworks_launcher', 'inverted_coaster', 'merry_mill', 'photo_booth'];

test.describe('Build 3 overview screenshot', () => {
  test.use({ deviceScaleFactor: 2 });
  test('one park at dusk: lake, bridge, two scenery themes, a corkscrew coaster, a flume, a show, staff, guests', async ({ page }, info) => {
    test.skip(!process.env.TC_SCREENSHOT || info.project.name !== 'desktop', 'set TC_SCREENSHOT=1 to refresh the screenshot');
    test.setTimeout(300_000);
    const errors = watchErrors(page);
    await newPark(page, 'Frost & Spark Park');
    const summary = await page.evaluate((unlock) => {
      const g = (window as unknown as { __tc: OverviewTc }).__tc;
      g.setSpeed(0);
      const st = g.world.state;
      st.management.research.unlocked.push(...unlock);
      st.park.cash = 20_000_000;
      const run = (c: Record<string, unknown>): { id?: number } => {
        const r = g.dispatch(c);
        if (!r.ok) throw new Error(`${String(c.type)}: ${r.reason} ${JSON.stringify(c)}`);
        return r;
      };
      const line = (x0: number, y0: number, x1: number, y1: number, kind = 'footpath'): void => {
        run({ type: 'buildPathLine', x0, y0, x1, y1, kind });
      };
      const w = st.map.width;
      const pathAt = (tile: number, kind: string): void => {
        run({ type: 'buildPath', x: tile % w, y: Math.floor(tile / w), kind });
      };

      // The lake first (land lowered, water raised), east of the main path.
      const lake: ReadonlyArray<readonly [number, number]> = [[37, 17], [40, 17], [43, 17], [46, 17], [37, 19], [40, 19], [43, 19], [46, 19]];
      for (const [x, y] of lake) run({ type: 'lowerLand', x, y, size: 3 });
      for (const [x, y] of lake) run({ type: 'raiseWater', x, y, size: 3 });

      // Paths: the main spine from the entrance, the north road, and a road along the lake's north shore.
      line(31, 59, 31, 6);
      line(30, 6, 5, 6);
      line(32, 6, 50, 6);
      line(4, 4, 4, 6, 'queue');
      line(6, 4, 6, 5);
      line(19, 11, 30, 11);
      line(32, 14, 49, 14);
      line(32, 7, 32, 13);
      // An elevated footpath (a bridge 2 m up) across the lake, south from the shore road.
      run({ type: 'buildPathLine', x0: 41, y0: 15, x1: 41, y1: 20, kind: 'footpath', z: 10 });

      // Inverted Coaster (as in content.spec.ts): chain lift, helix, 12 m drop, corkscrew.
      const id = run({ type: 'placeStation', typeId: 'inverted_coaster', x: 4, y: 2, dir: 1 }).id as number;
      const ch = (d: string): [string, boolean, number?] => [d, true];
      const s = (d: string): [string, boolean, number?] => [d, false];
      const times = (n: number, d: string): Array<[string, boolean, number?]> => Array.from({ length: n }, () => s(d));
      const pieces: Array<[string, boolean, number?]> = [
        s('station'), s('station'),
        ch('flat_to_gentle_up'), ch('gentle_to_steep_up'), ch('steep_up'), ch('steep_to_gentle_up'), ch('gentle_up_to_flat'),
        s('helix_right_down'), s('turn_medium_right'),
        s('flat_to_gentle_down'), s('gentle_down'), s('gentle_to_steep_down'), s('steep_to_gentle_down'), s('gentle_down_to_flat'),
        s('corkscrew_right'), ['brakes', false, 8], s('turn_medium_right'),
        ...times(11, 'straight'), s('turn_medium_right'), ...times(9, 'straight'), s('turn_medium_right'),
      ];
      for (const [defId, chain, brakeSpeed] of pieces) run({ type: 'addTrackPiece', rideId: id, defId, chain, ...(brakeSpeed ? { brakeSpeed } : {}) });
      run({ type: 'placeTrackGate', rideId: id, kind: 'entrance', x: 4, y: 3 });
      run({ type: 'placeTrackGate', rideId: id, kind: 'exit', x: 6, y: 3 });
      run({ type: 'setTrackColours', rideId: id, track: 6, supports: 9, cars: 0 });
      run({ type: 'startTestRun', rideId: id });
      g.step(1100);
      run({ type: 'setRideOpen', rideId: id, open: true });

      // Log Flume (tests/unit/track/waterRides.test.ts circuit) east of the main path, gates on the north road.
      const flume = run({ type: 'placeStation', typeId: 'log_flume', x: 36, y: 8, dir: 1 }).id as number;
      const f = (p: string): string => `flume_${p}`;
      const flumePieces = [
        f('station'), f('lift'), f('lift'), f('lift'), f('straight'), f('turn_small_r'), f('drop'), f('splashdown'), f('turn_small_r'),
        ...Array.from({ length: 6 }, () => f('straight')), f('turn_small_r'), ...Array.from({ length: 3 }, () => f('straight')), f('turn_small_r'),
      ];
      for (const defId of flumePieces) run({ type: 'addTrackPiece', rideId: flume, defId });
      run({ type: 'placeTrackGate', rideId: flume, kind: 'entrance', x: 36, y: 7 });
      run({ type: 'placeTrackGate', rideId: flume, kind: 'exit', x: 37, y: 7 });
      run({ type: 'startTestRun', rideId: flume });
      g.step(1200);
      run({ type: 'setRideOpen', rideId: flume, open: true });

      // Two flat rides south of the west road and three stalls north of the main road.
      for (const [defId, x] of [['magic_carpet', 19], ['merry_mill', 24]] as const) {
        const rideId = run({ type: 'placeRide', defId, x, y: 8, rotation: 2 }).id as number;
        const r = st.rides.find((q) => q.id === rideId)!;
        if (r.entrance) pathAt(r.entrance.outside, 'queue');
        if (r.exit) pathAt(r.exit.outside, 'footpath');
        run({ type: 'setRideOpen', rideId, open: true });
      }
      for (const [defId, x] of [['noodle_bar', 21], ['smoothie_bar', 23], ['photo_booth', 26]] as const) run({ type: 'placeStall', defId, x, y: 5, rotation: 2 });

      // Show sites by the shore road, both at 20:00 every day.
      const tower = run({ type: 'placeShowSite', defId: 'lightshow_tower', x: 46, y: 11, rotation: 0 }).id as number;
      const launcher = run({ type: 'placeShowSite', defId: 'fireworks_launcher', x: 49, y: 12, rotation: 0 }).id as number;
      for (const sid of [tower, launcher]) {
        run({ type: 'setShowSchedule', id: sid, hour: 20, minute: 0, everyNDays: 1 });
        run({ type: 'setShowEnabled', id: sid, enabled: true });
      }

      // Scenery: Frost Peaks on the west shore, Volcano Ridge on the east shore.
      const put = (defId: string, x: number, y: number, rotation = 0): void => {
        run({ type: 'placeScenery', defId, x, y, rotation, edge: -1 });
      };
      for (const [defId, x, y] of [
        ['snow_pine', 34, 15], ['snow_pine_small', 34, 17], ['snowman', 35, 20], ['snow_pine', 33, 19], ['ice_crystals', 36, 21],
        ['aurora_lantern', 33, 13], ['snow_pine_small', 37, 21], ['statue_frost', 35, 13],
      ] as const) put(defId, x, y);
      for (const [defId, x, y] of [
        ['ash_palm', 48, 16], ['lava_rock', 48, 21], ['glow_crystal', 49, 18], ['ember_torch', 44, 13], ['basalt_columns', 49, 20],
        ['fire_fern', 46, 21], ['ash_palm', 50, 15], ['statue_spark', 48, 13],
      ] as const) put(defId, x, y);
      // Lamps along the roads (lit paths at night).
      for (const [x, y] of [[31, 10], [31, 16], [31, 22], [34, 14], [38, 14], [44, 6], [27, 6], [15, 6], [40, 6], [25, 11]] as const) run({ type: 'buildPathItem', x, y, itemType: 'lamp' });

      for (const staffType of ['mechanic', 'mechanic', 'groundskeeper', 'groundskeeper', 'groundskeeper', 'security', 'performer']) run({ type: 'hireStaff', staffType });
      run({ type: 'setAfterDark', on: true });
      run({ type: 'setEntranceFee', fee: 500 });
      run({ type: 'setParkOpen', open: true });

      // Fill the park over a few days, then wait for a dusk (20:10–20:58, both shows running) when a loaded train rolls
      // through the corkscrew: piece 15, from 120,897 mm along the circuit for 15,919 mm (content.spec.ts). Each day
      // the train passes about 105 ticks earlier in the day (a lap with its dwell is ~1,095 ticks), so its pass
      // falls in the dusk window within about 3 weeks; without a match it stops at 20:30.
      g.step(6_000);
      const DAY = 1200;
      const HOUR = 50;
      type Train = { state: string; s: number; seats: number[] };
      const train = (): Train | undefined => (st.track.rides[String(id)] as unknown as { trains: Train[] } | undefined)?.trains[0];
      let inCorkscrew = false;
      for (let t = 0; t < 40 * DAY && !inCorkscrew; t++) {
        g.step(1);
        const tod = st.tick % DAY;
        const tr = train();
        inCorkscrew = tod >= 20 * HOUR + 8 && tod <= 20 * HOUR + 48 && !!tr && tr.state === 'running' && tr.s > 124_000 && tr.s < 132_000 && tr.seats.filter((q) => q >= 0).length >= 4;
      }
      if (!inCorkscrew) {
        const now = st.tick;
        let target = Math.floor(now / DAY) * DAY + 20 * HOUR + 25;
        if (target < now) target += DAY;
        g.step(target - now);
      }
      st.management.weather.current = 'sunny';
      // Frame the corkscrew (17, 10), the flume, the lake with its bridge, the scenery, and the show sites; the toolbar
      // covers the left edge and the HUD the top.
      g.camera.zoom = 0.9;
      g.camera.centerX = 590;
      g.camera.centerY = 630;
      let wet = 0;
      for (let i = 0; i < st.map.width * st.map.width; i++) if ((st.map.water[i] ?? 0) > (st.map.heights[i] ?? 0)) wet += 1;
      return {
        guests: st.guests.length,
        staff: st.staff.members.length,
        tested: st.track.rides[String(id)]?.test?.passed ?? false,
        flumeTested: st.track.rides[String(flume)]?.test?.passed ?? false,
        shows: st.shows.map((x) => x.status),
        scenery: st.scenery.length,
        elevated: st.elevatedPaths.length,
        corkscrew: (st.track.rides[String(id)] as unknown as { pieces: Array<{ defId: string; x: number; y: number }> }).pieces.filter((p) => p.defId.startsWith('corkscrew') || p.defId.startsWith('helix')).map((p) => [p.defId, p.x, p.y]),
        wet,
        afterDark: st.park.afterDark,
        inCorkscrew,
        clock: `${Math.floor((st.tick % DAY) / HOUR)}:${String(Math.floor(((st.tick % DAY) % HOUR) * 1.2)).padStart(2, '0')}`,
      };
    }, UNLOCK);
    console.log(JSON.stringify(summary));
    expect(summary.tested).toBe(true);
    expect(summary.flumeTested).toBe(true);
    expect(summary.shows).toEqual(['running', 'running']);
    expect(summary.scenery).toBeGreaterThanOrEqual(16);
    expect(summary.elevated).toBeGreaterThan(0);
    expect(summary.wet).toBeGreaterThan(9);
    expect(summary.staff).toBe(7);
    expect(summary.guests).toBeGreaterThan(50);
    await page.waitForTimeout(3500);
    const dismiss = page.locator('.msg-toast:not([hidden]) .icon-btn');
    while ((await dismiss.count()) > 0) await dismiss.first().click();
    const award = page.locator('[data-testid="award-toast"]:not([hidden])');
    for (let k = 0; k < 10 && (await award.count()) > 0; k++) {
      await award.click();
      await page.waitForTimeout(250);
    }
    await page.screenshot({ path: 'docs/screenshots/build3-overview.png' });
    errors.expectNoErrors();
  });
});
