/** Owner: W4-E. Performance overlay strings (Phase 6 §4.6, §7). Keys start with `perf.`. Master R4: no final period. */
export const perfStrings: Record<string, string> = {
  'perf.overlay': 'Performance',
  'perf.fps': '{fps} fps',
  'perf.frame': 'Frame {p50} ms (p95 {p95} ms)',
  'perf.tick': 'Tick {p50} ms (p95 {p95} ms)',
  'perf.draws': 'Draw calls {n}',
  'perf.sprites': 'Sprite cache {mb} MB',
  'perf.entities': 'Guests {guests} · Rides {rides} · Stalls {stalls} · Staff {staff}',
};
