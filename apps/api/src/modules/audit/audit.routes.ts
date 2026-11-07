import { API_ROUTES, HTTP_STATUS, cursorPaginationQuerySchema, ok } from '@freetier-loop/shared';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import type { AppEnv } from '../../types';

export const createAuditRoutes = () => {
  return new Hono<AppEnv>().get(
    API_ROUTES.AUDIT_LOGS,
    zValidator('query', cursorPaginationQuerySchema),
    async (c) => {
      const query = c.req.valid('query');
      const result = await c.var.deps.auditService.list({
        limit: query.limit,
        ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
      });
      return c.json(
        ok(result.items, {
          limit: query.limit,
          nextCursor: result.nextCursor,
        }),
        HTTP_STATUS.OK,
      );
    },
  );
};
