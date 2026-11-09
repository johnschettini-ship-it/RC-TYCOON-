/** Phase 5 §4.7: the 8 scenario maps — golden hashes, validation, slope legality, features, start conditions. */
import { describe, expect, it } from 'vitest';
import { getSceneryDef } from '../../../src/data/catalog';
import { getScenarioDef, SCENARIOS, type Difficulty } from '../../../src/data/scenarios';
import { TICKS_PER_MONTH } from '../../../src/data/tuning/core';
import { REL_MAX } from '../../../src/data/tuning/staff';
import { DIFFICULTY } from '../../../src/data/tuning/scenario';
import { validateState } from '../../../src/save';
import { Content, Owned, PathItem, Terrain, tileIndex } from '../../../src/sim/map';
import { isBroken } from '../../../src/sim/litter/pathItems';
import { scenarioMaxLoan } from '../../../src/sim/scenario/api';
import { landReachableFromEntrance } from '../../../src/sim/scenario/generate';
import { createScenarioWorld } from '../../../src/sim/scenario/start';
import { generateTerrain } from '../../../src/sim/scenario/terrain';
import type { World } from '../../../src/sim/types';
import { stateHash } from '../../helpers/world';
import { cornersAt, isWetAt, terrainHash } from './helpers';

const cache = new Map<string, World>();
function scenario(id: string, difficulty: Difficulty = 'standard'): World {
  const key = `${id}/${difficulty}`;
  let w = cache.get(key);
  if (!w) {
    w = createScenarioWorld(id, difficulty) as World;
    cache.set(key, w);
  }
  return w;
}

describe('the 8 scenarios (Phase 5 §4.7 table)', () => {
  it('are listed in card order with their stars, deadlines, climates, and After Dark rules', () => {
    expect(SCENARIOS.map((s) => [s.id, s.stars, s.timeLimitMonths, s.climate, s.afterDark])).toEqual([
      ['meadow_start', 1, 12, 'temperate', 'off'],
      ['sandy_shores', 2, 18, 'hot', 'on'],
      ['frostbite_falls', 2, 24, 'cold', 'off'],
      ['volcano_ridge', 3, 24, 'temperate', 'on'],
      ['spooky_hollow', 3, 24, 'temperate', 'forced'],
      ['harbor_lights', 3, 30, 'coastal', 'forced'],
      ['fading_fairground', 4, 24, 'temperate', 'off'],
      ['sky_high', 5, 36, 'hot', 'on'],
    ]);
    expect(new Set(SCENARIOS.map((s) => s.map.seed)).size).toBe(8);
    expect(getScenarioDef('nope')).toBeUndefined();
    expect(createScenarioWorld('nope', 'standard')).toBeNull();
  });

  it('carry the goals and start money of the table (cents, hundredths)', () => {
    const goals = Object.fromEntries(SCENARIOS.map((s) => [s.id, s.objectives]));
    expect(goals.meadow_start).toEqual([{ type: 'guestsInPark', count: 250, minRating: 500 }]);
    expect(goals.sandy_shores).toEqual([
      { type: 'temperamentBalance', minGuests: 400, minShare: 30, minHappiness: 170, months: 2 },
      { type: 'monthlyProfit', amount: 500_000, months: 1 },
    ]);
    expect(goals.frostbite_falls).toEqual([{ type: 'guestsInPark', count: 400 }, { type: 'monthlyRideIncome', amount: 400_000, months: 1 }]);
    expect(goals.volcano_ridge).toEqual([{ type: 'coasterExcitement', count: 2, minExcitement: 650, maxIntensity: 850 }, { type: 'guestsInPark', count: 500 }]);
    expect(goals.spooky_hollow).toEqual([{ type: 'ridesOpen', count: 3, flag: 'spooky' }, { type: 'afterDarkHappiness', minGuests: 300, minHappiness: 180, months: 1 }]);
    expect(goals.harbor_lights).toEqual([
      { type: 'guestsInPark', count: 600 },
      { type: 'afterDarkHappiness', minGuests: 200, minHappiness: 170, months: 1 },
      { type: 'parkValue', value: 12_000_000 },
    ]);
    expect(goals.fading_fairground).toEqual([{ type: 'repayLoan' }, { type: 'parkRatingHeld', rating: 650, months: 3 }]);
    expect(goals.sky_high).toEqual([{ type: 'guestsInPark', count: 500 }, { type: 'coasterExcitement', count: 1, minExcitement: 700 }, { type: 'parkValue', value: 15_000_000 }]);
    expect(SCENARIOS.map((s) => [s.start.cash, s.start.loan, s.start.maxLoan])).toEqual([
      [2_000_000, 0, 2_000_000],
      [2_200_000, 500_000, 3_000_000],
      [1_800_000, 1_000_000, 3_000_000],
      [2_500_000, 1_000_000, 4_000_000],
      [2_000_000, 0, 3_000_000],
      [2_500_000, 0, 5_000_000],
      [200_000, 3_000_000, 3_500_000],
      [3_000_000, 0, 6_000_000],
    ]);
  });

  it('pin their generated terrain with golden hashes (heights, slopes, water, terrain, ownership, entrance)', () => {
    const hashes = Object.fromEntries(SCENARIOS.map((s) => [s.id, terrainHash(scenario(s.id).state.map)]));
    expect(hashes).toMatchInlineSnapshot(`
      {
        "fading_fairground": "c9f8d5c2",
        "frostbite_falls": "dd15b9db",
        "harbor_lights": "36785f66",
        "meadow_start": "d75bc042",
        "sandy_shores": "3f63a6b7",
        "sky_high": "9984470f",
        "spooky_hollow": "c6bf8e88",
        "volcano_ridge": "bb0d7c40",
      }
    `);
  });

  for (const def of SCENARIOS) {
    describe(def.id, () => {
      it('generates, passes the save checks, and is the same every time', () => {
        const w = scenario(def.id);
        expect(validateState(w.state)).toBeNull();
        expect(w.state.map.width).toBe(def.map.width);
        expect(w.state.map.height).toBe(def.map.height);
        expect(w.state.tick).toBe(450);
        expect(w.events).toEqual([]);
        expect(stateHash(createScenarioWorld(def.id, 'standard') as World)).toBe(stateHash(w));
      });

      it('keeps the slope rules: neighbours meet at the same corners except across cliffs', () => {
        const t = generateTerrain(def.map);
        expect(t.passes).toBeLessThanOrEqual(64);
        for (let y = 0; y < t.height; y++) {
          for (let x = 0; x < t.width; x++) {
            const i = y * t.width + x;
            expect(t.slope[i] as number).toBeLessThan(15);
            const c = cornersAt(t, x, y);
            if (x + 1 < t.width && t.offset[i] === t.offset[i + 1]) {
              const e = cornersAt(t, x + 1, y);
              expect(c[1] === e[0] && c[2] === e[3], `${def.id} ${x},${y} east`).toBe(true);
            }
            if (y + 1 < t.height && t.offset[i] === t.offset[i + t.width]) {
              const s = cornersAt(t, x, y + 1);
              expect(c[3] === s[0] && c[2] === s[1], `${def.id} ${x},${y} south`).toBe(true);
            }
          }
        }
      });

      it('has an owned entrance on flat dry land with 200+ buildable tiles reachable on land', () => {
        const map = scenario(def.id).state.map;
        const e = map.entranceTile;
        expect(e).toBe(tileIndex(map, def.map.park.entrance.x, def.map.park.entrance.y));
        expect(map.content[e]).toBe(Content.ParkEntrance);
        expect(map.owned[e]).toBe(Owned.Owned);
        expect(map.slope[e]).toBe(0);
        const reach = landReachableFromEntrance(map).filter((t) => map.content[t] === Content.Empty && map.slope[t] === 0);
        expect(reach.length).toBeGreaterThanOrEqual(200);
      });

      for (const difficulty of ['relaxed', 'standard', 'tough'] as const) {
        it(`${difficulty}: start cash, loan, loan limit, modifiers, After Dark, deadline`, () => {
          const w = scenario(def.id, difficulty);
          const s = w.state;
          const p = DIFFICULTY[difficulty];
          expect(s.park.cash).toBe(Math.round(def.start.cash * p.startCash));
          expect(s.park.entranceFee).toBe(def.start.entranceFee);
          expect(s.management.loan.balance).toBe(def.start.loan);
          expect(scenarioMaxLoan(s)).toBe(Math.max(def.start.loan, Math.floor((def.start.maxLoan * p.maxLoan) / 100_000) * 100_000));
          expect(s.modifiers).toEqual({
            arrivals: p.arrivals,
            priceTolerance: p.priceTolerance,
            happinessDecay: p.happinessDecay,
            researchSpeed: p.researchSpeed,
            breakdownChance: p.breakdownChance,
            loanInterest: p.loanInterest,
            ratingBonus: 0,
          });
          expect(s.park.afterDark).toBe(def.afterDark !== 'off');
          expect(s.park.name).toBe(def.start.parkName);
          const sc = s.scenario;
          if (sc.kind !== 'scenario') throw new Error('not a scenario');
          expect(sc).toMatchObject({ id: def.id, defVersion: def.defVersion, difficulty, status: 'active', endReason: null, endMonthIndex: null, continued: false, progressRecorded: false });
          expect(sc.deadlineMonthIndex).toBe((def.timeLimitMonths as number) - 1);
          expect(sc.objectives).toHaveLength(def.objectives.length);
          expect(validateState(s)).toBeNull();
        });
      }
    });
  }
});

describe('scenario map features (Phase 5 §4.7 map column)', () => {
  it('Meadow Start: gentle grass, a round pond in the north-east of the park, a 5-tile plaza path, land for sale east', () => {
    const map = scenario('meadow_start').state.map;
    let pond = 0;
    for (let y = 23; y < 40; y++) for (let x = 36; x < 52; x++) if (isWetAt(map, x, y)) pond++;
    expect(pond).toBeGreaterThan(20);
    expect(Math.max(...map.heights) - Math.min(...map.heights)).toBeLessThanOrEqual(6);
    let path = 0;
    for (let i = 0; i < map.content.length; i++) if (map.content[i] === Content.Footpath) path++;
    expect(path).toBe(5);
    expect(map.owned[tileIndex(map, 55, 40)]).toBe(Owned.LandForSale);
    expect(map.owned[tileIndex(map, 12, 23)]).toBe(Owned.Owned);
    expect(map.owned[tileIndex(map, 11, 23)]).toBe(Owned.NotOwned);
  });

  it('Sandy Shores: sea along the east edge, sand near it, a boardwalk along the beach', () => {
    const map = scenario('sandy_shores').state.map;
    for (let y = 0; y < 48; y++) expect(isWetAt(map, 95, y)).toBe(true);
    expect(map.terrain[tileIndex(map, 84, 20)]).toBe(Terrain.Sand);
    expect(map.terrain[tileIndex(map, 35, 20)]).toBe(Terrain.Grass);
    for (let y = 9; y <= 42; y++) expect(map.content[tileIndex(map, 82, y)]).toBe(Content.Footpath);
  });

  it('Frostbite Falls: an 8-step snowy cliff across the north, a waterfall river, a bridge over it', () => {
    const map = scenario('frostbite_falls').state.map;
    expect((map.heights[tileIndex(map, 10, 5)] as number) - (map.heights[tileIndex(map, 10, 20)] as number)).toBeGreaterThanOrEqual(6);
    expect(map.terrain[tileIndex(map, 10, 5)]).toBe(Terrain.Snow);
    // The river falls over the cliff: wet above and below it, 8 steps apart.
    expect(isWetAt(map, 43, 12) && isWetAt(map, 43, 15)).toBe(true);
    expect((map.water[tileIndex(map, 43, 12)] as number) - (map.water[tileIndex(map, 43, 15)] as number)).toBeGreaterThanOrEqual(7);
    // Owned land on both banks, and the prebuilt bridge across.
    for (let y = 38; y <= 41; y++) expect(isWetAt(map, 26, y)).toBe(true);
    expect(map.owned[tileIndex(map, 26, 34)]).toBe(Owned.Owned);
    expect(map.owned[tileIndex(map, 26, 45)]).toBe(Owned.Owned);
    expect(isWetAt(map, 0, 52) || isWetAt(map, 1, 51)).toBe(true);
  });

  it('Volcano Ridge: a central cone with rock up high, a crater lake, and Volcano Ridge scenery', () => {
    const s = scenario('volcano_ridge').state;
    const map = s.map;
    expect(Math.max(...map.heights)).toBeGreaterThanOrEqual(8 + 28);
    let crater = 0;
    for (let y = 18; y < 27; y++) for (let x = 36; x < 45; x++) if (isWetAt(map, x, y)) crater++;
    expect(crater).toBeGreaterThan(0);
    expect(map.terrain[tileIndex(map, 40, 14)]).toBe(Terrain.Rock);
    expect(s.scenery.length).toBeGreaterThan(30);
    expect(s.scenery.every((sc) => getSceneryDef(sc.defId)?.theme === 'volcano_ridge')).toBe(true);
    for (const sc of s.scenery) expect(map.contentRef[tileIndex(map, sc.x, sc.y)]).toBe(sc.id);
  });

  it('Spooky Hollow: a creek north to south and dense bare trees', () => {
    const s = scenario('spooky_hollow').state;
    for (const y of [5, 30, 60]) {
      let wet = 0;
      for (let x = 20; x < 45; x++) if (isWetAt(s.map, x, y)) wet++;
      expect(wet, `row ${y}`).toBeGreaterThan(0);
    }
    const inPark = s.scenery.filter((sc) => s.map.owned[tileIndex(s.map, sc.x, sc.y)] === Owned.Owned);
    expect(inPark.length).toBeGreaterThan(300);
    expect(new Set(s.scenery.map((sc) => sc.defId))).toContain('tree_bare');
  });

  it('Harbor Lights: sea on the south, a basin, a headland with the lighthouse stand-in, two piers', () => {
    const s = scenario('harbor_lights').state;
    const map = s.map;
    for (let x = 0; x < 96; x++) expect(isWetAt(map, x, 63)).toBe(true);
    expect(map.water[tileIndex(map, 40, 63)]).toBe(12);
    expect(isWetAt(map, 31, 45)).toBe(true);
    expect(isWetAt(map, 68, 52)).toBe(false);
    expect(s.scenery.map((sc) => [sc.defId, sc.x, sc.y])).toEqual([['star_beacon', 68, 57]]);
    for (const x of [50, 62]) for (let y = 48; y <= 54; y++) expect(isWetAt(map, x, y)).toBe(true);
  });

  it('Fading Fairground: 6 old rides running, 4 broken benches, litter, 120 unhappy guests, park open', () => {
    const s = scenario('fading_fairground').state;
    const map = s.map;
    expect(s.rides.map((r) => r.defId)).toEqual(['carousel', 'big_wheel', 'swing_tower', 'teacup_twirl', 'rocket_rounds', 'mirror_maze']);
    for (const r of s.rides) {
      expect(Math.floor((s.tick - r.builtTick) / TICKS_PER_MONTH)).toBe(96);
      expect(r.reliability).toBe((45 * REL_MAX) / 100);
      expect(r.status).toBe('open');
    }
    expect(s.stalls).toHaveLength(3);
    const benches = [18, 25, 31, 38].map((x) => tileIndex(map, x, 47));
    for (const t of benches) {
      expect(map.pathItem[t]).toBe(PathItem.Bench);
      expect(isBroken(map, t)).toBe(true);
    }
    let paths = 0;
    let littered = 0;
    for (let i = 0; i < map.content.length; i++) {
      if (map.content[i] !== Content.Footpath) continue;
      paths++;
      if ((map.litter[i] as number) > 0) littered++;
    }
    expect(littered / paths).toBeGreaterThan(0.2);
    expect(littered / paths).toBeLessThan(0.4);
    expect(s.guests).toHaveLength(120);
    for (const g of s.guests) {
      expect(g.needs.happiness).toBe(90);
      expect(map.content[g.tile]).toBe(Content.Footpath);
    }
    expect(s.park.open).toBe(true);
    expect(s.park.cash).toBe(200_000);
    expect(s.management.loan.balance).toBe(3_000_000);
    expect(s.park.rating).toBeGreaterThan(0);
  });

  it('Sky High: a 20 × 20 mesa 20 steps up with cliffs, owned alone, construction rights for sale around it', () => {
    const map = scenario('sky_high').state.map;
    for (const [x, y] of [[22, 22], [41, 41], [31, 30]] as const) {
      expect(map.heights[tileIndex(map, x, y)]).toBe(28);
      expect(map.owned[tileIndex(map, x, y)]).toBe(Owned.Owned);
    }
    expect(map.heights[tileIndex(map, 21, 30)] as number).toBeLessThanOrEqual(12);
    expect(map.owned[tileIndex(map, 21, 30)]).toBe(Owned.RightsForSale);
    expect(map.owned[tileIndex(map, 5, 5)]).toBe(Owned.NotOwned);
    let owned = 0;
    for (const o of map.owned) if (o === Owned.Owned) owned++;
    expect(owned).toBe(400);
    expect(map.entranceTile).toBe(tileIndex(map, 31, 41));
  });
});
