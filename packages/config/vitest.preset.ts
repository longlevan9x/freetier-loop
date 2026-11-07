import { defineConfig } from 'vitest/config';

export const vitestPreset = defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    passWithNoTests: true,
    restoreMocks: true,
    clearMocks: true,
    env: {
      NODE_ENV: 'test',
      BETTER_AUTH_SECRET: 'test-only-better-auth-secret-32-chars-minimum',
      TURNSTILE_SECRET_KEY: 'test-only-turnstile-secret',
      ENCRYPTION_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    },
  },
});
