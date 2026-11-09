/**
 * Sandbox options that change running systems (Phase 5 §4.5). Owner: W3-H.
 * Unlimited money, guests arriving, all items unlocked, climate, and awards are read where they apply
 * (`api.ts`, awards); After Dark, breakdowns, and the weather are written into the state here.
 */
import type { World } from '../types';
import type { SandboxLiveOption, SandboxOptions } from './types';

export const SANDBOX_LIVE_OPTIONS: readonly SandboxLiveOption[] = ['afterDark', 'unlimitedMoney', 'guestsArrive', 'breakdowns', 'weather', 'awards'];

/** Write one option's effect: After Dark → `park.afterDark`; breakdowns → `modifiers.breakdownChance` 1 or 0; always sunny → sunny now and next. */
export function applySandboxOption(world: World, key: keyof SandboxOptions, options: SandboxOptions): void {
  const s = world.state;
  if (key === 'afterDark') s.park.afterDark = options.afterDark;
  else if (key === 'breakdowns') s.modifiers.breakdownChance = options.breakdowns ? 1 : 0;
  else if (key === 'weather' && options.weather === 'alwaysSunny') {
    s.management.weather.current = 'sunny';
    s.management.weather.next = 'sunny';
  }
}

/**
 * Change one live option of a sandbox and apply its effect at once (no-op for other park kinds). The one way to
 * change a live option: `setSandboxOption` uses it, and so does the park panel's After Dark switch (`setAfterDark`),
 * so `options.afterDark` and `park.afterDark` never disagree.
 */
export function setSandboxLiveOption<K extends SandboxLiveOption>(world: World, key: K, value: SandboxOptions[K]): void {
  const sc = world.state.scenario;
  if (sc.kind !== 'sandbox') return;
  sc.options = { ...sc.options, [key]: value };
  applySandboxOption(world, key, sc.options);
}

/** All option effects at sandbox start. */
export function applySandboxOptions(world: World, options: SandboxOptions): void {
  for (const key of ['afterDark', 'breakdowns', 'weather'] as const) applySandboxOption(world, key, options);
}
