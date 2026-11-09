export * from './types';
export * from './flatRides';
export * from './trackRides';
export * from './stalls';
export * from './people';
export * from './scenery';

/** Temperament groups (master R6). */
export type TemperamentGroup = 'chill' | 'family' | 'thrill';
export function temperamentGroup(t: number): TemperamentGroup {
  if (t <= 35) return 'chill';
  if (t >= 65) return 'thrill';
  return 'family';
}
