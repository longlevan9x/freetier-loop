import {
  API_PREFIX,
  AUTH_PREFIX,
  AppError,
  ERROR_CODE,
  type ErrorEnvelope,
  HEADER,
  HTTP_STATUS,
} from '@freetier-loop/shared';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { requireAuthMiddleware, sessionLoaderMiddleware } from './middleware/require-auth';
import { createAuditRoutes } from './modules/audit/audit.routes';
import { createAuthRoutes } from './modules/auth/auth.routes';
import { createDashboardRoutes } from './modules/dashboard/dashboard.routes';
import { createHealthRoutes } from './modules/health/health.routes';
import { createJobsRoutes } from './modules/jobs/jobs.routes';
import { createProviderAccountsRoutes } from './modules/provider-accounts/provider-accounts.routes';
import { createResourcesRoutes } from './modules/resources/resources.routes';
import { createSnapshotsRoutes } from './modules/snapshots/snapshots.routes';
import { type Deps, createDefaultDeps } from './platform/deps';
import type { AppEnv } from './types';

export const createApp = (customDeps?: Deps) => {
  const app = new Hono<AppEnv>();

  app.use('*', async (c, next) => {
    const incomingId = c.req.header(HEADER.REQUEST_ID);
    const requestId = incomingId && incomingId.length > 0 ? incomingId : crypto.randomUUID();
    const deps = customDeps ?? createDefaultDeps(c.env ?? {});
    c.set('requestId', requestId);
    c.set('deps', deps);
    c.set('session', null);
    c.header(HEADER.REQUEST_ID, requestId);
    await next();
  });

  app.use(
    '*',
    secureHeaders({
      xFrameOptions: 'DENY',
      referrerPolicy: 'strict-origin-when-cross-origin',
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'https://challenges.cloudflare.com'],
        frameSrc: ["'self'", 'https://challenges.cloudflare.com'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", 'https://challenges.cloudflare.com'],
        frameAncestors: ["'none'"],
      },
    }),
  );

  app.use('*', async (c, next) => {
    const webOrigin = c.var.deps.config.WEB_ORIGIN;
    if (!webOrigin) {
      await next();
      return;
    }
    const middleware = cors({
      origin: webOrigin,
      credentials: true,
    });
    return middleware(c, next);
  });

  app.use(`${API_PREFIX}/*`, sessionLoaderMiddleware, requireAuthMiddleware);

  const v1 = new Hono<AppEnv>()
    .route('/', createHealthRoutes())
    .route('/', createDashboardRoutes())
    .route('/', createProviderAccountsRoutes())
    .route('/', createResourcesRoutes())
    .route('/', createSnapshotsRoutes())
    .route('/', createJobsRoutes())
    .route('/', createAuditRoutes());

  const routes = app.route(AUTH_PREFIX, createAuthRoutes()).route(API_PREFIX, v1);

  app.notFound((c) => {
    const body: ErrorEnvelope = {
      error: {
        code: ERROR_CODE.NOT_FOUND,
        message: `Route not found: ${c.req.method} ${c.req.path}`,
        requestId: c.var.requestId ?? 'unknown',
      },
    };
    return c.json(body, HTTP_STATUS.NOT_FOUND);
  });

  app.onError((err, c) => {
    const requestId = c.var.requestId ?? 'unknown';
    if (err instanceof AppError) {
      const body: ErrorEnvelope = {
        error: {
          code: err.code,
          message: err.message,
          ...(err.details !== undefined ? { details: err.details } : {}),
          requestId,
        },
      };
      return c.json(body, err.status);
    }

    c.var.deps?.platform.logger.error('Unhandled request error', {
      requestId,
      message: err.message,
      stack: err.stack,
    });

    const body: ErrorEnvelope = {
      error: {
        code: ERROR_CODE.INTERNAL_ERROR,
        message: 'An unexpected error occurred',
        requestId,
      },
    };
    return c.json(body, HTTP_STATUS.INTERNAL_SERVER_ERROR);
  });

  return routes;
};

export type AppType = ReturnType<typeof createApp>;
