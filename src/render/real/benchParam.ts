/**
 * The stage 1 bench's runs by `?bench=` (VITE_ART=real build only): `1` the four parks and the scale park, `quick`
 * the same with every step a tenth as long (the e2e smoke), `scale` the scale park alone; anything else, no bench.
 * `main.ts` mounts the bench and `boot.ts` adds the scale park's alias sets for exactly these values.
 */
export type BenchMode = 'full' | 'quick' | 'scale';

export function benchMode(search: string): BenchMode | null {
  const v = new URLSearchParams(search).get('bench');
  return v === '1' ? 'full' : v === 'quick' || v === 'scale' ? v : null;
}
