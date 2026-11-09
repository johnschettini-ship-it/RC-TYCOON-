/** Owner: W1-E. Price and park setting commands (Phase 1 §4.4–4.6, §6). */
import {
  ENTRANCE_FEE_MAX,
  ENTRANCE_FEE_MIN,
  ENTRANCE_FEE_STEP,
  PARK_NAME_MAX,
  PARK_NAME_MIN,
  PRICE_MAX,
  PRICE_MIN,
  PRICE_STEP,
} from '../../../data/tuning/economy';
import { forgetDestination } from '../../guests/api';
import { emptyQueue } from '../../rides/flat/api';
import { canOpenTrackRide } from '../../rides/track/api';
import type { Ride, RideStatus } from '../../rides/types';
import type { World } from '../../types';
import { fail, ok, type CommandResult, type HandlerMap, type PriceCommand } from '../types';

/** Failure reasons (master R4: no final period). */
export const PRICE_ERRORS = Object.freeze({
  rideNotFound: 'Ride not found',
  stallNotFound: 'Stall not found',
  priceRange: 'Price must be between $0 and $20',
  priceStep: 'Price must be in steps of $0.10',
  feeRange: 'Entrance fee must be between $0 and $50',
  feeStep: 'Entrance fee must be in whole dollars',
  parkName: 'Park name must be 1 to 32 characters',
});

/** Null when `cents` is a valid price for this range and step, else the reason. */
function checkAmount(cents: number, min: number, max: number, step: number, rangeReason: string, stepReason: string): string | null {
  if (!(cents >= min && cents <= max)) return rangeReason;
  if (!Number.isInteger(cents) || cents % step !== 0) return stepReason;
  return null;
}

function checkPrice(cents: number): string | null {
  return checkAmount(cents, PRICE_MIN, PRICE_MAX, PRICE_STEP, PRICE_ERRORS.priceRange, PRICE_ERRORS.priceStep);
}

function findRide(world: World, id: number): Ride | undefined {
  return world.state.rides.find((r) => r.id === id);
}

/** Statuses the breakdown and weather systems own. They restore `statusBeforeBreakdown` when they finish. */
function isHeld(status: RideStatus): boolean {
  return status === 'broken' || status === 'inspecting' || status === 'stormHold';
}

function setRideOpen(world: World, ride: Ride, open: boolean): CommandResult {
  if (open) {
    if (ride.status === 'open') return ok();
    if (isHeld(ride.status)) {
      // Open again once the breakdown, inspection, or storm is over.
      ride.statusBeforeBreakdown = 'open';
      return ok();
    }
    if (ride.kind === 'track') {
      const reason = canOpenTrackRide(world, ride);
      if (reason !== null) return fail(reason);
    }
    ride.status = 'open';
    return ok();
  }
  if (ride.status === 'closed') return ok();
  if (isHeld(ride.status)) {
    ride.statusBeforeBreakdown = 'closed';
  } else if (ride.status === 'open') {
    ride.status = 'closed';
  } else {
    // A track ride still being built or tested has no queue to empty and nothing to close.
    return ok();
  }
  // Closed: riders finish the current cycle (flat cycle / track operation); the queue empties;
  // guests on their way re-plan.
  emptyQueue(world, ride, null);
  forgetDestination(world, `ride:${ride.id}`);
  return ok();
}

function renamePark(world: World, name: string): CommandResult {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  const length = Array.from(trimmed).length;
  if (length < PARK_NAME_MIN || length > PARK_NAME_MAX) return fail(PRICE_ERRORS.parkName);
  world.state.park.name = trimmed;
  return ok();
}

export const priceHandlers: HandlerMap<PriceCommand> = {
  setRidePrice: (world, cmd) => {
    const ride = findRide(world, cmd.rideId);
    if (!ride) return fail(PRICE_ERRORS.rideNotFound);
    const reason = checkPrice(cmd.price);
    if (reason) return fail(reason);
    ride.price = cmd.price;
    return ok();
  },
  setStallPrice: (world, cmd) => {
    const stall = world.state.stalls.find((s) => s.id === cmd.stallId);
    if (!stall) return fail(PRICE_ERRORS.stallNotFound);
    const reason = checkPrice(cmd.price);
    if (reason) return fail(reason);
    stall.price = cmd.price;
    return ok();
  },
  setEntranceFee: (world, cmd) => {
    const reason = checkAmount(
      cmd.fee,
      ENTRANCE_FEE_MIN,
      ENTRANCE_FEE_MAX,
      ENTRANCE_FEE_STEP,
      PRICE_ERRORS.feeRange,
      PRICE_ERRORS.feeStep,
    );
    if (reason) return fail(reason);
    world.state.park.entranceFee = cmd.fee;
    return ok();
  },
  setRideOpen: (world, cmd) => {
    const ride = findRide(world, cmd.rideId);
    if (!ride) return fail(PRICE_ERRORS.rideNotFound);
    return setRideOpen(world, ride, cmd.open === true);
  },
  setParkOpen: (world, cmd) => {
    world.state.park.open = cmd.open === true;
    return ok();
  },
  renamePark: (world, cmd) => renamePark(world, cmd.name),
};
