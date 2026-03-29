import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/__tests__/**/*.test.ts'],
    exclude: [
      ...configDefaults.exclude,
      '.claude/**',
      'dist/**',
      'python/**',
    ],
  },
});
