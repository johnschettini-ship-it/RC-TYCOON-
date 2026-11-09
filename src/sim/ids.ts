import type { GameState } from './types';
import type { EntityId } from './units';

export function allocId(state: GameState): EntityId {
  const id = state.nextId;
  state.nextId = id + 1;
  return id;
}
