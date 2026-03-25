import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 30_000,
    hookTimeout: 15_000,
    include: ['src/__tests__/**/*.test.ts'],
  },
  define: {
    __SDK_VERSION__: '"1.0.0"',
  },
});
