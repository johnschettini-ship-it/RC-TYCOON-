/** Path clarity (spec 2026-11-18 §5): the one-time tip on how guests reach a ride. */
import { describe, expect, it } from 'vitest';
import { CHAIN_TIP_KEY, armsChainTip, createChainTipModel, type ChainTipInput } from '../../../src/ui/paths/chainTip';
import { en } from '../../../src/data/strings/en';

function memStore(seen = false): { seen: boolean; get(): boolean; set(): void } {
  const s = { seen, get: () => s.seen, set: () => void (s.seen = true) };
  return s;
}
const on: ChainTipInput = { pathToolOn: true, tutorial: false, tipsOn: true };

describe('chain tip', () => {
  it('the spec text, no final period, its own storage key', () => {
    expect(en['paths.tipChain']).toBe('Guests walk: park entrance → footpath → queue → ride. Build a queue from the glowing entrance, then a footpath to its end');
    expect(CHAIN_TIP_KEY).toBe('tc.tip.pathChain');
  });

  it('armed by a placed ride or a track ride entrance, not by other commands or failures', () => {
    expect(armsChainTip({ type: 'placeRide', defId: 'carousel', x: 1, y: 1, rotation: 0 }, { ok: true })).toBe(true);
    expect(armsChainTip({ type: 'placeRide', defId: 'carousel', x: 1, y: 1, rotation: 0 }, { ok: false })).toBe(false);
    expect(armsChainTip({ type: 'placeTrackGate', rideId: 1, kind: 'entrance', x: 1, y: 1 }, { ok: true })).toBe(true);
    expect(armsChainTip({ type: 'placeTrackGate', rideId: 1, kind: 'exit', x: 1, y: 1 }, { ok: true })).toBe(false);
    expect(armsChainTip({ type: 'setParkOpen', open: true }, { ok: true })).toBe(false);
  });

  it('not shown before a ride is placed; shown once a ride is placed and a path tool is on; marked seen when it shows', () => {
    const store = memStore();
    const m = createChainTipModel(store);
    expect(m.step(on)).toBe(false);
    m.arm();
    expect(m.step({ ...on, pathToolOn: false })).toBe(false);
    expect(store.seen).toBe(false);
    expect(m.step(on)).toBe(true);
    expect(store.seen).toBe(true);
    expect(m.step(on)).toBe(true);
  });

  it('closes on Close, or when the path tool closes, and never comes back', () => {
    const a = createChainTipModel(memStore());
    a.arm();
    expect(a.step(on)).toBe(true);
    a.close();
    expect(a.step(on)).toBe(false);
    const b = createChainTipModel(memStore());
    b.arm();
    expect(b.step(on)).toBe(true);
    expect(b.step({ ...on, pathToolOn: false })).toBe(false);
    b.arm();
    expect(b.step(on)).toBe(false);
  });

  it('already seen (another park, a reload): never shows', () => {
    const m = createChainTipModel(memStore(true));
    m.arm();
    expect(m.step(on)).toBe(false);
  });

  it('not in the tutorial, not with tips off (it stays armed for later)', () => {
    const store = memStore();
    const m = createChainTipModel(store);
    m.arm();
    expect(m.step({ ...on, tutorial: true })).toBe(false);
    expect(m.step({ ...on, tipsOn: false })).toBe(false);
    expect(store.seen).toBe(false);
  });
});
