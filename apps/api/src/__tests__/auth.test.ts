import {
  API_PREFIX,
  API_ROUTES,
  AUTH_PREFIX,
  ERROR_CODE,
  HEADER,
  HTTP_STATUS,
} from '@freetier-loop/shared';
import { describe, expect, it } from 'vitest';
import { buildSeedAdminSql } from '../../../../packages/db/scripts/seed-admin';
import { createApp } from '../app';
import { createDefaultDeps } from '../platform/deps';
import { createInMemoryDatabase } from '../platform/sqlite-d1';

const createTestHarness = async (opts?: { failCaptcha?: boolean }) => {
  const { db } = await createInMemoryDatabase();
  const mockFetch = (async () =>
    new Response(JSON.stringify({ success: !opts?.failCaptcha }), {
      status: 200,
    })) as typeof fetch;

  const deps = createDefaultDeps(
    {
      ADMIN_EMAILS: 'admin@example.com',
    },
    {
      db,
      fetchFn: mockFetch,
    },
  );
  await deps.authService.seedAdmin({
    email: 'admin@example.com',
    password: 'CorrectHorseBatteryStaple!1',
  });
  const app = createApp(deps);
  return { app, deps };
};

describe('M1 Auth & Security (T-031..T-036)', () => {
  it('blocks public sign-up and allows idempotent admin seeding + login + session lookup + sign-out (T-031, T-032, T-036)', async () => {
    const { app, deps } = await createTestHarness();

    // Idempotent seed second call
    const firstSeed = await deps.authService.seedAdmin({
      email: 'admin@example.com',
      password: 'CorrectHorseBatteryStaple!1',
    });
    const secondSeed = await deps.authService.seedAdmin({
      email: 'admin@example.com',
      password: 'CorrectHorseBatteryStaple!1',
    });
    expect(secondSeed.id).toBe(firstSeed.id);

    // SQL helper test
    const sqlOut = buildSeedAdminSql({
      email: 'admin@example.com',
      password: 'CorrectHorseBatteryStaple!1',
    });
    expect(sqlOut.sqlStatements[0]).toContain('INSERT INTO user');
    expect(sqlOut.sqlStatements[0]).toContain('ON CONFLICT(email) DO UPDATE');

    // Public sign-up blocked
    const signUpRes = await app.request(`${AUTH_PREFIX}/sign-up/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'hacker@example.com',
        password: 'Password123!',
      }),
    });
    expect(signUpRes.status).toBe(HTTP_STATUS.FORBIDDEN);
    const signUpBody = (await signUpRes.json()) as { error: { code: string } };
    expect(signUpBody.error.code).toBe(ERROR_CODE.AUTH_NOT_ALLOWED);

    // Protected route without cookie -> 401
    const unauthRes = await app.request(`${API_PREFIX}${API_ROUTES.PROVIDER_ACCOUNTS}`);
    expect(unauthRes.status).toBe(HTTP_STATUS.UNAUTHORIZED);

    // Valid sign-in
    const signInRes = await app.request(`${AUTH_PREFIX}/sign-in/email`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [HEADER.CAPTCHA]: 'pass-token',
        'x-forwarded-for': '10.0.0.1',
      },
      body: JSON.stringify({
        email: 'admin@example.com',
        password: 'CorrectHorseBatteryStaple!1',
      }),
    });
    expect(signInRes.status).toBe(HTTP_STATUS.OK);
    const setCookie = signInRes.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('better-auth.session_token=');
    const cookieHeader = setCookie.split(';')[0] ?? '';

    // Protected route with session cookie -> 200
    const authedRes = await app.request(`${API_PREFIX}${API_ROUTES.PROVIDER_ACCOUNTS}`, {
      headers: { cookie: cookieHeader },
    });
    expect(authedRes.status).toBe(HTTP_STATUS.OK);

    // Audit log recorded login
    const logs = await deps.auditService.list({ limit: 10 });
    expect(logs.items.some((l) => l.action === 'auth.sign_in.succeeded')).toBe(true);
  });

  it('rejects missing or invalid Turnstile token with 400 AUTH_CAPTCHA_FAILED (T-035)', async () => {
    const { app } = await createTestHarness({
      failCaptcha: true,
    });

    const missingHeaderRes = await app.request(`${AUTH_PREFIX}/sign-in/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@example.com',
        password: 'CorrectHorseBatteryStaple!1',
      }),
    });
    expect(missingHeaderRes.status).toBe(HTTP_STATUS.BAD_REQUEST);
    const missingBody = (await missingHeaderRes.json()) as { error: { code: string } };
    expect(missingBody.error.code).toBe(ERROR_CODE.AUTH_CAPTCHA_FAILED);

    const failedCaptchaRes = await app.request(`${AUTH_PREFIX}/sign-in/email`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [HEADER.CAPTCHA]: 'bad-captcha-token',
      },
      body: JSON.stringify({
        email: 'admin@example.com',
        password: 'CorrectHorseBatteryStaple!1',
      }),
    });
    expect(failedCaptchaRes.status).toBe(HTTP_STATUS.BAD_REQUEST);
  });

  it('rejects non-allowlisted emails with 403 AUTH_NOT_ALLOWED and locks after 5 failed attempts with 423 AUTH_LOCKED (T-033)', async () => {
    const { app } = await createTestHarness();

    const outsiderRes = await app.request(`${AUTH_PREFIX}/sign-in/email`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [HEADER.CAPTCHA]: 'pass-token',
        'x-forwarded-for': '10.0.0.2',
      },
      body: JSON.stringify({
        email: 'intruder@example.com',
        password: 'SomePassword123!',
      }),
    });
    expect(outsiderRes.status).toBe(HTTP_STATUS.FORBIDDEN);
    const outsiderBody = (await outsiderRes.json()) as { error: { code: string } };
    expect(outsiderBody.error.code).toBe(ERROR_CODE.AUTH_NOT_ALLOWED);

    // 5 failed attempts from distinct IPs to test account lockout specifically
    for (let i = 1; i <= 4; i++) {
      const failRes = await app.request(`${AUTH_PREFIX}/sign-in/email`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          [HEADER.CAPTCHA]: 'pass-token',
          'x-forwarded-for': `10.0.1.${i}`,
        },
        body: JSON.stringify({
          email: 'admin@example.com',
          password: 'WrongPassword!1234',
        }),
      });
      expect(failRes.status).toBe(HTTP_STATUS.UNAUTHORIZED);
    }

    const fifthRes = await app.request(`${AUTH_PREFIX}/sign-in/email`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [HEADER.CAPTCHA]: 'pass-token',
        'x-forwarded-for': '10.0.1.5',
      },
      body: JSON.stringify({
        email: 'admin@example.com',
        password: 'WrongPassword!1234',
      }),
    });
    expect(fifthRes.status).toBe(HTTP_STATUS.LOCKED);
    const lockedBody = (await fifthRes.json()) as { error: { code: string } };
    expect(lockedBody.error.code).toBe(ERROR_CODE.AUTH_LOCKED);
  });

  it('enforces rate limit of 5 requests per 60s per IP on /sign-in/email (T-034)', async () => {
    const { app } = await createTestHarness();

    for (let i = 1; i <= 5; i++) {
      const res = await app.request(`${AUTH_PREFIX}/sign-in/email`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          [HEADER.CAPTCHA]: 'pass-token',
          'x-forwarded-for': '192.168.1.99',
        },
        body: JSON.stringify({
          email: `nonallow_${i}@example.com`,
          password: 'Password123456!',
        }),
      });
      expect(res.status).toBe(HTTP_STATUS.FORBIDDEN);
    }

    const sixthRes = await app.request(`${AUTH_PREFIX}/sign-in/email`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [HEADER.CAPTCHA]: 'pass-token',
        'x-forwarded-for': '192.168.1.99',
      },
      body: JSON.stringify({
        email: 'admin@example.com',
        password: 'CorrectHorseBatteryStaple!1',
      }),
    });
    expect(sixthRes.status).toBe(HTTP_STATUS.TOO_MANY_REQUESTS);
    const rateBody = (await sixthRes.json()) as { error: { code: string } };
    expect(rateBody.error.code).toBe(ERROR_CODE.AUTH_RATE_LIMITED);
  });
});
