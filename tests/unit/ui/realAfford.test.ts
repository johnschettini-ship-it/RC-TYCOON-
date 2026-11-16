/**
 * Unaffordable ride and stall cards in the realistic build (realistic title and cards, Task 3): `markAfford` marks a
 * card the park cannot pay for with `data-afford="no"` and `aria-description` "Not enough cash", clears both once the
 * park can pay, skips cards with no tracked cost, and never disables the card (it stays pressable).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeTestWorld } from '../../helpers/world';

/** The few Element methods `markAfford` (via `setAttr`) uses, over a plain attribute map. */
class FakeCard {
  readonly attrs = new Map<string, string>();
  disabled = false;
  getAttribute(n: string): string | null {
    return this.attrs.get(n) ?? null;
  }
  setAttribute(n: string, v: string): void {
    this.attrs.set(n, v);
  }
  hasAttribute(n: string): boolean {
    return this.attrs.has(n);
  }
  removeAttribute(n: string): void {
    this.attrs.delete(n);
  }
}

function rootOf(cards: FakeCard[]): ParentNode {
  return {
    querySelectorAll: (sel: string) => {
      expect(sel).toBe('.content-card');
      return cards;
    },
  } as unknown as ParentNode;
}

/** The realistic build's strings (`realCardsStrings` is folded in only when VITE_ART is 'real'). */
async function load(): Promise<typeof import('../../../src/ui/decks/realAfford')> {
  vi.stubEnv('VITE_ART', 'real');
  vi.resetModules();
  return import('../../../src/ui/decks/realAfford');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('markAfford (realistic cards)', () => {
  it('marks an unaffordable card "Not enough cash", clears it once affordable; the card stays enabled', async () => {
    const { markAfford, trackCost } = await load();
    const world = makeTestWorld();
    world.state.park.cash = 1_000;
    const dear = new FakeCard();
    const cheap = new FakeCard();
    const untracked = new FakeCard();
    trackCost(dear as unknown as HTMLElement, 5_000);
    trackCost(cheap as unknown as HTMLElement, 500);
    const root = rootOf([dear, cheap, untracked]);

    markAfford(root, world);
    expect(dear.getAttribute('aria-description')).toBe('Not enough cash');
    expect(dear.getAttribute('data-afford')).toBe('no');
    expect(cheap.hasAttribute('aria-description')).toBe(false);
    expect(cheap.hasAttribute('data-afford')).toBe(false);
    expect(untracked.attrs.size).toBe(0);
    for (const c of [dear, cheap]) {
      expect(c.disabled).toBe(false);
      expect(c.hasAttribute('disabled')).toBe(false);
      expect(c.hasAttribute('aria-disabled')).toBe(false);
    }

    world.state.park.cash = 5_000;
    markAfford(root, world);
    expect(dear.hasAttribute('aria-description')).toBe(false);
    expect(dear.hasAttribute('data-afford')).toBe(false);
    expect(dear.disabled).toBe(false);
    expect(dear.hasAttribute('disabled')).toBe(false);
  });
});
