/**
 * Land ownership rules shared by every placement check (Phase 4 §4.1, §4.5, §4.9). Owner: W3-G.
 * Real bodies (small, used by every Wave 3 card from day one).
 */
import { Owned, type MapState } from '../map';

export const OUTSIDE_THE_PARK = 'Outside the park';
export const ONLY_RIGHTS_HERE = 'You only have construction rights here';

/**
 * Ground-touching placement (terrain edits, ground paths, rides, stalls, scenery): null when the tile is owned
 * (state 1), else the reason. Construction rights (state 3) give the rights string; every other state "Outside the park".
 */
export function groundOwnershipBlock(map: MapState, i: number): string | null {
  const o = map.owned[i];
  if (o === Owned.Owned) return null;
  return o === Owned.RightsOwned ? ONLY_RIGHTS_HERE : OUTSIDE_THE_PARK;
}

/**
 * Objects above the ground (track, elevated paths, supports): owned land, or construction rights when the object's
 * lowest point is at least 3 m above the ground (`RIGHTS_MIN_CLEARANCE`). The caller passes whether that holds.
 */
export function aboveGroundOwnershipBlock(map: MapState, i: number, clearsRights: boolean): string | null {
  const o = map.owned[i];
  if (o === Owned.Owned) return null;
  if (o === Owned.RightsOwned) return clearsRights ? null : ONLY_RIGHTS_HERE;
  return OUTSIDE_THE_PARK;
}
