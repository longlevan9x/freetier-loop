import {
  API_ROUTES,
  HTTP_STATUS,
  confirmJobSchema,
  createProviderAccountSchema,
  ok,
  updateProviderAccountSchema,
} from '@freetier-loop/shared';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../../types';

const syncQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
});

export const createProviderAccountsRoutes = () => {
  return new Hono<AppEnv>()
    .get(API_ROUTES.PROVIDER_ACCOUNTS, async (c) => {
      const accounts = await c.var.deps.providerAccountsService.list();
      return c.json(ok(accounts), HTTP_STATUS.OK);
    })
    .post(
      API_ROUTES.PROVIDER_ACCOUNTS,
      zValidator('json', createProviderAccountSchema),
      async (c) => {
        const body = c.req.valid('json');
        const created = await c.var.deps.providerAccountsService.create(body, c.var.session?.id);
        return c.json(ok(created), HTTP_STATUS.CREATED);
      },
    )
    .get(`${API_ROUTES.PROVIDER_ACCOUNTS}/:id`, async (c) => {
      const id = c.req.param('id');
      const account = await c.var.deps.providerAccountsService.getById(id);
      return c.json(ok(account), HTTP_STATUS.OK);
    })
    .patch(
      `${API_ROUTES.PROVIDER_ACCOUNTS}/:id`,
      zValidator('json', updateProviderAccountSchema),
      async (c) => {
        const id = c.req.param('id');
        const body = c.req.valid('json');
        const updated = await c.var.deps.providerAccountsService.update(
          id,
          body,
          c.var.session?.id,
        );
        return c.json(ok(updated), HTTP_STATUS.OK);
      },
    )
    .delete(
      `${API_ROUTES.PROVIDER_ACCOUNTS}/:id`,
      zValidator('json', confirmJobSchema),
      async (c) => {
        const id = c.req.param('id');
        const body = c.req.valid('json');
        await c.var.deps.providerAccountsService.delete(id, body.confirm, c.var.session?.id);
        return c.json(ok({ deleted: true }), HTTP_STATUS.OK);
      },
    )
    .post(`${API_ROUTES.PROVIDER_ACCOUNTS}/:id/verify`, async (c) => {
      const id = c.req.param('id');
      const verified = await c.var.deps.providerAccountsService.verifyById(id, c.var.session?.id);
      return c.json(ok(verified), HTTP_STATUS.OK);
    })
    .post(
      `${API_ROUTES.PROVIDER_ACCOUNTS}/:id/sync`,
      zValidator('query', syncQuerySchema),
      async (c) => {
        const id = c.req.param('id');
        const query = c.req.valid('query');
        const synced = await c.var.deps.providerAccountsService.syncInventory(
          id,
          query.cursor,
          c.var.session?.id,
        );
        return c.json(ok(synced), HTTP_STATUS.OK);
      },
    )
    .get(`${API_ROUTES.PROVIDER_ACCOUNTS}/:id/usage`, async (c) => {
      const id = c.req.param('id');
      const usage = await c.var.deps.providerAccountsService.getUsage(id);
      return c.json(ok(usage), HTTP_STATUS.OK);
    });
};
