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
import { generateTotpCode } from '../platform/totp';

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

  it('supports adaptive 2FA setup, challenge on new IP/device, and active session management', async () => {
    const { app } = await createTestHarness();

    // 1. Initial sign in from a known IP and UA
    const signIn1 = await app.request(`${AUTH_PREFIX}/sign-in/email`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [HEADER.CAPTCHA]: 'pass-token',
        'x-forwarded-for': '10.0.0.1',
        'cf-ipcountry': 'VN',
        'user-agent': 'Chrome-Device-1',
      },
      body: JSON.stringify({
        email: 'admin@example.com',
        password: 'CorrectHorseBatteryStaple!1',
      }),
    });
    expect(signIn1.status).toBe(HTTP_STATUS.OK);
    const cookie1 = (signIn1.headers.get('set-cookie') ?? '').split(';')[0] ?? '';

    // 2. Setup 2FA
    const setupRes = await app.request(`${AUTH_PREFIX}/2fa/setup`, {
      method: 'POST',
      headers: { cookie: cookie1 },
    });
    expect(setupRes.status).toBe(HTTP_STATUS.OK);
    const setupData = ((await setupRes.json()) as { data: { secret: string; otpauthUri: string } })
      .data;
    expect(setupData.secret).toBeDefined();
    expect(setupData.otpauthUri).toContain('otpauth://totp/');

    // Generate valid TOTP code
    const validCode = await generateTotpCode(setupData.secret);

    // 3. Enable 2FA with valid code (adaptive mode: always = false)
    const enableRes = await app.request(`${AUTH_PREFIX}/2fa/enable`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: cookie1 },
      body: JSON.stringify({ code: validCode, always: false }),
    });
    expect(enableRes.status).toBe(HTTP_STATUS.OK);

    // Check 2FA status
    const statusRes = await app.request(`${AUTH_PREFIX}/2fa/status`, {
      headers: { cookie: cookie1 },
    });
    const statusData = ((await statusRes.json()) as { data: { enabled: boolean; always: boolean } })
      .data;
    expect(statusData.enabled).toBe(true);
    expect(statusData.always).toBe(false);

    // 4. Sign in again from the SAME IP and UA -> adaptive mode allows sign-in without 2FA challenge
    const sameDeviceSignIn = await app.request(`${AUTH_PREFIX}/sign-in/email`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [HEADER.CAPTCHA]: 'pass-token',
        'x-forwarded-for': '10.0.0.1',
        'cf-ipcountry': 'VN',
        'user-agent': 'Chrome-Device-1',
      },
      body: JSON.stringify({
        email: 'admin@example.com',
        password: 'CorrectHorseBatteryStaple!1',
      }),
    });
    expect(sameDeviceSignIn.status).toBe(HTTP_STATUS.OK);
    const sameDeviceBody = (await sameDeviceSignIn.json()) as {
      data: { requiresTwoFactor: boolean };
    };
    expect(sameDeviceBody.data.requiresTwoFactor).toBe(false);

    // 5. Sign in from a NEW IP (e.g. 198.51.100.99 from JP) -> triggers 2FA challenge
    const newIpSignIn = await app.request(`${AUTH_PREFIX}/sign-in/email`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [HEADER.CAPTCHA]: 'pass-token',
        'x-forwarded-for': '198.51.100.99',
        'cf-ipcountry': 'JP',
        'user-agent': 'Chrome-Device-1',
      },
      body: JSON.stringify({
        email: 'admin@example.com',
        password: 'CorrectHorseBatteryStaple!1',
      }),
    });
    expect(newIpSignIn.status).toBe(HTTP_STATUS.OK);
    const newIpBody = (await newIpSignIn.json()) as {
      data: { requiresTwoFactor: boolean; reason: string; ip: string; country: string };
    };
    expect(newIpBody.data.requiresTwoFactor).toBe(true);
    expect(newIpBody.data.reason).toBe('new_ip');
    expect(newIpBody.data.ip).toBe('198.51.100.99');
    expect(newIpBody.data.country).toBe('JP');

    // 6. Sign in with invalid 2FA code -> 401
    const invalidTotpRes = await app.request(`${AUTH_PREFIX}/sign-in/email`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '198.51.100.99',
        'cf-ipcountry': 'JP',
        'user-agent': 'Chrome-Device-1',
      },
      body: JSON.stringify({
        email: 'admin@example.com',
        password: 'CorrectHorseBatteryStaple!1',
        twoFactorCode: '000000',
      }),
    });
    expect(invalidTotpRes.status).toBe(HTTP_STATUS.UNAUTHORIZED);

    // 7. Sign in with valid 2FA code -> succeeds and issues session cookie
    const validCode2 = await generateTotpCode(setupData.secret);
    const validTotpRes = await app.request(`${AUTH_PREFIX}/sign-in/email`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '198.51.100.99',
        'cf-ipcountry': 'JP',
        'user-agent': 'Chrome-Device-1',
      },
      body: JSON.stringify({
        email: 'admin@example.com',
        password: 'CorrectHorseBatteryStaple!1',
        twoFactorCode: validCode2,
      }),
    });
    expect(validTotpRes.status).toBe(HTTP_STATUS.OK);
    const validTotpCookie = (validTotpRes.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
    expect(validTotpCookie).toContain('better-auth.session_token=');

    // 8. Active sessions management: check sessions list
    const sessionsRes = await app.request(`${AUTH_PREFIX}/sessions`, {
      headers: { cookie: validTotpCookie },
    });
    expect(sessionsRes.status).toBe(HTTP_STATUS.OK);
    const sessionsList = (
      (await sessionsRes.json()) as {
        data: Array<{ id: string; ipAddress: string; country: string; isCurrent: boolean }>;
      }
    ).data;
    expect(sessionsList.length).toBeGreaterThanOrEqual(2);
    const currentSession = sessionsList.find((s) => s.isCurrent);
    expect(currentSession?.ipAddress).toBe('198.51.100.99');
    expect(currentSession?.country).toBe('JP');

    // 9. Revoke all other sessions
    const revokeOthersRes = await app.request(`${AUTH_PREFIX}/sessions/revoke-others`, {
      method: 'POST',
      headers: { cookie: validTotpCookie },
    });
    expect(revokeOthersRes.status).toBe(HTTP_STATUS.OK);

    // Check sessions list again: only current session remains
    const sessionsRes2 = await app.request(`${AUTH_PREFIX}/sessions`, {
      headers: { cookie: validTotpCookie },
    });
    const sessionsList2 = (
      (await sessionsRes2.json()) as { data: Array<{ id: string; isCurrent: boolean }> }
    ).data;
    expect(sessionsList2.length).toBe(1);
    expect(sessionsList2[0]?.isCurrent).toBe(true);

    // 10. Sign out completely (deleting active session from db)
    const signOutRes = await app.request(`${AUTH_PREFIX}/sign-out`, {
      method: 'POST',
      headers: { cookie: validTotpCookie },
    });
    expect(signOutRes.status).toBe(HTTP_STATUS.OK);

    // 11. Sign in again from the SAME IP (198.51.100.99) and SAME Device (Chrome-Device-1)
    // Even though session table is now empty, audit_logs remembers this trusted device/IP!
    const reSignInSameDevice = await app.request(`${AUTH_PREFIX}/sign-in/email`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [HEADER.CAPTCHA]: 'pass-token',
        'x-forwarded-for': '198.51.100.99',
        'cf-ipcountry': 'JP',
        'user-agent': 'Chrome-Device-1',
      },
      body: JSON.stringify({
        email: 'admin@example.com',
        password: 'CorrectHorseBatteryStaple!1',
      }),
    });
    expect(reSignInSameDevice.status).toBe(HTTP_STATUS.OK);
    const reSignInBody = (await reSignInSameDevice.json()) as {
      data: { requiresTwoFactor: boolean };
    };
    expect(reSignInBody.data.requiresTwoFactor).toBe(false);

    // 12. Sign in from a brand new IP (203.0.113.88) with known device -> triggers 2FA for new_ip
    const unknownIpSignIn = await app.request(`${AUTH_PREFIX}/sign-in/email`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [HEADER.CAPTCHA]: 'pass-token',
        'x-forwarded-for': '203.0.113.88',
        'cf-ipcountry': 'SG',
        'user-agent': 'Chrome-Device-1',
      },
      body: JSON.stringify({
        email: 'admin@example.com',
        password: 'CorrectHorseBatteryStaple!1',
      }),
    });
    const unknownIpBody = (await unknownIpSignIn.json()) as {
      data: { requiresTwoFactor: boolean; reason: string };
    };
    expect(unknownIpBody.data.requiresTwoFactor).toBe(true);
    expect(unknownIpBody.data.reason).toBe('new_ip');

    // 13. Sign in from known IP (198.51.100.99) with unknown Device (Firefox-Device-99) -> triggers 2FA for new_device
    const unknownDeviceSignIn = await app.request(`${AUTH_PREFIX}/sign-in/email`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [HEADER.CAPTCHA]: 'pass-token',
        'x-forwarded-for': '198.51.100.99',
        'cf-ipcountry': 'JP',
        'user-agent': 'Firefox-Device-99',
      },
      body: JSON.stringify({
        email: 'admin@example.com',
        password: 'CorrectHorseBatteryStaple!1',
      }),
    });
    const unknownDeviceBody = (await unknownDeviceSignIn.json()) as {
      data: { requiresTwoFactor: boolean; reason: string };
    };
    expect(unknownDeviceBody.data.requiresTwoFactor).toBe(true);
    expect(unknownDeviceBody.data.reason).toBe('new_device');
  });
});
