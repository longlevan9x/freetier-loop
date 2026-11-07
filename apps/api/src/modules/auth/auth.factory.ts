import * as schema from '@freetier-loop/db';
import { AUTH, AUTH_RATE_LIMIT } from '@freetier-loop/shared';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { captcha } from 'better-auth/plugins';
import type { AppConfig } from '../../config/env.schema';
import type { AppDatabase } from '../../platform/db';
import type { PasswordHasher } from '../../platform/password-hasher';

export const createBetterAuthInstance = (
  config: AppConfig,
  db: AppDatabase,
  hasher: PasswordHasher,
) => {
  return betterAuth({
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      schema,
    }),
    baseURL: config.BETTER_AUTH_URL,
    secret: config.BETTER_AUTH_SECRET,
    trustedOrigins: config.TRUSTED_ORIGINS,
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: AUTH.MIN_PASSWORD_LENGTH,
      maxPasswordLength: AUTH.MAX_PASSWORD_LENGTH,
      password: {
        hash: (password) => hasher.hash(password),
        verify: (data) => hasher.verify(data),
      },
    },
    session: {
      expiresIn: AUTH.SESSION_TTL_SECONDS,
      updateAge: AUTH.SESSION_UPDATE_AGE_SECONDS,
      cookieCache: {
        enabled: true,
        maxAge: AUTH.COOKIE_CACHE_MAX_AGE_SECONDS,
      },
    },
    rateLimit: {
      enabled: true,
      window: AUTH_RATE_LIMIT.DEFAULT_WINDOW_SECONDS,
      max: AUTH_RATE_LIMIT.DEFAULT_MAX_REQUESTS,
      storage: 'database',
      modelName: 'rateLimit',
      customRules: {
        '/sign-in/email': {
          window: AUTH_RATE_LIMIT.SIGN_IN_WINDOW_SECONDS,
          max: AUTH_RATE_LIMIT.SIGN_IN_MAX_REQUESTS,
        },
      },
    },
    plugins: [
      captcha({
        provider: 'cloudflare-turnstile',
        secretKey: config.TURNSTILE_SECRET_KEY,
        endpoints: ['/sign-in/email'],
      }),
    ],
  });
};
