import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Phase 8b stage 0b test (never merged): the Pixel branches are live in Node tests (`__TC_APP__`, `vite.config.ts`).
  define: { __TC_APP__: 'true' },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    benchmark: { include: ['tests/bench/**/*.bench.ts'] },
    environment: 'node',
  },
});
