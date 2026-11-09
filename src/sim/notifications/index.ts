/** Owner: W1-I. Message log (Phase 3 §4.14). */
import type { MessageCategory } from '../management/types';
import type { World } from '../types';
import type { EntityId } from '../units';

export function notify(
  _world: World,
  _category: MessageCategory,
  _textId: string,
  _opts: { params?: Record<string, string | number>; tile?: number; entityId?: EntityId } = {},
): void {}

export function pruneMessages(_world: World): void {}
