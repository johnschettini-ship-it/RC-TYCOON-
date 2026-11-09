/**
 * Owner: W1-H. Where Security Guards and performing Performers stand, cached once per tick
 * (derived data in a WeakMap). Guest decision hooks read it, so each check costs O(staff of that type).
 */
import type { Costume } from '../../data/catalog/types';
import type { World } from '../types';

interface Presence {
  tick: number;
  memberCount: number;
  security: number[];
  performers: { tile: number; costume: Costume | null }[];
}

const cache = new WeakMap<World, Presence>();

function presence(world: World): Presence {
  const members = world.state.staff.members;
  const cur = cache.get(world);
  if (cur && cur.tick === world.state.tick && cur.memberCount === members.length) return cur;
  const p: Presence = { tick: world.state.tick, memberCount: members.length, security: [], performers: [] };
  for (const m of members) {
    if (m.type === 'security') p.security.push(m.tile);
    else if (m.type === 'performer' && m.state === 'performing') p.performers.push({ tile: m.tile, costume: m.costume });
  }
  cache.set(world, p);
  return p;
}

export function chebyshev(width: number, a: number, b: number): number {
  return Math.max(Math.abs((a % width) - (b % width)), Math.abs(Math.floor(a / width) - Math.floor(b / width)));
}

export function securityWithin(world: World, tile: number, r: number): boolean {
  const w = world.state.map.width;
  for (const t of presence(world).security) if (chebyshev(w, t, tile) <= r) return true;
  return false;
}

export function performersWithin(world: World, tile: number, r: number): { tile: number; costume: Costume | null }[] {
  const w = world.state.map.width;
  return presence(world).performers.filter((p) => chebyshev(w, p.tile, tile) <= r);
}
