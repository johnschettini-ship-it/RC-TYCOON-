import type { SimEvent, World } from './types';

export function emit(world: World, ev: SimEvent): void {
  world.events.push(ev);
}

/** Client side: take all pending events. */
export function drainEvents(world: World): SimEvent[] {
  const evs = world.events;
  world.events = [];
  return evs;
}
