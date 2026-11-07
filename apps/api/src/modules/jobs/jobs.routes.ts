import {
  API_ROUTES,
  HTTP_STATUS,
  confirmJobSchema,
  createJobSchema,
  manualStepInputSchema,
  ok,
} from '@freetier-loop/shared';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../../types';

const recommendStrategySchema = z.object({
  resourceId: z.string().min(1),
  sourceAccountId: z.string().min(1),
  targetAccountId: z.string().min(1),
  sameSupabaseUser: z.boolean().optional(),
});

export const createJobsRoutes = () => {
  return new Hono<AppEnv>()
    .get(API_ROUTES.MIGRATION_TEMPLATES, (c) => {
      const data = c.var.deps.jobsService.listTemplates();
      return c.json(ok(data), HTTP_STATUS.OK);
    })
    .post(
      `${API_ROUTES.MIGRATION_TEMPLATES}/recommend`,
      zValidator('json', recommendStrategySchema),
      async (c) => {
        const body = c.req.valid('json');
        const data = await c.var.deps.jobsService.recommendStrategy(body);
        return c.json(ok(data), HTTP_STATUS.OK);
      },
    )
    .get(API_ROUTES.JOBS, async (c) => {
      const data = await c.var.deps.jobsService.list();
      return c.json(ok(data), HTTP_STATUS.OK);
    })
    .post(API_ROUTES.JOBS, zValidator('json', createJobSchema), async (c) => {
      const body = c.req.valid('json');
      const userId = c.var.session?.id ?? 'system';
      const data = await c.var.deps.jobsService.create(body, userId);
      return c.json(ok(data), HTTP_STATUS.CREATED);
    })
    .get(`${API_ROUTES.JOBS}/:id`, async (c) => {
      const id = c.req.param('id');
      const data = await c.var.deps.jobsService.getById(id);
      return c.json(ok(data), HTTP_STATUS.OK);
    })
    .post(`${API_ROUTES.JOBS}/:id/plan`, async (c) => {
      const id = c.req.param('id');
      const userId = c.var.session?.id ?? 'system';
      const data = await c.var.deps.jobsService.plan(id, userId);
      return c.json(ok(data), HTTP_STATUS.OK);
    })
    .post(`${API_ROUTES.JOBS}/:id/confirm`, zValidator('json', confirmJobSchema), async (c) => {
      const id = c.req.param('id');
      const body = c.req.valid('json');
      const userId = c.var.session?.id ?? 'system';
      const data = await c.var.deps.jobsService.confirm(id, body.confirm, userId);
      return c.json(ok(data), HTTP_STATUS.OK);
    })
    .post(`${API_ROUTES.JOBS}/:id/advance`, async (c) => {
      const id = c.req.param('id');
      const userId = c.var.session?.id ?? 'system';
      const data = await c.var.deps.jobsService.advance(id, userId);
      return c.json(ok(data), HTTP_STATUS.OK);
    })
    .post(
      `${API_ROUTES.JOBS}/:id/steps/:stepId/manual-input`,
      zValidator('json', manualStepInputSchema),
      async (c) => {
        const id = c.req.param('id');
        const stepId = c.req.param('stepId');
        const body = c.req.valid('json');
        const userId = c.var.session?.id ?? 'system';
        const data = await c.var.deps.jobsService.submitManualInput(id, stepId, body, userId);
        return c.json(ok(data), HTTP_STATUS.OK);
      },
    )
    .post(`${API_ROUTES.JOBS}/:id/retry`, async (c) => {
      const id = c.req.param('id');
      const userId = c.var.session?.id ?? 'system';
      const data = await c.var.deps.jobsService.retry(id, userId);
      return c.json(ok(data), HTTP_STATUS.OK);
    })
    .post(`${API_ROUTES.JOBS}/:id/cancel`, async (c) => {
      const id = c.req.param('id');
      const userId = c.var.session?.id ?? 'system';
      const data = await c.var.deps.jobsService.cancel(id, userId);
      return c.json(ok(data), HTTP_STATUS.OK);
    })
    .post(`${API_ROUTES.JOBS}/:id/compensate`, async (c) => {
      const id = c.req.param('id');
      const userId = c.var.session?.id ?? 'system';
      const data = await c.var.deps.jobsService.compensate(id, userId);
      return c.json(ok(data), HTTP_STATUS.OK);
    })
    .get(`${API_ROUTES.JOBS}/:id/events`, async (c) => {
      const id = c.req.param('id');
      const data = await c.var.deps.jobsService.listEvents(id);
      return c.json(ok(data), HTTP_STATUS.OK);
    });
};
