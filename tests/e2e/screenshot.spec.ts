import { expect, test } from '@playwright/test';
import { newPark, watchErrors } from './helpers';

/**
 * `TC_SCREENSHOT=1`: save docs/screenshots/build1-overview.png (desktop, device scale 2).
 * One Build 1 park: the Steel Coaster R1 with a loaded train on the move, four flat rides, stalls (with a
 * Balloon Stand and an Umbrella Stand), bins and benches, four staff, and guests, some holding balloons (and
 * open umbrellas when it rains). The park is built with commands through the debug hook. The two stands are
 * Phase 3 research items: the script marks them researched instead of waiting for the research, and borrows
 * $10,000 for the build.
 */

interface OverviewGame {
  world: {
    state: {
      management: { research: { unlocked: string[] } };
      guests: Array<{ items: { balloon: boolean } }>;
      track: { rides: Record<string, { trains: Array<{ state: string; v: number; s: number; seats: number[] }> }> };
    };
  };
  camera: { centerX: number; centerY: number; zoom: number };
  dispatch(cmd: Record<string, unknown>): { ok: boolean; reason?: string; id?: number };
  step(n: number): void;
  setSpeed(n: number): void;
}

test.describe('Build 1 overview screenshot', () => {
  test.use({ deviceScaleFactor: 2 });
  test('a park with a running coaster, flat rides, stalls, staff, and guests with balloons', async ({ page }, info) => {
    test.skip(!process.env.TC_SCREENSHOT || info.project.name !== 'desktop', 'set TC_SCREENSHOT=1 to refresh the screenshot');
    test.setTimeout(240_000);
    const errors = watchErrors(page);
    await newPark(page, 'Sunny Hills Park');
    const summary = await page.evaluate(() => {
      const g = (window as unknown as { __tc: OverviewGame }).__tc;
      g.setSpeed(0);
      const run = (c: Record<string, unknown>): { id?: number } => {
        const r = g.dispatch(c);
        if (!r.ok) throw new Error(`${String(c.type)}: ${r.reason} ${JSON.stringify(c)}`);
        return r;
      };
      const line = (x0: number, y0: number, x1: number, y1: number, kind = 'footpath'): void => {
        run({ type: 'buildPathLine', x0, y0, x1, y1, kind });
      };
      run({ type: 'borrow', amount: 1_000_000 });
      // Paths first, so the coaster drop skips its support over the footpath (phase-2 §9.2 script).
      line(31, 59, 31, 6);
      line(30, 6, 5, 6);
      line(6, 4, 6, 5);
      line(4, 4, 4, 6, 'queue');
      line(5, 11, 12, 11);
      line(12, 7, 12, 10);
      line(20, 11, 30, 11);

      // R1 (phase-2 §9.2): Steel Coaster, station at (4, 2) heading east.
      const id = run({ type: 'placeStation', typeId: 'steel_coaster', x: 4, y: 2, dir: 1 }).id as number;
      const ch = (d: string): [string, boolean, number?] => [d, true];
      const pieces: Array<[string, boolean, number?]> = [
        ['station', false], ['station', false],
        ch('flat_to_gentle_up'), ch('gentle_to_steep_up'), ch('steep_up'), ch('steep_to_gentle_up'), ch('gentle_up_to_flat'),
        ['straight', false], ['straight', false], ['turn_medium_right', false],
        ['flat_to_gentle_down', false], ['gentle_to_steep_down', false], ['steep_down', false], ['steep_to_gentle_down', false], ['gentle_down_to_flat', false],
        ['brakes', false, 8], ['turn_medium_right', false],
        ...Array.from({ length: 10 }, (): [string, boolean] => ['straight', false]), ['turn_medium_right', false],
        ...Array.from({ length: 6 }, (): [string, boolean] => ['straight', false]), ['turn_medium_right', false],
      ];
      for (const [defId, chain, brakeSpeed] of pieces) run({ type: 'addTrackPiece', rideId: id, defId, chain, ...(brakeSpeed ? { brakeSpeed } : {}) });
      run({ type: 'placeTrackGate', rideId: id, kind: 'entrance', x: 4, y: 3 });
      run({ type: 'placeTrackGate', rideId: id, kind: 'exit', x: 6, y: 3 });
      run({ type: 'setTrainConfig', rideId: id, trains: 1, carsPerTrain: 4 });
      run({ type: 'startTestRun', rideId: id });
      g.step(1100);
      run({ type: 'setRideOpen', rideId: id, open: true });

      // Four flat rides facing north: a 1-tile queue from the main row (y = 6), the exit onto a back row (y = 11).
      for (const [defId, x, y] of [['big_wheel', 4, 8], ['swing_tower', 8, 8], ['teacup_twirl', 19, 8], ['carousel', 24, 8]] as const) {
        const rideId = run({ type: 'placeRide', defId, x, y, rotation: 2 }).id as number;
        run({ type: 'buildPath', x: x + 1, y: y - 1, kind: 'queue' });
        run({ type: 'setRideOpen', rideId, open: true });
      }
      g.world.state.management.research.unlocked.push('balloon_stand', 'umbrella_stand');
      for (const [defId, x] of [['snack_shack', 19], ['fizz_stand', 21], ['balloon_stand', 23], ['umbrella_stand', 25], ['restrooms', 27]] as const) {
        run({ type: 'placeStall', defId, x, y: 5, rotation: 2 });
      }
      run({ type: 'placeStall', defId: 'balloon_stand', x: 32, y: 9, rotation: 3 });
      for (const [x, y, itemType] of [[14, 6, 'bench'], [17, 6, 'bin'], [29, 6, 'bench'], [31, 14, 'bin'], [8, 11, 'bin']] as const) {
        run({ type: 'buildPathItem', x, y, itemType });
      }
      for (const staffType of ['mechanic', 'groundskeeper', 'security', 'performer']) run({ type: 'hireStaff', staffType });
      run({ type: 'setEntranceFee', fee: 500 });
      run({ type: 'setParkOpen', open: true });

      // Let the park fill up, then stop with a loaded train moving fast on the circuit.
      const st = g.world.state;
      const train = (): { state: string; v: number; s: number; seats: number[] } | undefined => st.track.rides[String(id)]?.trains[0];
      g.step(9_000);
      for (let t = 0; t < 20_000; t++) {
        g.step(1);
        const tr = train();
        if (tr && tr.state === 'running' && tr.v > 12_000 && tr.seats.filter((s) => s >= 0).length >= 12) break;
      }
      g.camera.zoom = 0.9;
      g.camera.centerX = 170;
      g.camera.centerY = 262;
      const tr = train();
      return {
        guests: st.guests.length,
        balloons: st.guests.filter((x) => x.items.balloon).length,
        trainState: tr?.state ?? 'none',
        trainSpeed: tr?.v ?? 0,
        riders: tr ? tr.seats.filter((s) => s >= 0).length : 0,
      };
    });
    expect(summary.balloons).toBeGreaterThan(5);
    expect(summary.trainState).toBe('running');
    expect(summary.riders).toBeGreaterThan(0);
    // Let the build toasts (3 s) fade, and dismiss message toasts (research news), before the picture.
    await page.waitForTimeout(3500);
    const dismiss = page.locator('.msg-toast:not([hidden]) .icon-btn');
    while ((await dismiss.count()) > 0) await dismiss.first().click();
    await page.screenshot({ path: 'docs/screenshots/build1-overview.png' });
    errors.expectNoErrors();
  });
});
