import { AppError, ERROR_CODE, HTTP_STATUS, PUBLIC_API_ROUTES } from '@freetier-loop/shared';
import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import { SESSION_COOKIE_NAME } from '../modules/auth/auth.service';
import type { AppEnv } from '../types';

export const sessionLoaderMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE_NAME);
  if (token) {
    const sessionUser = await c.var.deps.authService.getSessionByToken(token);
    c.set('session', sessionUser);
  }
  await next();
};

export const requireAuthMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const path = c.req.path;
  if ((PUBLIC_API_ROUTES as readonly string[]).includes(path)) {
    await next();
    return;
  }

  if (!c.var.session) {
    throw new AppError(ERROR_CODE.AUTH_UNAUTHORIZED, 'Authentication required', {
      status: HTTP_STATUS.UNAUTHORIZED,
    });
  }

  await next();
};
