import { TURNSTILE_TEST_KEYS } from '@freetier-loop/shared';
import { z } from 'zod';

const commaSeparatedList = z
  .string()
  .default('')
  .transform((val) =>
    val
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0),
  );

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  BETTER_AUTH_SECRET: z
    .string()
    .min(32)
    .default('dev-only-better-auth-secret-please-change-in-prod-32b'),
  BETTER_AUTH_URL: z.string().url().default('http://localhost:8787'),
  ADMIN_EMAILS: commaSeparatedList,
  TURNSTILE_SECRET_KEY: z.string().min(1).default(TURNSTILE_TEST_KEYS.ALWAYS_PASS_SECRET_KEY),
  ENCRYPTION_KEY: z.string().min(32).default('MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY='),
  ENCRYPTION_KEY_PREVIOUS: z.string().min(32).optional(),
  REQUIRE_2FA: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  TRUSTED_ORIGINS: commaSeparatedList,
  WEB_ORIGIN: z.string().url().optional(),
  SELF_PROTECTED_HOSTS: commaSeparatedList,
});

export type AppConfig = Readonly<z.infer<typeof envSchema>>;

export const getConfig = (rawEnv: Record<string, unknown> = {}): AppConfig => {
  const parsed = envSchema.parse(rawEnv);
  return Object.freeze(parsed);
};
