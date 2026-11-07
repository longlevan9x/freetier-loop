import { API_ROUTES, HTTP_STATUS, listResourcesQuerySchema, ok } from '@freetier-loop/shared';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import type { AppEnv } from '../../types';

export const createResourcesRoutes = () => {
  return new Hono<AppEnv>()
    .get(API_ROUTES.RESOURCES, zValidator('query', listResourcesQuerySchema), async (c) => {
      const query = c.req.valid('query');
      const result = await c.var.deps.resourcesService.list(query);
      return c.json(
        ok(result.items, {
          limit: query.limit,
          nextCursor: result.nextCursor,
        }),
        HTTP_STATUS.OK,
      );
    })
    .get(`${API_ROUTES.RESOURCES}/:id`, async (c) => {
      const id = c.req.param('id');
      const detail = await c.var.deps.resourcesService.getById(id);
      return c.json(ok(detail), HTTP_STATUS.OK);
    })
    .post(`${API_ROUTES.RESOURCES}/:id/pause`, async (c) => {
      const id = c.req.param('id');
      const updated = await c.var.deps.resourcesService.pauseProject(id, c.var.session?.id);
      return c.json(ok(updated), HTTP_STATUS.OK);
    })
    .post(`${API_ROUTES.RESOURCES}/:id/restore`, async (c) => {
      const id = c.req.param('id');
      const updated = await c.var.deps.resourcesService.restoreProject(id, c.var.session?.id);
      return c.json(ok(updated), HTTP_STATUS.OK);
    });
};
