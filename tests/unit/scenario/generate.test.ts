/** Phase 5 §4.2 steps 7–9: ownership, entrance, content features in list order, validation (failures are errors). */
import { describe, expect, it } from 'vitest';
import { getSceneryDef } from '../../../src/data/catalog';
import type { Feature, MapGenSpec } from '../../../src/data/scenarios/types';
import { validateState } from '../../../src/save';
import { Content, Owned, tileIndex } from '../../../src/sim/map';
import { generateWorldMap, placeSceneryDirect } from '../../../src/sim/scenario/generate';
import { stateHash } from '../../helpers/world';
import { makeTestWorld } from '../../helpers/world';
import type { World } from '../../../src/sim/types';

function spec(features: Feature[] = [], patch: Partial<MapGenSpec> = {}): MapGenSpec {
  return {
    width: 40,
    height: 40,
    seed: 5,
    baseHeight: 8,
    noise: { amplitude: 0, scale: 8, octaves: 1 },
    waterLevel: 0,
    terrainRules: [],
    features,
    park: { owned: [{ x0: 2, y0: 2, x1: 37, y1: 37 }], forSale: [{ x0: 0, y0: 0, x1: 39, y1: 1 }], rightsForSale: [{ x0: 38, y0: 0, x1: 39, y1: 39 }], entrance: { x: 20, y: 38, side: 'S' } },
    ...patch,
  };
}

function gen(s: MapGenSpec): { w: World; problems: string[] } {
  const w = makeTestWorld();
  const problems = generateWorldMap(w, s);
  return { w, problems };
}

describe('ownership and entrance (step 7)', () => {
  it('owned → 1, for sale → 2, rights for sale → 4 where not owned; the entrance is owned in the border gap', () => {
    const { w, problems } = gen(spec());
    expect(problems).toEqual([]);
    const map = w.state.map;
    expect(map.owned[tileIndex(map, 5, 5)]).toBe(Owned.Owned);
    expect(map.owned[tileIndex(map, 5, 0)]).toBe(Owned.LandForSale);
    expect(map.owned[tileIndex(map, 38, 5)]).toBe(Owned.RightsForSale);
    expect(map.owned[tileIndex(map, 5, 39)]).toBe(Owned.NotOwned);
    expect(map.entranceTile).toBe(tileIndex(map, 20, 38));
    expect(map.content[map.entranceTile]).toBe(Content.ParkEntrance);
    expect(map.owned[map.entranceTile]).toBe(Owned.Owned);
    expect(validateState(w.state)).toBeNull();
  });
});

describe('content features (step 8, list order)', () => {
  it('prebuilt commands run in setup mode (no cash, no ledger) with relative heights made absolute', () => {
    // `z` on a path command means an elevated path at that walking height (W3-B, Phase 4 §6); a ground path has no
    // `z`. Relative z 2 over base height 8 is absolute 10: a deck 2 steps above the flat ground.
    const { w, problems } = gen(
      spec([
        {
          kind: 'prebuilt',
          commands: [
            { type: 'buildPathLine', x0: 20, y0: 37, x1: 20, y1: 30, kind: 'footpath' },
            { type: 'buildPathLine', x0: 21, y0: 30, x1: 24, y1: 30, kind: 'footpath', z: 2 },
            { type: 'placeRide', defId: 'flip_arm', x: 10, y: 10, rotation: 0 },
          ],
        },
      ]),
    );
    expect(problems).toEqual([]);
    expect(w.state.rides.map((r) => r.defId)).toEqual(['flip_arm']);
    expect(w.state.park.cash).toBe(1_500_000);
    expect(w.state.economy.ledger.at(-1)!.lines.construction).toBe(0);
    expect(w.state.map.content[tileIndex(w.state.map, 20, 30)]).toBe(Content.Footpath);
    expect(w.state.elevatedPaths.map((p) => [p.x, p.y, p.z])).toEqual([21, 22, 23, 24].map((x) => [x, 30, 10]));
  });

  it('a prebuilt elevated path at relative height 0 over flat ground is below the land: a problem, not a silent fix', () => {
    const { problems } = gen(spec([{ kind: 'prebuilt', commands: [{ type: 'buildPathLine', x0: 20, y0: 37, x1: 20, y1: 30, kind: 'footpath', z: 0 }] }]));
    expect(problems).toEqual(['prebuilt command 1 (buildPathLine) failed: The path is below the land']);
  });

  it('a failing prebuilt command, a missing ride, a missing path item, or an unknown item are problems, not silent fixes', () => {
    const { problems } = gen(
      spec([
        { kind: 'prebuilt', commands: [{ type: 'placeRide', defId: 'carousel', x: 0, y: 0, rotation: 0 }, { type: 'warpDrive' }] },
        { kind: 'rideCondition', rideIndex: 3, ageMonths: 1, reliability: 50 },
        { kind: 'brokenPathItems', points: [{ x: 4, y: 4 }] },
        { kind: 'scatterScenery', rect: { x0: 3, y0: 3, x1: 4, y1: 4 }, defIds: ['oak_round', 'golden_unicorn', 'hedge_low'], density: 1 },
      ]),
    );
    expect(problems[0]).toMatch(/^prebuilt command 1 \(placeRide\) failed: \S/);
    expect(problems.slice(1)).toEqual([
      'prebuilt command 2 (warpDrive) failed: Unknown command warpDrive',
      'rideCondition: there is no ride 3',
      'brokenPathItems: no path item at 4,4',
      'scatterScenery: unknown item golden_unicorn',
      'scatterScenery: hedge_low is not a centre item',
    ]);
  });

  it('scatter places centre items on free dry tiles, flat unless slope-tolerant, the same way every time', () => {
    const features: Feature[] = [
      { kind: 'lake', cx: 10, cy: 10, radius: 3, surface: 0 },
      { kind: 'flatten', rect: { x0: 18, y0: 18, x1: 22, y1: 39 }, height: 0 },
      { kind: 'prebuilt', commands: [{ type: 'buildPathLine', x0: 20, y0: 37, x1: 20, y1: 20, kind: 'footpath' }] },
      { kind: 'scatterScenery', rect: { x0: 2, y0: 2, x1: 37, y1: 37 }, defIds: ['oak_round', 'bed_tulip', 'tent_red'], density: 0.4 },
    ];
    const a = gen(spec(features, { noise: { amplitude: 3, scale: 6, octaves: 2 } }));
    const b = gen(spec(features, { noise: { amplitude: 3, scale: 6, octaves: 2 } }));
    expect(a.problems).toEqual([]);
    expect(stateHash(a.w)).toBe(stateHash(b.w));
    const map = a.w.state.map;
    expect(a.w.state.scenery.length).toBeGreaterThan(100);
    for (const sc of a.w.state.scenery) {
      const def = getSceneryDef(sc.defId)!;
      const span = def.w === 2 ? 2 : 1;
      for (let dy = 0; dy < span; dy++) {
        for (let dx = 0; dx < span; dx++) {
          const t = tileIndex(map, sc.x + dx, sc.y + dy);
          expect(map.content[t]).toBe(Content.Scenery);
          expect(map.contentRef[t]).toBe(sc.id);
          expect((map.water[t] as number) > (map.heights[t] as number)).toBe(false);
          if (!def.slopeOk) expect(map.slope[t]).toBe(0);
          expect(map.heights[t]).toBe(sc.z);
        }
      }
    }
    for (let y = 20; y <= 37; y++) expect(map.content[tileIndex(map, 20, y)]).toBe(Content.Footpath);
    expect(validateState(a.w.state)).toBeNull();
  });

  it('placeSceneryDirect refuses edge and over-path items, taken, wet, or uneven tiles', () => {
    const { w } = gen(spec([{ kind: 'lake', cx: 10, cy: 10, radius: 3, surface: 0 }]));
    expect(placeSceneryDirect(w, getSceneryDef('fence_wood')!, 30, 30, 0)).toBe(false);
    expect(placeSceneryDirect(w, getSceneryDef('ticket_arch')!, 30, 30, 0)).toBe(false);
    expect(placeSceneryDirect(w, getSceneryDef('oak_round')!, 10, 10, 0)).toBe(false);
    expect(placeSceneryDirect(w, getSceneryDef('oak_round')!, 30, 30, 0)).toBe(true);
    expect(placeSceneryDirect(w, getSceneryDef('oak_round')!, 30, 30, 0)).toBe(false);
    expect(placeSceneryDirect(w, getSceneryDef('tent_red')!, 39, 30, 0)).toBe(false);
  });

  it('litter goes on footpaths only, about `density` of them', () => {
    const { w, problems } = gen(
      spec([
        { kind: 'prebuilt', commands: [{ type: 'buildPathLine', x0: 3, y0: 10, x1: 36, y1: 10, kind: 'footpath' }, { type: 'buildPathLine', x0: 3, y0: 12, x1: 36, y1: 12, kind: 'footpath' }] },
        { kind: 'litter', rect: { x0: 0, y0: 0, x1: 39, y1: 39 }, density: 0.5 },
      ]),
    );
    expect(problems).toEqual([]);
    const map = w.state.map;
    let littered = 0;
    for (let i = 0; i < map.litter.length; i++) {
      if ((map.litter[i] as number) === 0) continue;
      expect(map.content[i]).toBe(Content.Footpath);
      littered++;
    }
    expect(littered).toBeGreaterThan(20);
    expect(littered).toBeLessThan(48);
  });
});

describe('validation (step 9)', () => {
  it('an entrance in water, facing into the park, or cut off from enough land fails', () => {
    const wet = gen(spec([{ kind: 'lake', cx: 20, cy: 38, radius: 4, surface: 0 }]));
    expect(wet.problems).toContain('the park entrance needs flat, dry land');
    const inward = gen(spec([], { park: { ...spec().park, entrance: { x: 20, y: 30, side: 'S' } } }));
    expect(inward.problems).toContain('the park entrance must face out of the park');
    const small = gen(spec([], { park: { ...spec().park, owned: [{ x0: 15, y0: 30, x1: 25, y1: 37 }] } }));
    expect(small.problems).toEqual(['only 88 buildable tiles can be reached from the entrance (at least 200 needed)']);
    const cliff = gen(spec([{ kind: 'raise', area: { rect: { x0: 0, y0: 0, x1: 39, y1: 37 } }, by: 4, falloff: 0 }]));
    expect(cliff.problems).toEqual(['the park entrance does not lead into the park on land', 'only 0 buildable tiles can be reached from the entrance (at least 200 needed)']);
    const outside = gen(spec([], { park: { ...spec().park, entrance: { x: 50, y: 38, side: 'S' } } }));
    expect(outside.problems).toEqual(['the park entrance is outside the map']);
  });

  it('terrain rule failures come back as problems', () => {
    const { problems } = gen(spec([{ kind: 'river', points: [{ x: 0, y: 5 }], width: 2, depth: 2 }]));
    expect(problems).toEqual(['river needs at least 2 points']);
  });
});
