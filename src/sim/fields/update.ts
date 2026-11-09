/**
 * Calm and Buzz refresh at every hour start (master R13, after the rating). Owner: W3-E.
 * Contract: bring the derived fields up to date with sources that change without a command (ride status, wilting,
 * litter penalties are read-time). Guest effects run through `fieldHooks` (`./hooks.ts`). Stub: no-op.
 */
import type { World } from '../types';

export function hourlyFields(_world: World): void {}
