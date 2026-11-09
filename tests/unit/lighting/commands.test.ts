/** Phase 4 §6 `setAfterDark { on }` and the §4.7 warning toast. Owner: W3-F. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { text } from '../../../src/data/strings/en';
import { executeCommand } from '../../../src/sim/commands';
import { afterDarkLocked } from '../../../src/sim/scenario/api';
import { PathItem, tileIndex } from '../../../src/sim/map';
import { makeTestWorld, placeFootpath, stateHash } from '../../helpers/world';

// W3-H owns `afterDarkLocked` (a stub until it merges): lock the switch here.
vi.mock('../../../src/sim/scenario/api', async (orig) => ({ ...(await orig<typeof import('../../../src/sim/scenario/api')>()), afterDarkLocked: vi.fn(() => null) }));

afterEach(() => {
  vi.mocked(afterDarkLocked).mockReset().mockReturnValue(null);
});

const WARN = 'Guests dislike dark paths. Build lamps';

describe('setAfterDark', () => {
  it('the warning text is the spec text', () => {
    expect(text('night.warnDarkPaths')).toBe(WARN);
  });

  it('turns After Dark off and on, free and with no ledger line', () => {
    const w = makeTestWorld();
    const cash = w.state.park.cash;
    const ledger = JSON.stringify(w.state.economy);
    expect(executeCommand(w, { type: 'setAfterDark', on: false })).toEqual({ ok: true, cost: 0, warnings: [] });
    expect(w.state.park.afterDark).toBe(false);
    expect(executeCommand(w, { type: 'setAfterDark', on: true })).toEqual({ ok: true, cost: 0, warnings: [] });
    expect(w.state.park.afterDark).toBe(true);
    expect(w.state.park.cash).toBe(cash);
    expect(JSON.stringify(w.state.economy)).toBe(ledger);
  });

  it('turning it on with litShare < 0.5 warns "Guests dislike dark paths. Build lamps"', () => {
    const w = makeTestWorld();
    w.state.park.afterDark = false;
    for (let x = 5; x < 10; x++) placeFootpath(w, x, 10); // 3 lit stub tiles of 8
    const r = executeCommand(w, { type: 'setAfterDark', on: true });
    expect(r).toEqual({ ok: true, cost: 0, warnings: [WARN] });
    expect(w.state.park.afterDark).toBe(true);
  });

  it('no warning at litShare ≥ 0.5, when turning it off, or when it is already on', () => {
    const w = makeTestWorld();
    w.state.park.afterDark = false;
    for (let x = 5; x < 8; x++) placeFootpath(w, x, 10); // 3 lit of 6 = 0.5
    expect(executeCommand(w, { type: 'setAfterDark', on: true })).toEqual({ ok: true, cost: 0, warnings: [] });
    placeFootpath(w, 9, 10);
    expect(executeCommand(w, { type: 'setAfterDark', on: true })).toEqual({ ok: true, cost: 0, warnings: [] });
    expect(executeCommand(w, { type: 'setAfterDark', on: false })).toEqual({ ok: true, cost: 0, warnings: [] });
  });

  it('a lamp placed after a first check is seen by the next one', () => {
    const w = makeTestWorld();
    w.state.park.afterDark = false;
    for (let x = 5; x < 10; x++) placeFootpath(w, x, 10);
    expect(executeCommand(w, { type: 'setAfterDark', on: true })).toMatchObject({ warnings: [WARN] });
    executeCommand(w, { type: 'setAfterDark', on: false });
    w.state.map.pathItem[tileIndex(w.state.map, 7, 10)] = PathItem.Lamp;
    expect(executeCommand(w, { type: 'setAfterDark', on: true })).toMatchObject({ warnings: [] });
  });

  it('fails with the scenario reason when the scenario forces or forbids After Dark, and changes nothing', () => {
    const w = makeTestWorld();
    vi.mocked(afterDarkLocked).mockReturnValue('After Dark is always on in this scenario');
    const before = stateHash(w);
    expect(executeCommand(w, { type: 'setAfterDark', on: false })).toEqual({ ok: false, reason: 'After Dark is always on in this scenario' });
    expect(stateHash(w)).toBe(before);
    expect(w.state.park.afterDark).toBe(true);
  });
});
