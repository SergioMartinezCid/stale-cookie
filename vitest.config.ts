import { defineConfig } from 'vitest/config';

// Unit tests only — the integration suite (real headless Firefox) runs
// separately via vitest.integration.config.ts (`npm run test:integration`).
export default defineConfig({
  test: {
    include: ['tests/*.test.ts'],
  },
});
