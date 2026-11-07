import { AUTH, AppError, ERROR_CODE, HEADER, HTTP_STATUS, ok } from '@freetier-loop/shared';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';
import type { AppEnv } from '../../types';
import { SESSION_COOKIE_NAME } from './auth.service';

const signInBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const createAuthRoutes = () => {
  const app = new Hono<AppEnv>();

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
    const userAgent = c.req.header('user-agent') ?? 'unknown';

    const result = await c.var.deps.authService.signInEmail({
      email: body.email,
      password: body.password,
      captchaToken,
      ip,
      userAgent,
    });

    setCookie(c, SESSION_COOKIE_NAME, result.token, {
      httpOnly: true,
      secure: c.var.deps.config.NODE_ENV === 'production',
      sameSite: 'Lax',
      path: '/',
      maxAge: AUTH.SESSION_TTL_SECONDS,
    });

    return c.json(
      ok({
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

  return app;
};
