import { TURNSTILE_TEST_KEYS } from '@freetier-loop/shared';
import { z } from 'zod';

export const webEnvSchema = z.object({
  VITE_API_BASE_URL: z.string().default('/'),
  VITE_TURNSTILE_SITE_KEY: z.string().min(1).default(TURNSTILE_TEST_KEYS.ALWAYS_PASS_SITE_KEY),
});

export type WebEnv = Readonly<z.infer<typeof webEnvSchema>>;

export const parseWebEnv = (raw: Record<string, unknown> = {}): WebEnv =>
  Object.freeze(webEnvSchema.parse(raw));

const rawImportMetaEnv =
  typeof import.meta !== 'undefined' && 'env' in import.meta
    ? (import.meta as unknown as { env: Record<string, unknown> }).env
    : {};

export const webEnv = parseWebEnv(rawImportMetaEnv);
