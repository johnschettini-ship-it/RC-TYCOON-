import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    benchmark: { include: ['tests/bench/**/*.bench.ts'] },
    environment: 'node',
  },
});
