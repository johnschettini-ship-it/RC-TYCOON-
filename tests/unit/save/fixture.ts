/** Save test fixtures: a world that touches every slice, built with the shared direct helpers. */
import {
  addGuestDirect,
  makeTestWorld,
  makeTrackRideDataDirect,
  placeFootpath,
  placeQueue,
  placeRideDirect,
  placeStallDirect,
  testResultDirect,
  trackPiecesDirect,
} from '../../helpers/world';
import { allocId } from '../../../src/sim/ids';
import { Content, tileIndex } from '../../../src/sim/map';
import { recordLedger } from '../../../src/sim/economy/ledger';
import type { World } from '../../../src/sim/types';
import type { Ride } from '../../../src/sim/rides/types';
import type { Staff } from '../../../src/sim/staff/types';

export interface RichWorld {
  world: World;
  ride: Ride;
  track: Ride;
  stallId: number;
  queuer: number;
  rider: number;
  buyer: number;
  seated: number;
  mechanic: number;
}

/** A track ride record plus its track slice entry: 2 station tiles and a brake at (40..42, 20), heading +x. */
export function addTrackRideDirect(world: World): Ride {
  const s = world.state;
  const id = allocId(s);
  const tiles = [40, 41, 42].map((x) => tileIndex(s.map, x, 20));
  for (const t of tiles) {
    s.map.content[t] = Content.Track;
    s.map.contentRef[t] = id;
  }
  const ride: Ride = {
    id,
    kind: 'track',
    defId: 'steel_coaster',
    name: 'Steel Coaster 1',
    x: 40,
    y: 20,
    rotation: 1,
    status: 'open',
    price: 500,
    entrance: { gate: tileIndex(s.map, 41, 21), outside: tileIndex(s.map, 41, 22) },
    exit: null,
    stats: { excitement: 500, intensity: 314, nausea: 143 },
    queue: [],
    riders: [],
    cycle: { phase: 'waiting', ticks: 0 },
    totals: { riders: 12, income: 6000, ridersThisMonth: 4, incomeThisMonth: 2000 },
    builtTick: s.tick,
    hoursThisMonth: 3,
    reliability: 97.5,
    lastInspectionTick: s.tick,
    inspectionIntervalTicks: 1200,
    breakdownType: null,
    statusBeforeBreakdown: null,
    breakdownsThisMonth: 0,
    lastBreakdownTick: -1,
    assignedMechanicId: null,
    totalBuildCost: 2_345_600,
  };
  s.rides.push(ride);
  // Station, station, brakes along +x (map rotation E = track direction 0); the circuit is open.
  const pieces = trackPiecesDirect(40, 20, 8, 0, ['station', 'station', 'brakes']);
  pieces.forEach((p, i) => (p.cost = 6_000 + 100 * i));
  pieces[2]!.brakeSpeed = 8;
  makeTrackRideDataDirect(world, ride, {
    pieces,
    trainConfig: { trains: 1, carsPerTrain: 2 },
    operation: { minDwellTicks: 20, maxDwellTicks: 200, laps: 1 },
    trains: [
      {
        id: 0,
        s: 1234,
        v: 6789,
        state: 'running',
        dwellTicks: 0,
        lap: 0,
        seats: [-1, -1, -1, -1, -1, -1, -1, -1],
        dist: 5678,
        parked: false,
        release: true,
        driveMms: 0,
        lapStartTick: 2600,
      },
    ],
    test: testResultDirect({ airtimeTicks: 12, inversions: 1 }),
    colours: { track: 3, supports: 1, cars: 7 },
    openedOnce: true,
    lastDispatchTick: 2600,
    bestLapTicks: 1234,
  });
  return ride;
}

export function addStaffDirect(world: World, patch: Partial<Staff> = {}): Staff {
  const s = world.state;
  const id = allocId(s);
  const member: Staff = {
    id,
    type: 'groundskeeper',
    name: `Staff ${id}`,
    tile: tileIndex(s.map, 31, 60),
    z: 8,
    nextTile: -1,
    progress: 0,
    dir: 0,
    state: 'walking',
    stateTicks: 0,
    targetTile: -1,
    targetRideId: -1,
    patrol: null,
    costume: null,
    hiredTick: s.tick,
    hoursThisMonth: 0,
    task: 'none',
    route: [],
    prevTile: -1,
    nextRecheckTick: s.tick,
    fixRideId: -1,
    savedRideStatus: null,
    walkTicksLeft: 0,
    ...patch,
  };
  s.staff.members.push(member);
  return member;
}

export function makeRichWorld(): RichWorld {
  const world = makeTestWorld(4242, 'Frosty Peaks');
  const s = world.state;
  const map = s.map;
  const n = map.width * map.height;

  for (let y = 30; y <= 60; y++) placeFootpath(world, 31, y);
  for (let x = 20; x <= 40; x++) placeFootpath(world, x, 30);
  for (const y of [25, 26, 27, 28, 29]) placeQueue(world, 12, y);

  const ride = placeRideDirect(world, 'carousel', 11, 22, 0);
  const stall = placeStallDirect(world, 'snack_shack', 25, 29, 2);
  const restroom = placeStallDirect(world, 'restrooms', 27, 31, 0);
  const track = addTrackRideDirect(world);

  const walker = addGuestDirect(world, tileIndex(map, 31, 50), {
    target: `ride:${ride.id}`,
    thoughts: [
      { id: 'thinking.hungry', tick: 500 },
      { id: 'thinking.ridePrice', tick: 520, params: { ride: 'Carousel', price: 200 } },
    ],
    thoughtCooldowns: { 'thinking.hungry': 500 },
    ridden: { [String(ride.id)]: 2 },
    items: { map: true, umbrella: false, balloon: true, photo: false },
    needs: { hunger: 140, thirst: 12, bladder: 99, energy: 180, happiness: 211, nausea: 3 },
  });
  const queuer = addGuestDirect(world, tileIndex(map, 12, 27), { state: 'queueing', activityId: ride.id, target: `ride:${ride.id}` });
  const rider = addGuestDirect(world, ride.entrance!.gate, { state: 'riding', activityId: ride.id });
  const buyer = addGuestDirect(world, stall.serviceTile, { state: 'buying', activityId: stall.id, target: `stall:${stall.id}`, spent: 300 });
  const seated = addGuestDirect(world, tileIndex(map, 41, 20), {
    state: 'riding',
    activityId: track.id,
    seat: { rideId: track.id, trainId: 0, car: 1, seat: 2 },
  });
  addGuestDirect(world, tileIndex(map, 31, 62), { state: 'leaving', target: 'exit', trashTimer: 40, lostSinceTick: 470 });
  void walker;

  ride.queue.push(queuer.id);
  ride.riders.push(rider.id);
  ride.status = 'open';
  ride.cycle = { phase: 'running', ticks: 120 };
  stall.servingGuest = buyer.id;
  restroom.open = false;
  const trackData = s.track.rides[String(track.id)]!;
  trackData.trains[0]!.seats[1 * 4 + 2] = seated.id;

  const patrol = new Uint8Array(Math.ceil(n / 8));
  patrol[3] = 0b1010_0101;
  patrol[patrol.length - 1] = 0xff;
  addStaffDirect(world, { patrol });
  const mechanic = addStaffDirect(world, { type: 'mechanic', state: 'fixing', targetRideId: ride.id, targetTile: ride.exit!.outside });
  addStaffDirect(world, { type: 'performer', costume: 'boo', state: 'performing' });
  ride.assignedMechanicId = mechanic.id;
  ride.status = 'broken';
  ride.statusBeforeBreakdown = 'open';
  ride.breakdownType = 'stuck';
  s.staff.pendingBreakdowns.push(track.id);
  s.staff.autoRepair = true;

  // Non-zero values in every map layer.
  for (let i = 0; i < n; i += 7) {
    map.terrain[i] = (i % 5) as number;
    map.heights[i] = 8 + (i % 4);
    map.slope[i] = i % 16;
    map.water[i] = i % 3 === 0 ? 9 : 0;
    map.litter[i] = i % 9;
    map.mess[i] = i % 3;
  }
  const bin = tileIndex(map, 31, 45);
  map.pathItem[bin] = 2;
  map.binFill[bin] = 17;
  map.pathItem[tileIndex(map, 31, 46)] = 1;
  map.pathItemFlags[tileIndex(map, 31, 46)] = 1;
  map.owned[5] = 2;

  s.park.open = true;
  s.park.rating = 612;
  s.park.turnedAway = 3;
  s.park.recentLeavers = [120, 200, 255, 0];
  s.park.arrivalCarry = 437;
  s.park.guestsArrivedTotal = 25;
  s.modifiers.arrivals = 1.25;
  s.tick = 2777;
  s.rng = -123456789;
  recordLedger(world, 'construction', -120_000);
  recordLedger(world, 'entranceTickets', 4_000);

  const m = s.management;
  m.research.level = 'high';
  m.research.focus.water = false;
  m.research.current = 'flip_arm';
  m.research.progress = 77.5;
  m.research.unlocked = ['pizza_slice'];
  m.campaigns.push({ type: 'posterRun', targetId: -1, endTick: 9000 });
  m.loan.balance = 500_000;
  m.weather = { current: 'rain', next: 'storm', nextChangeTick: 3000 };
  m.parkValue = 3_456_700;
  m.messages.push(
    { id: 1, tick: 600, category: 'breakdown', textId: 'msg.breakdown', params: { ride: 'Carousel' }, tile: ride.entrance!.gate, entityId: ride.id },
    { id: 2, tick: 700, category: 'weather', textId: 'msg.storm', tile: -1, entityId: -1 },
  );
  m.nextMessageId = 3;
  m.messagesReadUpTo = 1;

  world.events.push({ type: 'guestsChanged' }, { type: 'monthEnded', monthIndex: 0 });

  return { world, ride, track, stallId: stall.id, queuer: queuer.id, rider: rider.id, buyer: buyer.id, seated: seated.id, mechanic: mechanic.id };
}
