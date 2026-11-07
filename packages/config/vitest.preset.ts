import { defineConfig } from 'vitest/config';

export const vitestPreset = defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    passWithNoTests: true,
    restoreMocks: true,
    clearMocks: true,
  },
});
