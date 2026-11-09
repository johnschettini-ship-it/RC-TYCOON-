import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/sim/research/api', () => ({ isUnlocked: () => true }));

import { executeCommand } from '../../../src/sim/commands';
import { Content, Owned, tileIndex } from '../../../src/sim/map';
import { canOpenTrackRide } from '../../../src/sim/rides/track/api';
import { trackDirFromMapDir } from '../../../src/sim/rides/track/geometry';
import { getLayout } from '../../../src/sim/rides/track/layout';
import { TRACK_ERR, TRACK_WARN } from '../../../src/data/strings/track';
import { addGuestDirect, makeTestWorld, placeFootpath, placeQueue, placeRideDirect, stateHash } from '../../helpers/world';
import { add, addAll, buildR1, dataOf, EAST, expectOk, NORTH, place, rideOf, SMALL_LOOP, SOUTH, times, WEST } from './helpers';

function fresh() {
  return makeTestWorld();
}

function reasonOf(r: ReturnType<typeof executeCommand>): string | null {
  return r.ok ? null : r.reason;
}

describe('placeStation', () => {
  it('creates a building track ride with one station piece and pays base + piece cost', () => {
    const w = fresh();
    const cash = w.state.park.cash;
    const r = expectOk(executeCommand(w, { type: 'placeStation', typeId: 'steel_coaster', x: 10, y: 10, dir: EAST }));
    const ride = rideOf(w, r.id as number);
    expect(ride.kind).toBe('track');
    expect(ride.defId).toBe('steel_coaster');
    expect(ride.status).toBe('building');
    expect(ride.stats).toBeNull();
    expect(ride.entrance).toBeNull();
    expect(ride.exit).toBeNull();
    expect(ride.totalBuildCost).toBe(300_000 + 6_000);
    expect(r.cost).toBe(306_000);
    expect(w.state.park.cash).toBe(cash - 306_000);
    const data = dataOf(w, ride.id);
    expect(data.pieces).toHaveLength(1);
    expect(data.pieces[0]).toMatchObject({ defId: 'station', x: 10, y: 10, z: 8, dir: 0 });
    const t = tileIndex(w.state.map, 10, 10);
    expect(w.state.map.content[t]).toBe(Content.Track);
    expect(w.state.map.contentRef[t]).toBe(ride.id);
    const ledger = w.state.economy.ledger[w.state.economy.ledger.length - 1];
    expect(ledger?.lines.construction).toBe(-306_000);
  });

  it('rejects unknown types and keeps the state unchanged', () => {
    const w = fresh();
    const h = stateHash(w);
    expect(reasonOf(executeCommand(w, { type: 'placeStation', typeId: 'log_flume', x: 10, y: 10, dir: EAST }))).toBe(TRACK_ERR.unknownType);
    expect(stateHash(w)).toBe(h);
  });

  it(`"${TRACK_ERR.notEnoughCash}" blocks below cost and allows exact cash`, () => {
    const w = fresh();
    w.state.park.cash = 306_000 - 1;
    expect(reasonOf(executeCommand(w, { type: 'placeStation', typeId: 'steel_coaster', x: 10, y: 10, dir: EAST }))).toBe(TRACK_ERR.notEnoughCash);
    w.state.park.cash = 306_000;
    expect(executeCommand(w, { type: 'placeStation', typeId: 'steel_coaster', x: 10, y: 10, dir: EAST }).ok).toBe(true);
    expect(w.state.park.cash).toBe(0);
  });

  it(`"${TRACK_ERR.outsidePark}"`, () => {
    const w = fresh();
    expect(reasonOf(executeCommand(w, { type: 'placeStation', typeId: 'steel_coaster', x: 0, y: 10, dir: EAST }))).toBe(TRACK_ERR.outsidePark);
  });

  it('takes a map Dir: E builds the station along +x (track direction 0)', () => {
    const w = fresh();
    const id = place(w, 'steel_coaster', 10, 10, EAST);
    expect(rideOf(w, id).rotation).toBe(EAST);
    expectOk(add(w, id, 'station'));
    expectOk(add(w, id, 'station'));
    const pieces = dataOf(w, id).pieces;
    expect(pieces.map((p) => [p.x, p.y, p.dir])).toEqual([
      [10, 10, 0],
      [11, 10, 0],
      [12, 10, 0],
    ]);
    const t = (x: number, y: number): number => tileIndex(w.state.map, x, y);
    for (const x of [10, 11, 12]) expect(w.state.map.contentRef[t(x, 10)]).toBe(id);
    expect(w.state.map.content[t(10, 11)]).toBe(Content.Empty);
  });

  it.each([
    [NORTH, 0, -1, 3],
    [EAST, 1, 0, 0],
    [SOUTH, 0, 1, 1],
    [WEST, -1, 0, 2],
  ] as const)('map Dir %i: the next station tile is at (+%i, +%i), track direction %i', (dir, dx, dy, trackDir) => {
    expect(trackDirFromMapDir(dir)).toBe(trackDir);
    const w = fresh();
    const id = place(w, 'steel_coaster', 20, 20, dir);
    expectOk(add(w, id, 'station'));
    const [a, b] = dataOf(w, id).pieces;
    expect(a).toMatchObject({ x: 20, y: 20, dir: trackDir });
    expect(b).toMatchObject({ x: 20 + dx, y: 20 + dy, dir: trackDir });
    expect(rideOf(w, id).rotation).toBe(dir);
  });
});

describe('addTrackPiece validation (phase-2 §4.6)', () => {
  it(`"${TRACK_ERR.mustStartWithStation}"`, () => {
    const w = fresh();
    const id = place(w, 'steel_coaster', 10, 10, EAST);
    dataOf(w, id).pieces.length = 0;
    expect(reasonOf(add(w, id, 'straight'))).toBe(TRACK_ERR.mustStartWithStation);
  });

  it(`"${TRACK_ERR.stationOnGround}"`, () => {
    const w = fresh();
    const id = place(w, 'steel_coaster', 10, 10, EAST);
    w.state.map.heights[tileIndex(w.state.map, 11, 10)] = 9;
    expect(reasonOf(add(w, id, 'station'))).toBe(TRACK_ERR.stationOnGround);
  });

  it(`"${TRACK_ERR.doesNotFit}"`, () => {
    const w = fresh();
    const id = place(w, 'steel_coaster', 10, 10, EAST);
    expect(reasonOf(add(w, id, 'gentle_up'))).toBe(TRACK_ERR.doesNotFit);
    expect(reasonOf(add(w, id, 'bank_left_out'))).toBe(TRACK_ERR.doesNotFit);
    expectOk(add(w, id, 'straight'));
    expect(reasonOf(add(w, id, 'station'))).toBe(TRACK_ERR.doesNotFit);
  });

  it(`"${TRACK_ERR.typeCannotUse}"`, () => {
    const w = fresh();
    const j = place(w, 'junior_coaster', 10, 10, EAST);
    expect(reasonOf(add(w, j, 'vertical_loop_left'))).toBe(TRACK_ERR.typeCannotUse);
    const m = place(w, 'mini_railway', 10, 20, EAST);
    expect(reasonOf(add(w, m, { id: 'straight', chain: true }))).toBe(TRACK_ERR.typeCannotUse);
    expect(reasonOf(add(w, m, 'brakes'))).toBe(TRACK_ERR.typeCannotUse);
    const s = place(w, 'steel_coaster', 10, 30, EAST);
    expect(reasonOf(add(w, s, { id: 'turn_small_left', chain: true }))).toBe(TRACK_ERR.typeCannotUse);
  });

  it(`"${TRACK_ERR.hitsPath}" at ground level`, () => {
    const w = fresh();
    const id = place(w, 'steel_coaster', 10, 10, EAST);
    placeFootpath(w, 11, 10);
    expect(reasonOf(add(w, id, 'straight'))).toBe(TRACK_ERR.hitsPath);
  });

  it('path clearance: rail 4 m above a path passes, 3 m fails', () => {
    const w = fresh();
    const id = place(w, 'steel_coaster', 10, 10, EAST);
    // flat_to_gentle_up (+1) + gentle_up (+2) puts the end at +3; gentle_up_to_flat ends at +4.
    addAll(w, id, [{ id: 'flat_to_gentle_up', chain: true }, { id: 'gentle_up_to_flat', chain: true }, { id: 'flat_to_gentle_up', chain: true }, { id: 'gentle_up_to_flat', chain: true }]);
    // End at +4 m (z = 12). A straight at 4 m over a path passes.
    placeFootpath(w, 15, 10);
    expectOk(add(w, id, 'straight'));
    const w2 = fresh();
    const id2 = place(w2, 'steel_coaster', 10, 10, EAST);
    addAll(w2, id2, [{ id: 'flat_to_gentle_up', chain: true }, { id: 'gentle_up', chain: true }]);
    // End at +3 m (z = 11): the next piece's lowest rail is 3 m above the path.
    placeFootpath(w2, 13, 10);
    expect(reasonOf(add(w2, id2, { id: 'gentle_up_to_flat', chain: true }))).toBe(TRACK_ERR.hitsPath);
  });

  it(`"${TRACK_ERR.hitsBuilding}"`, () => {
    const w = fresh();
    const id = place(w, 'steel_coaster', 10, 10, EAST);
    placeRideDirect(w, 'carousel', 11, 9, 0);
    expect(reasonOf(add(w, id, 'straight'))).toBe(TRACK_ERR.hitsBuilding);
  });

  it(`"${TRACK_ERR.hitsOwnTrack}"`, () => {
    const w = fresh();
    const id = place(w, 'steel_coaster', 10, 10, EAST);
    addAll(w, id, ['turn_small_right', 'turn_small_right', 'turn_small_right']);
    expect(reasonOf(add(w, id, 'straight'))).toBe(TRACK_ERR.hitsOwnTrack);
  });

  it(`"${TRACK_ERR.hitsOtherTrack}"`, () => {
    const w = fresh();
    const a = place(w, 'steel_coaster', 10, 10, EAST);
    place(w, 'junior_coaster', 11, 10, SOUTH);
    expect(reasonOf(add(w, a, 'straight'))).toBe(TRACK_ERR.hitsOtherTrack);
  });

  it(`"${TRACK_ERR.belowGround}"`, () => {
    const w = fresh();
    const id = place(w, 'steel_coaster', 10, 10, EAST);
    expect(reasonOf(add(w, id, 'flat_to_gentle_down'))).toBe(TRACK_ERR.belowGround);
  });

  it('"Too high for this ride type (max 12 m)"', () => {
    const w = fresh();
    const id = place(w, 'junior_coaster', 5, 10, EAST);
    addAll(w, id, [{ id: 'flat_to_gentle_up', chain: true }, ...times(5, { id: 'gentle_up', chain: true })]);
    expect(reasonOf(add(w, id, { id: 'gentle_up', chain: true }))).toBe('Too high for this ride type (max 12 m)');
  });

  it(`"${TRACK_ERR.noSupports}": span rule passes at 2 and fails at 3`, () => {
    const w = fresh();
    const id = place(w, 'steel_coaster', 10, 10, EAST);
    addAll(w, id, [{ id: 'flat_to_gentle_up', chain: true }, { id: 'gentle_up', chain: true }, { id: 'gentle_up_to_flat', chain: true }]);
    // End at +4 m (z = 12) at tile (14, 10). Paths under the next three straights.
    placeFootpath(w, 14, 10);
    placeFootpath(w, 15, 10);
    placeFootpath(w, 16, 10);
    expectOk(add(w, id, 'straight'));
    expectOk(add(w, id, 'straight'));
    expect(reasonOf(add(w, id, 'straight'))).toBe(TRACK_ERR.noSupports);
    // Supports block the ground; a path tile keeps its content under elevated track.
    expect(w.state.map.content[tileIndex(w.state.map, 14, 10)]).toBe(Content.Footpath);
    expect(w.state.map.content[tileIndex(w.state.map, 12, 10)]).toBe(Content.Track);
  });

  it(`"${TRACK_ERR.tooLong}"`, () => {
    const w = fresh();
    const id = place(w, 'steel_coaster', 10, 10, EAST);
    const d = dataOf(w, id);
    const first = d.pieces[0];
    if (!first) throw new Error('no station');
    while (d.pieces.length < 300) d.pieces.push({ ...first });
    expect(reasonOf(add(w, id, 'straight'))).toBe(TRACK_ERR.tooLong);
  });

  it(`"${TRACK_ERR.notEnoughCash}" for a piece`, () => {
    const w = fresh();
    const id = place(w, 'steel_coaster', 10, 10, EAST);
    w.state.park.cash = 2_499;
    expect(reasonOf(add(w, id, 'straight', false))).toBe(TRACK_ERR.notEnoughCash);
    w.state.park.cash = 2_500;
    expectOk(add(w, id, 'straight', false));
    expect(w.state.park.cash).toBe(0);
  });

  it(`"${TRACK_ERR.outsidePark}" for a piece`, () => {
    const w = fresh();
    const id = place(w, 'steel_coaster', 2, 10, WEST);
    expectOk(add(w, id, 'straight'));
    expect(reasonOf(add(w, id, 'straight'))).toBe(TRACK_ERR.outsidePark);
    w.state.map.owned[tileIndex(w.state.map, 20, 20)] = Owned.LandForSale;
    expect(reasonOf(executeCommand(w, { type: 'placeStation', typeId: 'steel_coaster', x: 20, y: 20, dir: EAST }))).toBe(TRACK_ERR.outsidePark);
  });

  it('a failed command leaves the state hash unchanged', () => {
    const w = fresh();
    const id = place(w, 'steel_coaster', 10, 10, EAST);
    const h = stateHash(w);
    expect(add(w, id, 'flat_to_gentle_down').ok).toBe(false);
    expect(add(w, id, 'gentle_up').ok).toBe(false);
    expect(stateHash(w)).toBe(h);
  });
});

describe('circuit closure', () => {
  it('auto-closes only on an exact joint match', () => {
    const w = fresh();
    const id = place(w, 'steel_coaster', 10, 10, EAST);
    addAll(w, id, SMALL_LOOP.slice(0, 4));
    expect(dataOf(w, id).circuitClosed).toBe(false);
    const r = expectOk(add(w, id, SMALL_LOOP[4] as string));
    expect(dataOf(w, id).circuitClosed).toBe(true);
    expect(r.warnings).toContain(TRACK_WARN.circuitComplete);
    expect(reasonOf(add(w, id, 'straight'))).toBe(TRACK_ERR.circuitAlreadyComplete);
  });

  it('does not close when the end reaches the station tile in the wrong direction', () => {
    const w = fresh();
    const id = place(w, 'steel_coaster', 10, 10, EAST);
    addAll(w, id, ['turn_small_right', 'turn_small_right', 'turn_small_right']);
    expect(dataOf(w, id).circuitClosed).toBe(false);
  });

  it('R1 closes after its last piece and measures 204.37 m', () => {
    const w = fresh();
    const id = buildR1(w);
    const d = dataOf(w, id);
    expect(d.circuitClosed).toBe(true);
    expect(d.pieces).toHaveLength(36);
    expect(getLayout(d).lengthMm).toBe(204_374);
  });

  it('removeLastTrackPiece reopens the circuit, refunds 100% before opening and 50% after', () => {
    const w = fresh();
    const id = place(w, 'steel_coaster', 10, 10, EAST, false);
    for (const p of SMALL_LOOP) expectOk(add(w, id, p, false));
    const cash = w.state.park.cash;
    const r = expectOk(executeCommand(w, { type: 'removeLastTrackPiece', rideId: id }));
    expect(dataOf(w, id).circuitClosed).toBe(false);
    expect(r.cost).toBe(-3_500);
    expect(w.state.park.cash).toBe(cash + 3_500);
    expect(w.state.map.content[tileIndex(w.state.map, 9, 10)]).toBe(Content.Empty);
    expectOk(add(w, id, 'turn_small_right', false));
    dataOf(w, id).openedOnce = true;
    const cash2 = w.state.park.cash;
    const before = rideOf(w, id).totalBuildCost;
    const r2 = expectOk(executeCommand(w, { type: 'removeLastTrackPiece', rideId: id }));
    expect(r2.cost).toBe(-1_750);
    expect(w.state.park.cash).toBe(cash2 + 1_750);
    expect(rideOf(w, id).totalBuildCost).toBe(before - 3_500);
    const led = w.state.economy.ledger[w.state.economy.ledger.length - 1];
    expect(led?.lines.demolitionRefunds).toBe(3_500 + 1_750);
  });

  it('never removes the first station piece', () => {
    const w = fresh();
    const id = place(w, 'steel_coaster', 10, 10, EAST);
    expect(reasonOf(executeCommand(w, { type: 'removeLastTrackPiece', rideId: id }))).toBe(TRACK_ERR.firstStation);
  });
});

describe('costs (phase-2 §4.12)', () => {
  it('piece cost = cost × factor + chain extra + $3 per metre of height', () => {
    const w = fresh();
    const id = place(w, 'steel_coaster', 10, 10, EAST, false);
    const c1 = expectOk(add(w, id, { id: 'flat_to_gentle_up', chain: true }, false));
    expect(c1.cost).toBe(4_000 + 2_000 + 300 * 1);
    const c2 = expectOk(add(w, id, { id: 'gentle_up', chain: false }, false));
    expect(c2.cost).toBe(3_500 + 300 * 3);
    const j = place(w, 'junior_coaster', 10, 20, EAST, false);
    expect(rideOf(w, j).totalBuildCost).toBe(150_000 + 4_200);
    const c3 = expectOk(add(w, j, 'straight', false));
    expect(c3.cost).toBe(1_750);
  });

  it('extra trains cost the type extra train cost and refund by the piece rule', () => {
    const w = fresh();
    const id = place(w, 'steel_coaster', 10, 10, EAST, false);
    const cash = w.state.park.cash;
    const r = expectOk(executeCommand(w, { type: 'setTrainConfig', rideId: id, trains: 3, carsPerTrain: 4 }));
    expect(r.cost).toBe(2 * 80_000);
    expect(w.state.park.cash).toBe(cash - 160_000);
    const r2 = expectOk(executeCommand(w, { type: 'setTrainConfig', rideId: id, trains: 1, carsPerTrain: 4 }));
    expect(r2.cost).toBe(-160_000);
    expect(reasonOf(executeCommand(w, { type: 'setTrainConfig', rideId: id, trains: 4, carsPerTrain: 4 }))).toBe('This ride type takes 1 to 3 trains');
    expect(reasonOf(executeCommand(w, { type: 'setTrainConfig', rideId: id, trains: 1, carsPerTrain: 8 }))).toBe('This ride type takes 2 to 7 cars per train');
  });
});

describe('gates', () => {
  it('places entrance and exit beside the station and warns about missing paths', () => {
    const w = fresh();
    const id = place(w, 'steel_coaster', 10, 10, EAST);
    addAll(w, id, ['station', 'station']);
    placeQueue(w, 11, 12);
    const r = expectOk(executeCommand(w, { type: 'placeTrackGate', rideId: id, kind: 'entrance', x: 11, y: 11 }));
    expect(r.warnings).toEqual([]);
    const ride = rideOf(w, id);
    expect(ride.entrance).toEqual({ gate: tileIndex(w.state.map, 11, 11), outside: tileIndex(w.state.map, 11, 12) });
    expect(w.state.map.content[tileIndex(w.state.map, 11, 11)]).toBe(Content.Building);
    expect(w.state.map.contentRef[tileIndex(w.state.map, 11, 11)]).toBe(id);
    const r2 = expectOk(executeCommand(w, { type: 'placeTrackGate', rideId: id, kind: 'exit', x: 12, y: 9 }));
    expect(r2.warnings).toEqual([TRACK_WARN.exitNeedsFootpath]);
    expect(ride.exit).toEqual({ gate: tileIndex(w.state.map, 12, 9), outside: tileIndex(w.state.map, 12, 8) });
    const r3 = expectOk(executeCommand(w, { type: 'placeTrackGate', rideId: id, kind: 'entrance', x: 10, y: 9 }));
    expect(r3.warnings).toEqual([TRACK_WARN.entranceNeedsQueue]);
    expect(w.state.map.content[tileIndex(w.state.map, 11, 11)]).toBe(Content.Empty);
  });

  it(`"${TRACK_ERR.gateBesideStation}" and "${TRACK_ERR.tileNotEmpty}"`, () => {
    const w = fresh();
    const id = place(w, 'steel_coaster', 10, 10, EAST);
    addAll(w, id, ['station', 'straight']);
    expect(reasonOf(executeCommand(w, { type: 'placeTrackGate', rideId: id, kind: 'entrance', x: 9, y: 10 }))).toBe(TRACK_ERR.gateBesideStation);
    expect(reasonOf(executeCommand(w, { type: 'placeTrackGate', rideId: id, kind: 'entrance', x: 12, y: 11 }))).toBe(TRACK_ERR.gateBesideStation);
    expect(reasonOf(executeCommand(w, { type: 'placeTrackGate', rideId: id, kind: 'entrance', x: 10, y: 12 }))).toBe(TRACK_ERR.gateBesideStation);
    placeFootpath(w, 10, 11);
    expect(reasonOf(executeCommand(w, { type: 'placeTrackGate', rideId: id, kind: 'entrance', x: 10, y: 11 }))).toBe(TRACK_ERR.tileNotEmpty);
    expectOk(executeCommand(w, { type: 'placeTrackGate', rideId: id, kind: 'entrance', x: 11, y: 11 }));
    expect(reasonOf(executeCommand(w, { type: 'placeTrackGate', rideId: id, kind: 'exit', x: 11, y: 11 }))).toBe(TRACK_ERR.tileNotEmpty);
    expect(reasonOf(executeCommand(w, { type: 'placeTrackGate', rideId: id, kind: 'exit', x: 11, y: 0 }))).toBe(TRACK_ERR.outsidePark);
  });
});

describe('test, open, and edit rules', () => {
  function closedLoop(typeId = 'junior_coaster', cars?: number) {
    const w = fresh();
    const id = place(w, typeId, 10, 10, EAST);
    addAll(w, id, SMALL_LOOP);
    if (cars !== undefined) expectOk(executeCommand(w, { type: 'setTrainConfig', rideId: id, trains: 1, carsPerTrain: cars }, { setup: true }));
    return { w, id };
  }

  it(`"${TRACK_ERR.circuitNotComplete}"`, () => {
    const w = fresh();
    const id = place(w, 'steel_coaster', 10, 10, EAST);
    expect(reasonOf(executeCommand(w, { type: 'startTestRun', rideId: id }))).toBe(TRACK_ERR.circuitNotComplete);
    expect(canOpenTrackRide(w, rideOf(w, id))).toBe(TRACK_ERR.circuitNotComplete);
  });

  it('"Station is too short for this train. Needs 3 tiles"', () => {
    const { w, id } = closedLoop('steel_coaster', 4);
    expect(reasonOf(executeCommand(w, { type: 'startTestRun', rideId: id }))).toBe('Station is too short for this train. Needs 3 tiles');
  });

  it(`"${TRACK_ERR.tooManyTrains}"`, () => {
    const { w, id } = closedLoop('junior_coaster', 2);
    expectOk(executeCommand(w, { type: 'setTrainConfig', rideId: id, trains: 2, carsPerTrain: 2 }, { setup: true }));
    expect(reasonOf(executeCommand(w, { type: 'startTestRun', rideId: id }))).toBe(TRACK_ERR.tooManyTrains);
  });

  it(`"${TRACK_ERR.needGates}" then "${TRACK_ERR.runTestFirst}"`, () => {
    const { w, id } = closedLoop('junior_coaster', 2);
    expect(canOpenTrackRide(w, rideOf(w, id))).toBe(TRACK_ERR.needGates);
    expectOk(executeCommand(w, { type: 'placeTrackGate', rideId: id, kind: 'entrance', x: 10, y: 9 }));
    expect(canOpenTrackRide(w, rideOf(w, id))).toBe(TRACK_ERR.needGates);
    rideOf(w, id).exit = { gate: 0, outside: 0 };
    expect(canOpenTrackRide(w, rideOf(w, id))).toBe(TRACK_ERR.runTestFirst);
  });

  it(`"${TRACK_ERR.closeFirst}", "${TRACK_ERR.waitForTest}", "${TRACK_ERR.mustBeEmpty}"`, () => {
    const { w, id } = closedLoop('junior_coaster', 2);
    const ride = rideOf(w, id);
    ride.status = 'open';
    expect(reasonOf(executeCommand(w, { type: 'editTrack', rideId: id }))).toBe(TRACK_ERR.closeFirst);
    expect(reasonOf(executeCommand(w, { type: 'removeLastTrackPiece', rideId: id }))).toBe(TRACK_ERR.closeFirst);
    expect(reasonOf(executeCommand(w, { type: 'setTrainConfig', rideId: id, trains: 1, carsPerTrain: 3 }))).toBe(TRACK_ERR.closeFirst);
    expect(reasonOf(executeCommand(w, { type: 'startTestRun', rideId: id }))).toBe(TRACK_ERR.closeFirst);
    ride.status = 'testing';
    expect(reasonOf(executeCommand(w, { type: 'editTrack', rideId: id }))).toBe(TRACK_ERR.waitForTest);
    expect(reasonOf(executeCommand(w, { type: 'removeLastTrackPiece', rideId: id }))).toBe(TRACK_ERR.waitForTest);
    expect(reasonOf(executeCommand(w, { type: 'setPieceOptions', rideId: id, index: 1, chain: true }))).toBe(TRACK_ERR.waitForTest);
    ride.status = 'closed';
    const g = addGuestDirect(w, 0, { state: 'riding' });
    const d = dataOf(w, id);
    d.trains = [{ id: 1, s: 0, v: 0, state: 'loading', dwellTicks: 0, lap: 0, seats: [g.id, -1, -1, -1], dist: 0, parked: false, release: false, driveMms: 0, lapStartTick: 0 }];
    expect(reasonOf(executeCommand(w, { type: 'editTrack', rideId: id }))).toBe(TRACK_ERR.mustBeEmpty);
    expect(reasonOf(executeCommand(w, { type: 'removeLastTrackPiece', rideId: id }))).toBe(TRACK_ERR.mustBeEmpty);
    d.trains[0]!.seats[0] = -1;
    expectOk(executeCommand(w, { type: 'editTrack', rideId: id }));
    expect(ride.status).toBe('building');
    expect(d.trains).toEqual([]);
  });

  it('setPieceOptions toggles a chain, sets brake speed, and clears the test', () => {
    const w = fresh();
    const id = place(w, 'steel_coaster', 10, 10, EAST, false);
    expectOk(add(w, id, 'straight', false));
    expectOk(add(w, id, 'brakes', false));
    const d = dataOf(w, id);
    expect(d.pieces[2]?.brakeSpeed).toBe(6);
    const cash = w.state.park.cash;
    const r = expectOk(executeCommand(w, { type: 'setPieceOptions', rideId: id, index: 1, chain: true }));
    expect(r.cost).toBe(2_000);
    expect(w.state.park.cash).toBe(cash - 2_000);
    expect(d.pieces[1]?.chain).toBe(true);
    expectOk(executeCommand(w, { type: 'setPieceOptions', rideId: id, index: 2, brakeSpeed: 12 }));
    expect(d.pieces[2]?.brakeSpeed).toBe(12);
    expect(reasonOf(executeCommand(w, { type: 'setPieceOptions', rideId: id, index: 2, brakeSpeed: 21 }))).toBe(TRACK_ERR.brakeSpeedRange);
    expect(reasonOf(executeCommand(w, { type: 'setPieceOptions', rideId: id, index: 2, chain: true }))).toBe(TRACK_ERR.typeCannotUse);
    expect(reasonOf(executeCommand(w, { type: 'setPieceOptions', rideId: id, index: 9, chain: true }))).toBe(TRACK_ERR.noSuchPiece);
  });

  it('setTrackOperation and setTrackColours apply any time and validate ranges', () => {
    const w = fresh();
    const id = place(w, 'go_karts', 10, 10, EAST);
    rideOf(w, id).status = 'open';
    expectOk(executeCommand(w, { type: 'setTrackOperation', rideId: id, minDwellS: 0, maxDwellS: 60, laps: 5 }));
    expect(dataOf(w, id).operation).toEqual({ minDwellTicks: 0, maxDwellTicks: 1200, laps: 5 });
    expect(reasonOf(executeCommand(w, { type: 'setTrackOperation', rideId: id, minDwellS: 31, maxDwellS: 60, laps: 2 }))).toBe(TRACK_ERR.operationRange);
    expect(reasonOf(executeCommand(w, { type: 'setTrackOperation', rideId: id, minDwellS: 3, maxDwellS: 4, laps: 2 }))).toBe(TRACK_ERR.operationRange);
    expect(reasonOf(executeCommand(w, { type: 'setTrackOperation', rideId: id, minDwellS: 3, maxDwellS: 15, laps: 6 }))).toBe(TRACK_ERR.operationRange);
    expectOk(executeCommand(w, { type: 'setTrackColours', rideId: id, track: 3, supports: 4, cars: 11 }));
    expect(dataOf(w, id).colours).toEqual({ track: 3, supports: 4, cars: 11 });
    expect(reasonOf(executeCommand(w, { type: 'setTrackColours', rideId: id, track: 12, supports: 4, cars: 1 }))).toBe(TRACK_ERR.colourRange);
  });
});
