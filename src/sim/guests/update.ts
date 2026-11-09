/**
 * Owner: W1-D. Phase 1 §4.3. Guests in ascending id order.
 * Per guest and tick: needs → state work (safety, target checks, decision, movement, queue, buying)
 * → guestHooks.perTick. Guests who reach the exit are removed after the loop.
 */
import {
  GUEST_DECISION_INTERVAL,
  GUEST_WALK_TICKS_PER_TILE,
  QUEUE_HAPPINESS_TICKS,
  RECENT_LEAVERS_MAX,
  SIT_MAX_TICKS,
} from '../../data/tuning/guests';
import { emit } from '../events';
import { guestHooks, hookFactor } from '../hooks';
import { isHourStart } from '../time';
import { distanceTo, nextStep, queueOwner } from '../pathing';
import type { World } from '../types';
import { joinQueue, leaveQueue } from './api';
import { updateBuying, startBuying } from './buying';
import { becomeLost, decide } from './decide';
import { beginStep, relocate, stepOffQueue, stopWalking, tileOk, wanderStep } from './movement';
import { changeNeed, ditherStep, updateNeeds } from './needs';
import { findRide, findStall, parseDest, replan, setState, targetValid } from './state';
import { THOUGHT } from './thoughts';
import type { Guest } from './types';

const AT_TARGET = -2;

/** Put a guest who left through the entrance on the leavers list. */
function despawn(world: World, guest: Guest, gone: Set<number>): void {
  const leavers = world.state.park.recentLeavers;
  leavers.push(guest.needs.happiness);
  while (leavers.length > RECENT_LEAVERS_MAX) leavers.shift();
  gone.add(guest.id);
}

/** True when the guest stands where its target is served. */
function atTarget(world: World, guest: Guest): boolean {
  const target = guest.target;
  if (target === null) return false;
  const p = parseDest(target);
  if (p.kind === 'exit') return guest.tile === world.state.map.entranceTile;
  if (p.kind === 'stall') return findStall(world, p.id)?.serviceTile === guest.tile;
  const ride = findRide(world, p.id);
  if (!ride) return false;
  return guest.tile === ride.entrance?.outside || queueOwner(world, guest.tile) === ride.id;
}

/** Act on arrival. Returns true when the guest left the park. */
function arrive(world: World, guest: Guest, gone: Set<number>): boolean {
  const p = parseDest(guest.target as NonNullable<Guest['target']>);
  if (p.kind === 'exit') {
    despawn(world, guest, gone);
    return true;
  }
  if (p.kind === 'stall') {
    const stall = findStall(world, p.id);
    if (stall) startBuying(world, guest, stall);
    else replan(world, guest);
    return false;
  }
  const ride = findRide(world, p.id);
  if (ride) joinQueue(world, guest, ride);
  else replan(world, guest);
  return false;
}

/** Choose the next tile: toward the target, or wander. −1 = stand still; −2 = already at the target. */
function chooseNextTile(world: World, guest: Guest): number {
  if (guest.target !== null) {
    const n = nextStep(world, guest.tile, guest.target);
    if (n !== null && tileOk(world, n)) {
      if (guest.state === 'leaving') guest.lostSinceTick = -1;
      return n;
    }
    // `nextStep` is null both at the destination and when unreachable (W1-C): distance 0 means arrived.
    if (n === null && distanceTo(world, guest.tile, guest.target) === 0) return AT_TARGET;
    // No route (Phase 1 §4.2): wander and think "I am lost". Walking guests drop the target.
    becomeLost(world, guest);
    if (guest.state !== 'leaving') guest.target = null;
  }
  return wanderStep(world, guest);
}

/** Movement for walking and leaving guests. Returns true when the guest left the park. */
function move(world: World, guest: Guest, gone: Set<number>): boolean {
  if (guest.nextTile < 0) {
    if (atTarget(world, guest)) return arrive(world, guest, gone);
    const next = chooseNextTile(world, guest);
    if (next === AT_TARGET) return arrive(world, guest, gone);
    if (next < 0) return false;
    beginStep(world, guest, next);
  }
  if (!tileOk(world, guest.nextTile)) {
    stopWalking(guest);
    return false;
  }
  // Build 2 walking factors (Calm, Buzz) through the guest hooks; 1 with no hooks.
  guest.progress += guestHooks.walkSpeed.length === 0 ? 1 : hookFactor(guestHooks.walkSpeed, world, guest);
  if (guest.progress < GUEST_WALK_TICKS_PER_TILE) return false;
  guest.tile = guest.nextTile;
  stopWalking(guest);
  if (atTarget(world, guest)) return arrive(world, guest, gone);
  return false;
}

function updateWalking(world: World, guest: Guest, gone: Set<number>): boolean {
  const tick = world.state.tick;
  if (guest.state === 'leaving' && guest.tile === world.state.map.entranceTile) {
    despawn(world, guest, gone);
    return true;
  }
  if (!tileOk(world, guest.tile)) relocate(world, guest);
  if (guest.target !== null && !targetValid(world, guest.target)) replan(world, guest);
  if (guest.state === 'arriving') setState(guest, 'walking');
  if (guest.state === 'walking' && tick >= guest.nextDecisionTick) {
    guest.nextDecisionTick = tick + GUEST_DECISION_INTERVAL;
    decide(world, guest);
    if (guest.state !== 'walking' && guest.state !== 'leaving') return false;
  }
  return move(world, guest, gone);
}

function updateQueueing(world: World, guest: Guest): void {
  const ride = findRide(world, guest.activityId);
  if (!ride || !ride.queue.includes(guest.id)) {
    // The ride is gone or someone removed the guest from its queue without telling us.
    stepOffQueue(world, guest);
    replan(world, guest);
    if (!tileOk(world, guest.tile)) relocate(world, guest);
    return;
  }
  if (!tileOk(world, guest.tile)) {
    leaveQueue(world, guest, ride, null);
    relocate(world, guest);
    return;
  }
  if (guest.stateTicks > 0 && guest.stateTicks % QUEUE_HAPPINESS_TICKS === 0) {
    const k = guest.stateTicks / QUEUE_HAPPINESS_TICKS - 1;
    changeNeed(guest, 'happiness', -ditherStep(world.state.modifiers.happinessDecay, k));
  }
  // Phase 3 §4.5: patience drains twice as fast while the ride is broken (except slow running).
  if (ride.status === 'broken' && ride.breakdownType !== 'slow_running') guest.nextDecisionTick -= 1;
  if (world.state.tick >= guest.nextDecisionTick) leaveQueue(world, guest, ride, THOUGHT.waitedTooLong);
}

function updateRiding(world: World, guest: Guest): void {
  if (findRide(world, guest.activityId)) return;
  // The ride vanished with the guest on board: put the guest back on the paths.
  guest.seat = null;
  replan(world, guest);
  if (!tileOk(world, guest.tile)) relocate(world, guest);
}

/**
 * A sitting guest stays put. The bench owner (W1-H perTick hook) ends the sit and gives the energy;
 * as a safety net the guest stands up (no energy) after SIT_MAX_TICKS or when the tile is gone.
 */
function updateSitting(world: World, guest: Guest): void {
  stopWalking(guest);
  if (!tileOk(world, guest.tile)) relocate(world, guest);
  else if (guest.stateTicks < SIT_MAX_TICKS) return;
  setState(guest, 'walking');
  guest.nextDecisionTick = world.state.tick;
}

function updateBuyingState(world: World, guest: Guest): void {
  if (!tileOk(world, guest.tile)) {
    const stall = findStall(world, guest.activityId);
    if (stall && stall.servingGuest === guest.id) stall.servingGuest = -1;
    replan(world, guest);
    relocate(world, guest);
    return;
  }
  updateBuying(world, guest, findStall(world, guest.activityId));
}

/** Update one guest for this tick. Returns true when the guest left the park. */
export function updateGuest(world: World, guest: Guest, gone: Set<number>): boolean {
  guest.stateTicks += 1;
  updateNeeds(world, guest);
  let left = false;
  switch (guest.state) {
    case 'queueing':
      updateQueueing(world, guest);
      break;
    case 'riding':
      updateRiding(world, guest);
      break;
    case 'buying':
      updateBuyingState(world, guest);
      break;
    case 'sitting':
      updateSitting(world, guest);
      break;
    default:
      left = updateWalking(world, guest, gone);
  }
  if (left) return true;
  for (const hook of guestHooks.perTick) hook(world, guest);
  if (guestHooks.perHour.length > 0 && isHourStart(world.state.tick)) for (const hook of guestHooks.perHour) hook(world, guest);
  return false;
}

export function updateGuests(world: World): void {
  const guests = world.state.guests;
  const gone = new Set<number>();
  for (let i = 0; i < guests.length; i++) updateGuest(world, guests[i] as Guest, gone);
  if (gone.size === 0) return;
  let w = 0;
  for (let r = 0; r < guests.length; r++) {
    const g = guests[r] as Guest;
    if (!gone.has(g.id)) guests[w++] = g;
  }
  guests.length = w;
  emit(world, { type: 'guestsChanged' });
}
