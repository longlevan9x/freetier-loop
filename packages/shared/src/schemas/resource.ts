import { z } from 'zod';
import { RESOURCE_KIND_VALUES } from '../constants/domain';
import { cursorPaginationQuerySchema } from './pagination';

export const listResourcesQuerySchema = cursorPaginationQuerySchema.extend({
  accountId: z.string().min(1).optional(),
  kind: z.enum(RESOURCE_KIND_VALUES).optional(),
  parentId: z.string().min(1).optional(),
  q: z.string().trim().max(120).optional(),
  topLevelOnly: z.enum(['true', 'false']).optional(),
});

export type ListResourcesQuery = z.infer<typeof listResourcesQuerySchema>;

export const resourceDtoSchema = z.object({
  id: z.string(),
  providerAccountId: z.string(),
  kind: z.enum(RESOURCE_KIND_VALUES),
  externalId: z.string(),
  name: z.string(),
  parentId: z.string().nullable(),
  data: z.record(z.unknown()),
  syncedAt: z.number(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export type ResourceDto = z.infer<typeof resourceDtoSchema>;
