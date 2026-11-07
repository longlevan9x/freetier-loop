import { z } from 'zod';

export const webEnvSchema = z.object({
  VITE_API_BASE_URL: z.string().default('/'),
  VITE_TURNSTILE_SITE_KEY: z.string().default(''),
});

export type WebEnv = Readonly<z.infer<typeof webEnvSchema>>;

export const parseWebEnv = (raw: Record<string, unknown> = {}): WebEnv =>
  Object.freeze(webEnvSchema.parse(raw));

const rawImportMetaEnv =
  typeof import.meta !== 'undefined' && 'env' in import.meta
    ? (import.meta as unknown as { env: Record<string, unknown> }).env
    : {};

export const webEnv = parseWebEnv(rawImportMetaEnv);
