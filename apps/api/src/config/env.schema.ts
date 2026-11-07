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
  BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET must be set in env (>= 32 chars)'),
  BETTER_AUTH_URL: z.string().url().default('http://localhost:8787'),
  ADMIN_EMAILS: commaSeparatedList,
  TURNSTILE_SECRET_KEY: z.string().min(1, 'TURNSTILE_SECRET_KEY must be set in env'),
  ENCRYPTION_KEY: z.string().min(32, 'ENCRYPTION_KEY must be set in env (32-byte base64)'),
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
  const merged =
    typeof process !== 'undefined' && process.env ? { ...process.env, ...rawEnv } : rawEnv;
  const parsed = envSchema.parse(merged);
  return Object.freeze(parsed);
};
