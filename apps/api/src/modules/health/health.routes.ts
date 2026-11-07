import { API_ROUTES, HTTP_STATUS, ok } from '@freetier-loop/shared';
import { Hono } from 'hono';
import type { AppEnv } from '../../types';

export const createHealthRoutes = () => {
  return new Hono<AppEnv>().get(API_ROUTES.HEALTH, (c) => {
    return c.json(
      ok({
        status: 'ok' as const,
        timestamp: c.var.deps.platform.clock.nowMs(),
      }),
      HTTP_STATUS.OK,
    );
  });
};
