/** Phase 8b stage 0b test (never merged): the stage 0 integer hash, pure (runtime keys and the ground painter share it). */

/** Unsigned 32-bit hash of three integers (`h3`, `pixel3.py:80-82`, with `Math.imul` mixing). */
export function hash3(a: number, b: number, c: number): number {
  let n = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 2147483647)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return (n ^ (n >>> 16)) >>> 0;
}
