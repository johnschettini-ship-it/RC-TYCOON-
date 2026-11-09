/**
 * Scenery benchmarks (W3-D). Phase 4 §9.4: one scenery change updates fields and light in < 0.2 ms. The change goes
 * through the real commands (`placeScenery` then `removeScenery`), which call `markFieldsDirty` / `markLightDirty`
 * for every touched tile (W3-E and W3-F stubs until the gate), the occupancy and network marks, and the derived
 * scenery index. Also: the hourly garden upkeep with 2,000 gardens, and the per-tile queries other cards call in hot
 * loops (`edgeBlocked`, `spookyItemsNear`). Run with `npm run bench` on a 128 × 128 map with 3,000 items.
 */
import { test } from 'vitest';
import { SCENERY } from '../../src/data/catalog';
import { executeCommand } from '../../src/sim/commands';
import { tileIndex } from '../../src/sim/map';
import { edgeBlocked, spookyItemsNear } from '../../src/sim/scenery/api';
import { hourlyScenery } from '../../src/sim/scenery/update';
import { createWorld } from '../../src/sim/world';
import type { World } from '../../src/sim/types';

const RUN = { time: 2_000, warmupTime: 300 };

function report(label: string, mean: number, tail: number, budget: number): void {
  const verdict = mean < budget ? 'within' : 'OVER';
  console.log(`[bench] ${label}: mean ${mean.toFixed(4)} ms, p99 ${tail.toFixed(4)} ms (${verdict} the ${budget} ms budget)`);
}

/** 128 × 128 classic park with every theme researched and about 3,000 scenery items (a third of them gardens). */
function busyPark(): World {
  const w = createWorld({ seed: 99, parkName: 'Bench Gardens', mapSize: 128 });
  w.state.management.research.unlocked.push('frost_peaks', 'volcano_ridge', 'spooky_hollow', 'jungle_lagoon', 'starport');
  const singles = SCENERY.filter((d) => !d.edge && !d.overPath && d.w === 1 && d.d === 1);
  const gardens = SCENERY.filter((d) => d.needsWater);
  let k = 0;
  for (let y = 2; y < 125 && w.state.scenery.length < 3_000; y += 2) {
    for (let x = 2; x < 125 && w.state.scenery.length < 3_000; x += 2) {
      const def = k % 3 === 0 ? gardens[k % gardens.length]! : singles[k % singles.length]!;
      executeCommand(w, { type: 'placeScenery', defId: def.id, x, y, rotation: (k % 4) as 0 | 1 | 2 | 3, edge: -1 }, { setup: true });
      if (k % 5 === 0) executeCommand(w, { type: 'placeScenery', defId: 'hedge_low', x, y, rotation: 0, edge: 2 }, { setup: true });
      k++;
    }
  }
  return w;
}

test('one scenery change (place + remove) incl. field and light marks (budget 0.2 ms each)', async ({ bench }) => {
  const world = busyPark();
  let id = -1;
  const r = await bench('placeScenery / removeScenery', () => {
    if (id < 0) {
      const res = executeCommand(world, { type: 'placeScenery', defId: 'fountain_carved', x: 3, y: 3, rotation: 0, edge: -1 }, { setup: true });
      id = res.ok && res.id !== undefined ? res.id : -1;
    } else {
      executeCommand(world, { type: 'removeScenery', id }, { setup: true });
      id = -1;
    }
  }).run(RUN);
  report(`scenery change (${world.state.scenery.length} items)`, r.latency.mean, r.latency.p99 ?? r.latency.max, 0.2);
}, 60_000);

test('hourly garden upkeep with about 1,000 gardens', async ({ bench }) => {
  const world = busyPark();
  world.state.management.weather.current = 'sunny';
  const r = await bench('hourlyScenery', () => {
    hourlyScenery(world);
    for (const s of world.state.scenery) s.waterLevel = 255;
  }).run(RUN);
  report('hourly garden upkeep', r.latency.mean, r.latency.p99 ?? r.latency.max, 0.5);
}, 60_000);

test('per-tile queries: edgeBlocked × 4 and spookyItemsNear(6)', async ({ bench }) => {
  const world = busyPark();
  const t = tileIndex(world.state.map, 64, 64);
  let n = 0;
  const r = await bench('edgeBlocked ×4 + spookyItemsNear', () => {
    for (let d = 0; d < 4; d++) if (edgeBlocked(world, t, d as 0 | 1 | 2 | 3)) n++;
    n += spookyItemsNear(world, t, 6);
  }).run(RUN);
  report(`tile queries (${n > 0 ? 'hits' : 'no hits'})`, r.latency.mean, r.latency.p99 ?? r.latency.max, 0.01);
}, 60_000);
