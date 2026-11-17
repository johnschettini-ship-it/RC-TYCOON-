/**
 * Title-to-play bridge, part 2 (VITE_ART=real build): the welcome card's rules without a browser. Which arrivals show
 * it (`arrivalPlan`, also in titlePush.test.ts), the game paused while it is open and its speed given back when it
 * closes (`welcomeSession`), and its strings: realistic-only, so the website's string table does not change. The card's
 * DOM, focus, Escape, the tip waiting, its fit and axe are checked in `tests/e2e/bridge-real.spec.ts`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { arrivalPlan } from '../../../src/ui/bridge/arrival';
import { welcomeSession } from '../../../src/ui/bridge/welcomeModel';
import { realBridgeStrings } from '../../../src/data/strings/realBridge';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('when the welcome card shows', () => {
  it('on New game only: a new free-play or sandbox park, not Continue, Load, a scenario or the tutorial', () => {
    expect(arrivalPlan({ reduced: false, newPark: true, kind: 'freePlay' }).welcome).toBe(true);
    expect(arrivalPlan({ reduced: true, newPark: true, kind: 'sandbox' }).welcome).toBe(true);
    for (const kind of ['freePlay', 'sandbox', 'scenario', 'tutorial'] as const) expect(arrivalPlan({ reduced: false, newPark: false, kind }).welcome).toBe(false);
    expect(arrivalPlan({ reduced: false, newPark: true, kind: 'scenario' }).welcome).toBe(false);
    expect(arrivalPlan({ reduced: false, newPark: true, kind: 'tutorial' }).welcome).toBe(false);
  });
});

describe('welcomeSession (the game paused while the card is open)', () => {
  it('pauses on open and gives the speed back on close, once', () => {
    let speed: 0 | 1 | 2 | 4 = 2;
    const s = welcomeSession({ speed: () => speed, setSpeed: (v) => (speed = v) });
    s.open();
    expect(speed).toBe(0);
    expect(s.isOpen()).toBe(true);
    s.close();
    expect(speed).toBe(2);
    expect(s.isOpen()).toBe(false);
    speed = 4;
    s.close();
    expect(speed).toBe(4);
  });
  it('a speed the player chose while it was open (none can be: the card is modal) is not overwritten by a pause', () => {
    let speed: 0 | 1 | 2 | 4 = 0;
    const s = welcomeSession({ speed: () => speed, setSpeed: (v) => (speed = v) });
    s.open();
    s.close();
    // Paused before: it stays paused, except a new park, which the title starts at 1x before the card opens.
    expect(speed).toBe(0);
  });
});

describe('the welcome strings', () => {
  it('are the spec text, no final period', () => {
    expect(realBridgeStrings['ui.welcome.to']).toBe('Welcome to');
    expect(realBridgeStrings['ui.welcome.body']).toBe('Your park is an empty field. Build the park on the poster!');
    expect(realBridgeStrings['ui.welcome.go']).toBe("Let's go");
    for (const v of Object.values(realBridgeStrings)) expect(v.endsWith('.')).toBe(false);
    for (const k of Object.keys(realBridgeStrings)) expect(k.startsWith('ui.')).toBe(true);
  });
  it('are in the realistic build’s English table only; the website table does not have them', async () => {
    vi.stubEnv('VITE_ART', 'real');
    vi.resetModules();
    const real = await import('../../../src/data/strings/en');
    expect(real.text('ui.welcome.go')).toBe("Let's go");
    vi.unstubAllEnvs();
    vi.stubEnv('VITE_ART', '');
    vi.resetModules();
    const web = await import('../../../src/data/strings/en');
    for (const k of Object.keys(realBridgeStrings)) expect(Object.hasOwn(web.en, k), k).toBe(false);
  });
});
