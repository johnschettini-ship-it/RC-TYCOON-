/**
 * Id order and reference integrity of a structurally valid GameState (master §6.5, §7; Phase 2 §5; Phase 3 §5).
 * Runs after `checkStructure`, so every field has its declared type here.
 */
import { getFlatRideDef, getStallDef, TRACK_RIDES } from '../data/catalog';
import type { GameState } from '../sim/types';
import type { Ride } from '../sim/rides/types';
import type { Guest } from '../sim/guests/types';
import { checkTrackRideForLoad } from '../sim/rides/track/api';

type EntityKind = 'ride' | 'stall' | 'guest' | 'staff';

const TRACK_TYPES = new Set(TRACK_RIDES.map((d) => d.id));

/** Null when ids and references are sound, else a short reason. */
export function checkIntegrity(s: GameState): string | null {
  if (s.nextId < 1) return 'bad value at nextId';
  if (s.tick < 0) return 'bad value at tick';

  // Ids: each list strictly ascending, ids unique across all lists, 1 ≤ id < nextId.
  const owner = new Map<number, EntityKind>();
  const lists: Array<[string, EntityKind, ReadonlyArray<{ id: number }>]> = [
    ['rides', 'ride', s.rides],
    ['stalls', 'stall', s.stalls],
    ['guests', 'guest', s.guests],
    ['staff', 'staff', s.staff.members],
  ];
  for (const [label, kind, list] of lists) {
    let prev = 0;
    for (const e of list) {
      if (e.id < 1) return `bad id ${e.id}`;
      if (e.id >= s.nextId) return `id ${e.id} is not below nextId`;
      if (e.id === prev || owner.has(e.id)) return `id ${e.id} is used twice`;
      if (e.id < prev) return `${label} are not sorted by id`;
      owner.set(e.id, kind);
      prev = e.id;
    }
  }

  const rides = new Map<number, Ride>(s.rides.map((r) => [r.id, r]));
  const guests = new Map<number, Guest>(s.guests.map((g) => [g.id, g]));
  const isRideOrStall = (id: number): boolean => owner.get(id) === 'ride' || owner.get(id) === 'stall';

  // Map tiles.
  const refs = s.map.contentRef;
  for (let i = 0; i < refs.length; i++) {
    const id = refs[i] as number;
    if (id >= 0 && !isRideOrStall(id)) return `map tile ${i} points to a missing ride or stall`;
  }

  // Rides.
  for (const r of s.rides) {
    if (r.kind === 'flat' && !getFlatRideDef(r.defId)) return `ride ${r.id} has an unknown type`;
    for (const g of r.queue) if (!guests.has(g)) return `ride ${r.id} queue lists a missing guest`;
    for (const g of r.riders) if (!guests.has(g)) return `ride ${r.id} lists a missing rider`;
    if (r.assignedMechanicId !== null && owner.get(r.assignedMechanicId) !== 'staff') return `ride ${r.id} has a missing mechanic`;
  }

  // Stalls.
  for (const st of s.stalls) {
    if (!getStallDef(st.defId)) return `stall ${st.id} has an unknown type`;
    if (st.servingGuest >= 0 && !guests.has(st.servingGuest)) return `stall ${st.id} serves a missing guest`;
  }

  // Guests.
  for (const g of s.guests) {
    if (g.activityId >= 0 && !isRideOrStall(g.activityId)) return `guest ${g.id} is busy at a missing ride or stall`;
    if (g.seat !== null && !rides.has(g.seat.rideId)) return `guest ${g.id} has a seat on a missing ride`;
  }

  // Track slice: keys match the live track rides one to one; seated guests ride this ride; then the track
  // module's own load checks (Phase 2 §5: pieces join, circuit flag, train positions and speeds, seats).
  const trackRides = s.track.rides;
  for (const key of Object.keys(trackRides)) {
    const id = Number(key);
    const ride = rides.get(id);
    if (!Number.isInteger(id) || String(id) !== key || !ride || ride.kind !== 'track') return `track data ${key} has no matching track ride`;
    const data = trackRides[key]!;
    if (data.rideId !== id) return `track data ${key} has the wrong ride id`;
    if (!TRACK_TYPES.has(data.typeId)) return `track ride ${id} has an unknown type`;
    for (const train of data.trains) {
      for (const gid of train.seats) {
        if (gid < 0) continue;
        const guest = guests.get(gid);
        if (!guest) return `track ride ${id} seats a missing guest`;
        if (guest.state !== 'riding' || guest.seat === null || guest.seat.rideId !== id) {
          return `track ride ${id} seats guest ${gid} who is not on it`;
        }
      }
    }
    const trackProblem = checkTrackRideForLoad(data, s);
    if (trackProblem) return trackProblem;
  }
  for (const r of s.rides) {
    if (r.kind === 'track' && !Object.prototype.hasOwnProperty.call(trackRides, String(r.id))) return `track ride ${r.id} has no track data`;
  }

  // Staff.
  for (const m of s.staff.members) {
    if (m.targetRideId >= 0 && !rides.has(m.targetRideId)) return `staff ${m.id} targets a missing ride`;
  }
  for (const id of s.staff.pendingBreakdowns) {
    if (!rides.has(id)) return 'a pending breakdown points to a missing ride';
  }
  return null;
}
