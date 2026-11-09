/** Panel text helpers: warnings, guest target and thoughts, temperament. Owner: W1-B. Pure. */
import { temperamentGroup } from '../data/catalog';
import { text } from '../data/strings/en';
import type { Guest } from '../sim/guests/types';
import { Content } from '../sim/map';
import type { Ride } from '../sim/rides/types';
import type { Stall } from '../sim/stalls/types';
import type { World } from '../sim/types';

/** Ride warnings (Phase 1 §4.1). The panel keeps showing them until fixed. */
export function rideWarnings(world: World, ride: Ride): string[] {
  const c = world.state.map.content;
  const out: string[] = [];
  if (ride.entrance && c[ride.entrance.outside] !== Content.Queue) out.push(text('ui.ride.entranceQueue'));
  if (ride.exit && c[ride.exit.outside] !== Content.Footpath) out.push(text('ui.ride.exitPath'));
  return out;
}

export function stallWarnings(world: World, stall: Stall): string[] {
  return world.state.map.content[stall.serviceTile] === Content.Footpath ? [] : [text('ui.stall.facePath')];
}

export function guestTargetLabel(world: World, guest: Guest): string {
  const t = guest.target;
  if (t === 'exit') return text('ui.guest.targetExit');
  if (t) {
    const [kind, idText] = t.split(':');
    const id = Number(idText);
    const found = kind === 'ride' ? world.state.rides.find((r) => r.id === id) : world.state.stalls.find((s) => s.id === id);
    if (found) return found.name;
  }
  return text('ui.guest.targetNone');
}

/** The newest `n` thoughts, newest first, as text (master R5). */
export function guestThoughtLines(guest: Guest, n = 5): string[] {
  return guest.thoughts
    .slice(-n)
    .reverse()
    .map((th) => text(th.id, th.params));
}

export function temperamentLabel(t: number): string {
  return text('ui.guest.temperamentValue', { value: t, group: text(`ui.tag.${temperamentGroup(t)}`) });
}
