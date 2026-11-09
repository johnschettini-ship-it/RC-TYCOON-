/** content-catalog.md §2. Speeds in mm/s. Costs and piece sets live in phase-2-coasters.md §8 (W1-G data). */
import type { ContentFlags, TrackRideDef } from './types';

const F = (covered = false, spooky = false): ContentFlags => ({ covered, spooky, tall: false });

export const TRACK_RIDES: readonly TrackRideDef[] = Object.freeze([
  { id: 'steel_coaster', name: 'Steel Coaster', phase: 2, unlock: 'start', tag: 'thrill', flags: F(), drive: 'gravity', seatsPerCar: 4, carsMin: 2, carsMax: 7, maxTrains: 3, maxHeightM: 50, driveSpeedMms: null, driveSpeedMinMms: null, defaultPrice: 500 },
  { id: 'junior_coaster', name: 'Junior Coaster', phase: 2, unlock: 'start', tag: 'family', flags: F(), drive: 'gravity', seatsPerCar: 2, carsMin: 2, carsMax: 6, maxTrains: 2, maxHeightM: 12, driveSpeedMms: null, driveSpeedMinMms: null, defaultPrice: 300 },
  { id: 'mini_railway', name: 'Mini Railway', phase: 2, unlock: 'start', tag: 'chill', flags: F(), drive: 'powered', seatsPerCar: 6, carsMin: 2, carsMax: 5, maxTrains: 2, maxHeightM: 8, driveSpeedMms: 5000, driveSpeedMinMms: null, defaultPrice: 200 },
  { id: 'wooden_coaster', name: 'Wooden Coaster', phase: 3, unlock: 'coasters', tag: 'thrill', flags: F(), drive: 'gravity', seatsPerCar: 4, carsMin: 2, carsMax: 7, maxTrains: 3, maxHeightM: 40, driveSpeedMms: null, driveSpeedMinMms: null, defaultPrice: 500 },
  { id: 'spinning_mouse', name: 'Spinning Mouse', phase: 3, unlock: 'coasters', tag: 'family', flags: F(), drive: 'gravity', seatsPerCar: 4, carsMin: 1, carsMax: 1, maxTrains: 6, maxHeightM: 16, driveSpeedMms: null, driveSpeedMinMms: null, defaultPrice: 400 },
  { id: 'ghost_train', name: 'Ghost Train', phase: 3, unlock: 'gentle', tag: 'chill', flags: F(true, true), drive: 'powered', seatsPerCar: 2, carsMin: 1, carsMax: 3, maxTrains: 4, maxHeightM: 6, driveSpeedMms: 3000, driveSpeedMinMms: null, defaultPrice: 300 },
  { id: 'go_karts', name: 'Go-Kart Track', phase: 3, unlock: 'thrill', tag: 'thrill', flags: F(), drive: 'guestDriven', seatsPerCar: 1, carsMin: 1, carsMax: 1, maxTrains: 12, maxHeightM: 4, driveSpeedMms: 9000, driveSpeedMinMms: 6000, defaultPrice: 300 },
  { id: 'log_flume', name: 'Log Flume', phase: 4, unlock: 'water', tag: 'family', flags: F(), drive: 'waterChannel', seatsPerCar: 4, carsMin: 1, carsMax: 1, maxTrains: 6, maxHeightM: 20, driveSpeedMms: null, driveSpeedMinMms: null, defaultPrice: 400 },
  { id: 'rapids_raft', name: 'Rapids Raft', phase: 4, unlock: 'water', tag: 'family', flags: F(), drive: 'waterCurrent', seatsPerCar: 8, carsMin: 1, carsMax: 1, maxTrains: 8, maxHeightM: 10, driveSpeedMms: null, driveSpeedMinMms: null, defaultPrice: 400 },
]);

export function getTrackRideDef(id: string): TrackRideDef | undefined {
  return TRACK_RIDES.find((r) => r.id === id);
}
