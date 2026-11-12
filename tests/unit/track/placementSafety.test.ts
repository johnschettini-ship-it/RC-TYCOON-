/**
 * R7 / R5 (owner 2026-11-12): the build-time safety rule and the meter values in the preview (plan ride-work-1 Task 5).
 * A piece whose projected section (the test train simulated from the station over the open track plus the candidate,
 * values taken while the train's centre is on the candidate) passes a hard limit cannot be built, in setup mode too. The
 * refusal names the strongest car's value, the same value and the same piece the Open check names for the whole circuit.
 * A stall never blocks building.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/sim/research/api', () => ({ isUnlocked: () => true }));

import { getTrackTypeDef, type TrackTypeDef } from '../../../src/data/track';
import { TRACK_ERR, fillTrackString } from '../../../src/data/strings/track';
import { executeCommand } from '../../../src/sim/commands';
import { canOpenTrackRide, nextTrackPieces, previewTrackPiece, trackTroublePlace } from '../../../src/sim/rides/track/api';
import type { TroublePlace } from '../../../src/sim/rides/track/trouble';
import { updateTrackRides } from '../../../src/sim/rides/track/update';
import { trackEnd } from '../../../src/sim/rides/track/build';
import { projectSection, type SectionProjection } from '../../../src/sim/rides/track/projection';
import { formatSafetyG, unsafeOpenReason, unsafePieceReason } from '../../../src/sim/rides/track/safety';
import { runTestLapDetailed } from '../../../src/sim/rides/track/testRun';
import type { TrackPieceInstance, TrackRideData } from '../../../src/sim/rides/track/types';
import type { CommandResult } from '../../../src/sim/commands/types';
import type { World } from '../../../src/sim/types';
import { makeTestWorld, stateHash } from '../../helpers/world';
import {
  add,
  addAll,
  dataOf,
  EAST,
  expectOk,
  place,
  R1_PIECES,
  rideOf,
  SHARP_TURN_PIECES,
  UNSAFE_DROP_PIECES,
  writePieces,
  type PieceSpec,
} from './helpers';

const steel = getTrackTypeDef('steel_coaster') as TrackTypeDef;
const UNSAFE_REASONS = [TRACK_ERR.pieceUnsafePosG, TRACK_ERR.pieceUnsafeNegG, TRACK_ERR.pieceUnsafeLat];

function reasonOf(r: CommandResult | { ok: boolean; reason?: string }): string {
  if (r.ok) throw new Error('expected a refusal');
  return (r as { reason: string }).reason;
}

function isUnsafeReason(reason: string): boolean {
  return UNSAFE_REASONS.some((tpl) => new RegExp(`^${tpl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\{\w+\\\}/g, '.+?')}$`).test(reason));
}

/** A Steel Coaster at (4, 2) heading +x with `specs` written into its data (no safety rule). */
function written(specs: PieceSpec[]): { w: World; id: number; d: TrackRideData } {
  const w = makeTestWorld();
  const id = place(w, 'steel_coaster', 4, 2, EAST);
  writePieces(w, id, specs);
  return { w, id, d: dataOf(w, id) };
}

/** The piece `defId` as `addTrackPiece` would place it at the track end. */
function candidate(w: World, id: number, spec: PieceSpec): TrackPieceInstance {
  const p = typeof spec === 'string' ? { id: spec } : spec;
  const end = trackEnd(w, rideOf(w, id), dataOf(w, id));
  return { defId: p.id, x: end.x, y: end.y, z: end.z, dir: end.dir, chain: !!p.chain, brakeSpeed: p.brakeSpeed ?? null, cost: 0 };
}

/** Run the live test to its end, place the gates, and read the Open check and the trouble place. */
function openAfterTest(w: World, id: number): { reason: string | null; place: TroublePlace | null } {
  expectOk(executeCommand(w, { type: 'startTestRun', rideId: id }));
  const n = (dataOf(w, id).testRun?.ticksLeft ?? 0) + 1;
  for (let i = 0; i < n; i++) {
    updateTrackRides(w);
    w.state.tick++;
  }
  const ride = rideOf(w, id);
  ride.entrance = { gate: 0, outside: 0 };
  ride.exit = { gate: 1, outside: 1 };
  return { reason: canOpenTrackRide(w, ride), place: trackTroublePlace(w, id) };
}

function preview(w: World, id: number, spec: PieceSpec): ReturnType<typeof previewTrackPiece> {
  const p = typeof spec === 'string' ? { id: spec } : spec;
  return previewTrackPiece(w, id, p.id, !!p.chain, p.brakeSpeed);
}

describe('build-time safety rule (R7, owner 2026-11-12)', () => {
  // UNSAFE_DROP_PIECES: the strongest car passes 6.0 G with its centre on piece 32 (index 31, `gentle_down_to_flat`, the
  // piece that ends the valley: the rear car is still in it). The valley piece itself (index 30) projects about 4.1 G.
  const VALLEY_END = 31;

  it('a piece whose section passes 6.0 G cannot be built (setup mode too) and nothing changes', () => {
    const { w, id } = written(UNSAFE_DROP_PIECES.slice(0, VALLEY_END - 1));
    const spec = UNSAFE_DROP_PIECES[VALLEY_END - 1]!;
    expect(spec).toBe('gentle_down_to_flat');
    const h0 = stateHash(w);
    for (const setup of [true, false]) {
      const r = add(w, id, spec, setup);
      expect(r.ok).toBe(false);
      expect(reasonOf(r)).toMatch(/^Over the safety limit: \d+\.\d\d G \(max 6\.00 G\)$/);
      expect(stateHash(w)).toBe(h0);
    }
  });

  it('Build and Open name the same piece and the same value', () => {
    const full = written(UNSAFE_DROP_PIECES);
    const open = openAfterTest(full.w, full.id);
    expect(open.place).toMatchObject({ pieceIndex: VALLEY_END, kind: 'posG' });
    const { w, id } = written(UNSAFE_DROP_PIECES.slice(0, VALLEY_END - 1));
    const r = add(w, id, UNSAFE_DROP_PIECES[VALLEY_END - 1]!);
    const breach = { kind: open.place!.kind as 'posG', value: open.place!.value! };
    expect(reasonOf(r)).toBe(unsafePieceReason(breach));
    expect(open.reason).toBe(unsafeOpenReason(breach, VALLEY_END + 1));
    // The value is the strongest car's value of the whole test lap.
    expect(breach.value).toBe(runTestLapDetailed(full.w.state.map, full.d, steel).worst.posGMax);
    // The valley piece itself is allowed: its section stays under the limit (the train's centre has not reached the
    // tight end of the valley yet; the piece that ends it is the one refused).
    const before = written(UNSAFE_DROP_PIECES.slice(0, VALLEY_END - 2));
    const valley = preview(before.w, before.id, UNSAFE_DROP_PIECES[VALLEY_END - 2]!);
    expect(valley.ok).toBe(true);
    expect(valley.meter?.breach).toBeNull();
  });

  it('the preview refuses with the same reason and carries the meter values', () => {
    const { w, id } = written(UNSAFE_DROP_PIECES.slice(0, VALLEY_END - 1));
    const spec = UNSAFE_DROP_PIECES[VALLEY_END - 1]!;
    const pv = preview(w, id, spec);
    expect(pv).toMatchObject({ ok: false, reason: reasonOf(add(w, id, spec)) });
    expect(pv.meter?.breach?.kind).toBe('posG');
    expect(pv.meter).toEqual(projectSection(dataOf(w, id), steel, candidate(w, id, spec)));
  });

  it('building piece by piece, the first refusal is the piece and the value Open names (drop and sharp turn)', () => {
    for (const specs of [UNSAFE_DROP_PIECES, SHARP_TURN_PIECES]) {
      const full = written(specs);
      const open = openAfterTest(full.w, full.id);
      expect(open.place).not.toBeNull();
      const breach = { kind: open.place!.kind as 'posG' | 'negG' | 'lat', value: open.place!.value! };
      // Same value as the whole lap's strongest car (no section misses a tick of the lap).
      const worst = runTestLapDetailed(full.w.state.map, full.d, steel).worst;
      expect(breach.value).toBe(breach.kind === 'posG' ? worst.posGMax : breach.kind === 'negG' ? worst.vertGMin : worst.latMax);
      const w = makeTestWorld();
      const id = place(w, 'steel_coaster', 4, 2, EAST);
      let refusedAt: number | null = null;
      for (const spec of specs) {
        const r = add(w, id, spec);
        if (!r.ok) {
          refusedAt = dataOf(w, id).pieces.length;
          expect(reasonOf(r)).toBe(unsafePieceReason(breach));
          break;
        }
      }
      expect(refusedAt).toBe(open.place!.pieceIndex);
      expect(open.reason).toBe(unsafeOpenReason(breach, refusedAt! + 1));
    }
  });

  it('planAppend refuses for safety exactly when the projected section passes a limit', () => {
    const cases: { specs: PieceSpec[]; ends: number[] }[] = [
      { specs: UNSAFE_DROP_PIECES, ends: [20, 26, 28, 29, 30, 31, 32] },
      { specs: SHARP_TURN_PIECES, ends: [15, 16, 17, 18, 19] },
      { specs: R1_PIECES, ends: [2, 9, 12, 13, 14, 15, 20] },
    ];
    let refused = 0;
    let allowed = 0;
    for (const c of cases) {
      for (const k of c.ends) {
        const { w, id, d } = written(c.specs.slice(0, k - 1));
        for (const def of nextTrackPieces(w, id)) {
          const pv = preview(w, id, def.id);
          // Refused by an earlier rule (tiles, height, supports): no projection was made.
          if (!pv.ok && pv.meter === null) continue;
          const proj = projectSection(d, steel, candidate(w, id, def.id));
          const unsafe = !pv.ok && isUnsafeReason(pv.reason);
          expect(unsafe, `${k}: ${def.id}`).toBe(proj.breach !== null);
          if (pv.ok || unsafe) expect(pv.meter).toEqual(proj);
          if (unsafe) {
            expect(pv.reason).toBe(unsafePieceReason(proj.breach!));
            refused++;
          } else if (pv.ok) allowed++;
        }
      }
    }
    expect(refused).toBeGreaterThan(0);
    expect(allowed).toBeGreaterThan(20);
  });

  it('a piece on which the train stops can still be built, and later pieces show where it stops', () => {
    const w = makeTestWorld();
    const id = place(w, 'steel_coaster', 4, 2, EAST);
    addAll(w, id, ['station']);
    const r = add(w, id, 'flat_to_gentle_up'); // no chain
    expect(r.ok).toBe(true);
    const pv = previewTrackPiece(w, id, 'gentle_up_to_flat');
    expect(pv.ok).toBe(true);
    expect(pv.meter).toMatchObject({ reached: false, stallPiece: 2, stallKind: 'stop', breach: null });
  });

  it('a valid piece returns ok with its meter; a piece refused before the projection has none', () => {
    const w = makeTestWorld();
    const id = place(w, 'steel_coaster', 4, 2, EAST);
    addAll(w, id, R1_PIECES.slice(0, 9));
    const pv = previewTrackPiece(w, id, 'straight');
    expect(pv.ok).toBe(true);
    expect(pv.meter).toMatchObject({ reached: true, stallPiece: null, breach: null });
    expect(pv.meter!.vMaxMms).toBeGreaterThan(0);
    const bad = previewTrackPiece(w, id, 'steep_up'); // does not fit a flat track end
    expect(bad).toMatchObject({ ok: false, reason: TRACK_ERR.doesNotFit, meter: null });
  });

  it('meter values are the strongest car’s (SectionProjection), not the train average', () => {
    const { w, id } = written(UNSAFE_DROP_PIECES.slice(0, VALLEY_END - 1));
    const m = preview(w, id, 'gentle_down_to_flat').meter as SectionProjection;
    expect(m.posGMax).toBeGreaterThan(600);
    expect(m.avg.posGMax).toBeLessThanOrEqual(600);
  });
});
