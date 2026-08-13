import { defineConfig } from 'vitest/config';

// Integration tests: drive the built extension inside a real headless
// browser (Firefox for dist/, Chrome for Testing for dist-chrome/) with a
// throwaway profile per session — never a real one. Run with
// `npm run test:integration`, which builds first. One browser per file, so
// files run serially.
export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 180_000,
    fileParallelism: false,
  },
});
