import { defineConfig } from 'vitest/config';

// Store-listing screenshot generator, not a test suite: drives the built
// extension in headless Firefox with seeded demo data and saves raw PNGs
// (popup element shots + 1280×800 options viewports) to .screenshots-raw/
// for compositing into the final store images. Run via `npm run screenshots`.
export default defineConfig({
  test: {
    include: ['tests/screenshots/**/*.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 180_000,
    fileParallelism: false,
  },
});
