/**
 * After Dark determinism (master 5.4, Phase 4 §9.3): the light map is derived data, so a game that saves and loads
 * in the middle of a night, or one whose render and UI read the light map between ticks, must end with the same
 * state hash as the game that never did. Owner: W3-F.
 */
import { describe, expect, it } from 'vitest';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../../../src/data/tuning/core';
import { deserialize, GAME_VERSION, serialize } from '../../../src/save';
import { executeCommand } from '../../../src/sim/commands';
import { lightAt, litShare } from '../../../src/sim/lighting/api';
import { lightSources } from '../../../src/sim/lighting/lightMap';
import { PathItem, tileIndex } from '../../../src/sim/map';
import type { World } from '../../../src/sim/types';
import { makeTestWorld, runTicks, stateHash } from '../../helpers/world';
import { buildPhase3Park, must } from '../../integration/scenario';

const SEED = 2468;

/** The Phase 3 park with lamps on half of its paths, run to 19:00 of day 2 with After Dark on. */
function nightPark(): World {
  const w = makeTestWorld(SEED, 'Night Park');
  buildPhase3Park(w);
  must(w, { type: 'borrow', amount: 300_000 });
  must(w, { type: 'setEntranceFee', fee: 0 });
  const map = w.state.map;
  // Lamps along the lower loop's south row and west column (the lamp is Phase 4 content: written directly).
  for (const [x, y] of [[25, 59], [29, 59], [35, 59], [24, 50], [24, 54]] as const) map.pathItem[tileIndex(map, x, y)] = PathItem.Lamp;
  const target = TICKS_PER_DAY + 19 * TICKS_PER_HOUR;
  runTicks(w, target - w.state.tick);
  expect(w.state.park.afterDark).toBe(true);
  expect(w.state.guests.length).toBeGreaterThan(20);
  return w;
}

describe('After Dark keeps the simulation deterministic', () => {
  it('a save and load in the middle of the night continues to the same state hash', () => {
    const live = nightPark();
    runTicks(live, 3 * TICKS_PER_HOUR + 17);
    const json = serialize(live, GAME_VERSION, '2026-11-09T22:00:00.000Z');
    const loaded = deserialize(json);
    if (!loaded.ok) throw new Error(loaded.error);
    for (let step = 0; step < 6; step++) {
      runTicks(live, TICKS_PER_HOUR);
      runTicks(loaded.world, TICKS_PER_HOUR);
      expect(stateHash(loaded.world), `hour ${step + 1}`).toBe(stateHash(live));
    }
  }, 60_000);

  it('reading the light map between ticks (render, UI) and editing lamps between ticks does not change the run', () => {
    const plain = nightPark();
    const watched = nightPark();
    const map = (w: World) => w.state.map;
    const lampTile = (w: World) => tileIndex(map(w), 30, 48);
    for (let t = 0; t < 8 * TICKS_PER_HOUR; t++) {
      // The watched game is read between ticks the way the render and the park panel read it.
      lightSources(watched);
      litShare(watched);
      lightAt(watched, lampTile(watched));
      // Both games get the same edit between the same ticks, without telling the light module.
      if (t === 2 * TICKS_PER_HOUR) {
        for (const w of [plain, watched]) map(w).pathItem[lampTile(w)] = PathItem.Lamp;
      }
      if (t === 5 * TICKS_PER_HOUR) {
        for (const w of [plain, watched]) map(w).pathItemFlags[lampTile(w)] = 1;
      }
      runTicks(plain, 1);
      runTicks(watched, 1);
    }
    expect(stateHash(watched)).toBe(stateHash(plain));
  }, 60_000);

  it('the same script twice gives the same state hash, and After Dark off gives a different night', () => {
    const a = nightPark();
    const b = nightPark();
    const c = nightPark();
    expect(executeCommand(c, { type: 'setAfterDark', on: false }).ok).toBe(true);
    for (const w of [a, b, c]) runTicks(w, 10 * TICKS_PER_HOUR);
    expect(stateHash(a)).toBe(stateHash(b));
    expect(stateHash(c)).not.toBe(stateHash(a));
  }, 60_000);
});
