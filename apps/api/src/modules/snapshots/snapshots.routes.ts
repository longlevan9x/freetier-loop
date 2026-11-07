import { API_ROUTES, HTTP_STATUS, ok } from '@freetier-loop/shared';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../../types';

const createSnapshotBodySchema = z.object({
  resourceId: z.string().min(1),
});

export const createSnapshotsRoutes = () => {
  return new Hono<AppEnv>()
    .get(API_ROUTES.SNAPSHOTS, async (c) => {
      const items = await c.var.deps.snapshotsService.listAll();
      return c.json(ok(items), HTTP_STATUS.OK);
    })
    .post(API_ROUTES.SNAPSHOTS, zValidator('json', createSnapshotBodySchema), async (c) => {
      const { resourceId } = c.req.valid('json');
      const created = await c.var.deps.snapshotsService.createForResource(resourceId, {
        userId: c.var.session?.id ?? null,
      });
      return c.json(ok(created), HTTP_STATUS.CREATED);
    })
    .post(`${API_ROUTES.RESOURCES}/:id/snapshots`, async (c) => {
      const resourceId = c.req.param('id');
      const created = await c.var.deps.snapshotsService.createForResource(resourceId, {
        userId: c.var.session?.id ?? null,
      });
      return c.json(ok(created), HTTP_STATUS.CREATED);
    })
    .get(`${API_ROUTES.SNAPSHOTS}/:id`, async (c) => {
      const id = c.req.param('id');
      const snap = await c.var.deps.snapshotsService.getRedactedById(id);
      return c.json(ok(snap), HTTP_STATUS.OK);
    })
    .get(`${API_ROUTES.SNAPSHOTS}/:id/bind`, async (c) => {
      const id = c.req.param('id');
      const snap = await c.var.deps.snapshotsService.getRedactedById(id);
      c.header('Content-Type', 'text/plain; charset=utf-8');
      return c.body(snap.bindZoneFile ?? '', HTTP_STATUS.OK);
    })
    .get(`${API_ROUTES.SNAPSHOTS}/:id/download`, async (c) => {
      const id = c.req.param('id');
      const format = c.req.query('format') ?? 'json';
      const snap = await c.var.deps.snapshotsService.getRedactedById(id);

      if (format === 'bind' && snap.bindZoneFile) {
        c.header('Content-Type', 'text/plain; charset=utf-8');
        c.header(
          'Content-Disposition',
          `attachment; filename="${snap.resourceName}-${snap.id}.zone.txt"`,
        );
        return c.body(snap.bindZoneFile, HTTP_STATUS.OK);
      }

      c.header('Content-Type', 'application/json; charset=utf-8');
      c.header(
        'Content-Disposition',
        `attachment; filename="${snap.resourceName}-${snap.id}.snapshot.json"`,
      );
      return c.body(JSON.stringify(snap.payload, null, 2), HTTP_STATUS.OK);
    });
};
