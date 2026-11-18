import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // The bake tools (tools/art3d) import `three`, which the bake bundles from its vendored build (bake.mjs): tests that
  // load a bake module (the track kit's frames) resolve it the same way.
  resolve: { alias: { three: fileURLToPath(new URL('./tools/art3d/vendor/three-0.160.0.module.min.js', import.meta.url)) } },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    benchmark: { include: ['tests/bench/**/*.bench.ts'] },
    environment: 'node',
  },
});
