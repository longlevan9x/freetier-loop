import { AUTH, AppError, ERROR_CODE, HEADER, HTTP_STATUS, ok } from '@freetier-loop/shared';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';
import type { AppEnv, SessionUser } from '../../types';
import { SESSION_COOKIE_NAME } from './auth.service';

const signInBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  twoFactorCode: z.string().optional(),
});

const enable2faSchema = z.object({
  code: z.string().min(6).max(6),
  always: z.boolean().optional(),
});

const disable2faSchema = z.object({
  password: z.string().min(1),
});

export const createAuthRoutes = () => {
  const app = new Hono<AppEnv>();

  const requireCurrentSession = async (c: {
    var: {
      deps: {
        authService: {
          getSessionByToken: (token: string | undefined) => Promise<SessionUser | null>;
        };
      };
    };
  }): Promise<{ user: SessionUser; token: string }> => {
    // biome-ignore lint/suspicious/noExplicitAny: Hono context
    const token = getCookie(c as any, SESSION_COOKIE_NAME);
    const sessionUser = await c.var.deps.authService.getSessionByToken(token);
    if (!sessionUser || !token) {
      throw new AppError(ERROR_CODE.AUTH_UNAUTHORIZED, 'Authentication required', {
        status: HTTP_STATUS.UNAUTHORIZED,
      });
    }
    return { user: sessionUser, token };
  };

  app.post('/sign-up/*', () => {
    throw new AppError(
      ERROR_CODE.AUTH_NOT_ALLOWED,
      'Public sign-up is disabled for this admin console',
      { status: HTTP_STATUS.FORBIDDEN },
    );
  });

  app.post('/sign-in/email', zValidator('json', signInBodySchema), async (c) => {
    const body = c.req.valid('json');
    const captchaToken = c.req.header(HEADER.CAPTCHA);
    const ip = c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? '127.0.0.1';
    const country = c.req.header('cf-ipcountry') ?? 'LOCAL';
    const userAgent = c.req.header('user-agent') ?? 'unknown';

    const result = await c.var.deps.authService.signInEmail({
      email: body.email,
      password: body.password,
      captchaToken,
      ip,
      country,
      userAgent,
      twoFactorCode: body.twoFactorCode,
    });

    if (result.requiresTwoFactor) {
      return c.json(
        ok({
          requiresTwoFactor: true,
          reason: result.reason,
          ip: result.ip,
          country: result.country,
        }),
        HTTP_STATUS.OK,
      );
    }

    setCookie(c, SESSION_COOKIE_NAME, result.token, {
      httpOnly: true,
      secure: c.var.deps.config.NODE_ENV === 'production',
      sameSite: 'Lax',
      path: '/',
      maxAge: AUTH.SESSION_TTL_SECONDS,
    });

    return c.json(
      ok({
        requiresTwoFactor: false,
        user: result.user,
        expiresAt: result.expiresAtMs,
      }),
      HTTP_STATUS.OK,
    );
  });

  app.get('/get-session', async (c) => {
    const token = getCookie(c, SESSION_COOKIE_NAME);
    const sessionUser = await c.var.deps.authService.getSessionByToken(token);
    return c.json(
      ok({
        user: sessionUser,
      }),
      HTTP_STATUS.OK,
    );
  });

  app.post('/sign-out', async (c) => {
    const token = getCookie(c, SESSION_COOKIE_NAME);
    const ip = c.req.header('cf-connecting-ip') ?? '127.0.0.1';
    await c.var.deps.authService.signOutByToken(token, ip);
    deleteCookie(c, SESSION_COOKIE_NAME, { path: '/' });
    return c.json(ok({ signedOut: true }), HTTP_STATUS.OK);
  });

  // Active Sessions Management
  app.get('/sessions', async (c) => {
    const { user: sessionUser, token } = await requireCurrentSession(c);
    const sessions = await c.var.deps.authService.listSessions(sessionUser.id, token);
    return c.json(ok(sessions), HTTP_STATUS.OK);
  });

  app.delete('/sessions/:id', async (c) => {
    const { user: sessionUser } = await requireCurrentSession(c);
    const sessionId = c.req.param('id');
    await c.var.deps.authService.revokeSession(sessionUser.id, sessionId);
    return c.json(ok({ revoked: true }), HTTP_STATUS.OK);
  });

  app.post('/sessions/revoke-others', async (c) => {
    const { user: sessionUser, token } = await requireCurrentSession(c);
    await c.var.deps.authService.revokeOtherSessions(sessionUser.id, token);
    return c.json(ok({ revoked: true }), HTTP_STATUS.OK);
  });

  // 2FA Management
  app.get('/2fa/status', async (c) => {
    const { user: sessionUser } = await requireCurrentSession(c);
    const status = await c.var.deps.authService.get2faStatus(sessionUser.id);
    return c.json(ok(status), HTTP_STATUS.OK);
  });

  app.post('/2fa/setup', async (c) => {
    const { user: sessionUser } = await requireCurrentSession(c);
    const setup = await c.var.deps.authService.setup2fa(sessionUser.id);
    return c.json(ok(setup), HTTP_STATUS.OK);
  });

  app.post('/2fa/enable', zValidator('json', enable2faSchema), async (c) => {
    const { user: sessionUser } = await requireCurrentSession(c);
    const { code, always } = c.req.valid('json');
    await c.var.deps.authService.enable2fa(sessionUser.id, code, always);
    return c.json(ok({ enabled: true }), HTTP_STATUS.OK);
  });

  app.post('/2fa/disable', zValidator('json', disable2faSchema), async (c) => {
    const { user: sessionUser } = await requireCurrentSession(c);
    const { password } = c.req.valid('json');
    await c.var.deps.authService.disable2fa(sessionUser.id, password);
    return c.json(ok({ disabled: true }), HTTP_STATUS.OK);
  });

  return app;
};
