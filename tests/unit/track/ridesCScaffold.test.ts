/**
 * New rides batch C scaffolding (docs/superpowers/specs/2026-11-17-new-rides-design.md): the shared track pieces the
 * five new track types build on. `typeBuildsPiece` is the one build rule (its own set and groups, less exclusions, plus
 * `alsoPieces`) and keeps every existing type's piece list; the launch piece is a plain flat straight with the `launch`
 * special in its own group; existing types have no launch speed and no pieces of another set.
 */
import { describe, expect, it } from 'vitest';
import { ALL_TRACK_PIECES, ALL_TRACK_TYPES, getTrackPieceDef, typeBuildsPiece } from '../../../src/data/track';
import { LAUNCH_COST_MULTIPLE } from '../../../src/data/tuning/track';
import { PALETTE_GROUPS } from '../../../src/ui/track/builder';

const RIDES_C_TYPE_IDS = ['launch_coaster', 'mine_train', 'water_coaster', 'flying_coaster', 'sky_ride'];
const OLD_TYPES = ALL_TRACK_TYPES.filter((t) => !RIDES_C_TYPE_IDS.includes(t.id));

describe('batch C scaffolding: the build rule', () => {
  it('for every existing type and piece, typeBuildsPiece is the old rule (own set, own groups, not excluded)', () => {
    expect(OLD_TYPES).toHaveLength(12);
    for (const type of OLD_TYPES) {
      expect(type.alsoPieces, type.id).toEqual([]);
      expect(type.physics.launchSpeedMms, type.id).toBe(0);
      for (const def of ALL_TRACK_PIECES) {
        const old = def.set === type.pieceSet && type.groups.includes(def.group) && !type.excludePieces.includes(def.id);
        expect(typeBuildsPiece(type, def), `${type.id} ${def.id}`).toBe(old);
      }
    }
  });

  it('no existing type builds the launch', () => {
    const launch = getTrackPieceDef('launch')!;
    for (const type of OLD_TYPES) expect(typeBuildsPiece(type, launch), type.id).toBe(false);
  });
});

describe('batch C scaffolding: the launch piece', () => {
  it('is a flat 4 m rail straight, group Ln, special launch, not chainable, 4 × the straight cost', () => {
    const d = getTrackPieceDef('launch')!;
    const st = getTrackPieceDef('straight')!;
    expect(d).toMatchObject({ set: 'rail', group: 'Ln', special: 'launch', chainable: false, inversions: 0, minEntryMms: 0, water: null });
    expect([d.entry, d.exit, d.tiles, d.lengthMm, d.geometry]).toEqual([st.entry, st.exit, st.tiles, st.lengthMm, st.geometry]);
    expect(d.cost).toBe(LAUNCH_COST_MULTIPLE * st.cost);
    expect(d.num).toBe(57);
  });

  it('shows under the Special tab of the builder palette', () => {
    expect(PALETTE_GROUPS.find((g) => g.id === 'special')!.groups).toContain('Ln');
  });
});
