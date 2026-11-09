import { describe, expect, it } from 'vitest';
import { landUiStrings } from '../../../src/data/strings/landUi';
import { TERRAIN_ERR, TERRAIN_INPUT_ERR } from '../../../src/data/strings/terrain';
import { text } from '../../../src/data/strings/en';

describe('Land and Water strings (master R4)', () => {
  it('every key starts with landUi. and no message ends with a period', () => {
    for (const [k, v] of Object.entries(landUiStrings)) {
      expect(k.startsWith('landUi.'), k).toBe(true);
      expect(v.trim().length, k).toBeGreaterThan(0);
      expect(/\.$/.test(v), `${k}: "${v}"`).toBe(false);
    }
    for (const v of [...Object.values(TERRAIN_ERR), ...Object.values(TERRAIN_INPUT_ERR)]) expect(/\.$/.test(v), v).toBe(false);
  });

  it('the Phase 4 §4.1–4.3 check strings are the exact spec text', () => {
    expect(TERRAIN_ERR).toMatchObject({
      outsidePark: 'Outside the park',
      onlyRights: 'You only have construction rights here',
      entranceInWay: 'The park entrance is in the way',
      pathInWay: 'A path is in the way',
      rideOrStallInWay: 'A ride or stall is in the way',
      trackInWay: 'A track is in the way',
      sceneryInWay: 'Scenery is in the way',
      noClearance: 'Not enough clearance under an object',
      tooHigh: 'The land cannot go higher',
      tooLow: 'The land cannot go lower',
      notEnoughCash: 'Not enough cash',
      skipped: '{n} tiles were skipped: {reason}',
      waterTooHigh: 'The water cannot go higher',
      noWater: 'There is no water here',
    });
  });

  it('are reachable through the shared string table', () => {
    expect(text('landUi.tool.land')).toBe('Land');
    expect(text('landUi.size', { n: 3 })).toBe('3 × 3');
    expect(text('landUi.title.paint', { terrain: text('landUi.terrain.4') })).toBe('Paint Snow');
  });
});
