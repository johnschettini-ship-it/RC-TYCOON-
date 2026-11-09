/** Which tab the next track ride panel opens on (the builder asks for the Test tab, §7.1 step 8). Owner: W2-A. */
export type TrackTab = 'overview' | 'track' | 'trains' | 'test';

let pending: { rideId: number; tab: TrackTab } | null = null;

export function requestTrackTab(rideId: number, tab: TrackTab): void {
  pending = { rideId, tab };
}

/** The requested tab for this ride (consumed), or null. */
export function takeTrackTab(rideId: number): TrackTab | null {
  if (!pending || pending.rideId !== rideId) return null;
  const t = pending.tab;
  pending = null;
  return t;
}
