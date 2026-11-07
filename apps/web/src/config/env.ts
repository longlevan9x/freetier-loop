import { z } from 'zod';

export const webEnvSchema = z.object({
  VITE_API_BASE_URL: z.string().default('/'),
  VITE_TURNSTILE_SITE_KEY: z.string().default(''),
});

export type WebEnv = Readonly<z.infer<typeof webEnvSchema>>;

export const parseWebEnv = (raw: Record<string, unknown> = {}): WebEnv =>
  Object.freeze(webEnvSchema.parse(raw));

// Access import.meta.env statically so Vite replaces them at build time
export const webEnv: WebEnv = parseWebEnv({
  VITE_API_BASE_URL: import.meta.env.VITE_API_BASE_URL || '/',
  VITE_TURNSTILE_SITE_KEY: import.meta.env.VITE_TURNSTILE_SITE_KEY || '1x00000000000000000000AA',
});
