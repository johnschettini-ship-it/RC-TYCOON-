import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/sim/research/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/sim/research/api')>()),
  isUnlocked: (_world: unknown, itemId: string) => itemId !== 'flip_arm' && itemId !== 'pizza_slice',
}));

import { executeCommand } from '../../../src/sim/commands';
import { makeTestWorld, stateHash } from '../../helpers/world';

describe('research lock (Phase 3 §4.6)', () => {
  it('blocks rides and stalls that are not unlocked', () => {
    const w = makeTestWorld();
    const before = stateHash(w);
    expect(executeCommand(w, { type: 'placeRide', defId: 'flip_arm', x: 20, y: 20, rotation: 0 })).toEqual({ ok: false, reason: 'Not unlocked' });
    expect(executeCommand(w, { type: 'placeStall', defId: 'pizza_slice', x: 10, y: 10, rotation: 0 })).toEqual({ ok: false, reason: 'Not unlocked' });
    expect(stateHash(w)).toBe(before);
    expect(executeCommand(w, { type: 'placeRide', defId: 'carousel', x: 20, y: 20, rotation: 0 }).ok).toBe(true);
  });
});
